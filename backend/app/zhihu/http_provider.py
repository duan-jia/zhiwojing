import os
import time
from typing import Any

import httpx

from .errors import ZhihuAPIError
from .models import (
    GlobalSearchInput,
    HotListInput,
    HotListItem,
    HotListResult,
    QuestionRecommendationItem,
    QuestionRecommendationsInput,
    QuestionRecommendationsResult,
    SearchItem,
    SearchResult,
    ZhidaInput,
    ZhidaResult,
    ZhihuSearchInput,
    CollectionContentItem, CreatorStatsResult, FavlistItem, FolloweeItem, Paging,
    UserCollectionsResult, UserContentItem, UserContentsResult,
    UserFavlistsResult, UserFolloweesResult,
)

BASE_URL = "https://developer.zhihu.com"
GLOBAL_SEARCH_URL = f"{BASE_URL}/api/v1/content/global_search"
ZHIHU_SEARCH_URL = f"{BASE_URL}/api/v1/content/zhihu_search"
HOT_LIST_URL = f"{BASE_URL}/api/v1/content/hot_list"
QUESTION_RECOMMENDATIONS_URL = f"{BASE_URL}/api/v1/user/question_recommendations"
ZHIDA_URL = f"{BASE_URL}/v1/chat/completions"
USER_CONTENTS_URL = f"{BASE_URL}/api/v1/user/contents"
USER_FOLLOWEES_URL = f"{BASE_URL}/api/v1/user/followees"
USER_COLLECTIONS_URL = f"{BASE_URL}/api/v1/user/collections"
USER_FAVLISTS_URL = f"{BASE_URL}/api/v1/user/favlists"
CREATOR_ACCOUNT_STATS_URL = f"{BASE_URL}/api/v1/user/creator_account_stats"


