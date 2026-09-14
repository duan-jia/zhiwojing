import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from sqlmodel import Session, create_engine, select

from app import main
from app.guest_cleanup import seconds_until_next_cleanup
from app.memory.store import (
    AvatarProfile,
    Contact,
    Episode,
    Message,
    PersonaCard,
    Presence,
    Relationship,
)


class FakeMemoryBackend:
    def __init__(self):
        self.deleted = []

    def delete_all(self, *, user_id):
        self.deleted.append(user_id)


class FailingMemoryBackend:
    def delete_all(self, *, user_id):
        raise RuntimeError("memory unavailable")


class FakeCheckpointer:
    def __init__(self, thread_ids):
        self.thread_ids = set(thread_ids)
        self.deleted = []

    def list(self, _config):
        return [SimpleNamespace(config={"configurable": {"thread_id": value}}) for value in self.thread_ids]

    def delete_thread(self, thread_id):
        self.deleted.append(thread_id)
        self.thread_ids.discard(thread_id)


class GuestCleanupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.original_engine = main.engine
        self.original_store_engine = main.communication_store.engine
        self.original_memory_service = main.agent_runtime.memory_service
        self.original_checkpointer = main.agent_runtime.checkpointer
        main.engine = create_engine(
            f"sqlite:///{Path(self.directory.name) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        main.startup()
        main.oauth_grants.clear()

    def tearDown(self):
        main.oauth_grants.clear()
        main.agent_runtime.memory_service = self.original_memory_service
        main.agent_runtime.checkpointer = self.original_checkpointer
        main.engine.dispose()
        main.engine = self.original_engine
        main.communication_store.engine = self.original_store_engine
        self.directory.cleanup()

    def test_deletes_guest_and_every_associated_store(self):
        with Session(main.engine) as session:
            guest = main.User(zhihu_id="guest-cleanup", kind="guest", name="游客")
            session.add(guest)
            session.flush()
            guest_id = guest.id
            session.add(main.AuthSession(user_id=guest_id, token_hash="guest-token", expires_at=main.datetime.now(main.timezone.utc) + main.timedelta(days=1)))
            session.add(AvatarProfile(avatar_id=guest_id, owner_facts_json='{"private":true}'))
            session.add(AvatarProfile(avatar_id=1, owner_facts_json='{"keep":true}'))
            session.add(PersonaCard(avatar_id=guest_id, persona_json='{"guest":true}'))
            session.add(Relationship(avatar_id=guest_id, partner_id=1))
            session.add(Relationship(avatar_id=1, partner_id=guest_id))
            session.add(Contact(user_id=guest_id, contact_id=1))
            session.add(Contact(user_id=1, contact_id=guest_id))
            session.add(Message(pair_key=f"1:{guest_id}", sender_id=guest_id, recipient_id=1, content="guest message"))
            session.add(Presence(user_id=guest_id, online=True))
            session.add(Episode(scope=f"avatar:{guest_id}", kind="owner", summary="guest", conversation_id=f"{guest_id}:{guest_id}", idempotency_key="guest-private"))
            session.add(Episode(scope=f"pair:1-{guest_id}", kind="meeting", summary="shared", conversation_id=f"1:{guest_id}", idempotency_key="guest-pair"))
            session.add(Episode(scope="avatar:1", kind="owner", summary="keep", conversation_id="1:1", idempotency_key="keep-private"))
            session.commit()

        main.oauth_grants["guest-token"] = {"access_token": "should-be-removed"}
        memory_backend = FakeMemoryBackend()
        main.agent_runtime.memory_service = SimpleNamespace(
            backend=memory_backend,
            _owner_turns={(guest_id, "owner"): ["private"], (1, "owner"): ["keep"]},
        )
        checkpointer = FakeCheckpointer({
            f"{guest_id}:1",
            f"remote:1:{guest_id}",
            f"chat:{guest_id}:1:custom-thread",
            "1:2",
        })
        main.agent_runtime.checkpointer = checkpointer

        self.assertEqual(main.delete_all_guest_data(), 1)

        with Session(main.engine) as session:
            self.assertIsNone(session.get(main.User, guest_id))
            self.assertEqual(session.exec(select(main.AuthSession).where(main.AuthSession.user_id == guest_id)).all(), [])
            self.assertEqual(session.exec(select(Relationship).where((Relationship.avatar_id == guest_id) | (Relationship.partner_id == guest_id))).all(), [])
            self.assertEqual(session.exec(select(Contact).where((Contact.user_id == guest_id) | (Contact.contact_id == guest_id))).all(), [])
            self.assertEqual(session.exec(select(Message).where((Message.sender_id == guest_id) | (Message.recipient_id == guest_id))).all(), [])
            self.assertIsNone(session.get(PersonaCard, guest_id))
            self.assertIsNone(session.get(Presence, guest_id))
            self.assertIsNotNone(session.get(AvatarProfile, 1))
            self.assertIsNotNone(session.exec(select(Episode).where(Episode.scope == "avatar:1")).first())

        self.assertNotIn("guest-token", main.oauth_grants)
        self.assertEqual(set(memory_backend.deleted), {f"avatar:{guest_id}", f"pair:1-{guest_id}"})
        self.assertNotIn((guest_id, "owner"), main.agent_runtime.memory_service._owner_turns)
        self.assertIn((1, "owner"), main.agent_runtime.memory_service._owner_turns)
        self.assertEqual(set(checkpointer.deleted), {
            f"{guest_id}:1",
            f"remote:1:{guest_id}",
            f"chat:{guest_id}:1:custom-thread",
        })
        self.assertIn("1:2", checkpointer.thread_ids)

    def test_next_run_is_four_am_shanghai(self):
        shanghai = ZoneInfo("Asia/Shanghai")
        self.assertEqual(
            seconds_until_next_cleanup(datetime(2026, 9, 14, 3, 59, tzinfo=shanghai)),
            60,
        )
        self.assertEqual(
            seconds_until_next_cleanup(datetime(2026, 9, 14, 4, 0, tzinfo=shanghai)),
            24 * 60 * 60,
        )

    def test_external_memory_failure_keeps_guest_for_retry(self):
        with Session(main.engine) as session:
            guest = main.User(zhihu_id="guest-retry", kind="guest", name="游客")
            session.add(guest)
            session.commit()
            session.refresh(guest)
            guest_id = guest.id
        main.agent_runtime.memory_service = SimpleNamespace(backend=FailingMemoryBackend(), _owner_turns={})
        main.agent_runtime.checkpointer = FakeCheckpointer(set())

        with self.assertRaises(RuntimeError):
            main.delete_all_guest_data()

        with Session(main.engine) as session:
            self.assertIsNotNone(session.get(main.User, guest_id))


if __name__ == "__main__":
    unittest.main()
