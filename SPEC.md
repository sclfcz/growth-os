# Growth OS 产品与技术规格（v1.0）

> 交给 Codex 实现用的权威规格。和其他文档有冲突时，以本文件为准。
> 只有一个用户（我自己），部署在我自己的云服务器上，手机和电脑都要能用。

---

## 0. 产品一句话 & 设计原则

**每天打开就告诉我：今天做哪些题、复习哪些题、做哪些事，什么时候能复习完；我只需要点几下做反馈，系统自动安排明天。**

以下五条原则贯穿所有功能，功能有取舍时按这几条来：

1. **系统给计划，我只负责执行和反馈。** 首页显示的是今天的待办，不是一堆要填的表单。
2. **每次记录不超过 10 秒。** 标记一道题只需点一次（不会 / 模糊 / 熟练），记一笔账只需一行（`18.5 午饭`），健身直接带出上次的重量和组数。
3. **手机优先。** 所有录入都要能单手完成，桌面端只是把版面铺开。
4. **不惩罚休息。** 休息日、生病日不扣分，也不打断连续打卡；评分是给复盘用的，不是用来考核自己的。
5. **规则透明。** 每个分数、每个复习日期都要能点开看到计算依据。

---

## 1. 技术栈（已定，不要换）

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Next.js 15（App Router）+ TypeScript（strict）** | 前后端放在一个仓库、一个容器里，部署最简单 |
| 数据库 | **SQLite（better-sqlite3）+ Drizzle ORM** | 单用户场景足够用，备份就是复制一个文件 |
| UI | Tailwind CSS + shadcn/ui + lucide-react | |
| 图表 | Recharts | |
| 校验 | zod（所有 API 入参和 AI 输出都要校验） | |
| 日期 | dayjs + utc/timezone 插件 | |
| 测试 | Vitest（单元测试）+ Playwright（e2e，手机视口） | |
| AI | OpenAI 兼容 Chat Completions 接口（主用 OpenCode Go，可切换到百炼或 NewAPI） | `openai` npm 包，配置 baseURL 和自定义请求头 |
| 部署 | Docker（Next standalone 输出）+ docker compose + Caddy | |

不需要 Redis、MQ 或单独的后端服务。不用 Server Actions 去做复杂逻辑：核心逻辑写在 `src/server/` 下的纯函数里，方便单元测试，路由层（Route Handler / Server Action）只做一层很薄的封装。

---

## 2. 全局概念

### 2.1 「逻辑日」（非常重要）
- 时区固定为 `Asia/Shanghai`（可配置）。
- **一天的分界点是凌晨 04:00**（可配置 `DAY_START_HOUR`）。凌晨 1 点刷题，算前一天。
- 全系统只能用一个工具函数 `getLogicalDate(now): 'YYYY-MM-DD'` 来判断「今天」，禁止在其他地方直接 `new Date()` 取日期。日期字段统一存成 `TEXT 'YYYY-MM-DD'`。

### 2.2 日类型 `day_type`
每天有一个类型：`normal` / `rest`（主动休息）/ `sick`（生病或有突发事件）/ `exam`（考试周）。
- `rest` / `sick`：当天不安排新题，复习也只放必须做的部分（见 4.3），不计算评分，不打断连续打卡。
- `exam`：学习预算自动降到设置里 `exam_budget_minutes` 的值。
- 首页顶部有一个开关可以切换，切换后今天的计划要重新生成。

### 2.3 认证
- 单用户，密码的 bcrypt 哈希存在环境变量 `APP_PASSWORD_HASH` 里。
- 登录后发 httpOnly + Secure + SameSite=Lax 的签名 cookie（iron-session），有效期 30 天。
- 登录接口要做限流：同一 IP 连续失败 5 次，锁定 15 分钟。
- 除 `/login` 和 `/api/health` 外，所有页面和 API 都要鉴权（middleware 实现）。

---

## 3. 模块总览 & 导航

手机端底部 Tab（5 个）：**今日 · 学习 · 健身 · 记账 · 复盘**。
「目标」「统计」「设置」放在右上角头像菜单里。桌面端（≥1024px）改为左侧边栏。

| 模块 | 路由 | 版本 |
|---|---|---|
| 今日总览 | `/` | M1 |
| 学习与智能复习 | `/study`、`/study/items/[id]`、`/study/onboard`、`/study/forecast` | M1 |
| 任务与目标 | `/goals`（今日任务在首页） | M2 |
| 复盘日记 | `/journal`、`/journal/[date]` | M2 |
| 健身 | `/fitness` | M3 |
| 记账 | `/money` | M3 |
| 评分与统计 | `/stats` | M4 |
| AI 复盘 | 嵌在 `/journal/[date]`、`/stats` 里 | M5 |
| 设置 / 数据导出 | `/settings` | M0 起逐步完善 |

