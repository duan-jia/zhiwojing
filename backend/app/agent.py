import json
import os
from collections.abc import Sequence
from typing import Any

from langchain_core.messages import AIMessage
from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent

from .zhihu import ToolContext
from .zhihu.registry import ToolRegistry

READ_ONLY_TOOLS = (
    "hot_list",
    "zhihu_search",
    "global_search",
    "question_recommendations",
)
OWNER_TOOLS = READ_ONLY_TOOLS + ("generate_draft", "zhida")


def create_llm() -> ChatOpenAI:
    """Create the OpenAI-compatible client (DeepSeek by default)."""
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL", "deepseek-chat"),
        base_url=os.getenv("LLM_BASE_URL", "https://api.deepseek.com"),
        api_key=os.getenv("LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY") or "not-configured",
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
        result = await agent.ainvoke(
            {"messages": [("user", message)]},
            config={"configurable": {"thread_id": conversation_id}},
        )
        for item in reversed(result["messages"]):
            if isinstance(item, AIMessage) and item.content:
                if isinstance(item.content, str):
                    return item.content
                return json.dumps(item.content, ensure_ascii=False)
        return ""
