import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app.zhihu.errors import CapabilityError, ZhihuAPIError
from app.zhihu.http_provider import (
    GLOBAL_SEARCH_URL,
    HOT_LIST_URL,
    QUESTION_RECOMMENDATIONS_URL,
    ZHIDA_URL,
    ZHIHU_SEARCH_URL,
    HttpZhihuProvider,
)
from app.zhihu.mcp_provider import McpZhihuProvider
from app.zhihu.models import (
    DraftProfile,
    GlobalSearchInput,
    HotListInput,
    QuestionRecommendationsInput,
    ZhidaInput,
    ZhihuSearchInput,
)
from app.zhihu.registry import ToolContext, build_tool_registry


def search_item() -> dict[str, object]:
    return {
        "Title": "搜索标题", "ContentType": "Article", "ContentID": "123",
        "ContentText": "搜索摘要", "Url": "https://www.zhihu.com/p/123",
        "CommentCount": 2, "VoteUpCount": 9, "AuthorName": "作者",
        "AuthorAvatar": "https://example.com/avatar.jpg", "AuthorBadge": "",
        "AuthorBadgeText": "", "EditTime": 1700000000,
        "CommentInfoList": [{"Content": "评论"}], "AuthorityLevel": "2",
        "RankingScore": 0.98,
    }


class HttpZhihuProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_capabilities_send_auth_and_normalize(self):
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            self.assertEqual(request.headers["Authorization"], "Bearer test-secret")
            self.assertTrue(request.headers["X-Request-Timestamp"].isdigit())
            url = str(request.url.copy_with(query=None))
            if url == HOT_LIST_URL:
                return httpx.Response(200, json={"Code": 0, "Data": {"Total": 1, "Items": [{"Title": "热榜", "Url": "https://www.zhihu.com/question/1", "ThumbnailUrl": "", "Summary": "摘要"}]}})
            if url == QUESTION_RECOMMENDATIONS_URL:
                return httpx.Response(200, json={"Code": 0, "Data": {"Items": [{"Title": "推荐问题", "Url": "https://www.zhihu.com/question/2"}]}})
            if url in (ZHIHU_SEARCH_URL, GLOBAL_SEARCH_URL):
                return httpx.Response(200, json={"Code": 0, "Data": {"HasMore": False, "Items": [search_item()]}})
            if url == ZHIDA_URL:
                return httpx.Response(200, json={"model": "zhida-fast-1p5", "choices": [{"message": {"content": "直答内容"}}]})
            return httpx.Response(404)

        provider = HttpZhihuProvider(access_secret="test-secret", transport=httpx.MockTransport(handler))
        hot = await provider.hot_list(HotListInput(limit=2))
        zhihu = await provider.zhihu_search(ZhihuSearchInput(query="人工智能", count=3))
        global_result = await provider.global_search(GlobalSearchInput(query="人工智能", count=4, filter='host=="example.com"', search_db="realtime"))
        answer = await provider.zhida(ZhidaInput(query="什么是智能体"))
        topic_questions = await provider.question_recommendations(
            QuestionRecommendationsInput(query="AI Agent", count=5)
        )
        profile_questions = await provider.question_recommendations(
            QuestionRecommendationsInput(count=3)
        )

        self.assertEqual(hot.items[0].title, "热榜")
        self.assertEqual(zhihu.items[0].comments, ["评论"])
        self.assertEqual(global_result.items[0].rankingScore, 0.98)
        self.assertEqual(answer.answer, "直答内容")
        self.assertEqual(topic_questions.mode, "topic")
        self.assertEqual(profile_questions.mode, "service_account_profile")
        self.assertEqual(topic_questions.items[0].title, "推荐问题")
        self.assertEqual(requests[0].url.params["Limit"], "2")
        self.assertEqual(requests[1].url.params["Count"], "3")
        self.assertEqual(requests[2].url.params["SearchDB"], "realtime")
        self.assertEqual(requests[2].url.params["Filter"], 'host=="example.com"')
        self.assertEqual(requests[3].method, "POST")
        self.assertEqual(requests[4].url.params["Query"], "AI Agent")
        self.assertEqual(requests[4].url.params["Count"], "5")
        self.assertNotIn("Query", requests[5].url.params)
        self.assertNotIn("test-secret", str([hot, zhihu, global_result, answer, topic_questions]))

    async def test_business_errors_are_mapped_without_leaking_secret(self):
        cases = [(10001, 400, "ZHIHU_INVALID_ARGUMENT"), (20001, 503, "ZHIHU_AUTH_INVALID"), (30001, 429, "ZHIHU_RATE_LIMITED"), (30002, 429, "ZHIHU_QUOTA_EXHAUSTED"), (30003, 403, "ZHIHU_RISK_REJECTED"), (90001, 502, "ZHIHU_UPSTREAM_ERROR")]
        for upstream_code, status_code, error_code in cases:
            with self.subTest(upstream_code=upstream_code):
                provider = HttpZhihuProvider(access_secret="test-secret", transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"Code": upstream_code})))
                with self.assertRaises(ZhihuAPIError) as raised:
                    await provider.hot_list(HotListInput())
                self.assertEqual(raised.exception.status_code, status_code)
                self.assertEqual(raised.exception.code, error_code)
                self.assertNotIn("test-secret", str(raised.exception))

    async def test_missing_configuration_timeout_and_invalid_payload(self):
        with patch.dict(os.environ, {"ZHIHU_ACCESS_SECRET": ""}):
            with self.assertRaises(ZhihuAPIError) as missing:
                await HttpZhihuProvider().hot_list(HotListInput())
        self.assertEqual(missing.exception.code, "ZHIHU_NOT_CONFIGURED")

        def timeout(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("timed out", request=request)

        provider = HttpZhihuProvider(access_secret="secret", transport=httpx.MockTransport(timeout))
        with self.assertRaises(ZhihuAPIError) as timed_out:
            await provider.hot_list(HotListInput())
        self.assertEqual(timed_out.exception.code, "ZHIHU_TIMEOUT")

        invalid = HttpZhihuProvider(access_secret="secret", transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"Code": 0, "Data": {"Items": [{}]}})))
        with self.assertRaises(ZhihuAPIError) as malformed:
            await invalid.hot_list(HotListInput())
        self.assertEqual(malformed.exception.code, "ZHIHU_INVALID_RESPONSE")

    async def test_question_recommendations_allow_empty_and_reject_malformed_items(self):
        empty = HttpZhihuProvider(
            access_secret="secret",
            transport=httpx.MockTransport(
                lambda _: httpx.Response(200, json={"Code": 0, "Data": {"Items": []}})
            ),
        )
        result = await empty.question_recommendations(QuestionRecommendationsInput())
        self.assertEqual(result.mode, "service_account_profile")
        self.assertEqual(result.items, [])

        invalid = HttpZhihuProvider(
            access_secret="secret",
            transport=httpx.MockTransport(
                lambda _: httpx.Response(200, json={"Code": 0, "Data": {"Items": [{}]}})
            ),
        )
        with self.assertRaises(ZhihuAPIError) as malformed:
            await invalid.question_recommendations(QuestionRecommendationsInput(query="AI"))
        self.assertEqual(malformed.exception.code, "ZHIHU_INVALID_RESPONSE")


class McpZhihuProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_mcp_results_are_normalized_to_shared_models(self):
        provider = McpZhihuProvider(access_secret="test-secret")
        provider._call = AsyncMock(side_effect=[
            '<hot_list total="1"><item rank="1"><title>热榜</title><url>https://www.zhihu.com/question/1</url><thumbnail_url></thumbnail_url><summary>摘要</summary></item></hot_list>',
            '<zhihu_search query="AI"><search_item title="标题" content_type="Article" url="https://www.zhihu.com/p/1" author_name="作者" author_avatar="" author_badge_text="" edit_time="2025-03-01 10:00:00 +0000 UTC" authority_level="2" ranking_score="0.9">正文<em>摘要</em></search_item></zhihu_search>',
            '<global_search query="AI"><search_item title="全网标题" content_type="Article" url="https://example.com/1" author_name="作者" author_avatar="" author_badge_text="" authority_level="1">全网摘要</search_item></global_search>',
            "直答内容",
        ])
        hot = await provider.hot_list(HotListInput())
        zhihu = await provider.zhihu_search(ZhihuSearchInput(query="AI"))
        global_result = await provider.global_search(GlobalSearchInput(query="AI"))
        answer = await provider.zhida(ZhidaInput(query="解释 AI"))

        self.assertEqual(hot.items[0].summary, "摘要")
        self.assertEqual(zhihu.items[0].rankingScore, 0.9)
        self.assertEqual(zhihu.items[0].contentText, "正文摘要")
        self.assertGreater(zhihu.items[0].editTime, 0)
        self.assertEqual(global_result.items[0].title, "全网标题")
        self.assertEqual(answer.answer, "直答内容")
        self.assertEqual(provider._call.await_args_list[0].args, ("hot_list", {"limit": 10}))

    async def test_invalid_mcp_xml_is_rejected(self):
        provider = McpZhihuProvider(access_secret="test-secret")
        provider._call = AsyncMock(return_value="not xml")
        with self.assertRaises(ZhihuAPIError) as raised:
            await provider.hot_list(HotListInput())
        self.assertEqual(raised.exception.code, "ZHIHU_INVALID_RESPONSE")


class ToolRegistryTests(unittest.IsolatedAsyncioTestCase):
    async def test_registry_exposes_agent_ready_schemas(self):
        registry = build_tool_registry(
            "http",
            profile_resolver=lambda user_id: DraftProfile(
                name=f"用户 {user_id}",
                interests=["科技"],
                style="严肃",
            ),
        )
        schemas = registry.schemas()
        self.assertEqual(
            [schema["name"] for schema in schemas],
            [
                "question_recommendations",
                "hot_list",
                "zhihu_search",
                "global_search",
                "zhida",
                "generate_draft",
            ],
        )
        self.assertTrue(all(schema["type"] == "function" for schema in schemas))
        self.assertEqual(registry.provider_name, "http")
        self.assertEqual(registry.draft_provider_name, "local-template")
        self.assertNotIn("user_id", str(schemas))
        self.assertNotIn("oauth_token", str(schemas))

        draft = await registry.execute(
            "generate_draft",
            {"idea": "如何理解智能体", "goal": "知乎回答"},
            ToolContext(user_id=7, oauth_token="do-not-expose"),
        )
        self.assertEqual(draft.profile.name, "用户 7")
        self.assertNotIn("do-not-expose", str(draft))

        with self.assertRaises(CapabilityError) as missing_context:
            await registry.execute("generate_draft", {"idea": "如何理解智能体"})
        self.assertEqual(missing_context.exception.code, "USER_CONTEXT_REQUIRED")

        with self.assertRaises(CapabilityError) as unknown:
            await registry.execute("missing", {})
        self.assertEqual(unknown.exception.code, "TOOL_NOT_FOUND")

    async def test_mcp_selection_keeps_recommendations_on_http(self):
        registry = build_tool_registry("mcp")
        self.assertEqual(registry.provider_name, "mcp")
        self.assertIsInstance(registry.recommendations_provider, HttpZhihuProvider)


if __name__ == "__main__":
    unittest.main()
