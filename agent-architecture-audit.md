# Agent 架构对照审计报告

日期：2026-10-17
方法：pi（最小 agent 实现）定义"必备清单" → codex / opencode / claw-code / ZCode 四个生产级项目逐项调查"成熟做法" → Lyra 逐项对照判定。
证据形式：全部结论带 `文件:行号`；调查由五路独立审计完成（每项目一路 + Lyra 自审一路），pi 核心为人工精读。

---

## 一、最小 Agent 必备清单（pi 给出的"有什么"）

pi 的 agent 核心包总共 2519 行（`references/pi/packages/agent/src/`）。它认为一个 Agent 必备的是：

| # | 必备项 | pi 的做法 |
|---|---|---|
| 1 | **模型调用主循环** | 单层 `while(true)`（agent-loop.ts:179）：请求→流式响应→有工具调用就执行→结果回填→重复；停止=模型不再调工具且 follow-up 为空 |
| 2 | **统一消息 transcript** | 唯一状态源 `AgentMessage[]`；发请求前 `convertToLlm` 投影成 provider 形状（types.ts:222） |
| 3 | **工具** | schema+execute+label；失败=`isError` 返回，不许异常逃逸 |
| 4 | **工具前拦截/后覆盖** | `beforeToolCall`（可 block）+ `afterToolCall`——权限与修饰的唯一挂点 |
| 5 | **abort 信号贯穿** | 每层都收 AbortSignal，工具批中段也能断 |
| 6 | **steering + follow-up** | 运行中插话在 drain 点注入；将停时问一次"还有后续吗" |
| 7 | **上下文管理钩子** | `transformContext`：超预算剪枝，唯一的压缩挂点 |
| 8 | **扁平事件流给 UI** | 10 种生命周期事件（agent/turn/message/tool），UI 只消费事件流 |
| 9 | **失败内嵌协议** | StreamFn/convertToLlm 合同：不许 throw，错误变成 `stopReason:"error"` 事件 |
| 10 | **请求前钩子** | prepareRequest 换模型/上下文、动态 API key |

产品级补齐（pi coding-agent/durable 层）：会话持久化（JSONL）、compaction、crash-log、MCP、project-trust。

**注意 pi 刻意没有的**：权限策略引擎、快照事件、per-message 协议状态、自动续跑、双层传输。这些是产品层的选择，不是 Agent 的定义。

---

## 二、四个成熟项目在每项上怎么做

