import unittest
from fastapi.testclient import TestClient
from app.main import app


class AgentContractTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_agent_contract_stubs_are_explicit(self):
        cases = [
            ("init", {"user_id": 1}),
            ("chat", {"message": "你好"}),
            ("step", {"conversation_id": "conversation-1"}),
        ]
        for operation, payload in cases:
            with self.subTest(operation=operation):
                response = self.client.post(f"/api/agent/{operation}", json=payload)
                self.assertEqual(response.status_code, 501)
                self.assertEqual(response.json()["status"], "not_implemented")
                self.assertEqual(response.json()["operation"], operation)


if __name__ == "__main__":
    unittest.main()
