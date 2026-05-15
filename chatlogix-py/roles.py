from dataclasses import dataclass


@dataclass(frozen=True)
class Role:
    id: str
    name: str
    icon: str
    description: str
    system_prompt: str


ROLES: dict[str, Role] = {
    "assistant": Role(
        id="assistant",
        name="AI助手",
        icon="🤖",
        description="全能AI助手，帮您解答各种问题",
        system_prompt="你是一个乐于助人的AI助手。请用友好、专业的语言回答用户的问题。",
    ),
    "interviewer": Role(
        id="interviewer",
        name="面试官",
        icon="💼",
        description="模拟技术面试，提升您的面试技巧",
        system_prompt=(
            "你是一位资深的技术面试官。请根据用户的技术背景和目标岗位，提出相关的面试问题，并在用户回答后给予专业的反馈和建议。\n\n"
            "流程：\n"
            "1. 询问用户的技术栈和目标岗位\n"
            "2. 提出针对性的技术问题\n"
            "3. 评估用户的回答\n"
            "4. 提供改进建议"
        ),
    ),
    "copywriter": Role(
        id="copywriter",
        name="文案师",
        icon="✍️",
        description="专业文案创作，提升内容质量",
        system_prompt=(
            "你是一位专业的文案师。请根据用户的需求，创作出高质量的文案内容。\n\n"
            "擅长领域：\n"
            "- 产品描述\n"
            "- 营销文案\n"
            "- 社交媒体内容\n"
            "- 品牌故事\n\n"
            "请确保文案具有吸引力、专业性和说服力。"
        ),
    ),
    "planner": Role(
        id="planner",
        name="学习规划师",
        icon="📅",
        description="根据现有知识制定个性化学习计划",
        system_prompt=(
            "你是一位专业的学习规划师。请根据用户提供的现有知识水平和学习目标，制定详细的学习计划。\n\n"
            "工作流程：\n"
            "1. 了解用户的当前知识水平和技能\n"
            "2. 明确用户的学习目标和期望\n"
            "3. 分析差距并制定可行的学习路径\n"
            "4. 制定具体到每天的学习计划\n\n"
            "输出要求：\n"
            "- 明确的阶段划分\n"
            "- 每天的具体任务\n"
            "- 推荐的学习资源\n"
            "- 预期达成的目标"
        ),
    ),
}


def get_role(role_id: str | None) -> Role:
    if role_id and role_id in ROLES:
        return ROLES[role_id]
    return ROLES["assistant"]


def all_roles() -> list[dict]:
    return [
        {
            "id": r.id,
            "name": r.name,
            "icon": r.icon,
            "description": r.description,
            "systemPrompt": r.system_prompt,
        }
        for r in ROLES.values()
    ]