| # | 必备项 | codex | opencode | claw-code | ZCode | 四家共识 |
|---|---|---|---|---|---|---|
| 1 | 主循环 | 单层 loop（turn.rs:454），停止=模型+pending input | drain `while(true)`（llm.ts:191），AGENTS.md 明文禁止内存中 tool loop | 单层 loop（conversation.rs:608），max_iterations=∞ | 三层：命令队列→turn loop→状态机，但思考循环仍是一个 | **一个思考循环**；重试在请求层，不长在循环层 |
| 2 | UI/Provider 消息 | 两套；envelope.metadata 是 harness 元数据，**不承担协议重放**；resume=重放 rollout JSONL（rollout_reconstruction.rs） | 两套；per-message `providerState` 只存 provider 流式增量；resume=重放+compaction checkpoint | 同一份消息直接发 | 两套；resume=SQLite hydrate | 4/5 两套+纯函数投影；**resume 全部=重放独立日志/表**，没有一家把全量 provider 协议副本存进消息 metadata |
| 3 | 工具输出上限 | 记录期 10K tokens 头尾截断（unified_exec/mod.rs:74）；UI 侧另 1MiB | 2000 行/50KiB+溢写文件+outputPath 引用（tool-output.ts:13） | 16KiB 字节+marker（bash.rs:450）；JSONL 字段 16KiB | 100KB model bytes head 截断+附言（result-serialization.ts:33）；UI 另 2K/4K chars | **记录期硬上限（10K~100KB 量级）+明确 marker**；模型侧和 UI 侧是两级各自的上限 |
| 4 | Compaction | 自动开，窗口 90%，LLM 摘要，失败保留历史继续；另有后台异步 | 自动开，窗口 90%，摘要+保留 15K tokens 原文；原生 compaction 双轨 | 自动开，累计输入 100K 触发，启发式摘要不调模型，ToolUse/Result 对不拆 | 自动开，窗口-21K-13K，两级（micro+auto），连续失败 3 次熔断 | **自动、阈值≈窗口 80-90%、保留 system+近期、失败不丢数据、有防抖** |
| 5 | 权限拦截 | execpolicy 规则+approval 中枢+Guardian；bwrap+seccomp 真沙箱 | ruleset allow/deny/ask+ask 等待；无 sandbox（明确不做） | hooks+policy+enforcer 三层；unshare 沙箱 | PreToolUse hooks+ruleset+plan mode；OS 沙箱不在核心 | **allow/deny/ask 决策+规则匹配+hook 挂点**；OS 沙箱两家有两家没有 |
| 6 | 事件到 UI | 扁平事件枚举 40+，JSON-RPC，WS 通道 32K | SSE 扁平事件流，订阅者队列 4096，**超限踢订阅者** | 事件流+sequence，WS 4MiB 帧，游标回放 | 事件流+客户端 reducer 投影，1MB 帧/500 ops，**超限 fail-closed resync 阶梯** | **全部是扁平增量事件流；没有任何一家把全量快照当常规事件发**（ZCode 的 UI 状态=EventReducer 归约） |
| 7 | 持久化恢复 | JSONL rollout（权威）+SQLite 索引（辅助）；重放重建 | SQLite 事件溯源；execution claim 崩溃恢复≤10 次 | JSONL+原子写+256KB 旋转；重放重建 | SQLite message+part；hydrate 重建 | **线性 append 日志/事件表+按序重放**；SQLite 只做索引或投影 |
| 8 | steering/中断 | input_queue 下轮注入；Interrupt=取消，部分产出保留 | inbox steer/queue 双模式；fiber 中断+不可中断掩码保证工具终态化 | 控制信号队列；abort 给未执行工具**合成 tool_result 保证配对** | guide/queue 双模式+FIFO barrier；TurnCancelled 算正常结束 | **排队、边界注入、配对完整、中断非错误** |
| 9 | 并行工具 | RwLock：parallel-safe 共享读锁并行，否则写锁独占 | 每 tool-call 一个 fiber 并行 | 顺序执行（唯一不并行） | 依赖图拓扑+parallelGroups+并发 10+concurrentSafe 元数据 | 默认并行+per-tool 顺序性声明；claw 反着来但那是刻意极简 |

---

## 三、逐项判定 Lyra

### ✅ 没有问题的（做法在共识带内）

| 项 | Lyra 的做法 | 判定依据 |
|---|---|---|
| UI/Provider 双模型+投影 | context_builder 纯投影（provider_messages.rs:15） | 与 codex/opencode/ZCode 同构 |
| 工具输出上限（LLM 侧） | 24K chars 头尾裁剪+marker（tool_protocol.rs:12） | 在 10K tokens~100KB 共识带内 |
| 工具输出上限（UI 侧） | 200 窗/16KiB/8KiB/2KiB+6MB 预算+7MB 写线护栏（2026-10-16/17 修复后） | 正是共识的"两级各自上限" |
| Compaction | 三层：micro（保留 10 工具结果）+ContextLimit 应急+turn 后后台异步；阈值=usable-13K | 每层都有先例：micro≈ZCode microcompact、异步≈codex async_compaction、阈值≈ZCode 公式 |
| 权限策略引擎 | permission-policy.json 四维规则+Allow/Ask/Deny | 结构就是共识的 ruleset |
| 并行工具 | JoinSet 并行+浏览器工具 ticket 串行链（browser_order.rs） | 浏览器串行=ZCode 依赖图声明的特例，合理 |
| 存储 | 每会话 SQLite(WAL)+stream_deltas 崩溃重放+ledger 审计 | stream_deltas≈WAL 先例，ledger 是正当审计；SQLite 做存储 opencode/ZCode 同款 |
| 崩溃恢复 | stream_deltas 重放未快照后缀（persist.rs:692 有测试） | ≈opencode execution claim 同级保障 |
| 分页读 | readWindow 尾窗+元数据 | codex/opencode/ZCode 都是这个形状（2026-10-16 修复后才达标） |
| 中断配对 | cancelled 工具有状态标记、协作取消 | 共识语义在 |
| Rollback | 文件操作回滚检查点 | opencode Snapshot+revert 有先例 |

### ❌ 有问题的

**红——我们做了别人几乎都不做的：**

