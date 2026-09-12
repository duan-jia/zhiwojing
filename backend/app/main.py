import os
import logging
import sqlite3
import re
from datetime import datetime, timezone
from ipaddress import ip_address
from typing import Literal, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from sqlmodel import Field, Session, SQLModel, create_engine, select

from .agent import AgentRuntimeError, AvatarAgentRuntime
from .memory import MemoryConfig, MemoryService, StructuredStore, build_mem0
from .zhihu import CapabilityError, ToolContext, build_tool_registry
from .zhihu.http_provider import HttpZhihuProvider
from .zhihu.models import (
    DraftInput,
    DraftProfile,
    DraftResult,
    HotListResult,
    QuestionRecommendationsResult,
    SearchResult,
    ZhidaInput,
    ZhidaResult,
    CreatorStatsResult,
    UserCollectionsResult,
    UserContentsResult,
    UserFavlistsResult,
    UserFolloweesResult,
)

engine = create_engine("sqlite:///./avatar.db", connect_args={"check_same_thread": False})

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    zhihu_id: str = Field(index=True, unique=True)
    name: str
    bio: str = ""
    interests: str = "科技、生活、创造"
    style: str = "清晰、真诚、有条理"
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DraftRequest(DraftInput):
    user_id: int = 1




class AgentChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None
    user_id: int = 1
    avatar_id: int = 1


class AgentChatResponse(BaseModel):
    conversation_id: str
    avatar_id: int
    response: str


class AgentPosition(BaseModel):
    x: float
    y: float


class AgentLocation(AgentPosition):
    id: str
    name: str


class NearbyAvatar(BaseModel):
    avatar_id: int
    name: str
    distance: float = Field(ge=0)


class AgentStepRequest(BaseModel):
    avatar_id: int
    position: AgentPosition
    locations: list[AgentLocation] = Field(default_factory=list)
    nearby: list[NearbyAvatar] = Field(default_factory=list)
    persona: str | None = None
    last_action: str | None = None


class AgentStepResponse(BaseModel):
    action: Literal["move", "say", "idle"]
    to: dict[str, float | str] | None = None
    text: str | None = None


class AgentInitRequest(BaseModel):
    user_id: int = 1
    world_id: str | None = None


class AgentStubResponse(BaseModel):
    status: Literal["not_implemented"] = "not_implemented"
    operation: Literal["chat", "step", "init"]
    message: str

class OAuthInterface(BaseModel):
    id: str
    name: str


class OAuthStatusResponse(BaseModel):
    configured: bool
    callbackConfigured: bool
    integrationReady: bool
    authorized: bool
    missingConfiguration: list[str]
    interfaces: list[OAuthInterface]


OAUTH_INTERFACES = [
    OAuthInterface(id="contents", name="我的创作"),
    OAuthInterface(id="followees", name="我的关注"),
    OAuthInterface(id="favlists", name="收藏夹"),
    OAuthInterface(id="favlist_contents", name="收藏内容"),
    OAuthInterface(id="collections", name="近期收藏"),
]


def is_public_oauth_callback(redirect_uri: str) -> bool:
    if not redirect_uri:
        return False
    try:
        parsed = urlparse(redirect_uri)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError:
        return False
    if (
        parsed.scheme != "https"
        or not hostname
        or parsed.username
        or parsed.password
        or not parsed.path.endswith("/auth/callback")
    ):
        return False

    normalized_hostname = hostname.lower()
    if normalized_hostname == "localhost" or normalized_hostname.endswith(
        (".localhost", ".local")
    ):
        return False
    try:
        return ip_address(normalized_hostname).is_global
    except ValueError:
        return "." in normalized_hostname


def oauth_configuration() -> dict[str, object]:
    app_id = os.getenv("ZHIHU_OAUTH_APP_ID", "").strip()
    redirect_uri = os.getenv("ZHIHU_OAUTH_REDIRECT_URI", "").strip()
    app_key_configured = bool(os.getenv("ZHIHU_OAUTH_APP_KEY", "").strip())
    access_secret_configured = bool(os.getenv("ZHIHU_ACCESS_SECRET", "").strip())
    app_id_configured = bool(re.fullmatch(r"\d+", app_id))

    callback_configured = is_public_oauth_callback(redirect_uri)

    configured_fields = {
        "app_id": app_id_configured,
        "redirect_uri": callback_configured,
        "app_key": app_key_configured,
        "access_secret": access_secret_configured,
    }
    missing = [name for name, configured in configured_fields.items() if not configured]
    return {
        "configured": not missing,
        "callback_configured": callback_configured,
        "missing": missing,
    }


