import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from langchain_core.messages import AIMessage
from sqlmodel import SQLModel, create_engine
from app.memory.coldstart import normalize_persona, run_coldstart
from app.memory.store import StructuredStore
from app.zhihu.models import CreatorStatsResult, UserCollectionsResult, UserContentsResult, UserFavlistsResult, UserFolloweesResult

class ColdstartTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        engine = create_engine(f"sqlite:///{self.temp.name}/test.db")
        SQLModel.metadata.create_all(engine); self.store = StructuredStore(engine)
        self.provider = SimpleNamespace(
            user_contents=AsyncMock(return_value=UserContentsResult(items=[])),
            user_favlists=AsyncMock(return_value=UserFavlistsResult(items=[])),
            user_collections=AsyncMock(return_value=UserCollectionsResult(items=[])),
            user_followees=AsyncMock(return_value=UserFolloweesResult(items=[])),
            creator_account_stats=AsyncMock(return_value=CreatorStatsResult()))
    def tearDown(self): self.temp.cleanup()
    async def test_success_limits_and_idempotent_upsert(self):
        llm = AsyncMock(); llm.ainvoke.return_value = AIMessage(content='{"domains":["AI"],"style":{"keywords":["清晰"],"description":"简洁"},"viewpoints":[],"interest_tags":["产品"],"summary":"摘要"}')
        with patch("app.memory.coldstart.create_llm", return_value=llm):
            first = await run_coldstart(1, self.provider, self.store); await run_coldstart(1, self.provider, self.store)
        self.assertEqual(first["domains"], ["AI"]); self.assertFalse(first["partial"])
        self.provider.user_contents.assert_awaited_with("all", 30); self.provider.user_followees.assert_awaited_with(50)
        self.assertEqual(self.store.get_persona(1)["summary"], "摘要")
    async def test_invalid_json_uses_safe_default(self):
        llm = AsyncMock(); llm.ainvoke.return_value = AIMessage(content="not json")
        with patch("app.memory.coldstart.create_llm", return_value=llm): result = await run_coldstart(2, self.provider, self.store)
        self.assertTrue(result["partial"]); self.assertEqual(result["style"], {"keywords": [], "description": ""})
    def test_missing_fields_are_partial_and_summary_is_bounded(self):
        card, partial = normalize_persona({"summary": "字" * 250})
        self.assertTrue(partial); self.assertEqual(len(card["summary"]), 200)

if __name__ == "__main__": unittest.main()