无。2026-10-17 复核清零：原红项"software capabilities 第二套工具来源"经四路独立核查+对抗验证后证伪——它承载的是 Lyra 自身 UI 的操控（24 个内置动作全部指向 Lyra 组件），不是外部能力；"codex/opencode/claw 的外部能力全部统一走 MCP"的前提也不成立（三家均有大量原生工具，MCP 只是补充；六家参考项目没有任何一家把宿主自控走 MCP）。改述后的条目见黄-5。

**黄——别人做我们没有做的：**

1. **OS 级沙箱**：codex（bwrap+seccomp+no_new_privs）、claw（unshare 命名空间）都有；我们完全没有，shell 直接跑宿主。桌面产品代用户执行命令，这是最大的安全缺口。

**黄——我们独有但有需求支撑的（保留，但要清楚在付什么代价）：**

2. **sudo 密码提权注入**（elevation.rs）——四家都没做，是桌面产品的真实需求；代价是明文密码驻留进程内存+注入链复杂度（`sudo -n` 假失败事件就是代价的实例）。
3. **goal continuation 自动续跑**（turns.rs:447）——ZCode 的 target-continuation-loop 有先例，但我们没有它的心跳/抢占结构。
4. **visual evidence / 多层 loop guard / cut_store / prompt cache contract**——各自有部分先例或产品理由，按 AGENTS.md"选项即成本"原则逐个再评估，不算红。
5. **software capabilities 的实现形状**（tools/tool_fs/software_catalog.rs、software_adapter.rs；renderer 侧在 apps/desktop/src/modules/workbench/software-capabilities/）——2026-10-17 四路核查后由红项改述。核查事实：24 个内置动作全部操控 Lyra 自身（browser-search/file-manager/settings/login-manager/software-store/terminal/image-viewer/office），默认 0 个外部包（外部仅限受信任 UIUX pack 注册）；工具发现与权限和 MCP/skills 共用同一 Tool-FS registry 与同一权限引擎，**不构成第二套**。站得住的批评有三：体量——约 2.6K 行生产代码+1.6K 行测试服务 24 个固定动作，按通用扩展系统建造却只装第一方内容（选项即成本）；接缝——software 动作走宿主 dispatcher 回环执行且双重闸（invoke 固定 dangerous+强制记录），MCP/skills 目标绕行宿主且单闸，同一概念两种待遇；重复——terminal.sendControlledInput vs write_stdin、readVisibleBuffer vs read_tab 局部重叠。收敛方向（下次动这条路径时执行，非当前行动项）：纯 Lyra 自控动作逐步并入 workbench 同款"原生清单+宿主适配器"形状，UIUX pack 通道统一权限/执行接缝。另记录三个真实的自控缺口（独立于本项）：无读写 Lyra 设置值的工具、无 turn 内创建/切换/关闭会话的工具、无通用"打开应用标签页"工具——补齐方向同样是原生工具，不是 MCP。

---

## 四、一句话总结

循环、投影、上限、压缩、权限、并行、存储、中断——八个必备项我们如今都在共识带内（多数是 2026-10-16/17 两轮修复到位的）；红项清零（原红项 software capabilities 经四路核查证伪后降级改述，见黄-5）。剩余待收敛项按优先级：**沙箱缺口**（最大的安全缺口）＞ software capabilities 的体量与接缝（维护成本问题，非正确性问题）。

## 附：调查方法与证据可靠性说明

- pi 核心（packages/agent 2519 行）：人工精读 types.ts + agent-loop.ts。
- codex / opencode / claw-code / ZCode / Lyra：五路独立审计代理，各自回答同一份 10 问清单（主循环 / 消息模型 / 输出上限 / compaction / 权限 / 事件 / 持久化 / steering / 并行 / 独有设计），要求读实现文件而非仅 grep，全部结论带 file:line。
- 本报告是**审计结论**，不是改动清单；所有修复项的当前状态以代码为准（git 工作树含 2026-10-16/17 的未提交修复）。
- 2026-10-17 补充复核：software capabilities 原红项经第二轮四路独立核查（Lyra 能力面 / 宿主自控面 / 六参考项目对比 / 业界产品对比；38 条断言对抗验证，36 条确认、2 条修正）后由红降黄改述，证据要点见黄-5。
- 2026-10-17 收敛：黄-2"steer 的连续性"已按参考语义实现（运行中插话在当前 turn 内排队、模型边界注入、turn 不死，soft interrupt 移除；协议状态与缓存前缀保持连续），条目删除。
