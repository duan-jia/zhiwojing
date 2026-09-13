import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from sqlmodel import Session, create_engine, select

from app import main


class ApiTests(unittest.IsolatedAsyncioTestCase):
    oauth_environment = {
        "ZHIHU_OAUTH_APP_ID": "",
        "ZHIHU_OAUTH_REDIRECT_URI": "",
        "ZHIHU_OAUTH_APP_KEY": "",
        "ZHIHU_ACCESS_SECRET": "",
    }

    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.original_engine = main.engine
        main.engine = create_engine(
            f"sqlite:///{Path(self.directory.name) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        main.startup()
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=main.app),
            base_url="http://testserver",
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        main.engine.dispose()
        main.engine = self.original_engine
        self.directory.cleanup()

    async def generate(self, **changes):
        return await self.client.post(
            "/api/avatar/draft", json={"idea": "人工智能如何帮助学习", **changes}
        )

    async def test_health_and_profile(self):
        health = await self.client.get("/api/health")
        profile = await self.client.get("/api/me")
        self.assertEqual(health.json()["status"], "ok")
        self.assertEqual(profile.json()["name"], "体验用户")

    async def test_building_catalog_assigns_every_capability(self):
        with patch.dict(os.environ, {"ZHIHU_ACCESS_SECRET": ""}):
            response = await self.client.get("/api/world/buildings")

        self.assertEqual(response.status_code, 200)
        catalog = response.json()
        self.assertEqual([item["id"] for item in catalog["buildings"]], [
            "hot", "home", "book", "wendao", "write", "tiangong",
        ])
        capabilities = [
            capability
            for building in catalog["buildings"]
            for capability in building["capabilities"]
        ]
        ids = [capability["id"] for capability in capabilities]
        self.assertEqual(len(ids), len(set(ids)))
        # 22 user-facing Zhihu APIs (quota is operational) plus persona and draft.
        self.assertEqual(len(ids), 24)
        self.assertEqual(
            next(item for item in capabilities if item["id"] == "hot_list")["status"],
            "unconfigured",
        )
        self.assertEqual(
            next(item for item in capabilities if item["id"] == "generate_draft")["status"],
            "ready",
        )
        self.assertEqual(
            next(item for item in capabilities if item["id"] == "user_contents")["status"],
            "auth_required",
        )
        self.assertEqual(
            next(item for item in capabilities if item["id"] == "pdf_parse")["status"],
            "coming_soon",
        )

    async def test_invalid_inputs(self):
        for idea in ["", "  ", "学习", " 学习 "]:
            with self.subTest(idea=idea):
                response = await self.generate(idea=idea)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["detail"]["code"], "DRAFT_IDEA_TOO_SHORT")
                self.assertIn("3 个字", response.json()["detail"]["message"])
                self.assertFalse(response.json()["detail"]["retryable"])
        for idea in [None, 123]:
            with self.subTest(idea=idea):
                self.assertEqual((await self.generate(idea=idea)).status_code, 422)
        response = await self.client.post("/api/avatar/draft", json={})
        self.assertEqual(response.status_code, 422)
        self.assertEqual((await self.generate(idea="学编程")).status_code, 200)

    async def test_missing_user(self):
        profile = await self.client.get("/api/me?user_id=999")
        self.assertEqual(profile.status_code, 404)
        self.assertEqual((await self.generate(user_id=999)).status_code, 404)

    async def test_tone_changes_body_independently_of_goal(self):
        drafts = []
        for tone in ["清晰、真诚、有条理", "幽默", "严肃"]:
            result = (await self.generate(tone=tone)).json()
            self.assertIn("人工智能如何帮助学习", result["draft"])
            self.assertEqual(result["profile"]["style"], tone)
            self.assertEqual(len(result["rationale"]), 3)
            drafts.append(result["draft"])
        self.assertEqual(len(set(drafts)), 3)

    async def test_article_has_sections_and_answer_does_not(self):
        answer = (await self.generate(tone="严肃")).json()["draft"]
        article = (await self.generate(tone="严肃", goal="知乎文章")).json()["draft"]
        self.assertNotEqual(answer, article)
        for heading in ["引言", "我的观点", "进一步讨论", "结语"]:
            self.assertIn(f"\n{heading}\n", article)
            self.assertNotIn(f"\n{heading}\n", answer)
        self.assertEqual((await self.generate(goal="不存在的格式")).status_code, 422)

    async def test_unknown_tone_has_explicit_default(self):
        result = (await self.generate(tone="不存在的语气")).json()
        default = (await self.generate()).json()
        self.assertEqual(result["draft"], default["draft"])
        self.assertIn("暂不支持", result["rationale"][0])
        self.assertEqual(result["profile"]["style"], "清晰、真诚、有条理")

    async def test_draft_accepts_traceable_references(self):
        result = (
            await self.generate(
                references=[
                    {
                        "title": "参考回答",
                        "url": "https://www.zhihu.com/question/1/answer/2",
                        "summary": "回答摘要",
                    }
                ]
            )
        ).json()
        self.assertIn("参考资料", result["draft"])
        self.assertIn("https://www.zhihu.com/question/1/answer/2", result["draft"])
        self.assertIn("1 条", result["rationale"][-1])

    async def test_cors(self):
        response = await self.client.options(
            "/api/avatar/draft",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:5173",
        )

    async def test_hot_list_requires_server_configuration(self):
        with patch.dict(os.environ, self.oauth_environment):
            response = await self.client.get("/api/zhihu/hot")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "ZHIHU_NOT_CONFIGURED")

    async def test_user_endpoints_require_server_configuration(self):
        paths = ["contents", "followees", "collections", "favlists", "creator-stats"]
        with patch.dict(os.environ, self.oauth_environment):
            responses = [await self.client.get(f"/api/zhihu/user/{path}") for path in paths]
        for response in responses:
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["detail"]["code"], "ZHIHU_NOT_CONFIGURED")
            self.assertIn("尚未配置", response.json()["detail"]["message"])

    async def test_hot_list_returns_normalized_items(self):
        result = {
            "total": 1,
            "items": [
                {
                    "title": "测试热榜",
                    "url": "https://www.zhihu.com/question/1",
                    "thumbnailUrl": "",
                    "summary": "摘要",
                }
            ],
        }
        execute = AsyncMock(return_value=result)
        with patch.object(main.tool_registry, "execute", new=execute):
            response = await self.client.get("/api/zhihu/hot?limit=1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)
        execute.assert_awaited_once_with("hot_list", {"limit": 1})

    async def test_hot_list_limit_is_validated_locally(self):
        for limit in [0, 31]:
            with self.subTest(limit=limit):
                response = await self.client.get(f"/api/zhihu/hot?limit={limit}")
                self.assertEqual(response.status_code, 422)

    async def test_question_recommendations_route_uses_registry(self):
        result = {
            "mode": "topic",
            "items": [
                {
                    "title": "如何理解 AI Agent？",
                    "url": "https://www.zhihu.com/question/1",
                }
            ],
        }
        execute = AsyncMock(return_value=result)
        with patch.object(main.tool_registry, "execute", new=execute):
            response = await self.client.get(
                "/api/zhihu/question-recommendations?query=AI%20Agent&count=5"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)
        execute.assert_awaited_once_with(
            "question_recommendations",
            {"query": "AI Agent", "count": 5},
        )

    async def test_search_and_answer_routes_use_registry(self):
        search_result = {
            "hasMore": False,
            "items": [],
            "searchHashId": None,
            "emptyReason": "没有结果",
        }
        answer_result = {"answer": "回答", "model": "zhida-fast-1p5"}
        execute = AsyncMock(side_effect=[search_result, search_result, answer_result])
        with patch.object(main.tool_registry, "execute", new=execute):
            zhihu = await self.client.get("/api/zhihu/search?query=人工智能&count=3")
            global_result = await self.client.get(
                "/api/zhihu/global-search?query=人工智能&count=4&search_db=realtime"
            )
            answer = await self.client.post(
                "/api/zhihu/answer",
                json={"query": "什么是智能体", "model": "zhida-fast-1p5"},
            )

        expected_search = {**search_result, "searchHashId": None}
        self.assertEqual(zhihu.json(), expected_search)
        self.assertEqual(global_result.json(), expected_search)
        self.assertEqual(answer.json(), answer_result)
        self.assertEqual(execute.await_args_list[0].args, ("zhihu_search", {"query": "人工智能", "count": 3}))
        self.assertEqual(
            execute.await_args_list[1].args,
            ("global_search", {"query": "人工智能", "count": 4, "filter": None, "search_db": "realtime"}),
        )
        self.assertEqual(
            execute.await_args_list[2].args,
            ("zhida", {"query": "什么是智能体", "model": "zhida-fast-1p5"}),
        )

    async def test_new_zhihu_routes_validate_inputs_locally(self):
        invalid_requests = [
            self.client.get("/api/zhihu/question-recommendations?query=a"),
            self.client.get("/api/zhihu/question-recommendations?query=AI&count=21"),
            self.client.get("/api/zhihu/search?query=a"),
            self.client.get("/api/zhihu/search?query=%20%20"),
            self.client.get("/api/zhihu/search?query=人工智能&count=11"),
            self.client.get("/api/zhihu/global-search?query=人工智能&search_db=wrong"),
            self.client.post("/api/zhihu/answer", json={"query": "a", "model": "zhida-fast-1p5"}),
            self.client.post("/api/zhihu/answer", json={"query": "人工智能", "model": "wrong"}),
        ]
        for request in invalid_requests:
            with self.subTest():
                self.assertEqual((await request).status_code, 422)

    async def test_startup_does_not_duplicate_user(self):
        main.startup()
        with Session(main.engine) as session:
            self.assertEqual(len(session.exec(select(main.User)).all()), 3)

    async def test_oauth_status_reports_reserved_interfaces_without_secrets(self):
        with patch.dict(os.environ, self.oauth_environment):
            response = await self.client.get("/api/oauth/status")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["configured"])
        self.assertFalse(payload["callbackConfigured"])
        self.assertFalse(payload["integrationReady"])
        self.assertFalse(payload["authorized"])
        self.assertEqual(
            payload["missingConfiguration"],
            ["app_id", "redirect_uri", "app_key", "access_secret"],
        )
        self.assertEqual(
            [item["id"] for item in payload["interfaces"]],
            ["contents", "followees", "favlists", "favlist_contents", "collections"],
        )

    async def test_oauth_routes_fail_safely_when_not_configured(self):
        with patch.dict(os.environ, self.oauth_environment):
            for path in ["/api/oauth/start", "/auth/callback?authorization_code=do-not-echo"]:
                with self.subTest(path=path):
                    response = await self.client.get(path)
                    self.assertEqual(response.status_code, 503)
                    self.assertEqual(response.json()["detail"]["code"], "OAUTH_NOT_CONFIGURED")
                    self.assertNotIn("do-not-echo", response.text)

    async def test_configured_oauth_skeleton_does_not_start_real_authorization(self):
        configured_environment = {
            "ZHIHU_OAUTH_APP_ID": "123456",
            "ZHIHU_OAUTH_REDIRECT_URI": "https://example.com/auth/callback",
            "ZHIHU_OAUTH_APP_KEY": "test-app-key-not-a-real-secret",
            "ZHIHU_ACCESS_SECRET": "test-access-secret-not-a-real-secret",
        }
        with patch.dict(os.environ, configured_environment):
            status = (await self.client.get("/api/oauth/status")).json()
            response = await self.client.get("/api/oauth/start")

        self.assertTrue(status["configured"])
        self.assertTrue(status["callbackConfigured"])
        self.assertFalse(status["integrationReady"])
        self.assertNotIn(configured_environment["ZHIHU_OAUTH_APP_KEY"], str(status))
        self.assertNotIn(configured_environment["ZHIHU_ACCESS_SECRET"], str(status))
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "OAUTH_NOT_IMPLEMENTED")

    async def test_oauth_callback_configuration_requires_public_https(self):
        for redirect_uri in [
            "http://example.com/auth/callback",
            "https://localhost/auth/callback",
            "https://127.0.0.1/auth/callback",
            "https://10.0.0.8/auth/callback",
            "https://example.com/wrong-path",
        ]:
            with self.subTest(redirect_uri=redirect_uri), patch.dict(
                os.environ,
                {
                    **self.oauth_environment,
                    "ZHIHU_OAUTH_APP_ID": "123456",
                    "ZHIHU_OAUTH_REDIRECT_URI": redirect_uri,
                },
            ):
                payload = (await self.client.get("/api/oauth/status")).json()
                self.assertFalse(payload["callbackConfigured"])
                self.assertIn("redirect_uri", payload["missingConfiguration"])

    async def test_oauth_run_all_requires_login_and_logout_is_idempotent(self):
        response = await self.client.post("/api/oauth/run-all")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"]["code"], "LOGIN_REQUIRED")
        first_logout = await self.client.post("/api/oauth/logout")
        second_logout = await self.client.post("/api/oauth/logout")
        self.assertEqual(first_logout.json(), {"ok": True})
        self.assertEqual(second_logout.json(), {"ok": True})


if __name__ == "__main__":
    unittest.main()
