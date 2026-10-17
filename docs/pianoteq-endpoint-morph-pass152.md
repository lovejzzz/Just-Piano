# 独立与联合端点的混合算术（pass152）

2026-10-17。恢复配对后的频率/衰减和幅度运算，补上独立端点向最终源表推进的一段计算。**尚未完成频率排序、相位、源表组装或原生端点音轨验证；未接入网页发声。**

## REA 与原指令

本轮使用本机 REA 6.5.0 MCP、Ghidra 12.1.4，只读打开既有 ARM64 文件。一个会话批量反编译 `62d20c`、`2a05c4`、`271fe0`、`85d044`，四项全部成功；会话正常 exit0，无目标执行或调试注入。证据 `ev_d69071f1ac48ed9ee403850047cf597fdda28e49c7337dbe835cba63f82cbd7f`。私有 `batch_decompile.json` SHA256 `3b21db791682facda6edecd66e7be75856c3ccf28e78035ba7160909dbbb00fd`。

结合 pass151 调用点和既有完整 ARM listing：

- `1026dc` 中间混合分支调用 `62d20c` 时 option=1。`62d388..398` 因此进入 `63ae9c`，不是一般匹配 helper `514f8c`。
- `63ae9c..63b010` 要求两端列长相同，将两侧未配对向量清空、两个配对向量设为相同行号 iota。不能把一般频率匹配算法套进本调用。
- `62d2fc..338` 先把 float32 blend 转 double，顺序计算 `(blend * π) * 0.5`、系统 double sin、double 平方，再舍入 float32。另一权重为 float32 的 `1-weight`。
- `62d6c0..6d0` 及 SIMD 主循环：频率使用 `FMA32(coupled, weight, f(separate * complement))`。`2a0830..09a8` 对衰减执行同式，没有用原始 blend 代替 weight。
- `62d778..8d0` 生成混合频率排序索引；`048848` 将同一索引应用到输出列。此次没有将它简化为 JS stable sort，原生相等键顺序尚未验证。
- `271fe0` 为幅度组装两侧配对向量，调用 `304b48`，传原始 blend 和 −40 dB。该函数不是频率/衰减的正弦平方混合。

## 新实现

`dsp/endpoint-morph.mjs` 提供独立配对值算术与幅度向量算术，复用已恢复的 double sin/pow、float logf/expf 和 FMA。输入必须显式提供，模块没有捕获快照或商业模型。

对非零幅度 a、b：

```
t = f(blend); u = f(1-t)
out = native_expf(FMA32(u, native_logf(b), f(t * native_logf(a))))
```

`304bd8..304d08` 的零端点另行处理：

- floor=`native_expf(f(floorDb * floatword(0x3debc8e3)))`；floorDb=0 时选择1。
- a=0、b≠0：以 `f(b*floor)` 作为 a 的对数输入，混合后再乘 `f(native_double_pow(u,0.25))`。
- b=0、a≠0：对称替代并乘 `f(native_double_pow(t,0.25))`。
- 上述零端点结果绝对值小于 floatword `0x1e3ce508` 时使用该 tiny 常量；端点 blend 恰为0或1也保留这个规则。
- a=b=0 则直接返回0，不执行对数。负幅度不属于有效输入。

## 验证及边界

独立 C oracle 正常链接系统 sin/logf/expf/pow/fmaf，以 `-O2 -ffp-contract=off` 编译，明确保留原本独立的乘法和 FMA。无需 Pianoteq 进程。100768组输入（包含零、subnormal、极值、blend边界、−40/0dB和随机float32）比较四结果共 **403072项，无差异**；其中4项NaN只检查语义，不声称NaN payload逐位相同。报告存于本机 `pass152-endpoint-interpolation/math-audit.json`，明确 `wholeAudioVerified=false`。

新增测试固定独立 oracle 位模式，检查正弦平方与原始blend差别、零端点四次根、tiny规则、非法输入拒绝；禁用 JS Math.sin/pow/log/exp 仍通过。纳入 npm test。

四函数反编译还显示相位有分段 wrap 和记录类型修正；ARM 的 SIMD lane 与标量尾部含不同精度的 π 减法，不能用一个通用 wrap 或最短弧插值替代。这部分、原生排序和最终源表组装保留为后续必须完成的工作。

本轮没有新的 Pianoteq 内部动态端点捕获，没有将独立 C 数值对照当作真实音频验收。既有分轨消费缓存表，未调用新模块，因此不重复导出旧音轨来声称新端点声音通过。调试目标39079仍启动挂起，本轮仅确认其进程状态，未重启。没有使用 Pedalboard；全部商业输入和反编译正文仍留本机。
