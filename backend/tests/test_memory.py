import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from sqlmodel import Session, SQLModel, create_engine, select
from app.memory.config import MemoryConfig
from app.memory.scopes import pair_scope, private_scope, scopes_for_chat
from app.memory.service import MemoryService
from app.memory.store import Episode, Relationship, StructuredStore
from app.memory.summarize import parse_json_object

class FakeBackend:
    def __init__(self): self.items=[]
    def add(self,messages,*,user_id,metadata=None,infer=True): self.items.append({"memory":str(messages),"user_id":user_id,"metadata":metadata,"infer":infer})
    def search(self,query,*,user_id,limit=5): return [x for x in self.items if x["user_id"]==user_id][:limit]
    def get_all(self,*,user_id): return self.search("",user_id=user_id)

class FailingBackend(FakeBackend):
    def search(self,query,*,user_id,limit=5): raise RuntimeError("vector store offline")
class Reply:
    def __init__(self,content): self.content=content
class LLM:
    def __init__(self,content): self.content=content; self.calls=0
    async def ainvoke(self,prompt): self.calls+=1; return Reply(self.content)

class MemoryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.engine=create_engine(f"sqlite:///{self.tmp.name}/db.sqlite")
        SQLModel.metadata.create_all(self.engine); self.backend=FakeBackend(); self.service=MemoryService(self.backend,StructuredStore(self.engine))
    def tearDown(self): self.tmp.cleanup()
    def test_scopes_are_canonical(self):
        self.assertEqual(pair_scope(9,2),"pair:2-9"); self.assertEqual(private_scope(2),"avatar:2")
        self.assertEqual(scopes_for_chat(2,2),("avatar:2","pair:2-2"))
    def test_private_and_pair_isolation(self):
        self.backend.add("A secret",user_id="avatar:1"); self.backend.add("shared",user_id="pair:1-2")
        self.assertNotIn("secret",self.service.context_for_chat(2,1,"x"))
        self.assertIn("shared",self.service.context_for_chat(2,1,"x"))
        self.assertEqual(self.service.context_for_chat(3,1,"x"),"")
    def test_disabled_degrades(self): self.assertEqual(MemoryService(None,StructuredStore(self.engine),enabled=False).context_for_chat(1,1,"x"),"")
    def test_backend_read_failure_degrades_and_logs(self):
        service=MemoryService(FailingBackend(),StructuredStore(self.engine))
        with self.assertLogs("app.memory.service",level="ERROR") as logs:
            self.assertEqual(service.context_for_chat(1,2,"x"),"")
        self.assertIn("memory search failed",logs.output[0])
    def test_missing_optional_mem0_degrades_runtime_and_logs(self):
        # Importing app.main itself must remain safe even if optional native
        # dependencies are absent; simulate the lazy factory failure here.
        from app import main
        with patch.object(main,"build_mem0",side_effect=ModuleNotFoundError("mem0")):
            with self.assertLogs("app.main",level="ERROR") as logs:
                runtime=main._build_agent_runtime()
        self.assertIsNone(runtime.memory_service)
        self.assertIn("continuing without memory",logs.output[0])
    def test_injection_limit(self):
        self.backend.add("x"*1500,user_id="pair:1-2")
        self.assertLessEqual(len(self.service.context_for_chat(1,2,"x")),1200)
    def test_summary_parse(self): self.assertEqual(parse_json_object('```json\n{"facts":["a"]}\n```')["facts"],["a"])
    async def test_pair_conclusion_is_idempotent(self):
        llm=LLM('{"summary":"见面聊书","topics":["书"],"mood":"好","familiarity_delta":0.2,"relation_tag":"书友"}')
        args=dict(a=2,b=1,conversation_id="1:2",user_message="书？",reply="好")
        await self.service.conclude_pair(llm,**args); await self.service.conclude_pair(llm,**args)
        self.assertEqual(llm.calls,1); self.assertEqual(len(self.backend.items),1)
        self.assertEqual(self.backend.items[0]["user_id"], "pair:1-2")
        with Session(self.engine) as session:
            relationships=session.exec(select(Relationship)).all()
            episodes=session.exec(select(Episode)).all()
        self.assertEqual({(row.avatar_id,row.partner_id) for row in relationships},{(1,2),(2,1)})
        self.assertEqual(len(episodes),1)
        self.assertEqual(episodes[0].conversation_id,"1:2")
    async def test_owner_summarizes_each_six_messages(self):
        llm=LLM('{"facts":["住上海"],"prefs":["茶"],"todos":[]}')
        for n in range(3): await self.service.record_owner_turn(llm,avatar_id=1,conversation_id="owner",user_message=str(n),reply="r")
        self.assertEqual(llm.calls,1); self.assertEqual(self.backend.items[0]["user_id"],"avatar:1")
