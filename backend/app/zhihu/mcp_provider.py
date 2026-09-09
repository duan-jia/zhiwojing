import os
from datetime import datetime, timedelta
from typing import Any
from xml.etree import ElementTree

import httpx
from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamable_http_client

from .errors import ZhihuAPIError
from .models import (
    GlobalSearchInput,
    HotListInput,
    HotListItem,
    HotListResult,
    SearchItem,
    SearchResult,
    ZhidaInput,
    ZhidaResult,
    ZhihuSearchInput,
)

MCP_ENDPOINTS = {
    "global_search": ("sse", "https://developer.zhihu.com/api/mcp/global_search/v1/sse"),
    "hot_list": ("sse", "https://developer.zhihu.com/api/mcp/hot_list/v1/sse"),
    "zhihu_search": ("sse", "https://developer.zhihu.com/api/mcp/zhihu_search/v1/sse"),
    "zhida": ("streamable_http", "https://developer.zhihu.com/api/mcp/zhida/v1/stream"),
}


class McpZhihuProvider:
    name = "mcp"

    def __init__(self, *, access_secret: str | None = None):
        self.access_secret = access_secret

    def _headers(self) -> dict[str, str]:
        access_secret = self.access_secret
        if access_secret is None:
            access_secret = os.getenv("ZHIHU_ACCESS_SECRET", "").strip()
        if not access_secret:
            raise ZhihuAPIError(503, "ZHIHU_NOT_CONFIGURED", "尚未配置知乎开放平台 Access Secret。")
        return {"Authorization": f"Bearer {access_secret}"}

    @staticmethod
    def _text(result: Any) -> str:
        if getattr(result, "isError", False):
            raise ZhihuAPIError(502, "ZHIHU_MCP_TOOL_ERROR", "知乎 MCP 工具调用失败。")
        texts = [
            content.text
            for content in getattr(result, "content", [])
            if getattr(content, "type", None) == "text" and isinstance(getattr(content, "text", None), str)
        ]
        if not texts:
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎 MCP 返回了无法识别的数据。")
        return "\n".join(texts)

    async def _call(self, name: str, arguments: dict[str, object]) -> str:
        transport, url = MCP_ENDPOINTS[name]
        try:
            if transport == "sse":
                async with sse_client(
                    url,
                    headers=self._headers(),
                    timeout=15,
                    sse_read_timeout=60,
                ) as (read, write):
                    async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=60)) as session:
                        await session.initialize()
                        return self._text(await session.call_tool(name, arguments))

            async with httpx.AsyncClient(headers=self._headers(), timeout=60.0) as client:
                async with streamable_http_client(url, http_client=client) as (read, write, _):
                    async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=60)) as session:
                        await session.initialize()
                        return self._text(await session.call_tool(name, arguments))
        except ZhihuAPIError:
            raise
        except httpx.TimeoutException as error:
            raise ZhihuAPIError(
                504,
                "ZHIHU_TIMEOUT",
                "请求知乎 MCP 超时，请稍后重试。",
                retryable=True,
            ) from error
        except httpx.HTTPStatusError as error:
            if error.response.status_code in (401, 403):
                raise ZhihuAPIError(503, "ZHIHU_AUTH_INVALID", "知乎开放平台凭证无效，请重新配置。") from error
            if error.response.status_code == 429:
                raise ZhihuAPIError(
                    429,
                    "ZHIHU_RATE_LIMITED",
                    "知乎开放平台请求过于频繁，请稍后再试。",
                    retryable=True,
                ) from error
            raise ZhihuAPIError(
                502,
                "ZHIHU_MCP_PROTOCOL_ERROR",
                "知乎 MCP 服务暂时不可用。",
                retryable=True,
            ) from error
        except Exception as error:
            raise ZhihuAPIError(
                502,
                "ZHIHU_MCP_PROTOCOL_ERROR",
                "知乎 MCP 通信失败。",
                retryable=True,
            ) from error

    @staticmethod
    def _xml(text: str, expected_tag: str) -> ElementTree.Element:
        try:
            root = ElementTree.fromstring(text)
        except ElementTree.ParseError as error:
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎 MCP 返回了无法识别的数据。") from error
        if root.tag != expected_tag:
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎 MCP 返回了无法识别的数据。")
        return root

    @staticmethod
    def _integer(value: str | None, default: int = 0) -> int:
        try:
            return int(value) if value is not None else default
        except ValueError:
            return default

    @classmethod
    def _timestamp(cls, value: str | None) -> int:
        integer = cls._integer(value, -1)
        if integer >= 0:
            return integer
        if not value:
            return 0
        for parser in (
            lambda raw: datetime.strptime(raw, "%Y-%m-%d %H:%M:%S %z UTC"),
            lambda raw: datetime.fromisoformat(raw),
        ):
            try:
                return int(parser(value).timestamp())
            except ValueError:
                continue
        return 0

    @staticmethod
    def _float(value: str | None) -> float | None:
        if not value:
            return None
        try:
            return float(value)
        except ValueError:
            return None

    @classmethod
    def _search_result(cls, text: str, root_tag: str) -> SearchResult:
        root = cls._xml(text, root_tag)
        items: list[SearchItem] = []
        for item in root.findall("search_item"):
            attrs = item.attrib
            if not attrs.get("title") or not attrs.get("url"):
                raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎 MCP 搜索结果缺少必要字段。")
            items.append(
                SearchItem(
                    title=attrs.get("title", ""),
                    contentType=attrs.get("content_type", ""),
                    contentId=attrs.get("content_id", ""),
                    contentText="".join(item.itertext()).strip(),
                    url=attrs.get("url", ""),
                    commentCount=cls._integer(attrs.get("comment_count")),
                    voteUpCount=cls._integer(attrs.get("vote_up_count")),
                    authorName=attrs.get("author_name", ""),
                    authorAvatar=attrs.get("author_avatar", ""),
                    authorBadge=attrs.get("author_badge", ""),
                    authorBadgeText=attrs.get("author_badge_text", ""),
                    editTime=cls._timestamp(attrs.get("edit_time")),
                    comments=[],
                    authorityLevel=attrs.get("authority_level", ""),
                    rankingScore=cls._float(attrs.get("ranking_score")),
                )
            )
        return SearchResult(hasMore=False, items=items)

    async def hot_list(self, payload: HotListInput) -> HotListResult:
        root = self._xml(await self._call("hot_list", {"limit": payload.limit}), "hot_list")
        items: list[HotListItem] = []
        for item in root.findall("item"):
            title = item.findtext("title", "")
            url = item.findtext("url", "")
            if not title or not url:
                raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎 MCP 热榜结果缺少必要字段。")
            items.append(
                HotListItem(
                    title=title,
                    url=url,
                    thumbnailUrl=item.findtext("thumbnail_url", ""),
                    summary=item.findtext("summary", ""),
                )
            )
        return HotListResult(total=self._integer(root.get("total"), len(items)), items=items)

    async def zhihu_search(self, payload: ZhihuSearchInput) -> SearchResult:
        text = await self._call("zhihu_search", {"query": payload.query, "count": payload.count})
        return self._search_result(text, "zhihu_search")

    async def global_search(self, payload: GlobalSearchInput) -> SearchResult:
        arguments: dict[str, object] = {
            "query": payload.query,
            "count": payload.count,
            "search_db": payload.search_db,
        }
        if payload.filter:
            arguments["filter"] = payload.filter
        text = await self._call("global_search", arguments)
        return self._search_result(text, "global_search")

    async def zhida(self, payload: ZhidaInput) -> ZhidaResult:
        answer = await self._call("zhida", {"query": payload.query, "model": payload.model})
        return ZhidaResult(answer=answer, model=payload.model)

    async def close(self) -> None:
        return None