def oauth_unavailable() -> None:
    configuration = oauth_configuration()
    if not configuration["configured"]:
        raise HTTPException(
            503,
            detail={
                "code": "OAUTH_NOT_CONFIGURED",
                "message": "知乎账号登录尚未完成服务端配置。",
            },
        )
    raise HTTPException(
        503,
        detail={
            "code": "OAUTH_NOT_IMPLEMENTED",
            "message": "知乎账号登录接口已预留，真实授权尚未启用。",
        },
    )

app = FastAPI(title="数字分身 API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def resolve_draft_profile(user_id: int) -> DraftProfile:
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            raise CapabilityError(404, "USER_NOT_FOUND", "用户不存在")
        return DraftProfile(
            name=user.name,
            interests=user.interests.split("、"),
            style=user.style,
        )


tool_registry = build_tool_registry(profile_resolver=resolve_draft_profile)
user_zhihu_provider = HttpZhihuProvider()

def _build_agent_runtime():
    try:
        config = MemoryConfig.from_env()
        if not config.enabled:
            return AvatarAgentRuntime(tool_registry)
        config.data_dir.mkdir(parents=True, exist_ok=True)
        backend = build_mem0(config)
        service = MemoryService(backend, StructuredStore(engine))
        from langgraph.checkpoint.sqlite import SqliteSaver
        connection = sqlite3.connect(config.data_dir / "checkpoints.sqlite", check_same_thread=False)
        return AvatarAgentRuntime(tool_registry, memory_service=service, checkpointer=SqliteSaver(connection))
    except Exception:
        logging.getLogger(__name__).exception("memory initialization failed; continuing without memory")
        return AvatarAgentRuntime(tool_registry)

agent_runtime = _build_agent_runtime()

MOCK_AVATARS = (
    {"zhihu_id": "mock-user", "name": "体验用户", "bio": "AI 产品经理", "interests": "科技、生活、创造", "style": "清晰、真诚、有条理"},
    {"zhihu_id": "mock-life", "name": "苏晚", "bio": "生活方式作者", "interests": "阅读、旅行、美食", "style": "温柔、细腻、善用比喻"},
    {"zhihu_id": "mock-science", "name": "周博", "bio": "科普研究员", "interests": "物理、天文、科学史", "style": "严谨、好奇、循序渐进"},
)

@app.on_event("startup")
def startup():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        existing = set(session.exec(select(User.zhihu_id)).all())
        added = False
        for avatar in MOCK_AVATARS:
            if avatar["zhihu_id"] not in existing:
                session.add(User(**avatar))
                added = True
        if added:
            session.commit()


@app.on_event("shutdown")
async def shutdown():
    await tool_registry.close()

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "avatar-api",
        "zhihuProvider": tool_registry.provider_name,
        "draftProvider": tool_registry.draft_provider_name,
    }

@app.post("/api/agent/chat", response_model=AgentChatResponse)
async def agent_chat(payload: AgentChatRequest):
    with Session(engine) as session:
        avatar = session.get(User, payload.avatar_id)
        if not avatar:
            raise HTTPException(404, "分身不存在")
        profile = {
            "name": avatar.name,
            "bio": avatar.bio,
            "interests": avatar.interests,
            "style": avatar.style,
        }
    conversation_id = payload.conversation_id or f"{payload.user_id}:{payload.avatar_id}"
    try:
        response = await agent_runtime.chat(
            user_id=payload.user_id,
            avatar_id=payload.avatar_id,
            conversation_id=conversation_id,
            message=payload.message,
            **profile,
        )
    except AgentRuntimeError as error:
        raise HTTPException(
            error.status_code,
            detail={
                "code": error.code,
                "message": error.message,
                "retryable": error.retryable,
            },
        ) from error
    return AgentChatResponse(
        conversation_id=conversation_id,
        avatar_id=payload.avatar_id,
        response=response,
    )


@app.post("/api/agent/step", response_model=AgentStepResponse)
async def agent_step(payload: AgentStepRequest):
    try:
        decision = await agent_runtime.step(
            avatar_id=payload.avatar_id,
            position=payload.position.model_dump(),
            locations=[item.model_dump() for item in payload.locations],
            nearby=[item.model_dump() for item in payload.nearby],
            persona=payload.persona,
            last_action=payload.last_action,
        )
    except AgentRuntimeError as error:
        raise HTTPException(error.status_code, detail={"code": error.code, "message": error.message, "retryable": error.retryable}) from error
    return AgentStepResponse(**decision)


@app.post("/api/agent/init", response_model=AgentStubResponse, status_code=501)
async def agent_init(payload: AgentInitRequest):
    return AgentStubResponse(operation="init", message="Agent initialization is not implemented yet.")


@app.get("/api/me")
async def me(user_id: int = 1):
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(404, "用户不存在")
        return {"id": user.id, "name": user.name, "profile": {"interests": user.interests.split("、"), "style": user.style}}


