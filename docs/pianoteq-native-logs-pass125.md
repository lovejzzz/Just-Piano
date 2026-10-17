# 耦合与谱权重的原生对数计算（pass125）

2026-10-17。本轮没有新的 Pianoteq 动态采集或完整音频等价结果。

## 数学实现与来源

新增 `dsp/native-double-log.mjs`，按本机 ARM64 libsystem_m 的指令顺序实现 double log：范围缩减、129 条数学表记录、FMA 多项式、补偿求和及次正规数路径。复用已有 `nativeScalarLog2f`。普通独立进程读取该进程自己加载的系统库，未附加 Pianoteq 或修改其代码/寄存器。原始系统代码留在私有分析目录，不提交。

独立 C 对照使用 seed 125 合成输入，保留原始 IEEE 字，并加入既有耦合回放生成的 26 个 log、36 个 log2f 参数。非 NaN 比较返回值位模式；NaN 仅比较语义，不主张 payload 或异常标志一致。

| 运算 | 检查数 | 差异 | NaN 语义检查 | JS Math 候选差异 |
| --- | ---: | ---: | ---: | ---: |
| double log | 82716 | 0 | 9993 | 1600 |
| log2f | 79782 | 0 | 5683 | 7 |

私有证据：`pass125-double-log/log-validation/report.json`、`log2f-validation/report.json`，各自保存完整输入与系统输出。覆盖随机 IEEE、音频范围、次正规数、1 附近、表边界及特殊值；不是全 IEEE 穷举或新增钢琴覆盖。公开单测使用独立系统输出的合成 fixture。

## 耦合与极点回放

`pianoteq_replay_impedance.mjs` 新增显式 `--native-double-log`、`--native-log2f`，可与已有 `--native-double-exp` 组合。报告分别列出自身计算与外部 oracle 调用。

`pass125-native-logs-impedance-report.json`：36 行、72 个原始 p/q、72 个 jitter p/q 无差异。自算 61 个唯一 exp、26 个 log、36 个 log2f，外部调用从 pass124 的 115 降为 53，余下 sincos、tan、pow。`pass125-native-logs-poles-report.json`：108 个频率、108 个衰减、108 个 lambda、36 个中心全同。求根仍使用独立 Durand–Kerner，非原生 QR 移植。

`pass125-native-math-guard/results.json`：包装器禁止外部 exp/log/log2f 后完整新模式通过；分别省略三个选项确实失败。只扰动一项比较目标时恰好一项不匹配，自算数学及预测保持不变。四项反向检查通过，原始输入摘要未改变。

## 源谱权重回放

`pianoteq_replay_source_weights.mjs --native-log-exp` 自算 double log/exp，旧 Math 模式明确标记为候选。报告保存生成的数学调用与权重预测。

`pass125-native-source-weights-report.json`：一个 A4 输入生成 35 个独立谐波权重，由两个模式消费，共 70 项输出比较无差异。不能称为 70 个不同权重或全键盘覆盖。70 次 log、118 次 exp 共 188 次调用经独立 C 程序核对全同；Math 候选分别有 1、6 个末位差。校准报告为 `pass125-source-weight-math-calibration.json`。

`pass125-source-weight-math-guard/results.json`：禁止全局 Math.log/Math.exp 后新模式通过，旧模式失败；翻转一个输出目标的末位仅产生一项差异，预测不变；修改源控制 s1 后预测改变并产生 50 项差异。三项反向检查通过，原始输入摘要未改变。

## 限制与验证

`npm test` 通过。上述数学替换使用历史捕获；不同运行未伪装成新的同次全链证据。模型、部分控制、外部三角/幂运算及其他观察依赖保留。没有新的完整 WAV、网页声音等价或完整接触力/弦反馈/制音毡耦合结论。

同一 pass121 E 的 LLDB、Pianoteq、debugserver 进程仍存在，目标停在启动阶段，无新记录；未重复启动或修改冻结 Python 依赖。此前系统报告 Developer mode disabled，是否根因尚未证实。pass120 D 的捕获拒绝和正常参考音频失败保持原判。完整目标未达成，不合并或部署。
