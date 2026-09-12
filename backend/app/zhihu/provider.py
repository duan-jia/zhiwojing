from typing import Protocol

from .models import (
    GlobalSearchInput,
    HotListInput,
    HotListResult,
    QuestionRecommendationsInput,
    QuestionRecommendationsResult,
    SearchResult,
    ZhidaInput,
    ZhidaResult,
    ZhihuSearchInput,
    UserContentsInput, UserContentsResult, UserFolloweesInput, UserFolloweesResult,
    UserCollectionsInput, UserCollectionsResult, UserFavlistsInput, UserFavlistsResult,
    CreatorAccountStatsInput, CreatorStatsResult,
)


class ZhihuProvider(Protocol):
    name: str

    async def hot_list(self, payload: HotListInput) -> HotListResult: ...

    async def zhihu_search(self, payload: ZhihuSearchInput) -> SearchResult: ...

    async def global_search(self, payload: GlobalSearchInput) -> SearchResult: ...

    async def zhida(self, payload: ZhidaInput) -> ZhidaResult: ...

    async def close(self) -> None: ...


class QuestionRecommendationsProvider(Protocol):
    async def question_recommendations(
        self,
        payload: QuestionRecommendationsInput,
    ) -> QuestionRecommendationsResult: ...


class UserProvider(Protocol):
    async def user_contents(self, content_type: str = "all", limit: int = 20) -> UserContentsResult: ...
    async def user_followees(self, limit: int = 20) -> UserFolloweesResult: ...
    async def user_collections(self, limit: int = 20) -> UserCollectionsResult: ...
    async def user_favlists(self, limit: int = 20) -> UserFavlistsResult: ...
    async def creator_account_stats(self) -> CreatorStatsResult: ...