async def execute_tool(
    name: str,
    arguments: dict,
    context: ToolContext | None = None,
):
    try:
        if context is None:
            return await tool_registry.execute(name, arguments)
        return await tool_registry.execute(name, arguments, context)
    except ValidationError as error:
        raise RequestValidationError(error.errors()) from error
    except CapabilityError as error:
        raise HTTPException(
            error.status_code,
            detail={
                "code": error.code,
                "message": error.message,
                "retryable": error.retryable,
            },
        ) from error


@app.get("/api/zhihu/hot", response_model=HotListResult)
async def zhihu_hot(limit: int = Query(default=10, ge=1, le=30)):
    return await execute_tool("hot_list", {"limit": limit})


@app.get(
    "/api/zhihu/question-recommendations",
    response_model=QuestionRecommendationsResult,
)
async def question_recommendations(
    query: str | None = Query(default=None, min_length=2, max_length=100),
    count: int = Query(default=5, ge=1, le=20),
):
    return await execute_tool(
        "question_recommendations",
        {"query": query, "count": count},
    )


@app.get("/api/zhihu/search", response_model=SearchResult)
async def zhihu_search(
    query: str = Query(min_length=2, max_length=100),
    count: int = Query(default=10, ge=1, le=10),
):
    return await execute_tool("zhihu_search", {"query": query, "count": count})


@app.get("/api/zhihu/global-search", response_model=SearchResult)
async def global_search(
    query: str = Query(min_length=2, max_length=100),
    count: int = Query(default=10, ge=1, le=20),
    filter: str | None = Query(default=None),
    search_db: Literal["all", "realtime", "static"] = Query(default="all"),
):
    return await execute_tool(
        "global_search",
        {"query": query, "count": count, "filter": filter, "search_db": search_db},
    )


@app.post("/api/zhihu/answer", response_model=ZhidaResult)
async def zhihu_answer(payload: ZhidaInput):
    return await execute_tool("zhida", payload.model_dump())


async def execute_user_request(call):
    try:
        return await call
    except CapabilityError as error:
        raise HTTPException(error.status_code, detail={"code": error.code, "message": error.message, "retryable": error.retryable}) from error


@app.get("/api/zhihu/user/contents", response_model=UserContentsResult)
async def zhihu_user_contents(content_type: Literal["all", "answer", "article", "zvideo", "pin", "question"] = "all", limit: int = Query(default=20, ge=1, le=50)):
    return await execute_user_request(user_zhihu_provider.user_contents(content_type, limit))


@app.get("/api/zhihu/user/followees", response_model=UserFolloweesResult)
async def zhihu_user_followees(limit: int = Query(default=20, ge=1, le=50)):
    return await execute_user_request(user_zhihu_provider.user_followees(limit))


@app.get("/api/zhihu/user/collections", response_model=UserCollectionsResult)
async def zhihu_user_collections(limit: int = Query(default=20, ge=1, le=50)):
    return await execute_user_request(user_zhihu_provider.user_collections(limit))


@app.get("/api/zhihu/user/favlists", response_model=UserFavlistsResult)
async def zhihu_user_favlists(limit: int = Query(default=20, ge=1, le=50)):
    return await execute_user_request(user_zhihu_provider.user_favlists(limit))


@app.get("/api/zhihu/user/creator-stats", response_model=CreatorStatsResult)
async def zhihu_creator_stats():
    return await execute_user_request(user_zhihu_provider.creator_account_stats())


@app.get("/api/oauth/status", response_model=OAuthStatusResponse)
async def oauth_status():
    configuration = oauth_configuration()
    return OAuthStatusResponse(
        configured=bool(configuration["configured"]),
        callbackConfigured=bool(configuration["callback_configured"]),
        integrationReady=False,
        authorized=False,
        missingConfiguration=list(configuration["missing"]),
        interfaces=OAUTH_INTERFACES,
    )


@app.get("/api/oauth/start")
async def oauth_start():
    oauth_unavailable()


@app.get("/auth/callback")
async def oauth_callback():
    oauth_unavailable()


@app.post("/api/oauth/run-all")
async def oauth_run_all():
    raise HTTPException(
        401,
        detail={"code": "LOGIN_REQUIRED", "message": "请先完成知乎账号授权。"},
    )


@app.post("/api/oauth/logout")
async def oauth_logout():
    return {"ok": True}

@app.post("/api/avatar/draft", response_model=DraftResult)
async def create_draft(payload: DraftRequest):
    return await execute_tool(
        "generate_draft",
        payload.model_dump(exclude={"user_id"}),
        ToolContext(user_id=payload.user_id),
    )
