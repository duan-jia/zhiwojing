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
