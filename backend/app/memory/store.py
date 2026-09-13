import json
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Session, SQLModel, select


def utcnow(): return datetime.now(timezone.utc)

class AvatarProfile(SQLModel, table=True):
    __tablename__ = "avatar_profiles"
    avatar_id: int = Field(primary_key=True)
    owner_facts_json: str = "{}"
    updated_at: datetime = Field(default_factory=utcnow)

class Relationship(SQLModel, table=True):
    __tablename__ = "relationships"
    id: Optional[int] = Field(default=None, primary_key=True)
    avatar_id: int = Field(index=True)
    partner_id: int = Field(index=True)
    familiarity: float = 0.0
    note: str = ""
    tags_json: str = "[]"
    last_met_at: datetime = Field(default_factory=utcnow, index=True)

class Episode(SQLModel, table=True):
    __tablename__ = "episodes"
    id: Optional[int] = Field(default=None, primary_key=True)
    scope: str = Field(index=True)
    kind: str = Field(index=True)
    summary: str
    conversation_id: str = Field(index=True)
    idempotency_key: str = Field(index=True, unique=True)
    metadata_json: str = "{}"
    created_at: datetime = Field(default_factory=utcnow)

class Contact(SQLModel, table=True):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("user_id", "contact_id", name="uq_contact_pair"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    contact_id: int = Field(index=True)
    added_at: datetime = Field(default_factory=utcnow)
    status: str = Field(default="active", index=True)
    agent_reply_streak: int = 0

class Message(SQLModel, table=True):
    __tablename__ = "messages"
    id: Optional[int] = Field(default=None, primary_key=True)
    pair_key: str = Field(index=True)
    sender_id: int = Field(index=True)
    recipient_id: int = Field(index=True)
    sender_kind: str = Field(default="human", index=True)
    content: str
    created_at: datetime = Field(default_factory=utcnow, index=True)
    read_at: Optional[datetime] = Field(default=None, index=True)

class Presence(SQLModel, table=True):
    __tablename__ = "presence"
    user_id: int = Field(primary_key=True)
    online: bool = False
    human_controlled: bool = False
    updated_at: datetime = Field(default_factory=utcnow)

class StructuredStore:
    def __init__(self, engine): self.engine = engine
    def recent_partners(self, avatar_id: int, limit: int = 5) -> list[int]:
        with Session(self.engine) as s:
            rows=s.exec(select(Relationship).where(Relationship.avatar_id==avatar_id).order_by(Relationship.last_met_at.desc()).limit(min(limit,5))).all()
            return [r.partner_id for r in rows]
    def has_episode(self, key: str) -> bool:
        with Session(self.engine) as s: return s.exec(select(Episode).where(Episode.idempotency_key==key)).first() is not None
    def add_episode(self, **values):
        with Session(self.engine) as s: s.add(Episode(**values)); s.commit()
    def update_relationships(self, a:int,b:int,delta:float,summary:str,tag:str,when:datetime):
        with Session(self.engine) as s:
            for owner,partner in ((a,b),(b,a)):
                row=s.exec(select(Relationship).where(Relationship.avatar_id==owner,Relationship.partner_id==partner)).first()
                if row is None: row=Relationship(avatar_id=owner,partner_id=partner); s.add(row)
                row.familiarity += delta; row.note=summary; row.tags_json=json.dumps([tag],ensure_ascii=False) if tag else row.tags_json; row.last_met_at=when
            s.commit()
    def update_profile(self, avatar_id:int, data:dict):
        with Session(self.engine) as s:
            row=s.get(AvatarProfile,avatar_id)
            if row is None: row=AvatarProfile(avatar_id=avatar_id); s.add(row)
            old=json.loads(row.owner_facts_json or "{}"); old.update(data); row.owner_facts_json=json.dumps(old,ensure_ascii=False); row.updated_at=utcnow(); s.commit()
    def ensure_contacts(self, a: int, b: int) -> None:
        """Add both directions once; a deliberate removal is never overwritten."""
        if a == b: return
        with Session(self.engine) as s:
            for owner, partner in ((a, b), (b, a)):
                row=s.exec(select(Contact).where(Contact.user_id==owner, Contact.contact_id==partner)).first()
                if row is None: s.add(Contact(user_id=owner, contact_id=partner))
            s.commit()
