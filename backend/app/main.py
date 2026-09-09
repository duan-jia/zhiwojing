import os
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

from .zhihu import CapabilityError, ToolContext, build_tool_registry
from .zhihu.models import (
    DraftInput,
    DraftProfile,
    DraftResult,
    HotListResult,
    QuestionRecommendationsResult,
    SearchResult,
    ZhidaInput,
    ZhidaResult,
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
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


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

@app.on_event("startup")
def startup():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        if not session.exec(select(User)).first():
            session.add(User(zhihu_id="mock-user", name="体验用户"))
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
