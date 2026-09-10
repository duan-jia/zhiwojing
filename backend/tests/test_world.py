import asyncio
import unittest

from app.world import Avatar, MAP_HEIGHT, MAP_WIDTH, SPAWN, World, generate_world


class WorldTests(unittest.TestCase):
    def test_generated_map_has_expected_shape_and_safe_spawn(self):
        world_map = generate_world(42)
        self.assertEqual((world_map["width"], world_map["height"]), (MAP_WIDTH, MAP_HEIGHT))
        self.assertEqual(len(world_map["cells"]), MAP_HEIGHT)
        self.assertTrue(all(len(row) == MAP_WIDTH for row in world_map["cells"]))
        spawn_cell = world_map["cells"][int(SPAWN[1])][int(SPAWN[0])]
        self.assertNotEqual(spawn_cell["ground"], "water")
        self.assertIsNone(spawn_cell["object"])

    def test_movement_is_bounded_and_normalized(self):
        world = World("test", generate_world(7))
        world.avatars["a"] = Avatar("a", "A", *SPAWN)
        avatar = world.move("a", 100, 0, 10)
        self.assertAlmostEqual(avatar.x, SPAWN[0] + 0.35)
        self.assertEqual(avatar.y, SPAWN[1])
        for _ in range(200):
            world.move("a", -1, 0, 0.1)
        self.assertGreaterEqual(avatar.x, 0)

    def test_seed_is_deterministic(self):
        self.assertEqual(generate_world(123), generate_world(123))

    def test_broadcast_removes_disconnected_avatar(self):
        class Socket:
            def __init__(self, fails=False):
                self.fails = fails
                self.messages = []

            async def send_json(self, message):
                if self.fails:
                    raise RuntimeError("closed")
                self.messages.append(message)

        world = World("test", generate_world(9))
        world.avatars["ok"] = Avatar("ok", "OK", *SPAWN)
        world.avatars["gone"] = Avatar("gone", "Gone", *SPAWN)
        ok, gone = Socket(), Socket(fails=True)
        world.sockets.update({"ok": ok, "gone": gone})
        asyncio.run(world.broadcast({"type": "ping"}))
        self.assertEqual(ok.messages, [{"type": "ping"}])
        self.assertNotIn("gone", world.sockets)
        self.assertNotIn("gone", world.avatars)


if __name__ == "__main__":
    unittest.main()
