# 无外部数学的 stretch 表构造与调律连接（pass133）

2026-10-17。没有新原生捕获、完整 WAV 或网页声音等价结果。

## 构造模块

新增 `native-stretch-math.mjs`，使用已恢复的 double exp2/log2/pow/sincos；sin 取恢复 sincos 的正弦结果。本次全部 106 个实际 sin 参数经独立普通 C 系统 sin 再核对，逐位同；不据此宣称新完成了整个 sin 符号的独立指令恢复或全 IEEE 穷举。

新增浏览器兼容 `constructStretchTable`：输入显式控制、128 项刚度和两个注册权重，自行构造音程比、谐波编号、原始约束、平滑与 RHS、差分矩阵、LU 解及频率表。默认使用恢复的数学模块，不读取原生 RHS、矩阵、解或频率表作为种子。

`pianoteq_replay_stretch_rhs.mjs --native-math` 接入构造器，消费 pass132 的自算刚度表和存档调律控制。报告保存上游源控制文件 SHA，并保留其外部数学依赖状态；自身调用与外部调用分开记录。

## 真实历史记录验证

正式 `pass133-native-stretch-final-guard/baseline/report.json`，一个 interval12 配置：

| 对象 | 比较数 | 差异 |
| --- | ---: | ---: |
| 完整 RHS | 203 double | 0 |
| 矩阵 | 41209 double | 0 |
| 完整解 | 203 double | 0 |
| 频率表 | 128 float | 0 |

其余存档控制/曲线、三处刚度表、115 个谐波编号、190 个缩放刚度、原始/平滑数组、滤波器系数及 delay、107 个 sine 也保持原比较通过。

332 个唯一数学调用（exp2 108、sin 106、log2 96、pow 21、sincos 1）的参数及返回字与原 pass19 系统数学报告全部相同。计算中外部数学调用 **0**，上游刚度计算也无外部数学依赖。106 个 sin 的再次系统比较是验证用途，不给预测反馈。

同一测试器直接调用构造器默认接口，临时禁止全局 Math.sin/cos/pow/log2，仍对上述原生 RHS、矩阵、解、表全部通过。`default-builder-audit.json` 保存该检查。原生注册权重与曲线模式仍为明确输入，没有隐藏默认值。

## 十一项反向检查

公开测试器 `pianoteq_test_native_stretch.mjs` 保存每例过程与输入摘要：

- RHS、矩阵、解、表、刚度比较值、滤波输出目标各改单个末位：各恰好一项失败，所有自身 RHS/频率表/数学预测不变。
- 省略原生数学模式：外部拒绝器阻止回退，无完整报告。
- 改预设平滑量、自算刚度来源、仍观察的注册权重：分别 527、424、639 项差异，预测表均改变。
- 缺少一个计算刚度行：明确拒绝，无完整报告。

所有原始输入摘要保持一致。初始 guard、抽取构造器后的 builder guard，以及加入默认接口检查的 final guard 都保留；新增检查没有冒记在早期结果中。

## 下游连接与限制

`pass133-computed-stretch-tuning-report.json` 使用自算 RHS/表，105 个不同键、315 条重复遍历、2520 项调律比较全同；`stretchTableComputedFromSystem=true`、`stretchRhsStillCaptured=false`、`nativeMathOracleRequired=false`。`stretchTableProducerReconstructed=false` 保留，因为两个注册权重、运行时曲线属性及未覆盖配置仍在。

`pass133-stretch-tuned-source-report.json` 再消费该调律输出，所有声源预测数组与 pass132 完全一致。新调律及声源报告传递完整 stretch 来源 SHA 和观察依赖，避免把已计算的表误当成整条来源已闭合。

两个注册权重当前观察值为 middleWeight=2、gramScale=1，**尚未恢复其生产来源**。运行曲线模式、注册参数、其他模型/音程/平滑配置和音频观察依赖继续保留。没有新增同次完整声部证据；不同历史捕获未伪装成新全链。完整琴槌接触力/弦反馈/制音毡及全预设网页音频仍未完成。

`npm test` 通过。原 pass121 E 三个进程本轮确认仍存活，目标启动挂起；未重复启动、修改冻结 Python 依赖或使用 Pedalboard。完整目标未达成，不合并、不发布。
