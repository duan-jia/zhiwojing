import os
import logging
import sqlite3
import re
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from ipaddress import ip_address
from typing import Literal, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from sqlmodel import Field, Session, SQLModel, create_engine, select

from .agent import AgentRuntimeError, AvatarAgentRuntime
from .memory import MemoryConfig, MemoryService, StructuredStore, build_mem0
from .memory.store import Contact, Message, Presence
from .memory.coldstart import persona_prompt, run_coldstart
from .zhihu import CapabilityError, ToolContext, build_tool_registry
from .zhihu.catalog import BuildingCatalog, build_building_catalog
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
    zhihu_id: Optional[str] = Field(default=None, index=True, unique=True)
    kind: str = Field(default="zhihu", index=True)
    name: str
    bio: str = ""
    interests: str = "科技、生活、创造"
    style: str = "清晰、真诚、有条理"
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuthSession(SQLModel, table=True):
    __tablename__ = "sessions"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    token_hash: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(index=True)
    revoked_at: Optional[datetime] = Field(default=None, index=True)


class DevLoginRequest(BaseModel):
    user_id: int

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

class ColdstartRequest(BaseModel):
    user_id: int


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

class PresenceRequest(BaseModel):
    user_id: int
    online: bool
    human_controlled: bool

class MessageSendRequest(BaseModel):
    sender_id: int
    recipient_id: int
    content: str = Field(min_length=1, max_length=4000)
    sender_kind: Literal["human", "agent"] = "human"

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


def _auth_required() -> bool:
    return os.getenv("AUTH_REQUIRED", "0") == "1"


def _auth_error(code: str = "AUTH_REQUIRED", message: str = "请提供有效的登录凭证。") -> HTTPException:
    return HTTPException(401, detail={"code": code, "message": message, "retryable": False})


def _token_from_request(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def _authenticated(request: Request) -> tuple[User, AuthSession] | None:
    token = _token_from_request(request)
    if token is None:
        return None
    digest = hashlib.sha256(token.encode()).hexdigest()
    with Session(engine) as session:
        auth_session = session.exec(select(AuthSession).where(AuthSession.token_hash == digest)).first()
        now = datetime.now(timezone.utc)
        expires_at = auth_session.expires_at if auth_session is not None else None
        if expires_at is not None and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if auth_session is None or auth_session.revoked_at is not None or expires_at <= now:
            return None
        user = session.get(User, auth_session.user_id)
        if user is None:
            return None
        session.expunge(auth_session)
        session.expunge(user)
        return user, auth_session


def _request_user_id(request: Request, legacy_user_id: int = 1) -> int:
    user_id = getattr(request.state, "user_id", None)
    if user_id is not None:
        return user_id
    if _auth_required():
        raise _auth_error()
    return legacy_user_id


def _issue_token(session: Session, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    try:
        days = max(1, int(os.getenv("AUTH_SESSION_DAYS", "30")))
    except ValueError:
        days = 30
    session.add(AuthSession(user_id=user_id, token_hash=hashlib.sha256(token.encode()).hexdigest(), expires_at=datetime.now(timezone.utc) + timedelta(days=days)))
    return token


def _user_response(user: User) -> dict:
    return {"id": user.id, "name": user.name, "kind": user.kind, "profile": {"interests": user.interests.split("、"), "style": user.style}}


@app.middleware("http")
async def authenticate_request(request: Request, call_next):
    public = request.url.path == "/api/health" or request.url.path.startswith("/api/auth/")
    if request.method == "OPTIONS" or public:
        return await call_next(request)
    authenticated = _authenticated(request)
    if authenticated is not None:
        request.state.user_id = authenticated[0].id
        request.state.auth_session_id = authenticated[1].id
    elif _token_from_request(request) is not None or _auth_required():
        error = _auth_error("INVALID_TOKEN", "登录凭证无效、已过期或已注销。")
        return JSONResponse(status_code=401, content={"detail": error.detail})
    return await call_next(request)


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
            return AvatarAgentRuntime(tool_registry, memory_service=MemoryService(None, communication_store))
        config.data_dir.mkdir(parents=True, exist_ok=True)
        backend = build_mem0(config)
        service = MemoryService(backend, communication_store)
        from langgraph.checkpoint.sqlite import SqliteSaver
        connection = sqlite3.connect(config.data_dir / "checkpoints.sqlite", check_same_thread=False)
        return AvatarAgentRuntime(tool_registry, memory_service=service, checkpointer=SqliteSaver(connection))
    except Exception:
        logging.getLogger(__name__).exception("memory initialization failed; continuing without memory")
        return AvatarAgentRuntime(tool_registry, memory_service=MemoryService(None, communication_store))

communication_store = StructuredStore(engine)
agent_runtime = _build_agent_runtime()

MOCK_AVATARS = (
    {"zhihu_id": "mock-user", "name": "体验用户", "bio": "AI 产品经理", "interests": "科技、生活、创造", "style": "清晰、真诚、有条理"},
    {"zhihu_id": "mock-life", "name": "苏晚", "bio": "生活方式作者", "interests": "阅读、旅行、美食", "style": "温柔、细腻、善用比喻"},
    {"zhihu_id": "mock-science", "name": "周博", "bio": "科普研究员", "interests": "物理、天文、科学史", "style": "严谨、好奇、循序渐进"},
)

@app.on_event("startup")
def startup():
    communication_store.engine = engine
    SQLModel.metadata.create_all(engine)
    # create_all does not add columns to databases created before authentication v1.
    with engine.begin() as connection:
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(user)")}
        if columns and "kind" not in columns:
            connection.exec_driver_sql("ALTER TABLE user ADD COLUMN kind VARCHAR NOT NULL DEFAULT 'zhihu'")
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


@app.get("/api/world/buildings", response_model=BuildingCatalog)
async def world_buildings():
    return build_building_catalog()


@app.post("/api/auth/guest")
async def auth_guest():
    with Session(engine) as session:
        user = User(zhihu_id=f"guest-{uuid.uuid4()}", kind="guest", name="游客")
        session.add(user)
        session.flush()
        token = _issue_token(session, user.id)
        session.commit()
        session.refresh(user)
        return {"token": token, "user": _user_response(user)}


@app.post("/api/auth/dev-login")
async def auth_dev_login(payload: DevLoginRequest):
    if os.getenv("AUTH_DEV_MODE", "0") != "1":
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "接口不存在。", "retryable": False})
    with Session(engine) as session:
        user = session.get(User, payload.user_id)
        if user is None:
            raise HTTPException(404, detail={"code": "USER_NOT_FOUND", "message": "用户不存在。", "retryable": False})
        token = _issue_token(session, user.id)
        session.commit()
        return {"token": token, "user": _user_response(user)}


