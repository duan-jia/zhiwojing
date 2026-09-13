import json
from langchain_core.messages import HumanMessage, SystemMessage
from openai import APIConnectionError, APIStatusError, APITimeoutError, AuthenticationError, RateLimitError

from ..agent import AgentRuntimeError, create_llm

DEFAULT_PERSONA = {"domains": [], "style": {"keywords": [], "description": ""}, "viewpoints": [], "interest_tags": [], "summary": ""}


def _strings(value, limit=20):
    return [str(item).strip()[:100] for item in value][:limit] if isinstance(value, list) else []


def normalize_persona(raw) -> tuple[dict, bool]:
    partial = False
    if not isinstance(raw, dict):
        return dict(DEFAULT_PERSONA), True
    style = raw.get("style")
    if not isinstance(style, dict):
        style, partial = {}, True
    required = ("domains", "style", "viewpoints", "interest_tags", "summary")
    partial = partial or any(key not in raw for key in required)
    persona = {
        "domains": _strings(raw.get("domains", [])),
        "style": {"keywords": _strings(style.get("keywords", [])), "description": str(style.get("description", ""))[:200]},
        "viewpoints": _strings(raw.get("viewpoints", [])),
        "interest_tags": _strings(raw.get("interest_tags", [])),
        "summary": str(raw.get("summary", ""))[:200],
    }
    return persona, partial


def compact_sources(contents, favlists, collections, followees, stats) -> dict:
    """Keep only fields useful for audits instead of persisting full API payloads."""
    return {
        "contents": [item.model_dump(include={"title", "url", "contentType"}, mode="json") for item in contents.items],
        "favlists": [item.model_dump(include={"title", "urlToken", "isPublic"}, mode="json") for item in favlists.items],
        "collections": [item.model_dump(include={"title", "url", "contentType"}, mode="json") for item in collections.items],
        "followees": [item.model_dump(include={"fullname", "urlToken"}, mode="json") for item in followees.items],
        "creator_stats": stats.model_dump(mode="json"),
    }


async def run_coldstart(user_id: int, provider, store) -> dict:
    contents = await provider.user_contents("all", 30)
    favlists = await provider.user_favlists(20)
    collections = await provider.user_collections(20)
    followees = await provider.user_followees(50)
    stats = await provider.creator_account_stats()
    llm_sources = {
        "contents": contents.model_dump(mode="json"), "favlists": favlists.model_dump(mode="json"),
        "collections": collections.model_dump(mode="json"), "followees": followees.model_dump(mode="json"),
        "creator_stats": stats.model_dump(mode="json"),
    }
    sources = compact_sources(contents, favlists, collections, followees, stats)
    prompt = "从知乎数据抽取人设。只输出 JSON，必须含 domains[], style{keywords[],description}, viewpoints[], interest_tags[], summary（200字内）。"
    try:
        reply = await create_llm().ainvoke([SystemMessage(content=prompt), HumanMessage(content=json.dumps(llm_sources, ensure_ascii=False)[:24000])])
        content = reply.content if isinstance(reply.content, str) else json.dumps(reply.content, ensure_ascii=False)
        parsed = json.loads(content.strip().removeprefix("```json").removesuffix("```").strip())
        persona, partial = normalize_persona(parsed)
    except (json.JSONDecodeError, TypeError, AttributeError):
        # A malformed model response must not replace the last known-good card.
        persona, partial = store.get_persona(user_id) or dict(DEFAULT_PERSONA), True
        return {**persona, "partial": partial}
    except AuthenticationError as error:
        raise AgentRuntimeError(503, "LLM_AUTH_FAILED", "模型服务认证失败，请重新配置有效的 API Key。", retryable=False) from error
    except RateLimitError as error:
        raise AgentRuntimeError(429, "LLM_RATE_LIMITED", "模型服务当前请求过多，请稍后重试。", retryable=True) from error
    except (APITimeoutError, APIConnectionError) as error:
        raise AgentRuntimeError(503, "LLM_UNAVAILABLE", "暂时无法连接模型服务，请稍后重试。", retryable=True) from error
    except APIStatusError as error:
        raise AgentRuntimeError(502, "LLM_UPSTREAM_ERROR", "模型服务返回异常，请稍后重试。", retryable=True) from error
    store.upsert_persona(user_id, persona, sources)
    return {**persona, "partial": partial}


def persona_prompt(persona: dict | None, limit: int = 300) -> str:
    if not persona:
        return ""
    text = f"人设卡：领域：{'、'.join(persona.get('domains', []))}；风格：{persona.get('style', {}).get('description', '')}；观点：{'、'.join(persona.get('viewpoints', []))}；兴趣：{'、'.join(persona.get('interest_tags', []))}；摘要：{persona.get('summary', '')}"
    return text[:limit]
