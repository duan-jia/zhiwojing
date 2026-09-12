from typing import Literal

from pydantic import BaseModel, Field, field_validator


class QuestionRecommendationsInput(BaseModel):
    query: str | None = Field(default=None, min_length=2, max_length=100)
    count: int = Field(default=5, ge=1, le=20)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) < 2:
            raise ValueError("主题至少需要 2 个字符")
        return value


class QuestionRecommendationItem(BaseModel):
    title: str
    url: str


class QuestionRecommendationsResult(BaseModel):
    mode: Literal["topic", "service_account_profile"]
    items: list[QuestionRecommendationItem]


class HotListInput(BaseModel):
    limit: int = Field(default=10, ge=1, le=30)


class UserContentsInput(BaseModel):
    content_type: str = Field(default="all", min_length=1)
    limit: int = Field(default=20, ge=1, le=50)


class UserFolloweesInput(BaseModel):
    limit: int = Field(default=20, ge=1, le=50)


class UserCollectionsInput(BaseModel):
    limit: int = Field(default=20, ge=1, le=50)


class UserFavlistsInput(BaseModel):
    limit: int = Field(default=20, ge=1, le=50)


class CreatorAccountStatsInput(BaseModel):
    pass


class ZhihuSearchInput(BaseModel):
    query: str = Field(min_length=2, max_length=100)
    count: int = Field(default=10, ge=1, le=10)

    @field_validator("query")
    @classmethod
    def query_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("查询词至少需要 2 个字符")
        return value


class GlobalSearchInput(BaseModel):
    query: str = Field(min_length=2, max_length=100)
    count: int = Field(default=10, ge=1, le=20)
    filter: str | None = None
    search_db: Literal["all", "realtime", "static"] = "all"

    @field_validator("query")
    @classmethod
    def query_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("查询词至少需要 2 个字符")
        return value

    @field_validator("filter")
    @classmethod
    def normalize_filter(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class ZhidaInput(BaseModel):
    query: str = Field(min_length=2, max_length=4000)
    model: Literal[
        "zhida-fast-1p5",
        "zhida-thinking-1p5",
        "zhida-agent",
    ] = "zhida-fast-1p5"

    @field_validator("query")
    @classmethod
    def query_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("问题至少需要 2 个字符")
        return value


class HotListItem(BaseModel):
    title: str
    url: str
    thumbnailUrl: str
    summary: str


class HotListResult(BaseModel):
    total: int
    items: list[HotListItem]


class UserContentItem(BaseModel):
    title: str = ""
    url: str = ""
    contentType: str = ""
    excerpt: str = ""
    voteUpCount: int = 0
    commentCount: int = 0


class FolloweeItem(BaseModel):
    fullname: str = ""
    urlToken: str = ""
    url: str = ""
    avatarUrl: str = ""


class CollectionContentItem(BaseModel):
    title: str = ""
    url: str = ""
    contentType: str = ""
    excerpt: str = ""


class FavlistItem(BaseModel):
    urlToken: str = ""
    url: str = ""
    title: str = ""
    description: str = ""
    isPublic: bool = False


class Paging(BaseModel):
    isEnd: bool = True
    totals: int | None = None
    next: str | None = None


class UserContentsResult(BaseModel):
    items: list[UserContentItem]
    paging: Paging | None = None


class UserFolloweesResult(BaseModel):
    items: list[FolloweeItem]
    paging: Paging | None = None


class UserCollectionsResult(BaseModel):
    items: list[CollectionContentItem]
    paging: Paging | None = None


class UserFavlistsResult(BaseModel):
    items: list[FavlistItem]
    paging: Paging | None = None


class CreatorStatsResult(BaseModel):
    metrics: dict[str, object] = Field(default_factory=dict)
    audience: dict[str, object] = Field(default_factory=dict)
    creationCounts: dict[str, object] = Field(default_factory=dict)
    followers: dict[str, object] = Field(default_factory=dict)


class SearchItem(BaseModel):
    title: str
    contentType: str
    contentId: str
    contentText: str
    url: str
    commentCount: int
    voteUpCount: int
    authorName: str
    authorAvatar: str
    authorBadge: str
    authorBadgeText: str
    editTime: int
    comments: list[str]
    authorityLevel: str
    rankingScore: float | None = None


class SearchResult(BaseModel):
    hasMore: bool
    items: list[SearchItem]
    searchHashId: str | None = None
    emptyReason: str | None = None


class ZhidaResult(BaseModel):
    answer: str
    model: str


class DraftReference(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=1, max_length=2000)
    summary: str = Field(default="", max_length=2000)


class DraftInput(BaseModel):
    idea: str
    goal: Literal["知乎回答", "知乎文章"] = "知乎回答"
    tone: str | None = None
    references: list[DraftReference] = Field(default_factory=list, max_length=10)


class DraftProfile(BaseModel):
    name: str
    interests: list[str]
    style: str


class DraftResult(BaseModel):
    draft: str
    rationale: list[str]
    profile: DraftProfile
