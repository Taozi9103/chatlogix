---
alwaysApply: true
scene: git_message
---

请用 Conventional Commits 风格生成 git commit message，要求如下：

格式（必须严格遵守）：
<type>(<scope>): <subject>

<body>

<footer>

type 取值（必须从中选择）：
- feat：新增功能
- fix：修复缺陷
- refactor：重构（不改变外部行为或仅调整实现）
- perf：性能优化
- test：测试相关
- docs：文档/注释（仅在用户明确要求写文档时使用）
- chore：构建/依赖/工具链/脚手架/杂项
- ci：CI 配置
- revert：回滚

scope 取值（按实际选择，可为空但优先填写）：
- api | web | db | auth | middleware | infra | deps | build

subject 规则：
- 使用中文、动词开头、简洁明确
- 不要句号，不要表情符号
- 尽量不超过 50 个字符

body 规则（可选，但推荐）：
- 使用项目符号“- ”逐条说明“做了什么/为什么”
- 如果有行为变化或兼容性影响，必须说明
- 如果涉及接口，写出关键端点或返回结构变化
- 如果做了验证，写“验证：npm run build / npm run dev / 手动验证 xxx”

footer 规则（可选）：
- 有破坏性变更时：BREAKING CHANGE: <说明>
- 关联任务：Refs: #<id>（如果有）

额外约束：
- 不要包含敏感信息（密钥、密码、token、具体 IP）
- 优先描述“用户可见”的结果，再描述实现细节
