import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from app.agent import OWNER_TOOLS, READ_ONLY_TOOLS, AvatarAgentRuntime
from app.main import app, agent_runtime


class AgentContractTests(unittest.TestCase):
    def test_step_and_init_remain_explicit_stubs(self):
        with TestClient(app) as client:
            for operation, payload in [
                ("init", {"user_id": 1}),
                ("step", {"conversation_id": "conversation-1"}),
            ]:
                with self.subTest(operation=operation):
                    response = client.post(f"/api/agent/{operation}", json=payload)
                    self.assertEqual(response.status_code, 501)
                    self.assertEqual(response.json()["status"], "not_implemented")
                    self.assertEqual(response.json()["operation"], operation)

    def test_chat_loads_avatar_persona(self):
        original = agent_runtime.chat
        agent_runtime.chat = AsyncMock(return_value="带着好奇心慢慢解释。")
        try:
            with TestClient(app) as client:
                response = client.post(
                    "/api/agent/chat",
                    json={
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

    async def test_owner_can_call_all_six_tools(self):
        self.assertEqual(await self._tool_names_for(2, 2), OWNER_TOOLS)

    async def test_other_avatar_exposes_read_only_tools(self):
        names = await self._tool_names_for(1, 2)
        self.assertEqual(names, READ_ONLY_TOOLS)
        self.assertNotIn("generate_draft", names)
        self.assertNotIn("zhida", names)


if __name__ == "__main__":
    unittest.main()