@app.post("/api/auth/logout")
async def auth_logout(request: Request):
    authenticated = _authenticated(request)
    if authenticated is None:
        raise _auth_error("INVALID_TOKEN", "登录凭证无效、已过期或已注销。")
    with Session(engine) as session:
        auth_session = session.get(AuthSession, authenticated[1].id)
        auth_session.revoked_at = datetime.now(timezone.utc)
        session.add(auth_session)
        session.commit()
    return {"ok": True}


@app.post("/api/auth/verify")
async def auth_verify(request: Request):
    authenticated = _authenticated(request)
    if authenticated is None:
        raise _auth_error("INVALID_TOKEN", "登录凭证无效、已过期或已注销。")
    return {"valid": True, "user": _user_response(authenticated[0])}

@app.post("/api/agent/chat", response_model=AgentChatResponse)
async def agent_chat(payload: AgentChatRequest, request: Request):
    current_user_id = _request_user_id(request, payload.user_id)
    with Session(engine) as session:
        avatar = session.get(User, payload.avatar_id)
        if not avatar:
            raise HTTPException(404, "分身不存在")
        profile = {
            "name": avatar.name,
            "bio": avatar.bio,
            "interests": avatar.interests,
            "style": avatar.style,
            "persona_card": persona_prompt(communication_store.get_persona(payload.avatar_id)),
        }
    conversation_id = payload.conversation_id or f"{current_user_id}:{payload.avatar_id}"
    try:
        response = await agent_runtime.chat(
            user_id=current_user_id,
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
async def agent_step(payload: AgentStepRequest, request: Request):
    avatar_id = _request_user_id(request, payload.avatar_id)
    card = communication_store.get_persona(avatar_id) or {}
    try:
        decision = await agent_runtime.step(
            avatar_id=avatar_id,
            position=payload.position.model_dump(),
            locations=[item.model_dump() for item in payload.locations],
            nearby=[item.model_dump() for item in payload.nearby],
            persona=payload.persona,
            last_action=payload.last_action,
            persona_summary=str(card.get("summary", "")),
        )
    except AgentRuntimeError as error:
        raise HTTPException(error.status_code, detail={"code": error.code, "message": error.message, "retryable": error.retryable}) from error
    return AgentStepResponse(**decision)

@app.get("/api/persona")
async def get_persona(request: Request, user_id: int = 1):
    user_id = _request_user_id(request, user_id)
    persona = communication_store.get_persona(user_id)
    if persona is None:
        raise HTTPException(404, detail={"code": "PERSONA_NOT_FOUND", "message": "尚未生成人设卡。"})
    return persona

@app.post("/api/memory/coldstart")
async def memory_coldstart(payload: ColdstartRequest, request: Request):
    user_id = _request_user_id(request, payload.user_id)
    with Session(engine) as session:
        if not session.get(User, user_id):
            raise HTTPException(404, detail={"code": "USER_NOT_FOUND", "message": "用户不存在"})
    try:
        return await run_coldstart(user_id, user_zhihu_provider, communication_store)
    except CapabilityError as error:
        raise HTTPException(error.status_code, detail={"code": error.code, "message": error.message, "retryable": error.retryable}) from error
    except AgentRuntimeError as error:
        raise HTTPException(error.status_code, detail={"code": error.code, "message": error.message, "retryable": error.retryable}) from error


@app.post("/api/agent/init", response_model=AgentStubResponse, status_code=501)
async def agent_init(payload: AgentInitRequest):
    return AgentStubResponse(operation="init", message="Agent initialization is not implemented yet.")


@app.get("/api/me")
async def me(request: Request, user_id: int = 1):
    user_id = _request_user_id(request, user_id)
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(404, "用户不存在")
        return _user_response(user)


def _pair_key(a: int, b: int) -> str:
    return f"{min(a, b)}:{max(a, b)}"


def _reply_limit() -> int:
    try:
        return max(0, int(os.getenv("REMOTE_AGENT_REPLY_LIMIT", "5")))
    except ValueError:
        return 5


@app.post("/api/presence")
async def update_presence(payload: PresenceRequest, request: Request):
    user_id = _request_user_id(request, payload.user_id)
    with Session(engine) as session:
        if not session.get(User, user_id):
            raise HTTPException(404, "用户不存在")
        row = session.get(Presence, user_id)
        if row is None:
            row = Presence(user_id=user_id)
            session.add(row)
        row.online = payload.online
        row.human_controlled = payload.human_controlled if payload.online else False
        row.updated_at = datetime.now(timezone.utc)
        session.commit()
    return {"ok": True}


@app.get("/api/contacts")
async def list_contacts(request: Request, user_id: int = 1):
    user_id = _request_user_id(request, user_id)
    with Session(engine) as session:
        contacts = session.exec(select(Contact).where(Contact.user_id == user_id).order_by(Contact.added_at.desc())).all()
        result = []
        for contact in contacts:
            user = session.get(User, contact.contact_id)
            presence = session.get(Presence, contact.contact_id)
            messages = session.exec(select(Message).where(Message.pair_key == _pair_key(user_id, contact.contact_id)).order_by(Message.created_at.desc()).limit(1)).all()
            unread = len(session.exec(select(Message).where(Message.recipient_id == user_id, Message.sender_id == contact.contact_id, Message.read_at == None)).all())  # noqa: E711
            result.append({
                "id": contact.contact_id, "name": user.name if user else f"用户 {contact.contact_id}",
                "online": bool(presence and presence.online),
                "humanControlled": bool(presence and presence.online and presence.human_controlled),
                "lastMessage": messages[0].content if messages else None, "unread": unread,
                "agentReplyStreak": contact.agent_reply_streak,
            })
        return {"contacts": result, "unread": sum(item["unread"] for item in result)}


@app.delete("/api/contacts/{contact_id}")
async def remove_contact(contact_id: int, request: Request, user_id: int = 1):
    user_id = _request_user_id(request, user_id)
    with Session(engine) as session:
        condition = (Contact.user_id == user_id) & (Contact.contact_id == contact_id)
        # Preserve the pre-auth bilateral-delete contract only for legacy callers.
        if getattr(request.state, "user_id", None) is None:
            condition = condition | ((Contact.user_id == contact_id) & (Contact.contact_id == user_id))
        rows = session.exec(select(Contact).where(condition)).all()
        if not rows:
            raise HTTPException(404, "联系人不存在")
        for row in rows:
            session.delete(row)
        session.commit()
    return {"ok": True}


@app.get("/api/messages/thread/{contact_id}")
async def message_thread(contact_id: int, request: Request, user_id: int = 1):
    user_id = _request_user_id(request, user_id)
    with Session(engine) as session:
        rows = session.exec(select(Message).where(Message.pair_key == _pair_key(user_id, contact_id)).order_by(Message.created_at)).all()
        now = datetime.now(timezone.utc)
        for row in rows:
            if row.recipient_id == user_id and row.read_at is None: row.read_at = now
        session.commit()
        return {"messages": [{"id": row.id, "senderId": row.sender_id, "recipientId": row.recipient_id, "senderKind": row.sender_kind, "content": row.content, "createdAt": row.created_at, "readAt": row.read_at} for row in rows]}


@app.get("/api/messages/inbox")
async def message_inbox(request: Request, user_id: int = 1):
    user_id = _request_user_id(request, user_id)
    with Session(engine) as session:
        count = len(session.exec(select(Message).where(Message.recipient_id == user_id, Message.read_at == None)).all())  # noqa: E711
    return {"unread": count}


@app.post("/api/messages/send")
async def send_message(payload: MessageSendRequest, request: Request):
    sender_id = _request_user_id(request, payload.sender_id)
    if sender_id == payload.recipient_id: raise HTTPException(400, "不能给自己发送远程消息")
    content = payload.content.strip()
    if not content: raise HTTPException(422, "消息不能为空")
    with Session(engine) as session:
        sender, recipient = session.get(User, sender_id), session.get(User, payload.recipient_id)
        if not sender or not recipient: raise HTTPException(404, "用户不存在")
        own_contact = session.exec(select(Contact).where(Contact.user_id == sender_id, Contact.contact_id == payload.recipient_id)).first()
        if own_contact is None: raise HTTPException(409, "请先将对方添加到通讯录")
        session.add(Message(pair_key=_pair_key(sender_id, payload.recipient_id), sender_id=sender_id, recipient_id=payload.recipient_id, sender_kind=payload.sender_kind, content=content))
        # A real owner's reply is the only action that clears the opposite direction.
        if payload.sender_kind == "human":
            reverse = session.exec(select(Contact).where(Contact.user_id == payload.recipient_id, Contact.contact_id == sender_id)).first()
            if reverse: reverse.agent_reply_streak = 0
        presence = session.get(Presence, payload.recipient_id)
        delivered_human = bool(presence and presence.online and presence.human_controlled)
        session.commit()
    if delivered_human:
        return {"delivered": "human", "reply": None, "capped": False}

    with Session(engine) as session:
        streak = session.exec(select(Contact).where(Contact.user_id == sender_id, Contact.contact_id == payload.recipient_id)).first()
        if streak is None: raise HTTPException(409, "联系人不存在")
        if streak.agent_reply_streak >= _reply_limit():
            return {"delivered": "capped", "reply": None, "capped": True}
        recipient = session.get(User, payload.recipient_id)
        profile = {"name": recipient.name, "bio": recipient.bio, "interests": recipient.interests, "style": recipient.style}
    try:
        reply = await agent_runtime.chat(user_id=sender_id, avatar_id=payload.recipient_id, conversation_id=f"remote:{_pair_key(sender_id, payload.recipient_id)}", message=content, **profile)
    except AgentRuntimeError as error:
        raise HTTPException(error.status_code, detail={"code": error.code, "message": error.message, "retryable": error.retryable}) from error
    with Session(engine) as session:
        session.add(Message(pair_key=_pair_key(sender_id, payload.recipient_id), sender_id=payload.recipient_id, recipient_id=sender_id, sender_kind="agent", content=reply))
        streak = session.exec(select(Contact).where(Contact.user_id == sender_id, Contact.contact_id == payload.recipient_id)).first()
        if streak: streak.agent_reply_streak += 1
        session.commit()
        current = streak.agent_reply_streak if streak else 0
    return {"delivered": "agent", "reply": reply, "capped": False, "agentReplyStreak": current}


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
async def create_draft(payload: DraftRequest, request: Request):
    user_id = _request_user_id(request, payload.user_id)
    return await execute_tool(
        "generate_draft",
        payload.model_dump(exclude={"user_id"}),
        ToolContext(user_id=user_id),
    )
