import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.world import world_manager


class WebSocketTests(unittest.TestCase):
    def setUp(self):
        world_manager.worlds.clear()
        world_manager.empty_since.clear()
        self.client = TestClient(app)

    def test_server_assigns_identity_and_disconnect_is_broadcast(self):
        with self.client.websocket_connect("/ws/world/integration") as first:
            first.send_json({"type": "join", "avatarId": "claimed", "name": "A"})
            welcome1 = first.receive_json()
            first.receive_json()  # join broadcast
            self.assertNotEqual(welcome1["avatarId"], "claimed")
            with self.client.websocket_connect("/ws/world/integration") as second:
                second.send_json({"type": "join", "avatarId": "claimed", "name": "B"})
                welcome2 = second.receive_json()
                first.receive_json()  # second player's join
                second.receive_json()  # second player's join
                self.assertNotEqual(welcome1["avatarId"], welcome2["avatarId"])
            leave = first.receive_json()
            self.assertEqual(leave, {"type": "leave", "avatarId": welcome2["avatarId"]})


if __name__ == "__main__":
    unittest.main()