class HttpZhihuProvider:
    name = "http"

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        access_secret: str | None = None,
    ):
        self.transport = transport
        self.access_secret = access_secret

    def _headers(self) -> dict[str, str]:
        access_secret = self.access_secret
        if access_secret is None:
            access_secret = os.getenv("ZHIHU_ACCESS_SECRET", "").strip()
        if not access_secret:
            raise ZhihuAPIError(
                503,
                "ZHIHU_NOT_CONFIGURED",
                "尚未配置知乎开放平台 Access Secret。",
            )
        return {
            "Authorization": f"Bearer {access_secret}",
            "X-Request-Timestamp": str(int(time.time())),
            "Content-Type": "application/json",
        }

    async def _request(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
    ) -> Any:
        try:
            async with httpx.AsyncClient(timeout=60.0, transport=self.transport) as client:
                response = await client.request(
                    method,
                    url,
                    params=params,
                    json=json,
                    headers=self._headers(),
                )
        except ImportError as error:
            raise ZhihuAPIError(
                503,
                "ZHIHU_PROXY_UNAVAILABLE",
                "当前网络需要 SOCKS 代理，但后端代理依赖尚未安装。",
            ) from error
        except httpx.TimeoutException as error:
            raise ZhihuAPIError(
                504,
                "ZHIHU_TIMEOUT",
                "请求知乎开放平台超时，请稍后重试。",
                retryable=True,
            ) from error
        except httpx.RequestError as error:
            raise ZhihuAPIError(
                502,
                "ZHIHU_NETWORK_ERROR",
                "暂时无法连接知乎开放平台。",
                retryable=True,
            ) from error

        if response.status_code in (401, 403):
            raise ZhihuAPIError(503, "ZHIHU_AUTH_INVALID", "知乎开放平台凭证无效，请重新配置。")
        if response.status_code == 429:
            raise ZhihuAPIError(
                429,
                "ZHIHU_RATE_LIMITED",
                "知乎开放平台请求过于频繁，请稍后再试。",
                retryable=True,
            )
        if not response.is_success:
            raise ZhihuAPIError(
                502,
                "ZHIHU_UPSTREAM_ERROR",
                "知乎开放平台暂时不可用。",
                retryable=True,
            )
        try:
            return response.json()
        except ValueError as error:
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎开放平台返回了无法识别的数据。") from error

    @staticmethod
    def _data(payload: Any) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎开放平台返回了无法识别的数据。")
        code = payload.get("Code")
        if code != 0:
            errors = {
                10001: (400, "ZHIHU_INVALID_ARGUMENT", "知乎开放平台拒绝了请求参数。", False),
                20001: (503, "ZHIHU_AUTH_INVALID", "知乎开放平台凭证无效，请重新配置。", False),
                30001: (429, "ZHIHU_RATE_LIMITED", "知乎开放平台请求过于频繁，请稍后再试。", True),
                30002: (429, "ZHIHU_QUOTA_EXHAUSTED", "知乎开放平台调用额度已用尽。", False),
                30003: (403, "ZHIHU_RISK_REJECTED", "知乎开放平台拒绝了本次请求。", False),
            }
            status, error_code, message, retryable = errors.get(
                code,
                (502, "ZHIHU_UPSTREAM_ERROR", "知乎开放平台暂时不可用。", True),
            )
            raise ZhihuAPIError(status, error_code, message, retryable=retryable)
        data = payload.get("Data")
        if not isinstance(data, dict):
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎开放平台返回了无法识别的数据。")
        return data

    @staticmethod
    def _search_result(data: dict[str, Any]) -> SearchResult:
        raw_items = data.get("Items")
        if not isinstance(raw_items, list):
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎搜索返回了无法识别的数据。")
        items: list[SearchItem] = []
        try:
            for item in raw_items:
                comments = item.get("CommentInfoList", [])
                items.append(
                    SearchItem(
                        title=item["Title"],
                        contentType=item["ContentType"],
                        contentId=str(item["ContentID"]),
                        contentText=item["ContentText"],
                        url=item["Url"],
                        commentCount=item["CommentCount"],
                        voteUpCount=item["VoteUpCount"],
                        authorName=item["AuthorName"],
                        authorAvatar=item["AuthorAvatar"],
                        authorBadge=item["AuthorBadge"],
                        authorBadgeText=item["AuthorBadgeText"],
                        editTime=item["EditTime"],
                        comments=[comment["Content"] for comment in comments],
                        authorityLevel=item["AuthorityLevel"],
                        rankingScore=item.get("RankingScore"),
                    )
                )
            return SearchResult(
                hasMore=data["HasMore"],
                items=items,
                searchHashId=data.get("SearchHashId"),
                emptyReason=data.get("EmptyReason"),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎搜索返回了无法识别的数据。") from error

    async def question_recommendations(
        self,
        payload: QuestionRecommendationsInput,
    ) -> QuestionRecommendationsResult:
        params: dict[str, object] = {"Count": payload.count}
        if payload.query is not None:
            params["Query"] = payload.query
        data = self._data(
            await self._request("GET", QUESTION_RECOMMENDATIONS_URL, params=params)
        )
        raw_items = data.get("Items")
        if not isinstance(raw_items, list):
            raise ZhihuAPIError(
                502,
                "ZHIHU_INVALID_RESPONSE",
                "知乎问题推荐返回了无法识别的数据。",
            )
        try:
            items = [
                QuestionRecommendationItem(title=item["Title"], url=item["Url"])
                for item in raw_items
            ]
        except (KeyError, TypeError, ValueError) as error:
            raise ZhihuAPIError(
                502,
                "ZHIHU_INVALID_RESPONSE",
                "知乎问题推荐返回了无法识别的数据。",
            ) from error
        return QuestionRecommendationsResult(
            mode="topic" if payload.query is not None else "service_account_profile",
            items=items,
        )

    async def hot_list(self, payload: HotListInput) -> HotListResult:
        data = self._data(await self._request("GET", HOT_LIST_URL, params={"Limit": payload.limit}))
        raw_items = data.get("Items")
        if not isinstance(raw_items, list):
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎热榜返回了无法识别的数据。")
        try:
            items = [
                HotListItem(
                    title=item["Title"],
                    url=item["Url"],
                    thumbnailUrl=item["ThumbnailUrl"],
                    summary=item["Summary"],
                )
                for item in raw_items
            ]
            total = data.get("Total", len(items))
            return HotListResult(total=total, items=items)
        except (KeyError, TypeError, ValueError) as error:
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎热榜返回了无法识别的数据。") from error

    async def zhihu_search(self, payload: ZhihuSearchInput) -> SearchResult:
        data = self._data(
            await self._request(
                "GET",
                ZHIHU_SEARCH_URL,
                params={"Query": payload.query, "Count": payload.count},
            )
        )
        return self._search_result(data)

    async def global_search(self, payload: GlobalSearchInput) -> SearchResult:
        params: dict[str, object] = {
            "Query": payload.query,
            "Count": payload.count,
            "SearchDB": payload.search_db,
        }
        if payload.filter:
            params["Filter"] = payload.filter
        data = self._data(await self._request("GET", GLOBAL_SEARCH_URL, params=params))
        return self._search_result(data)

    async def zhida(self, payload: ZhidaInput) -> ZhidaResult:
        response = await self._request(
            "POST",
            ZHIDA_URL,
            json={
                "model": payload.model,
                "messages": [{"role": "user", "content": payload.query}],
                "stream": False,
            },
        )
        try:
            answer = response["choices"][0]["message"]["content"]
            model = response.get("model", payload.model)
            if not isinstance(answer, str) or not isinstance(model, str):
                raise TypeError
            return ZhidaResult(answer=answer, model=model)
        except (AttributeError, KeyError, IndexError, TypeError) as error:
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", "知乎直答返回了无法识别的数据。") from error

    @staticmethod
    def _value(item: dict[str, Any], key: str, default: Any = "") -> Any:
        return item.get(key, item.get(key[:1].lower() + key[1:], default))

    @classmethod
    def _paging(cls, data: dict[str, Any]) -> Paging | None:
        raw = data.get("Paging", data.get("paging"))
        if not isinstance(raw, dict):
            return None
        return Paging(isEnd=bool(cls._value(raw, "IsEnd", True)), totals=cls._value(raw, "Totals", None), next=cls._value(raw, "Next", None))

    @staticmethod
    def _items(data: dict[str, Any], label: str) -> list[dict[str, Any]]:
        raw = data.get("Items", data.get("items"))
        if not isinstance(raw, list) or not all(isinstance(item, dict) for item in raw):
            raise ZhihuAPIError(502, "ZHIHU_INVALID_RESPONSE", f"知乎{label}返回了无法识别的数据。")
        return raw

    async def user_contents(self, content_type: str = "all", limit: int = 20) -> UserContentsResult:
        data = self._data(await self._request("GET", USER_CONTENTS_URL, params={"ContentType": content_type, "Limit": limit}))
        items = [UserContentItem(title=str(self._value(i, "Title")), url=str(self._value(i, "Url")), contentType=str(self._value(i, "ContentType")), excerpt=str(self._value(i, "Excerpt", self._value(i, "ContentText"))), voteUpCount=int(self._value(i, "VoteUpCount", 0) or 0), commentCount=int(self._value(i, "CommentCount", 0) or 0)) for i in self._items(data, "用户内容")]
        return UserContentsResult(items=items, paging=self._paging(data))

    async def user_followees(self, limit: int = 20) -> UserFolloweesResult:
        data = self._data(await self._request("GET", USER_FOLLOWEES_URL, params={"Limit": limit}))
        items = [FolloweeItem(fullname=str(self._value(i, "Fullname")), urlToken=str(self._value(i, "UrlToken")), url=str(self._value(i, "Url")), avatarUrl=str(self._value(i, "AvatarUrl"))) for i in self._items(data, "用户关注")]
        return UserFolloweesResult(items=items, paging=self._paging(data))

    async def user_collections(self, limit: int = 20) -> UserCollectionsResult:
        data = self._data(await self._request("GET", USER_COLLECTIONS_URL, params={"Limit": limit}))
        items = [CollectionContentItem(title=str(self._value(i, "Title")), url=str(self._value(i, "Url")), contentType=str(self._value(i, "ContentType")), excerpt=str(self._value(i, "Excerpt", self._value(i, "ContentText")))) for i in self._items(data, "收藏内容")]
        return UserCollectionsResult(items=items, paging=self._paging(data))

    async def user_favlists(self, limit: int = 20) -> UserFavlistsResult:
        data = self._data(await self._request("GET", USER_FAVLISTS_URL, params={"Limit": limit}))
        items = [FavlistItem(urlToken=str(self._value(i, "UrlToken")), url=str(self._value(i, "Url")), title=str(self._value(i, "Title")), description=str(self._value(i, "Description")), isPublic=bool(self._value(i, "IsPublic", False))) for i in self._items(data, "收藏夹")]
        return UserFavlistsResult(items=items, paging=self._paging(data))

    async def creator_account_stats(self) -> CreatorStatsResult:
        data = self._data(await self._request("GET", CREATOR_ACCOUNT_STATS_URL))
        def mapping(key: str) -> dict[str, object]:
            value = self._value(data, key, {})
            return value if isinstance(value, dict) else {}
        return CreatorStatsResult(metrics=mapping("Metrics"), audience=mapping("Audience"), creationCounts=mapping("CreationCounts"), followers=mapping("Followers"))

    async def close(self) -> None:
        return None
