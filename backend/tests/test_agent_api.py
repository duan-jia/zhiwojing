import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from httpx import ASGITransport, AsyncClient
from langchain_core.messages import AIMessage

from app.agent import (
    AgentRuntimeError,
    DEFAULT_LLM_BASE_URL,
    DEFAULT_LLM_MODEL,
    OWNER_TOOLS,
    READ_ONLY_TOOLS,
    AvatarAgentRuntime,
    create_llm,
    resolve_llm_api_key,
)
from app.main import app, agent_runtime, startup


class AgentContractTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        startup()

    async def post(self, path, payload):
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return await client.post(path, json=payload)

    async def test_llm_uses_hosted_defaults(self):
        with patch.dict(os.environ, {"LLM_API_KEY": "test-key"}, clear=True), patch(
            "app.agent.ChatOpenAI"
        ) as chat_openai:
            create_llm()

        chat_openai.assert_called_once_with(
            model=DEFAULT_LLM_MODEL,
            base_url=DEFAULT_LLM_BASE_URL,
            api_key="test-key",
            temperature=0.4,
        )

    async def test_llm_key_can_be_loaded_from_user_config(self):
        with tempfile.TemporaryDirectory() as config_home:
            secret_dir = Path(config_home) / "zhiwojing"
            secret_dir.mkdir()
            (secret_dir / "llm-api-key").write_text("local-test-key\n", encoding="utf-8")
            with patch.dict(
                os.environ, {"XDG_CONFIG_HOME": config_home}, clear=True
            ):
                self.assertEqual(resolve_llm_api_key(), "local-test-key")

    async def test_step_and_init_remain_explicit_stubs(self):
        for operation, payload in [
            ("init", {"user_id": 1}),
            ("step", {"conversation_id": "conversation-1"}),
        ]:
            with self.subTest(operation=operation):
                response = await self.post(f"/api/agent/{operation}", payload)
                self.assertEqual(response.status_code, 501)
                self.assertEqual(response.json()["status"], "not_implemented")
                self.assertEqual(response.json()["operation"], operation)

    async def test_chat_loads_avatar_persona(self):
        original = agent_runtime.chat
        agent_runtime.chat = AsyncMock(return_value="带着好奇心慢慢解释。")
        try:
            response = await self.post(
                "/api/agent/chat",
                {
                    "user_id": 1,
                    "avatar_id": 2,
                    "conversation_id": "persona-test",
                    "message": "请介绍自己",
                },
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["response"], "带着好奇心慢慢解释。")
            arguments = agent_runtime.chat.await_args.kwargs
            self.assertEqual(arguments["name"], "苏晚")
            self.assertIn("温柔", arguments["style"])
        finally:
            agent_runtime.chat = original

    async def test_chat_returns_actionable_agent_error(self):
        original = agent_runtime.chat
        agent_runtime.chat = AsyncMock(
            side_effect=AgentRuntimeError(
                503,
                "LLM_AUTH_FAILED",
                "模型服务认证失败，请重新配置有效的 API Key。",
                retryable=False,
            )
        )
        try:
            response = await self.post(
                "/api/agent/chat",
                {"user_id": 1, "avatar_id": 2, "message": "你好"},
            )
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["detail"]["code"], "LLM_AUTH_FAILED")
            self.assertFalse(response.json()["detail"]["retryable"])
        finally:
            agent_runtime.chat = original


class FakeGraph:
    async def ainvoke(self, input, config):
        return {"messages": [AIMessage(content="人物口吻回复")]}


class AgentToolBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def _tool_names_for(self, user_id, avatar_id):
        captured = {}

        def fake_create_agent(model, tools, **kwargs):
            captured["names"] = tuple(tool.name for tool in tools)
            captured["prompt"] = kwargs["state_modifier"]
            return FakeGraph()

        runtime = AvatarAgentRuntime(object())
        with patch("app.agent.create_llm", return_value=object()), patch(
            "app.agent.registry_tools",
            side_effect=lambda registry, names, user_id: [
                type("NamedTool", (), {"name": name})() for name in names
            ],
        ), patch("app.agent.create_react_agent", side_effect=fake_create_agent):
            reply = await runtime.chat(
                user_id=user_id,
                avatar_id=avatar_id,
                conversation_id="boundary-test",
                message="找些材料",
                name="苏晚",
                bio="生活方式作者",
                interests="阅读、旅行",
                style="温柔、细腻",
            )
        self.assertEqual(reply, "人物口吻回复")
        self.assertIn("苏晚", captured["prompt"])
        self.assertIn("温柔、细腻", captured["prompt"])
        return captured["names"]

    async def test_owner_can_call_all_eleven_tools(self):
        names = await self._tool_names_for(2, 2)
        self.assertEqual(names, OWNER_TOOLS)
        self.assertEqual(len(names), 11)

    async def test_other_avatar_exposes_read_only_tools(self):
        names = await self._tool_names_for(1, 2)
        self.assertEqual(names, READ_ONLY_TOOLS)
        self.assertEqual(len(names), 4)
        self.assertNotIn("generate_draft", names)
        self.assertNotIn("zhida", names)


if __name__ == "__main__":
    unittest.main()