---

## 4. 学习与智能复习引擎（核心，必须单元测试全覆盖）

### 4.1 卡组与条目
- **Deck（卡组）**：如「LeetCode Hot 100」「Java 八股」「Agent 知识点」，支持自定义新建。
- **Item（条目）**：一道题或一个知识点。字段包括标题、链接、难度、分类、笔记（Markdown）、排序号。
- 种子数据：`seed/hot100.json`（100 道题，按官方学习计划的分类顺序排列）。首次启动自动导入，导入要幂等，按 `slug` 去重。
- 新题的推进顺序：按卡组的 `order` 顺序。可以设置每个卡组「每天最多新学 N 个」，多个卡组之间按设置里的权重轮流取。

### 4.2 反馈与间隔算法（阶梯法，固定且可解释）

每次学习或复习只有 3 个按钮：

| 按钮 | 含义 |
|---|---|
| 😵 不会 | 看了题解才写出来，或者根本没思路 |
| 🤔 模糊 | 有提示或调试很久才 AC，思路有卡顿 |
| ✅ 熟练 | 独立、比较流畅地 AC |

另外有两个可选的快捷输入，默认折叠、不强制填：用时档位（10 / 20 / 30 / 45 / 60+ 分钟）和一行笔记。

**阶梯：** `LADDER = [1, 3, 7, 14, 30, 60, 120]`（单位：天），`stage` 是阶梯下标（0–6）。

状态更新规则：

```
首次学习（item.status == 'new'）：
  不会 → stage = 0
  模糊 → stage = 1
  熟练 → stage = 2
复习：
  熟练 → stage = min(stage + 1, 6)
  模糊 → stage 不变；如果 stage == 0，则变成 1（保证不会一直卡在 1 天）
  不会 → stage = max(stage - 2, 0)，lapses += 1

interval = min(LADDER[stage], settings.max_interval_days)
due_date = loadBalance(today + interval, fuzz)
```

- `max_interval_days`：「冲刺上限」，默认 30。求职期我希望最长间隔不超过 30 天，面试季结束后可以改成 120。
- **模糊抖动 + 负载均衡** `loadBalance`：当 interval ≥ 7 时，在 `[due - f, due + f]`（`f = round(interval * 0.15)`）区间里，挑已排复习数最少的那一天；interval < 7 时不做抖动。目的是避免复习任务扎堆到同一天。
- **状态派生：**
  - `new`：从没做过
  - `learning`：stage ≤ 1
  - `reviewing`：stage 为 2–3
  - `mastered`：stage ≥ 4（间隔达到 30 天及以上），并且最近一次反馈是「熟练」
  - `leech`（顽固题）：lapses ≥ 3。在列表中标红，首页上提示「建议重看题解并写笔记」
- 逾期很久才复习时，不做特殊补偿，仍然按上面的规则走（简单、可预测）。
- **撤销：** 每条 review_log 都保存反馈前的快照（stage、due_date、status、lapses）。首页上的每次标记都要有「撤销」入口：5 秒内的 toast 可以撤销，当天的历史记录里也可以撤销。

### 4.3 每日计划生成器 `buildDailyPlan(date)`

**触发方式：** 当天第一次打开首页时惰性生成，生成后存为快照（`daily_plans` 表），当天内保持稳定，不随操作重新洗牌。提供「重新生成」按钮，会保留已完成的项。不需要定时任务。

**输入：**
- `budget_minutes`：当天学习预算，按星期几分别设置（默认工作日 150，周末 180；`exam` 日使用 `exam_budget_minutes`）
- 预估耗时：新题 easy 20 / medium 35 / hard 50 分钟；复习统一按 `review_minutes` = 15 分钟。有 ≥ 10 条用时记录后，改用我自己的历史中位数
- `min_new_per_day`（默认 1）、`max_new_per_day`（默认 4）

**算法：**

1. `dueReviews` = 所有 `due_date ≤ date` 的条目，按优先级排序：逾期天数降序 → lapses 降序 → stage 升序。
2. 复习最多占用 `budget × 70%`。超出部分不进入今日计划，在首页显示为「积压 N 题」。积压的题不会改日期，明天会自动排在前面。
3. **清债模式：** 如果积压量 > 2 天的复习容量，当天新题数 = 0，首页显示横幅「今天是清债日」。
4. 用剩余预算按顺序填入新题，数量限制在 `[min_new, max_new]` 区间内（清债模式下为 0）。
5. `rest` / `sick` 日：新题 = 0；复习只放逾期 ≥ 3 天或 stage ≤ 1 的题，最多 2 题，标记为「可选」。
6. 计划之外的题也可以做：首页有「再来一题」按钮，从新题队列里取下一道，标记为 `extra`。

