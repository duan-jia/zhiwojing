import hashlib
import logging
from typing import Any, Protocol


log = logging.getLogger(__name__)


def collection_name(embedder: str, model: str, dimensions: int) -> str:
    identity = f"{embedder}:{model}:{dimensions}".encode("utf-8")
    return f"zhiwojing_{hashlib.sha256(identity).hexdigest()[:12]}"


def embedding_dimensions(config) -> int:
    if config.embedder == "fastembed":
        from fastembed import TextEmbedding

        supported = next(
            (model for model in TextEmbedding.list_supported_models() if model.get("model") == config.embedder_model),
            None,
        )
        if supported and supported.get("dim"):
            return int(supported["dim"])
        return int(TextEmbedding(model_name=config.embedder_model).embedding_size)

    known_openai_dimensions = {
        "text-embedding-3-small": 1536,
        "text-embedding-3-large": 3072,
        "text-embedding-ada-002": 1536,
    }
    dimensions = known_openai_dimensions.get(config.embedder_model)
    if dimensions is None:
        raise ValueError("unsupported OpenAI embedding model; configure a known MEMORY_EMBEDDER_MODEL")
    return dimensions

class MemoryBackend(Protocol):
    def add(self, messages: Any, *, user_id: str, metadata: dict[str, Any] | None = None, infer: bool = True) -> Any: ...
    def search(self, query: str, *, filters: dict[str, Any], top_k: int = 5) -> Any: ...
    def get_all(self, *, filters: dict[str, Any], top_k: int = 20) -> Any: ...
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
    dimensions = embedding_dimensions(config)
    if config.embedder == "fastembed":
        embedder = {"provider": "fastembed", "config": {"model": config.embedder_model, "embedding_dims": dimensions}}
    else:
        import os
        embedder = {"provider": "openai", "config": {
            "model": config.embedder_model,
            "api_key": os.getenv("LLM_API_KEY", "not-configured"),
            "openai_base_url": os.getenv("LLM_BASE_URL"),
        }}
    import os
    llm = {"provider": "openai", "config": {"model": os.getenv("LLM_MODEL", "deepseek-v4-flash"), "api_key": os.getenv("LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY") or "not-configured", "openai_base_url": os.getenv("LLM_BASE_URL", "https://api.openai-next.com/v1")}}
    return Memory.from_config({
        "llm": llm,
        "vector_store": {"provider": "qdrant", "config": {"path": str(config.data_dir / "qdrant"), "collection_name": collection_name(config.embedder, config.embedder_model, dimensions), "embedding_model_dims": dimensions}},
        "embedder": embedder,
        "history_db_path": str(config.data_dir / "history.db"),
    })
