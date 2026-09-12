import json
import os
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    RateLimitError,
)

from .zhihu import ToolContext
from .zhihu.registry import ToolRegistry

READ_ONLY_TOOLS = (
    "hot_list",
    "zhihu_search",
    "global_search",
    "question_recommendations",
)
OWNER_TOOLS = READ_ONLY_TOOLS + (
    "generate_draft", "zhida", "user_contents", "user_followees",
    "user_collections", "user_favlists", "creator_account_stats",
)

DEFAULT_LLM_MODEL = "deepseek-v4-flash"
DEFAULT_LLM_BASE_URL = "https://api.openai-next.com/v1"


class AgentRuntimeError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        retryable: bool,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retryable = retryable


def resolve_llm_api_key() -> str:
    configured_key = os.getenv("LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    if configured_key:
        return configured_key

    config_home = os.getenv("XDG_CONFIG_HOME")
    config_dir = Path(config_home).expanduser() if config_home else Path.home() / ".config"
    secret_file = config_dir / "zhiwojing" / "llm-api-key"
    try:
        local_key = secret_file.read_text(encoding="utf-8").strip()
    except OSError:
        return "not-configured"
    return local_key or "not-configured"


def create_llm() -> ChatOpenAI:
    """Create the OpenAI-compatible client used by avatar agents."""
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL", DEFAULT_LLM_MODEL),
        base_url=os.getenv("LLM_BASE_URL", DEFAULT_LLM_BASE_URL),
        api_key=resolve_llm_api_key(),
        temperature=float(os.getenv("LLM_TEMPERATURE", "0.4")),
    )


def registry_tools(
    registry: ToolRegistry, names: Sequence[str], *, user_id: int
) -> list[StructuredTool]:
    """Adapt registry definitions without duplicating validation or execution."""
    tools: list[StructuredTool] = []
    for name in names:
        definition = registry.definition(name)

        async def call_tool(_name: str = name, **arguments: Any) -> str:
            result = await registry.execute(
                _name, arguments, ToolContext(user_id=user_id)
            )
            return json.dumps(result.model_dump(mode="json"), ensure_ascii=False)

        tools.append(
            StructuredTool.from_function(
                coroutine=call_tool,
                name=definition.name,
                description=definition.description,
                args_schema=definition.input_model,
            )
        )
    return tools


class AvatarAgentRuntime:
    def __init__(self, registry: ToolRegistry):
        self.registry = registry
        self.checkpointer = MemorySaver()

    async def chat(
        self,
        *,
        user_id: int,
        avatar_id: int,
        conversation_id: str,
        message: str,
        name: str,
        bio: str,
        interests: str,
        style: str,
    ) -> str:
        names = OWNER_TOOLS if user_id == avatar_id else READ_ONLY_TOOLS
        prompt = (
            f"你是{name}的数字分身。简介：{bio or '暂无'}。"
            f"兴趣：{interests}。表达风格：{style}。"
            "请始终以这个人设和语气回答；需要外部信息时使用工具，不要虚构工具结果。"
        )
        agent = create_react_agent(
            create_llm(),
            registry_tools(self.registry, names, user_id=user_id),
            checkpointer=self.checkpointer,
            state_modifier=prompt,
        )
        try:
            result = await agent.ainvoke(
                {"messages": [("user", message)]},
                config={"configurable": {"thread_id": conversation_id}},
            )
        except AuthenticationError as error:
            raise AgentRuntimeError(
                503,
                "LLM_AUTH_FAILED",
                "模型服务认证失败，请重新配置有效的 API Key。",
                retryable=False,
            ) from error
        except RateLimitError as error:
            raise AgentRuntimeError(
                429,
                "LLM_RATE_LIMITED",
                "模型服务当前请求过多，请稍后重试。",
                retryable=True,
            ) from error
        except (APITimeoutError, APIConnectionError) as error:
            raise AgentRuntimeError(
                503,
                "LLM_UNAVAILABLE",
                "暂时无法连接模型服务，请稍后重试。",
                retryable=True,
            ) from error
        except APIStatusError as error:
            raise AgentRuntimeError(
                502,
                "LLM_UPSTREAM_ERROR",
                "模型服务返回异常，请稍后重试。",
                retryable=True,
            ) from error
        for item in reversed(result["messages"]):
            if isinstance(item, AIMessage) and item.content:
                if isinstance(item.content, str):
                    return item.content
                return json.dumps(item.content, ensure_ascii=False)
        return ""

    async def step(
        self,
        *,
        avatar_id: int,
        position: dict[str, float],
        locations: list[dict[str, Any]],
        nearby: list[dict[str, Any]],
        persona: str | None = None,
        last_action: str | None = None,
    ) -> dict[str, Any]:
        """Choose one autonomous action for an event-driven world tick.

        The caller invokes this only on state transitions (entering agent mode,
        arriving, or meeting somebody), never from a timer.
        """
        if not locations and not nearby:
            return {"action": "idle"}
        prompt = (
            "你是像素世界里的数字分身行为导演。只输出 JSON，不要 Markdown。"
            "格式为 {\"action\":\"move|say|idle\",\"location_id\":\"...\","
            "\"text\":\"...\"}。附近有人时优先 say 且只说一句简短自然的中文；"
            "否则从给定地点选择一个 location_id 前往，偶尔可 idle。"
        )
        observation = {
            "avatar_id": avatar_id,
            "position": position,
            "locations": locations,
            "nearby": nearby,
            "persona": persona or "真诚、好奇",
            "last_action": last_action,
        }
        try:
            reply = await create_llm().ainvoke(
                [SystemMessage(content=prompt), HumanMessage(content=json.dumps(observation, ensure_ascii=False))]
            )
        except AuthenticationError as error:
            raise AgentRuntimeError(503, "LLM_AUTH_FAILED", "模型服务认证失败，请重新配置有效的 API Key。", retryable=False) from error
        except RateLimitError as error:
            raise AgentRuntimeError(429, "LLM_RATE_LIMITED", "模型服务当前请求过多，请稍后重试。", retryable=True) from error
        except (APITimeoutError, APIConnectionError) as error:
            raise AgentRuntimeError(503, "LLM_UNAVAILABLE", "暂时无法连接模型服务，请稍后重试。", retryable=True) from error
        except APIStatusError as error:
            raise AgentRuntimeError(502, "LLM_UPSTREAM_ERROR", "模型服务返回异常，请稍后重试。", retryable=True) from error

        content = reply.content if isinstance(reply.content, str) else json.dumps(reply.content, ensure_ascii=False)
        try:
            raw = json.loads(content.strip().removeprefix("```json").removesuffix("```").strip())
        except (json.JSONDecodeError, AttributeError) as error:
            raise AgentRuntimeError(502, "LLM_INVALID_RESPONSE", "模型没有返回有效的分身动作。", retryable=True) from error
        action = raw.get("action")
        if action == "say" and str(raw.get("text", "")).strip():
            return {"action": "say", "text": str(raw["text"]).strip()[:120]}
        if action == "move":
            location = next((item for item in locations if item.get("id") == raw.get("location_id")), None)
            if location is None and locations:
                location = locations[0]
            if location:
                return {"action": "move", "to": {"x": location["x"], "y": location["y"], "name": location["name"]}}
        return {"action": "idle"}