**输出：** `{ reviews: Item[], news: Item[], backlogCount, mode: 'normal'|'clearing'|'rest', estimatedMinutes }`

### 4.4 完成预测 `forecast()`（回答「什么时候能复习完」）

用**蒙特卡洛模拟**：从今天开始，用和 4.3 完全相同的计划器逐日往后推演，最多推 365 天，跑 300 次。

- 每次复习的反馈结果按我的历史分布随机抽样，按 stage 分桶统计 P(不会/模糊/熟练)。某个桶的样本少于 10 条时，使用默认分布：首次 0.25/0.35/0.40，复习 0.10/0.30/0.60。
- 未来每天的预算按设置里各星期几的值来算（假设没有休息日；页面上注明「每休息一天，大约推迟 X 天」）。

给出两个里程碑，各自的 **P50 和 P80 日期**：

- **首刷完成**：卡组内所有条目都至少做过一次。
- **阶段掌握**：卡组内 ≥ 90% 的条目 stage ≥ 3（间隔 ≥ 14 天）。

`/study/forecast` 页面内容：
- 两个里程碑的日期卡片
- 未来 30 天每日复习量的柱状图（基于当前排程的确定性数据，不是模拟结果）
- **What-if 滑块**：「每天新题上限 2→3」「预算 +30 分钟」，拖动后实时重算日期
- 页面底部写清楚：长期记忆没有真正的「复习完」，阶段掌握之后复习频率会自然降下来

性能要求：100 道题、300 次模拟要在 300ms 内完成（服务端计算，结果按当天日期 + 数据版本号缓存）。

### 4.5 初始化引导 `/study/onboard`（解决「之前已经刷过一部分」）

- 按分类分组的网格展示 Hot100。点击题目卡片会在「未做 → 不会 → 模糊 → 熟练」之间循环切换。支持「整组设为…」。
- 提交时，标记过的题按对应状态初始化 stage（规则同首次学习）。首次 due 日期在以下窗口内**均匀分散并做负载均衡**，避免第一天就堆上 50 道复习：
  - 不会：1–3 天
  - 模糊：2–6 天
  - 熟练：4–12 天
- 引导页可以重复进入，只影响仍为 `new` 状态的题。

### 4.6 学习页面 `/study`
- 卡组切换。每个卡组显示进度条（新 / 学习中 / 复习中 / 已掌握 / 顽固），以及距离首刷完成的 P50 日期。
- 条目表格支持筛选（状态、分类、难度、顽固题）和排序（下次复习日期、lapses）。
- 条目详情页：标题和外链、笔记（Markdown 编辑）、复习时间线（每次的日期、反馈、用时、笔记）、当前 stage 和下次复习日期，以及「为什么是这天」的说明。另有手动操作：「推迟 N 天」「重置为新题」「暂停」。

---

## 5. 任务与目标（M2）

### 5.1 今日三件事
- 首页最上方是「今日最重要的三件事」（可以少于三件）。
- 前一天晚上复盘时填写的「明天最重要的一件事」，会自动成为第二天的第一件事。

### 5.2 任务
- 字段：标题、日期、分类（学习 / 项目 / 求职 / 生活 / 其他）、是否属于三件事、预估时长（可选）、关联目标（可选）、状态（todo / done / dropped）、未完成原因（可选，提供快捷标签：没时间、低估难度、状态差、计划变了）。
- **自动顺延：** 新的一天第一次打开首页时，如果昨天还有未完成的任务，弹出底部面板列出这些任务，每个可以选择「顺延到今天」或「放弃」，也可以一键全部顺延。被顺延的任务记录 `carried_count`；当它 ≥ 3 时，标黄提示「这件事拖了 3 天，要拆小还是放弃？」
- 支持重复任务模板（每天 / 每周几），例如「每周二、四投简历」。

### 5.3 长期目标
- 字段：标题、截止日期、描述、状态。可以挂若干关键结果（KR）：名称、目标值、当前值、单位，当前值可以手动更新。
- KR 也可以绑定系统数据并自动计算，v1 支持三种：
  - 「卡组 X 首刷完成数」
  - 「本月健身次数」
  - 「本月支出 ≤ 预算」
- 目标页显示进度条，以及「按当前速度预计在哪天完成」。

---

## 6. 复盘日记（M2）

