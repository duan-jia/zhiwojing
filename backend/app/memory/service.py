import hashlib, json, logging
from datetime import datetime, timezone
from typing import Any
from .scopes import pair_scope, private_scope
from .summarize import summarize_pair, summarize_private

log=logging.getLogger(__name__)

def _rows(value):
    if isinstance(value,dict): return value.get("results") or value.get("memories") or []
    return value if isinstance(value,list) else []
def _text(row):
    if isinstance(row,str): return row
    return str(row.get("memory") or row.get("text") or "") if isinstance(row,dict) else ""

class MemoryService:
    def __init__(self,backend,store,enabled=True,max_chars=1200): self.backend=backend; self.store=store; self.enabled=enabled and backend is not None; self.max_chars=max_chars; self._owner_turns={}
    def _search(self,query,scope,limit=5):
        if not self.enabled:return []
        try:return [_text(x) for x in _rows(self.backend.search(query,filters={"user_id":scope},top_k=limit)) if _text(x)]
        except Exception: log.exception("memory search failed"); return []
    def context_for_chat(self,user_id:int,avatar_id:int,query:str)->str:
        if not self.enabled:return ""
        chunks=[]
        if user_id==avatar_id:
            chunks += self._search(query,private_scope(avatar_id),5)
            for partner in self.store.recent_partners(avatar_id,5): chunks += self._search(query,pair_scope(avatar_id,partner),2)
        else: chunks += self._search(query,pair_scope(user_id,avatar_id),5)
        text="\n".join(f"- {x}" for x in chunks)
        return text[:self.max_chars]
    def context_for_step(self,avatar_id:int,nearby:list[dict])->str:
        if not nearby:return ""
        return "\n".join(self._search("上次见面和共同经历",pair_scope(avatar_id,int(nearby[0]["avatar_id"])),5))[:self.max_chars]
    async def conclude_pair(self,llm,*,a:int,b:int,conversation_id:str,user_message:str,reply:str,place:str=""):
        # Contacts are product state, not an optional semantic-memory feature.
        self.store.ensure_contacts(a,b)
        if not self.enabled:return
        key=hashlib.sha256(f"pair|{conversation_id}|{user_message}|{reply}".encode()).hexdigest()
        if self.store.has_episode(key):return
        data=await summarize_pair(llm,user_message,reply); scope=pair_scope(a,b); now=datetime.now(timezone.utc)
        self.backend.add(data["summary"],user_id=scope,infer=False,metadata={"kind":"meeting","partner":b,"place":place,"ts":now.isoformat()})
        self.store.update_relationships(a,b,data["familiarity_delta"],data["summary"],data["relation_tag"],now)
        self.store.add_episode(scope=scope,kind="meeting",summary=data["summary"],conversation_id=conversation_id,idempotency_key=key,metadata_json=json.dumps(data,ensure_ascii=False))
    async def record_owner_turn(self,llm,*,avatar_id:int,conversation_id:str,user_message:str,reply:str):
        if not self.enabled:return
        key=(avatar_id,conversation_id); turns=self._owner_turns.setdefault(key,[]); turns.extend([{"role":"user","content":user_message},{"role":"assistant","content":reply}])
        if len(turns)<6:return
        batch=turns[:6]; del turns[:6]; idem=hashlib.sha256(("private|"+conversation_id+json.dumps(batch,ensure_ascii=False)).encode()).hexdigest()
        if self.store.has_episode(idem):return
        data=await summarize_private(llm,batch); scope=private_scope(avatar_id)
        self.backend.add(batch,user_id=scope,infer=True,metadata={"kind":"owner_summary","ts":datetime.now(timezone.utc).isoformat()})
        self.store.update_profile(avatar_id,data); self.store.add_episode(scope=scope,kind="owner_summary",summary=json.dumps(data,ensure_ascii=False),conversation_id=conversation_id,idempotency_key=idem,metadata_json="{}")
