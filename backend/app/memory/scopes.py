"""Canonical memory scopes. Scope construction is the privacy boundary."""

def private_scope(avatar_id: int) -> str:
    return f"avatar:{int(avatar_id)}"


def pair_scope(first: int, second: int) -> str:
    low, high = sorted((int(first), int(second)))
    return f"pair:{low}-{high}"


def scopes_for_chat(user_id: int, avatar_id: int) -> tuple[str | None, str]:
    return (private_scope(avatar_id) if user_id == avatar_id else None, pair_scope(user_id, avatar_id))