`/journal/[date]`，晚上从首页的复盘入口进入。目标是 1 分钟内填完：

- 滑块（1–5）：心情、精力、学习感受。睡眠时长可选，数字输入。
- 三个短文本框：**今天的收获**、**遇到的问题**、**明天最重要的一件事**（这一项会写入第二天的三件事）。
- 页面上方只读展示当天的自动汇总：完成了哪些题（附反馈）、任务完成率、健身情况、花销合计、当天得分。
- M5 起，这里会出现「AI 复盘」按钮（见第 10 节）。
- `/journal` 列表页是日历视图，每个格子按当天评分着色，点击进入对应日期。

---

## 7. 健身（M3）

### 7.1 每周计划
- 设置里按星期几指定训练日以及对应模板，例如：一 胸+三头 / 三 背+二头 / 五 腿 / 六 肩+核心。
- 这个计划决定评分里健身项是否计入当天（见第 9 节）。

### 7.2 记录（最低摩擦）
- 首页健身卡片：
  - 训练日：显示「今天：胸+三头」和「开始记录」按钮。
  - 非训练日：显示「休息日」，并提供「临时练了」按钮。
- 训练记录页：
  - 自动带出模板里的动作，**每个动作预填上一次的重量 × 次数 × 组数**。完成一组就点 ✓，需要改再点开数字修改。
  - 可以临时添加动作，从历史动作库中搜索；也可以新建动作。
  - 训练结束后填写：时长、主观感受 1–5、可选的一行备注。
- 也可以不记细节，只打卡：「练了 / 没练（原因：没时间、累、不舒服、其他）」。
- 体重可选，单独一行记录。

### 7.3 展示
- 本周训练次数 / 计划次数。
- 近 8 周训练容量（Σ 重量 × 次数）柱状图。
- 单个动作的估算 1RM 趋势（Epley：`w × (1 + reps/30)`）。
- 体重折线图。

---

## 8. 记账（M3）

### 8.1 快速录入
- 首页记账卡片和 `/money` 顶部都有一个输入框，支持以下写法：
  - `18.5 午饭`
  - `午饭 18.5`
  - `打车 23 昨天`（支持「昨天」「前天」以及 `MM-DD`）
  - `+500 稿费`（加号表示收入）
- 解析器 `parseExpense(text)` 是纯函数，需要单元测试覆盖。
- **分类自动识别：** 先查关键词表（如 饭 / 餐 / 奶茶 → 餐饮；地铁 / 打车 → 交通；书 / 课 / API / token / 服务器 → 学习与工具），再查历史记录中同一备注最常用的分类。识别出的分类以 chip 形式显示，点击可以改。改过之后，以后同样的备注都用新分类（学习用户习惯）。
- 默认分类：餐饮、交通、学习与工具、日用、娱乐、恋爱社交、健身、医疗、其他。收入分类：稿费 / 公众号、工资、生活费、其他。

### 8.2 预算
- 月预算可以配置（例如 3000）。各分类也可以单独设预算，不填就不限制。
- **动态日预算** = （月预算 − 本月已花）÷ 本月剩余天数（含今天）。首页显示「今天还能花 ¥X」。
- `/money` 页面内容：本月已花 / 预算 / 收入，分类饼图，每日支出柱状图，近 6 个月趋势，流水列表（可以编辑、删除）。

---

## 9. 评分系统（M4）

### 9.1 每日得分（0–100）
只对当天「适用」的分项计分，权重按适用项重新归一化：

| 分项 | 权重 | 计算方式 | 什么时候适用 |
|---|---|---|---|
| 学习 | 35 | 完成的计划项 ÷ 计划项总数（复习和新题都计 1；extra 项可以加分，但该项封顶 100） | 当天计划项 > 0 |
| 任务 | 25 | 加权完成率：三件事权重 2，其他任务权重 1 | 当天有任务 |
| 健身 | 15 | 训练日练了 = 100，没练 = 0 | 只在训练日适用（休息日不计入；休息日临时练了也不额外加分） |
| 预算 | 10 | 当天支出 ≤ 日预算记 100；超出时线性递减，到 2 倍日预算时为 0 | 总是适用 |
| 复盘 | 15 | 填写了复盘 = 100 | 总是适用 |

- `day_type` 为 rest 或 sick 的日子不计算得分，显示为「休息」。
- 状态类的主观指标（心情、精力）**不计入得分**，只用于展示相关性，避免状态差的日子分数也低、形成「双重打击」。
- 每个分项都可以点开查看计算明细。

### 9.2 连续打卡
- 有效日的定义：得分 ≥ 60，或者当天是 rest / sick 日。
- 每周有 1 次「补签」机会，自动使用：一周内第一次断签不中断连续打卡。

