# 知我境 · 知乎数字分身小镇

> 「灵魂匹配局：社区 × 社交」把斯坦福小镇（Generative Agents）的方法论搬进一个由知乎内容驱动的实时多人世界。

我们不把知乎搬进游戏，而是把知乎的**内容关系**映射成**空间关系**，把**作者**映射成有长期记忆的**数字分身**：热榜是公共议题入口，藏书阁是资料检索入口，问道馆是问题理解入口，创作坊是表达生产入口，知我居是个人分身入口。用户在同一个世界里发现议题、交流观点、积累关系，再把自己的理解带回知乎。

前端像素小镇是我们的实验场，不是作品的卖点；这个仓库真正值得看的是**世界模型、记忆系统与 Agent 运行时**三块。

## 一、架构总览

```text
┌─────────────────────── 浏览器（RPGJS Client）───────────────────────┐
│  地图渲染 / 输入 / 地标与对话面板 / 战斗表现                        │
└───────────┬───────────────────────────────────────┬────────────────┘
            │ WebSocket                              │ HTTP
            ▼                                        ▼
┌─ RPGJS Node Server（世界权威，默认 8001）─┐  ┌─ FastAPI（大脑，默认 8000）─────────┐
│ · 地图、碰撞、移动判定、多人房间同步     │  │ · 知乎 Tool Registry（11/4 工具权限）│
│ · 托管分身状态机（巡游 / 到达 / 相遇）   │  │ · LangGraph ReAct Agent Loop        │
│ · 身份校验（WS 升级时向 FastAPI 验证）   │  │ · Mem0 语义记忆 + SQLite 结构化记忆 │
│ · 在线租约与断线清理                     │  │ · OAuth 边界与人设冷启动            │
└──────────────────────────────────────────┘  └─────────────────────────────────────┘
```

**为什么切成两半。** 游戏世界要的是高频、确定性、可回滚的物理与房间状态；知识和推理要的是低频、可降级、可替换的模型调用。两者混在一个进程里，任何一次 LLM 抖动都会拖慢整个世界。因此 RPGJS 独占世界权威——FastAPI 不保存地图、房间或移动状态；FastAPI 独占知识与推理——浏览器永远不接触任何凭证。两者通过 HTTP 契约协作，未来可以替换前端或接入别的 Agent Runtime。

## 二、设计① 把 Generative Agents 映射到知我境

斯坦福 Generative Agents 论文里有五个关键构件：**记忆流、检索、反思、规划、社交**。我们把它拆成可工程化的形态，并针对「真实 MMO + 知乎生态 + 成本约束」做了取舍：

| Generative Agents | 知我境实现 | 取舍与原因 |
|---|---|---|
| 记忆流：带时间戳的自然语言记录 | Mem0 向量库（嵌入式 Qdrant + 本地 `bge-small-zh-v1.5`）+ `episodes` 结构化事件 | 中文短文本本地嵌入，不依赖外部 API；结构化字段可审计 |
| 检索 = 近因 × 重要度 × 相关度 | 作用域过滤（`avatar:{id}` / `pair:{a}-{b}`）+ 近因排序 + 语义检索，pair 记忆取最近 5 位伙伴 | 暂不做重要度评分；优先保证**隔离正确**与**成本可预测** |
| 反思：周期性高层洞察 | 会话结束由一次 LLM 结构化摘要（`summary/topics/mood/familiarity_delta/relation_tag`），主人对话每 6 条提炼 `facts/prefs/todos` | 单次调用产出 JSON；失败不阻塞对话 |
| 规划：日计划递归分解 | `/api/agent/step` 每 ≥30 秒返回一个高层意图（`move` / `say` / `idle`） | 移动由 RPGJS 本地状态机执行，**LLM 不参与逐帧控制** |
| 社交：对话、关系、信息传播 | 2 格内相遇触发交谈，写入 pair 记忆，双向更新熟悉度与关系标签 | 60 秒冷却 + 全局并发闸门，避免「社交风暴」烧掉成本 |

与斯坦福的**三个本质差异**也是我们的设计重点：

1. **实时 MMO**：斯坦福是离线仿真，我们是真人在线和托管分身共存的世界——所有移动与战斗必须由服务端权威判定。
2. **成本约束**：斯坦福可以不计成本地跑一整季；我们必须给每个分身设预算：30 秒决策间隔、5 秒超时、15/30/60 秒退避、进程级并发上限 3。
3. **权限边界**：斯坦福的 Agent 只和彼此说话；我们的分身要替主人访问知乎数据，因此工具按关系收窄（见第四节）。

## 三、设计② 长期记忆：可隔离、可审计、可降级

记忆分两级作用域，由**服务端**按数值 ID 判定，客户端提供的 ID 永不作为权限依据：

```text
avatar:{id}           主人私有：事实 / 偏好 / 待办，仅本人分身可读
pair:{min}-{max}      双方共享：共同经历，仅这两个身份可读（ID 排序保证唯一）
```

**写入路径**

```text
主人 ↔ 自己分身     每累计 6 条消息 → 一次 LLM → facts/prefs/todos（infer=true）→ private
访客/相遇对话        每轮回复 → 一次 LLM → summary/topics/mood/familiarity_delta/relation_tag
                     （infer=false）→ pair + relationships + episodes
内容哈希作幂等键：重复写入不产生脏数据
```

**存储分层**

- `Mem0`（嵌入式 Qdrant）：语义检索层，负责「记得住」；
- `avatar_profiles` / `relationships` / `episodes`（SQLite）：结构化事实、熟悉度、关系标签、事件时间线，负责「说得清」；
- `persona_cards`：知乎数据冷启动的人设卡（一次 LLM 抽取兴趣领域、表达风格、观点摘要），独立于记忆开关。

