import os
from typing import Literal

from pydantic import BaseModel


CapabilityStatus = Literal["ready", "unconfigured", "auth_required", "coming_soon"]


class BuildingCapability(BaseModel):
    id: str
    label: str
    description: str
    status: CapabilityStatus
    authScope: Literal["app", "session", "zhihu_oauth"]
    ui: str


class BuildingCatalogItem(BaseModel):
    id: str
    name: str
    icon: str
    description: str
    capabilities: list[BuildingCapability]


class BuildingCatalog(BaseModel):
    revision: str
    buildings: list[BuildingCatalogItem]


def _capability(
    id: str,
    label: str,
    description: str,
    *,
    ui: str,
    implemented: bool = False,
    requires_access_secret: bool = True,
    auth_scope: Literal["app", "session", "zhihu_oauth"] = "app",
) -> BuildingCapability:
    if not implemented:
        status: CapabilityStatus = "coming_soon"
    elif auth_scope == "zhihu_oauth":
        # OAuth is still a contract placeholder. Do not present server-account
        # data as belonging to the currently signed-in game user.
        status = "auth_required"
    elif requires_access_secret and not os.getenv("ZHIHU_ACCESS_SECRET", "").strip():
        status = "unconfigured"
    else:
        status = "ready"
    return BuildingCapability(
        id=id,
        label=label,
        description=description,
        status=status,
        authScope=auth_scope,
        ui=ui,
    )


def build_building_catalog() -> BuildingCatalog:
    """Return safe presentation metadata; never expose credentials or upstream URLs."""
    return BuildingCatalog(
        revision="2026-09-1",
        buildings=[
            BuildingCatalogItem(
                id="hot",
                name="知乎热榜",
                icon="榜",
                description="发现此刻值得关注的知乎讨论",
                capabilities=[
                    _capability("hot_list", "浏览热榜", "查看当前知乎热门讨论。", ui="hot-list", implemented=True),
                ],
            ),
            BuildingCatalogItem(
                id="home",
                name="知我居",
                icon="居",
                description="看见你的内容、关注、收藏与个人分身",
                capabilities=[
                    _capability("user_contents", "我的内容", "查看最近发布的回答、文章和想法。", ui="user-contents", implemented=True, auth_scope="zhihu_oauth"),
                    _capability("user_followees", "我的关注", "查看当前知乎账号关注的用户。", ui="user-followees", implemented=True, auth_scope="zhihu_oauth"),
                    _capability("user_collections", "近期收藏", "查看最近收藏的知乎内容。", ui="user-collections", implemented=True, auth_scope="zhihu_oauth"),
                    _capability("user_favlists", "收藏夹", "查看创建或关注的收藏夹。", ui="user-favlists", implemented=True, auth_scope="zhihu_oauth"),
                    _capability("favlist_contents", "收藏夹内容", "浏览指定收藏夹中的条目。", ui="favlist-contents", auth_scope="zhihu_oauth"),
                    _capability("persona", "我的人设", "从知乎足迹生成或刷新分身人设。", ui="persona", implemented=True, requires_access_secret=False, auth_scope="session"),
                    _capability("zhihu_oauth", "连接知乎账号", "授权后按当前用户读取个人知乎数据。", ui="oauth", auth_scope="zhihu_oauth"),
                ],
            ),
            BuildingCatalogItem(
                id="book",
                name="藏书阁",
                icon="书",
                description="搜索知乎、全网与个人知识库",
                capabilities=[
                    _capability("zhihu_search", "搜知乎", "搜索知乎问题、回答和文章。", ui="search-zhihu", implemented=True),
                    _capability("global_search", "搜全网", "查找知乎之外的新闻、官网和资料。", ui="search-global", implemented=True),
                    _capability("question_answers", "查看问题回答", "按问题链接阅读回答列表。", ui="question-answers"),
                    _capability("knowledge_bases", "知识库", "查看可访问的个人知识库。", ui="knowledge-bases", auth_scope="zhihu_oauth"),
                    _capability("knowledge_base_items", "知识库条目", "浏览指定知识库中的资料。", ui="knowledge-items", auth_scope="zhihu_oauth"),
                    _capability("knowledge_file_upload", "收录文件", "上传文件并加入知识库。", ui="knowledge-upload", auth_scope="zhihu_oauth"),
                    _capability("knowledge_search", "检索知识库", "从知识库中检索相关片段和来源。", ui="knowledge-search", auth_scope="zhihu_oauth"),
                ],
            ),
            BuildingCatalogItem(
                id="wendao",
                name="问道馆",
                icon="问",
                description="向知乎直答提出问题",
                capabilities=[
                    _capability("zhida", "知乎直答", "检索并生成一个综合回答。", ui="answer", implemented=True),
                ],
            ),
            BuildingCatalogItem(
                id="write",
                name="创作坊",
                icon="创",
                description="寻找选题、生成草稿并复盘创作",
                capabilities=[
                    _capability("question_recommendations", "寻找选题", "按主题推荐适合回答的问题。", ui="question-recommendations", implemented=True),
                    _capability("generate_draft", "生成草稿", "根据想法生成待检查的知乎回答或文章草稿。", ui="draft", implemented=True, requires_access_secret=False, auth_scope="session"),
                    _capability("creator_account_stats", "创作数据", "查看账号整体创作表现。", ui="creator-stats", implemented=True, auth_scope="zhihu_oauth"),
                    _capability("user_content_detail", "内容详情", "读取自己创作内容的完整正文。", ui="content-detail", auth_scope="zhihu_oauth"),
                    _capability("user_content_comments", "评论回顾", "查看自己内容下的评论。", ui="content-comments", auth_scope="zhihu_oauth"),
                    _capability("creator_content_stats", "单篇分析", "分析指定内容的表现数据。", ui="content-stats", auth_scope="zhihu_oauth"),
                ],
            ),
            BuildingCatalogItem(
                id="tiangong",
                name="天工坊",
                icon="工",
                description="处理文件并生成可交付成果",
                capabilities=[
                    _capability("pdf_parse", "解析 PDF", "上传 PDF 并提取结构化内容。", ui="pdf-parse"),
                    _capability("ppt_generation", "生成 PPT", "根据资料链接生成演示文稿。", ui="ppt-generation"),
                ],
            ),
        ],
    )