### 9.3 统计页 `/stats`
- **以周为单位，而不是突出每一天**：本周平均分、和上周对比、各分项雷达图或条形图。
- 近 12 周得分趋势。
- 日历热力图（学习完成数）。
- 心情 / 精力与学习完成率的散点图（帮助我自己发现规律，不做价值判断）。

---

## 10. AI 能力（M5，第一版就要做，但排在最后实现）

### 10.1 配置（主用 OpenCode Go，可切换）
走 OpenAI 兼容的 `/chat/completions` 接口。没有配置 `AI_API_KEY` 时，所有 AI 按钮隐藏，其他功能完全不受影响。

| 环境变量 | 默认值 / 示例 | 说明 |
|---|---|---|
| `AI_BASE_URL` | `https://opencode.ai/inference/go/openai/v1` | OpenCode Go 当前文档给出的 OpenAI 兼容地址（旧地址 `https://opencode.ai/zen/go/v1` 也可能还能用）。不要写死，以配置为准 |
| `AI_API_KEY` | （OpenCode 控制台生成） | 用 Bearer 方式鉴权 |
| `AI_MODEL` | `deepseek-v4.1-flash` | 日报、讲解卡用 flash 档模型。flash 档额度比 premium 档宽松得多 |
| `AI_MODEL_WEEKLY` | 可选，例如 `glm-5.3` | 周报可以用更强的模型；不填就用 `AI_MODEL` |
| `AI_TIMEOUT_MS` | `90000` | 服务器在国内，访问海外接口延迟较高 |
| `AI_EXTRA_HEADERS` | 可选，JSON 格式 | 用于兼容其他服务商 |

**接入 OpenCode Go 的特殊要求（必须实现）：**
- 每个请求都要带 `x-opencode-session: <稳定 ID>` 请求头。会话 ID 按「功能 + 引用」生成，例如 `growth-os-daily-2026-10-17`。OpenCode Go 会拒绝没有会话头的请求，同时这个 ID 也用于它的路由和 prompt 缓存。
- 设置自定义 User-Agent：`growth-os/<version>`，不要使用 SDK 默认的 UA。
- 用模型 ID 本身（例如 `deepseek-v4.1-flash`），**不要**带 `opencode-go/` 前缀。
- 出错时重试 1 次（指数退避）。收到 429 或额度不足时，提示「本期额度用完」，不再继续重试。
- `/settings` 页提供「测试连接」按钮：发一个极短的请求，显示延迟、模型名和错误信息。
- 由于 OpenCode Go 的模型目录变动很频繁，模型名只从配置读取，**不要在代码里做白名单校验**。

**备用方案：** 只要改 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 三个环境变量，就能切换到阿里云百炼（`https://dashscope.aliyuncs.com/compatible-mode/v1`）或自建的 NewAPI。代码里不要出现任何 OpenCode 专属分支，只有会话头这一项通过配置开关 `AI_SEND_SESSION_HEADER=true` 控制。

### 10.2 功能
1. **今日 AI 复盘**（`/journal/[date]` 页面的按钮）
   - 输入：当天的结构化数据 JSON（题目和反馈、顽固题、任务和未完成原因、健身、支出与预算、复盘文本、近 7 天得分）。
   - 输出：用 JSON mode，并用 zod 校验以下结构：
     ```
     { highlights: string[≤3], problems: string[≤3], suggestions: string[≤3],
       tomorrow_top3: { title: string, category: string }[≤3] }
     ```
   - 在页面上渲染这些内容。`tomorrow_top3` 每条都有「加入明天任务」按钮，**AI 不会自动改动任何数据，一切以我的点击为准**。
2. **AI 周报**（`/stats` 页面，每周日或手动触发）：输入本周汇总数据，输出趋势、规律（例如「二叉树类题目反复不会」「周三普遍完成率低」）和下周建议。结果保存在 `ai_reports` 表里，可以回看。
3. **顽固题讲解卡**（条目详情页）：对于 leech 题，把题目标题和我的笔记发给 AI，生成「核心思路 / 易错点 / 一句话记忆口诀」，我可以选择保存到笔记里。

### 10.3 工程要求
- Prompt 模板放在 `src/server/ai/prompts/*.md`，不要写死在代码里。
- 每次调用都写入 `ai_reports` 表，记录 input_hash、模型、token 用量、耗时、原始输出和解析状态。同一天、同一份输入再次请求时直接返回缓存结果，除非我点「重新生成」。
- 请求超时或解析失败时，显示友好的报错，并提供重试按钮。
- 系统 prompt 要求：用中文、具体、可执行；不说空泛的鼓励；不对休息进行道德评判。

