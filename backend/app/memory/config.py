import os
from dataclasses import dataclass
from pathlib import Path


def _enabled(value: str | None, default: bool = True) -> bool:
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


@dataclass(frozen=True)
class MemoryConfig:
    enabled: bool
    data_dir: Path
    embedder: str
    embedder_model: str

    @classmethod
    def from_env(cls) -> "MemoryConfig":
        embedder = os.getenv("MEMORY_EMBEDDER", "fastembed").strip().lower()
        if embedder not in {"fastembed", "openai"}:
            raise ValueError("MEMORY_EMBEDDER must be fastembed or openai")
        default_model = "BAAI/bge-small-zh-v1.5" if embedder == "fastembed" else "text-embedding-3-small"
        return cls(
            enabled=_enabled(os.getenv("MEMORY_ENABLED")),
            data_dir=Path(os.getenv("MEMORY_DATA_DIR", "./memory_data")).expanduser(),
            embedder=embedder,
            embedder_model=os.getenv("MEMORY_EMBEDDER_MODEL", default_model),
        )
