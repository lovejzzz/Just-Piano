# 激励表到声部初始分量：pass22

REA/Ghidra 证据 `ev_8c2f7ca6a780a8b3a95b6be3e17f50e221b83650d4859fe9c17324e12d80c7a3`，目标 ARM64 SHA-256 `8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`。分析 `839c04` 的索引筛选及 `9511bc` 的分量收集；静态分析没有被当成运行验证。

## 已运行验证的计算

`dsp/voice-source-mapping.mjs` 接受激励后的四张表、列数、行边界及分组索引。源表按行排列，每行含多条耦合分量；声部按渲染组排列。有效 lane 的索引为 `i`，列数为 `C`：

```
F[lane] = sourceFrequency[i]
D[lane] = sourceDecay[i]
A[lane] = sourceAmplitude[i]
phase[lane] = sourcePhase[i]
row = floor(i / C)
J[lane] = 0                                  if lower <= row < upper
J[lane] = float32(F[lane] - Fsource[row*C])     otherwise
referenceDecay = sourceDecay[referenceRow*C]
```

原函数按实际分组清零填充 lane。模块提供零初始化输出，但不把组间空隙当作本次收集函数写入并验证过的数据。

独立调试副本仅在 `9517d8` 放置一个硬件断点，读取收集后的源表和声部值。此次 NY Steinway、A4、干声短音：源表为 61×3；实际有效分量 181 个，另有 3 个四 lane 填充值参与初始化。三个分组的 `{start,padded,capacity,count}` 为 `{0,152,148,148}`、`{152,176,17,17}`、`{176,192,16,16}`。源索引 94、95 未进入声部；它们的幅度分别约为 `9.95e-7`、`4.62e-7`。这不是全部预设或音高的统计。

`scripts/pianoteq_replay_voice_mapping.mjs` 逐项对照真实数据：五张声部数组各 184 个值，加参考衰减 1 个值，共 **921 个 float32 全部逐位一致**。将实际对照中的首幅度人为改为相邻 float32 后，验证器 exit 1，恰好报告该处不一致；负例保留。

## 接到连续渲染

`scripts/pianoteq_replay_modal_initial.mjs` 新增 `--source-mapping-report`。它验证报告、布局及完整 lane，先将映射预测与原初始化捕获对照，然后使用预测频率、幅度、相位、J 和衰减作为计算输入。结合 pass21 计算出的动态 pitch，继续经过三角近似、P/Q 初始化、R/A/B、7 次状态投影及 8 块连续分组输出：**35,907 个 float32 比较全部逐位一致**，包含 1,536 个完整分组输出样本，没有按块用捕获状态重置。

真实采集程序正常 exit 0，捕获错误为空。输出为 48kHz、24-bit、双声道、113152 帧，PCM SHA-256 为 `1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`，与此前原版基准相同。这个结果证明本次观察未改变该段输出；它不证明 JS 已生成相同的最终双声道 WAV。

## 仍未完成

激励后的四张源表仍来自捕获。分组筛选和索引构造已获得静态分支，但尚未成为运行验证过的独立计算；当前映射模块仍接收真实索引。特殊 bzz/多平面分支不在本次范围，验证器拒绝对应模式。其他音高、力度、预设、完整接触力/反馈/制音耦合及最终音板、效果与立体声输出仍未完成验证。网页目前仍使用原有独立音源；本次没有宣称网页声音完全复刻。

本地原始证据位于 `~/.local/share/just-piano-analysis/debug-pass22-voice-mapping/`：`runtime.json`、`replay.json`、`continuous-replay.json`、负例、LLDB 日志和实际 WAV。商业模型表及反编译全文仅留在私有分析目录。