---

## 11. 首页 `/` 布局（手机，从上到下）

1. **顶栏**：日期（逻辑日）+ 星期、day_type 切换（正常 / 休息 / 生病 / 考试）、今日得分圆环（M4 之前隐藏）。
2. **今日三件事**：勾选框列表，以及「+ 添加」。
3. **学习卡**（最大的一块）
   - 摘要：复习 X · 新题 Y · 预计 Z 分钟 · 积压 N（有积压时显示）。清债模式时显示横幅。
   - 列表：每行是 [复习/新题 标签] 题号 + 标题（点击在新标签页打开力扣链接）+ 三个反馈按钮。标记完成后该行折叠成 ✓ 和反馈结果，旁边有撤销。
   - 「再来一题」按钮。
   - 底部一行小字：「首刷预计 11-08 完成（P50）」，点击进入 forecast 页。
4. **其他任务**（三件事以外的任务）。
5. **健身卡**。
6. **记账卡**：快速输入框，以及「今天已花 ¥X / 还能花 ¥Y」。
7. **复盘入口**：20:00 之后高亮显示；已填写的话显示摘要。

首页数据用一个聚合接口 `GET /api/today` 一次返回，首屏渲染目标 < 1s。

---

## 12. 数据模型（Drizzle / SQLite）

所有表都包含 `id INTEGER PK`、`created_at`、`updated_at`。金额统一用**分（整数）**存储。

```
settings(key TEXT PK, value JSON)
  -- day_start_hour, timezone, budget_minutes_by_weekday[7], exam_budget_minutes,
  -- min_new_per_day, max_new_per_day, review_minutes, max_interval_days,
  -- monthly_budget_cents, category_budgets, workout_plan_by_weekday, deck_weights

day_meta(date TEXT PK, day_type TEXT, score INT NULL, score_detail JSON NULL)

decks(id, name, description, sort_order, daily_new_limit INT NULL, archived BOOL)
items(id, deck_id FK, external_id TEXT NULL /*slug*/, number INT NULL, title, url,
      difficulty TEXT NULL, category TEXT NULL, sort_order INT, notes_md TEXT,
      status TEXT /*new|learning|reviewing|mastered*/, stage INT, lapses INT,
      due_date TEXT NULL, first_learned_at TEXT NULL, last_reviewed_at TEXT NULL,
      suspended BOOL, UNIQUE(deck_id, external_id))
review_logs(id, item_id FK, date TEXT, kind TEXT /*learn|review*/, rating TEXT /*again=不会|hard=模糊|good=熟练*/,
            minutes INT NULL, note TEXT NULL, prev_state JSON, new_state JSON, undone BOOL)
daily_plans(date TEXT PK, mode TEXT, budget_minutes INT, backlog_count INT, generated_at)
daily_plan_items(id, date FK, item_id FK, kind TEXT /*review|new|extra*/, position INT,
                 optional BOOL, done_log_id FK NULL)

goals(id, title, description, deadline TEXT NULL, status TEXT)
key_results(id, goal_id FK, title, target REAL, current REAL, unit TEXT,
            auto_source TEXT NULL, auto_params JSON NULL)
tasks(id, date TEXT, title, category, is_top3 BOOL, est_minutes INT NULL, goal_id FK NULL,
      status TEXT, drop_reason TEXT NULL, carried_count INT, recurring_id FK NULL, sort_order)
recurring_tasks(id, title, category, rule JSON /*{type:'daily'}|{type:'weekly',days:[1,3]}*/, active BOOL)

journals(date TEXT PK, mood INT, energy INT, study_feel INT, sleep_hours REAL NULL,
         gains TEXT, problems TEXT, tomorrow_top1 TEXT)

exercises(id, name UNIQUE, body_part TEXT)
workout_templates(id, name, exercise_ids JSON)
workouts(id, date TEXT, status TEXT /*done|skipped*/, skip_reason TEXT NULL, template_id NULL,
         duration_min INT NULL, feeling INT NULL, note TEXT NULL)
workout_sets(id, workout_id FK, exercise_id FK, set_index INT, weight_kg REAL, reps INT, done BOOL)
body_weights(date TEXT PK, kg REAL)

expense_categories(id, name, kind TEXT /*expense|income*/, keywords JSON, sort_order)
transactions(id, date TEXT, amount_cents INT /*支出为正，收入另用 kind 区分*/, kind TEXT,
             category_id FK, note TEXT)
note_category_memory(note TEXT PK, category_id FK)

ai_reports(id, type TEXT /*daily|weekly|leech*/, ref TEXT /*date|week|item_id*/, model,
           input_hash, input JSON, output JSON NULL, raw TEXT, status TEXT,
           tokens_in INT, tokens_out INT, latency_ms INT)
```

