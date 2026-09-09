import os
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from pydantic import BaseModel

from .draft_provider import DraftProvider, LocalTemplateDraftProvider
from .errors import CapabilityError
from .http_provider import HttpZhihuProvider
from .mcp_provider import McpZhihuProvider
from .models import (
    DraftInput,
    DraftProfile,
    GlobalSearchInput,
    HotListInput,
    QuestionRecommendationsInput,
    ZhidaInput,
    ZhihuSearchInput,
)
from .provider import QuestionRecommendationsProvider, ZhihuProvider

ProfileResolver = Callable[[int], DraftProfile]
ToolHandler = Callable[[BaseModel, "ToolContext"], Awaitable[BaseModel]]


@dataclass(frozen=True)
class ToolContext:
    user_id: int | None = None
    oauth_token: str | None = None


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    input_model: type[BaseModel]
    auth_scope: str
    handler: ToolHandler

    def function_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "name": self.name,
            "description": self.description,
            "parameters": self.input_model.model_json_schema(),
        }


class ToolRegistry:
    def __init__(
        self,
        public_provider: ZhihuProvider,
        *,
        recommendations_provider: QuestionRecommendationsProvider,
        draft_provider: DraftProvider,
        profile_resolver: ProfileResolver | None = None,
    ):
        self.public_provider = public_provider
        self.recommendations_provider = recommendations_provider
        self.draft_provider = draft_provider
        self.profile_resolver = profile_resolver
        self._tools = {
            "question_recommendations": ToolDefinition(
                "question_recommendations",
                "按主题或服务账号画像推荐适合回答的知乎问题。",
                QuestionRecommendationsInput,
                "creator",
                lambda payload, context: recommendations_provider.question_recommendations(payload),
            ),
            "hot_list": ToolDefinition(
                "hot_list",
                "获取当前知乎热榜。",
                HotListInput,
                "app",
                lambda payload, context: public_provider.hot_list(payload),
            ),
            "zhihu_search": ToolDefinition(
                "zhihu_search",
                "搜索知乎站内的问题、回答和文章。",
                ZhihuSearchInput,
                "app",
                lambda payload, context: public_provider.zhihu_search(payload),
            ),
            "global_search": ToolDefinition(
                "global_search",
                "搜索全网内容，可选择索引库和筛选条件。",
                GlobalSearchInput,
                "app",
                lambda payload, context: public_provider.global_search(payload),
            ),
            "zhida": ToolDefinition(
                "zhida",
                "调用知乎直答回答一个问题。",
                ZhidaInput,
                "app",
                lambda payload, context: public_provider.zhida(payload),
            ),
            "generate_draft": ToolDefinition(
                "generate_draft",
                "根据用户的想法或问题生成知乎回答或文章草稿；发布前必须由用户检查。",
                DraftInput,
                "user_context",
                self._generate_draft,
            ),
        }

    @property
    def provider_name(self) -> str:
        return self.public_provider.name

    @property
    def draft_provider_name(self) -> str:
        return self.draft_provider.name

    def schemas(self) -> list[dict[str, Any]]:
        return [tool.function_schema() for tool in self._tools.values()]

    async def _generate_draft(
        self,
        payload: BaseModel,
        context: ToolContext,
    ) -> BaseModel:
        if not isinstance(payload, DraftInput):
            raise CapabilityError(500, "TOOL_CONFIGURATION_ERROR", "草稿工具配置错误。")
        if context.user_id is None:
            raise CapabilityError(400, "USER_CONTEXT_REQUIRED", "生成草稿需要用户上下文。")
        if self.profile_resolver is None:
            raise CapabilityError(503, "PROFILE_PROVIDER_UNAVAILABLE", "用户画像服务尚未配置。")
        profile = self.profile_resolver(context.user_id)
        return await self.draft_provider.generate(payload, profile)

    async def execute(
        self,
        name: str,
        arguments: dict[str, Any],
        context: ToolContext | None = None,
    ) -> BaseModel:
        tool = self._tools.get(name)
        if tool is None:
            raise CapabilityError(404, "TOOL_NOT_FOUND", f"未知工具：{name}")
        payload = tool.input_model.model_validate(arguments)
        return await tool.handler(payload, context or ToolContext())

    async def close(self) -> None:
        providers = [self.public_provider, self.recommendations_provider]
        seen: set[int] = set()
        for provider in providers:
            if id(provider) in seen:
                continue
            seen.add(id(provider))
            close = getattr(provider, "close", None)
            if close is not None:
                await close()


def build_tool_registry(
    provider_name: str | None = None,
    *,
    profile_resolver: ProfileResolver | None = None,
    draft_provider: DraftProvider | None = None,
) -> ToolRegistry:
    selected = (provider_name or os.getenv("ZHIHU_PUBLIC_PROVIDER", "http")).strip().lower()
    http_provider = HttpZhihuProvider()
    if selected == "http":
        public_provider: ZhihuProvider = http_provider
    elif selected == "mcp":
        public_provider = McpZhihuProvider()
    else:
        raise ValueError("ZHIHU_PUBLIC_PROVIDER 必须是 http 或 mcp")
    return ToolRegistry(
        public_provider,
        recommendations_provider=http_provider,
        draft_provider=draft_provider or LocalTemplateDraftProvider(),
        profile_resolver=profile_resolver,
    )