**检索与隐私**

- 主人对话：私有记忆全读 + 按 `last_met_at` 取最近 5 位伙伴的 pair 记忆；
- 他人对话：只读该 pair，绝不枚举私有作用域；
- prompt 注入上限约 1200 字符、人设卡约 300 字符，防止上下文失控。

**降级**

`MEMORY_ENABLED=0` 可完全关闭；`mem0ai` / `fastembed` / `onnxruntime` 惰性导入，缺失、初始化失败、模型不可用时只记日志，chat 与 step 的主流程不被阻断——这是刻意的产品选择：实验性能力不能成为单点故障。

## 四、设计③ LangGraph Agent Loop：带权限的工具调用

`/api/agent/chat` 每次请求按分身人设启动一个 LangGraph ReAct Agent：

```text
用户消息 ──► create_react_agent(LLM, tools, prompt, checkpointer)
                │
                ├─ 工具来自知乎 Tool Registry（共享领域模型 + Provider 可切换）
                └─ checkpointer = SqliteSaver（MEMORY_DATA_DIR，跨进程重启延续会话）
```

**工具权限按关系收窄**（`user_id == avatar_id` 时是主人，否则是访客）：

| 工具组 | 数量 | 内容 | 主人 | 访客 |
|---|---|---|---|---|
| 公共内容 | 4 | 热榜、知乎搜索、全网搜索、问题推荐 | ✅ | ✅ |
| 创作能力 | 2 | 知乎直答、草稿生成 | ✅ | ❌ |
| 个人数据 | 5 | 本人内容、关注、收藏、收藏夹、创作统计 | ✅ | ❌ |

`ToolContext.user_id` 只由宿主注入，永远不出现在模型可见的参数里——模型没有任何途径伪造身份或越权读取知乎数据。

**双契约**：`chat` 返回整段回复（对话/相遇），`step` 返回单步 JSON 意图（`move/say/idle`）。200 行不到的 `agent.py` 里还包含完整的错误分类（`LLM_NOT_CONFIGURED` / `LLM_AUTH_FAILED` / `LLM_RATE_LIMITED` / `LLM_UNAVAILABLE`）与可重试语义，前端据此决定重试、降级巡游还是提示用户。

## 五、世界层：托管挂机与相遇

- 玩家上线默认进入托管；按 `G` 切换，任何移动输入立即真人接管；
- 托管移动只下发 `moveTo` 目标（内置 7 个地标点），服务端每 1 秒以物理中心 48px 半径检测到达，15 秒超时兜底；
- LLM 只异步提供下一段意图：每玩家 ≥30 秒一次、5 秒超时、失败按 15/30/60 秒退避，模型不可用时显示「本地巡游中」；
- 2 格内相遇触发对话：60 秒/对冷却，先手方发起，`pair` 记忆落库；对话永不阻塞移动；
- 断线后角色与计时器即刻清理，在线状态由 15 秒租约、45 秒过期维护。

## 六、能力现状（诚实版）

**已接通**：多人小镇与六个可交互地标、知乎热榜/搜索/全网搜索/问题推荐/直答/草稿生成、LangGraph Agent 对话与行为意图、两级长期记忆、人设冷启动、托管挂机与相遇、通讯录与远程消息（离线由分身代答，连续自动回复上限 5 条）、游客与知乎 OAuth 双登录、PvP 动作战斗 v2（连击/闪避/格挡/蓄力 + 头顶血条）。

**已知边界**：托管仅限页面在线（无离线常驻实体）；知乎个人数据需 OAuth 授权；藏书阁知识库、天工坊 PDF/PPT 生产、状态效果与技能栏属于后续阶段；战斗的连击/格挡/蓄力目前是逻辑级测试覆盖，手感待真机试玩调参。

## 七、快速开始

```bash
# 一键启动完整链路（FastAPI 8000 + RPGJS world 8001 + Vite 5173）
./scripts/run-local.sh

# 腾讯云部署（写 systemd 服务 + Nginx + HTTPS）
sudo bash scripts/deploy-tencent.sh
```

没有模型密钥也能进入世界：托管角色会显示「本地巡游中」并执行确定性地标巡游。模型 Key 与知乎 Access Secret 保存在仓库外（本地 `~/.config/zhiwojing/secrets.env`，线上 `/etc/zhihu.env`，权限 600），不写入源码与前端。

## 八、接口与验证

主要接口：`/api/agent/chat`、`/api/agent/step`、`/api/memory/coldstart`、`/api/persona`、`/api/contacts`、`/api/messages/*`、`/api/zhihu/*`、`/api/auth/*`、`/api/oauth/*`；游戏侧为 RPGJS WebSocket 世界链路。

```bash
cd backend && python -m unittest discover -s tests -v   # 后端单测（75 项）
cd frontend && npm test                                  # 前端单测（含 12 项战斗）
cd frontend && npm run test:e2e:combat                   # 真机双客户端战斗 smoke
```

## 文档导航

- [产品说明计划书](docs/PRODUCT_PLAN.md)：面向评审的完整叙事与架构说明
- [项目状态](docs/PROJECT_STATUS.md)：逐项实现边界与验证情况
- [分身记忆](docs/MEMORY.md)：作用域、写入、表结构与降级
- [身份与鉴权](docs/AUTH.md)：会话、WS 校验与前端契约
- [动作战斗](docs/ACTION_BATTLE.md)：规则、按键与已知限制
- [小镇布局](docs/TOWN_LAYOUT.md)：地图与建筑