迁移用 drizzle-kit 生成 SQL 文件，应用启动时自动执行。

---

## 13. 代码结构

```
src/
  app/                    # 页面与 Route Handlers（薄层）
  components/             # UI 组件（shadcn 放在 components/ui）
  server/
    db/ schema.ts, client.ts, migrate.ts, seed.ts
    core/                 # 纯函数，不依赖 DB，100% 单测
      date.ts             # getLogicalDate 等
      scheduler.ts        # applyRating, loadBalance, deriveStatus
      planner.ts          # buildDailyPlan
      forecast.ts         # monteCarloForecast
      scoring.ts          # computeDayScore, streak
      expenseParser.ts    # parseExpense, guessCategory
    services/             # 组合 DB 与 core 的业务服务
    ai/ client.ts, prompts/*.md, schemas.ts
  lib/                    # 前端工具
seed/hot100.json
tests/ unit/*.test.ts, e2e/*.spec.ts
```

---

## 14. 部署与运维（M0 就要打通）

> **服务器位于中国大陆。** 下面所有要求都以「在国内服务器上能构建、能访问」为前提。

### 14.1 容器
- `Dockerfile`：多阶段构建，Next 使用 `output: 'standalone'`，以非 root 用户运行。
  - 基础镜像用 `node:22-bookworm-slim`。better-sqlite3 需要原生编译，构建阶段要装 `python3 make g++`。
- `docker-compose.yml`：
  - `app` 服务：挂载 `./data:/app/data`，SQLite 和备份都放在这里。
  - `caddy` 服务：负责 HTTPS 反向代理。
  - 只有 caddy 对外暴露端口，app 只在内部网络中可访问。

### 14.2 国内构建适配（必须）
- **禁止使用 `next/font/google` 及任何构建时或运行时访问 Google 的资源。** 国内服务器构建会直接失败。字体用系统字体栈：`-apple-system, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif`。图标用 lucide 本地组件。
- 所有前端资源都要本地打包，**不引用任何外部 CDN**。
- Dockerfile 支持构建参数 `NPM_REGISTRY`，默认 `https://registry.npmmirror.com`；pnpm 和 node-gyp 的下载镜像也要一并配置。
- 基础镜像名通过 `.env` 里的 `REGISTRY_PREFIX` 配置，以便切换到国内镜像源。README 里写明如何配置 Docker daemon 的 `registry-mirrors`。
- README 提供「**本地构建 → 推送到阿里云 ACR 个人版 → 服务器拉取**」的备选流程，用于服务器上构建太慢的情况。
- 服务器访问 OpenCode Go 的连通性要在部署文档里给出检查命令：`curl -I https://opencode.ai`。

### 14.3 访问模式（`.env` 中的 `ACCESS_MODE` 二选一，各提供一份 Caddyfile 模板）
1. **`domain`（有已备案的域名）**：Caddy 自动向 Let's Encrypt 申请证书，使用 80/443 端口。**域名必须已完成 ICP 备案**；未备案的域名解析到大陆服务器后，80/443 端口会被云厂商拦截。
2. **`ip`（没有域名或未备案，作为默认的推荐起步方式）**：
   - 通过 `https://<公网IP>:8443` 访问，Caddy 使用 `tls internal` 给 IP 签发证书。
   - README 写清楚如何把 Caddy 的根证书（`data/caddy/pki/authorities/local/root.crt`）安装到 iPhone、Android 和电脑并设置为信任。iPhone 的步骤是：隔空投送或下载描述文件 → 设置 → 已下载描述文件 → 安装 → 通用 → 关于本机 → 证书信任设置 → 打开开关。
   - 证书受信任之后，HTTPS、安全 cookie 和 PWA 都能正常工作。
   - 提供 `/ca.crt` 下载路由：仅在 `ACCESS_MODE=ip` 时启用，并且需要登录后才能下载。不过首次安装时还没信任证书，所以 README 也要说明如何用 scp 把证书拷下来。
- 两种模式下，README 都要提醒：在云厂商的安全组或防火墙里放行对应端口；SSH 不要用密码登录。

