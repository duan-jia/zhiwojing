from typing import Protocol

from .errors import CapabilityError
from .models import DraftInput, DraftProfile, DraftResult


class DraftProvider(Protocol):
    name: str

    async def generate(
        self,
        payload: DraftInput,
        profile: DraftProfile,
    ) -> DraftResult: ...


class LocalTemplateDraftProvider:
    name = "local-template"

    async def generate(
        self,
        payload: DraftInput,
        profile: DraftProfile,
    ) -> DraftResult:
        idea = payload.idea.strip()
        if len(idea) < 3:
            raise CapabilityError(
                400,
                "DRAFT_IDEA_TOO_SHORT",
                "请至少输入 3 个字的想法",
            )

        requested_tone = (payload.tone or profile.style).strip()
        templates = {
            "清晰、真诚、有条理": (
                "我想先说清楚自己的想法，再看看它背后的理由。",
                "讨论这件事，可以先关注事实与具体情境，再考虑不同选择会怎样影响日常生活。",
                "我的判断还需要更多事实支持，也愿意听听不同的看法。",
            ),
            "幽默": (
                "先把想法摆上桌，别急着给结论盖章。",
                "直觉可以先发言，但证据也得有个座位。不妨看看它在什么情况下成立，换个场景会不会掉链子。",
                "观点先写到这里，给新证据留把椅子，也欢迎不同看法来串门。",
            ),
            "严肃": (
                "讨论这一观点，需要明确其适用范围和论证依据。",
                "应区分事实陈述与价值判断，考察支持证据、可能的反例，以及不同情境下的实际影响。",
                "在证据尚不充分时，应保留结论的边界，避免将个别情况推广为普遍规律。",
            ),
        }
        tone = requested_tone if requested_tone in templates else "清晰、真诚、有条理"
        opening, analysis, ending = templates[tone]
        if payload.goal == "知乎文章":
            draft = (
                f"关于“{idea}”的思考\n\n引言\n{opening}\n\n我的观点\n{idea}"
                f"\n\n进一步讨论\n{analysis}\n\n结语\n{ending}"
            )
        else:
            draft = f"{idea}\n\n{opening}\n\n{analysis}\n\n{ending}"

        rationale = [
            f"使用了{tone}语气模板",
            f"按{payload.goal}组织内容",
            "保留原始观点，避免替你虚构经历",
        ]
        if tone != requested_tone:
            rationale[0] += "；暂不支持指定语气，已使用默认语气"
        if payload.references:
            reference_lines = [
                f"- {item.title}：{item.summary or '请打开原文核对'}（{item.url}）"
                for item in payload.references
            ]
            draft += "\n\n参考资料（发布前请核对原文）\n" + "\n".join(reference_lines)
            rationale.append(f"附带了 {len(payload.references)} 条可追溯参考资料")

        return DraftResult(
            draft=draft,
            rationale=rationale,
            profile=DraftProfile(
                name=profile.name,
                interests=profile.interests,
                style=tone,
            ),
        )
