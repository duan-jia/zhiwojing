import logging
from typing import Any, Protocol


log = logging.getLogger(__name__)

class MemoryBackend(Protocol):
    def add(self, messages: Any, *, user_id: str, metadata: dict[str, Any] | None = None, infer: bool = True) -> Any: ...
    def search(self, query: str, *, user_id: str, limit: int = 5) -> Any: ...
    def get_all(self, *, user_id: str) -> Any: ...
    def delete_all(self, *, user_id: str) -> Any: ...


def build_mem0(config):
    # Mem0 (and its native embedding stack) is intentionally imported only when
    # memory is enabled.  The API can therefore start in a minimal installation;
    # the composition root catches this explicit error and degrades to the
    # original in-process agent runtime.
    try:
        from mem0 import Memory
    except (ImportError, OSError) as error:
        log.warning("optional Mem0 backend is unavailable; memory will be disabled: %s", error)
        raise
    config.data_dir.mkdir(parents=True, exist_ok=True)
    if config.embedder == "fastembed":
        embedder = {"provider": "fastembed", "config": {"model": config.embedder_model}}
    else:
        import os
        embedder = {"provider": "openai", "config": {
            "api_key": os.getenv("LLM_API_KEY", "not-configured"),
            "openai_base_url": os.getenv("LLM_BASE_URL"),
        }}
    import os
    llm = {"provider": "openai", "config": {"model": os.getenv("LLM_MODEL", "deepseek-v4-flash"), "api_key": os.getenv("LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY") or "not-configured", "openai_base_url": os.getenv("LLM_BASE_URL", "https://api.openai-next.com/v1")}}
    return Memory.from_config({
        "llm": llm,
        "vector_store": {"provider": "qdrant", "config": {"path": str(config.data_dir / "qdrant"), "collection_name": "zhiwojing"}},
        "embedder": embedder,
        "history_db_path": str(config.data_dir / "history.db"),
    })