### 14.4 公网安全（因为直接暴露在公网 IP 上）
- 登录限流已经在 2.3 节规定。另外，所有 `/api/*` 写操作都要校验 Origin 头。
- 设置安全响应头：HSTS（仅 domain 模式）、`X-Frame-Options: DENY`、基础的 CSP。
- 不暴露任何调试端点。`/api/health` 不返回敏感信息，未登录时只返回 `{ ok }`。
- **PWA**：提供 manifest、图标和 service worker（只缓存静态资源，不做离线写入），可以添加到 iOS / Android 主屏。
- **备份**：应用内每天第一次请求时，检查当天是否已经备份；没有的话用 `VACUUM INTO` 生成 `data/backups/growth-YYYYMMDD.db`，保留最近 14 份。
- **导出 / 导入**：`/settings` 提供全量 JSON 导出和导入（导入前自动备份），记账流水另外支持 CSV 导出。
- `GET /api/health`：未登录时返回 `{ ok }`，登录后返回 `{ ok, version, dbSize }`。
- `.env.example` 列出所有环境变量。提供 `scripts/hash-password.ts`，用来生成 `APP_PASSWORD_HASH`。

---

## 15. 里程碑与验收标准

每个里程碑都要做到：`pnpm lint && pnpm typecheck && pnpm test` 全部通过，并且可以用 docker compose 部署起来。

**M0 · 骨架（半天）**
- Next.js、Tailwind、shadcn、Drizzle、迁移、登录鉴权、底部导航、设置页框架、Dockerfile、compose、健康检查。
- ✅ 验收：在国内服务器上用 `ACCESS_MODE=ip` 执行 `docker compose up -d --build`，构建过程中不访问任何境外资源：npm 走 npmmirror，Docker 基础镜像走镜像源，不访问 Google。手机信任根证书之后，用 `https://IP:8443` 登录能看到空首页，并且可以添加到主屏。

**M1 · 学习引擎 + 今日页（最重要）**
- 种子导入、onboard 引导页、scheduler、planner、forecast、首页学习卡、`/study` 列表和详情、撤销。
- ✅ 验收用例（都要写成 Vitest 测试）：
  1. stage = 2 时反馈「熟练」→ stage 变为 3，interval 为 14 ± 2，并且 due_date 落在当前负载最小的那一天。
  2. stage = 3 时反馈「不会」→ stage 变为 1，lapses + 1；lapses 达到 3 时状态显示为 leech。
  3. `max_interval_days = 30` 时，stage 6 的 interval 等于 30。
  4. 预算 150 分钟、到期复习 12 题 → 计划中复习 7 题（105 分钟，不超过 70%），积压 5 题；积压没有超过 2 天的复习容量，所以新题按剩余预算填 1 题。
  5. 积压量 > 2 天的容量 → 新题为 0，mode = clearing。
  6. rest 日 → 新题为 0，可选复习 ≤ 2 题。
  7. onboard 时标记 50 道「熟练」→ 第 4–12 天每天的复习数之差 ≤ 1。
  8. 凌晨 03:59 打开时，逻辑日仍是前一天。
  9. 撤销反馈后，条目状态与反馈前完全一致。
  10. forecast 的 P80 日期 ≥ P50 日期；预算增加后，P50 日期不会推后。
- ✅ Playwright（iPhone 13 视口）：登录 → onboard 标记 3 道题 → 首页标记 1 道新题为「熟练」→ 刷新后状态保持。

**M2 · 任务 / 目标 / 复盘**
- ✅ 验收：昨天未完成的任务第二天会出现顺延面板；复盘填写的「明天最重要的一件事」第二天出现在三件事第一位；同一任务顺延 3 次后标黄。

**M3 · 健身 / 记账**
- ✅ 验收：`parseExpense` 能正确解析 ≥ 15 个用例（包含收入、日期词、金额在前或在后、非法输入）；新建一次训练时，会预填该模板上一次的重量；动态日预算计算正确（写单元测试）。

**M4 · 评分 / 统计**
- ✅ 验收：休息日不出现得分，并且不打断连续打卡；非训练日的权重中不含健身项，且其他项权重归一化后总和为 100；分项明细可以点开查看。

**M5 · AI**
- ✅ 验收：没有配置 AI 时按钮不显示；接 OpenCode Go 时请求带上 `x-opencode-session` 请求头和自定义 UA（写一个单元测试，mock fetch 断言请求头）；设置页的「测试连接」能显示延迟；AI 返回非法 JSON 时页面不崩溃并提供重试；相同输入命中缓存；点击「加入明天任务」后，第二天的任务里能看到这一条。

---

## 16. 明确不做的事（防止范围膨胀）
- 多用户、注册、权限体系
- 原生 App（PWA 已经够用）
- 离线编辑与同步
- 自动抓取力扣提交记录（以后再考虑）
- 社交、分享、排行榜
- 复杂的 FSRS 参数拟合（阶梯法够用，而且可以解释）
