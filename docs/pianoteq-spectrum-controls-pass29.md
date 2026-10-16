# 硬度到谱加权及弦间混合：pass29

本轮把 pass28 自己计算的两个硬度值接到完整对数激励谱、原生向量指数以及源表逐行加权；同时补上加权前第三弦振幅、相位混合和全部模态衰减缩放。不是仅建立函数关联，实际生成的中间表逐个与原程序比较。

## 从硬度生成谱控制

`dsp/excitation-spectrum-controls.mjs` 保留以下 float32 次序，`f` 为单精度舍入：

```
T(h) = f(f(1 - f(float32(1.01) / f(h + epsilon))) * scale)
epsilon = float32 bits 0x3c23d700
slope = T(primary)
secondarySlope = T(secondary)
baseScale = slope <= 0 ? f(1-primary) : f(slope/scale)
referenceNumerator = slope > 0 ? referenceTable[2]
  : repeatFlag ? referenceTable[1]
  : FMA(referenceBlend, referenceTable[1], f((1-referenceBlend)*referenceTable[0]))
reference = f(referenceNumerator/referenceFrequency)
```

这里 epsilon 的位模式与通常写成 `float32(.01)` 不同，不能省略或替换；参考频率来自上一轮对应源表的指定行第一列。负斜率下限依次将 lowerControl、u 的共享系数合入；正斜率下限为0、上限为20。

共享 slopeBlend 非零时另有带符号立方根、混合、再立方路径。本批为0，该路径要求显式提供平台 powf/pow，不能暗中把 Math.pow 当成通用原生等价实现。

附加谱按 floor、blend、2*u、历史项、control30 和方向项的原生次序累积。随后使用已有 `buildLogSpectrum` 以实际模态坐标插值、合入双精度 dB 幅度转换；`nativeExpWeights` 复现向量指数；每一行的指数权重应用到该行全部弦振幅，小于 `1e-9` 的权重归零。

## 补齐加权前源表

输入为位置修正后的四张源表。三弦时，仅每行第三列从第二列混入：

```
amplitudeGain = nativeScalarExp(FMA(blend, amplitudeBlend, f(amplitudeFloor*floor)))
phase = FMA(blend, phaseBlend, f(phaseFloor*floor))
angle = f(phase + float32(pi))
turns = floor(f(angle/float32(2*pi)))
phaseDelta = f(FMA(-turns, float32(2*pi), angle) - double(pi))
A[row,2] = FMA(mix, f(amplitudeGain*A[row,1]), f((1-mix)*A[row,2]))
P[row,2] = FMA(mix, f(P[row,1]+phaseDelta), f((1-mix)*P[row,2]))
decayGain = f(decayInput*decayScale)
D[i] = f(D[i]*decayGain)
```

原生先用单精度 pi、2*pi 包裹，再减双精度 pi；不能直接按实数化简。单弦跳过弦间混合，仍执行衰减缩放。频率在本段保持不变。真实样本验证了一列和三列；两列只有静态路径，未实测。

REA/Ghidra 精确指令：`ev_879bf880a4a955b773e420afa48f2c59dfe2e2eade623a37f4bc98b4d228e98b` 确认 `694d90` 的谱 FMA；`ev_2c94c1a246291f44b55f28fa1115bccda3fac40ee86daf25f9a47c6a7112c1e2` 确认 `6941b0` 的相位 FMSUB。公式还依据保留的完整 ARM64 指令及反编译，并以运行输出验证运算方向。

## 实际中间量验证

只读硬件观察点：`694148`（硬度转换后）、`6950c8`（完整对数谱）、`695108`（指数后、加权前）、`695248`（源表加权后）。每个点独立进程运行，全部 exit0、无采集错误。

沿用默认 A4、四音域21/60/72/108、A4两个弱音控制案例及 velocity=1，共8次击弦16组主次路径：

| 内容 | 验证规模 |
|---|---:|
| 对数激励谱 | 556 个输出，全部逐位同 |
| 指数权重 | 556 个输出，全部逐位同；加权后还核对其未改变 |
| 加权前准备及加权后振幅 | 各1034个输出，全部逐位同 |
| 完整报告比较次数 | 10624，0差异 |

总数包含未改变的频率/相位、输入桥接和权重重复读取，不等于10624个独立物理状态。报告分别1024、6528、2048、1024项。音域样本含正斜率（note108=.2591383159160614）和负斜率；A4默认为 -.03701772540807724、baseScale=.12096518278121948。两路源表参考不同，所以实际 reference 也不同。

上述广域报告的加权前输入来自真实 post-position 源表捕获，明确标记仍有原生依赖。另一个默认 A4 桥接报告改用 pass27 自己算出的位置修正表，并用 pass28 计算的硬度报告，**1024项也全部逐位同**。这样该案例的准备、谱构建、指数和加权整段不再以原生加权前表作为计算输入。它与广域默认结果重复，不另加到样本数。

人为将首个最终振幅增加一单位 float32，报告准确给出一处 weighted-amplitude 差异、退出码1。默认首振幅计算结果为1.0045205354690552，和后续激励链已记录的值一致。

## 音频与剩余缺口

本轮20次采集（四观察点、控制点补充字段 v2）均保留真实48kHz/24-bit双声道 WAV。17次与对应原版 PCM 逐字节一致。四音域最初 controls、weights 两次各有18443个交错采样不同，weighted 有7303个，**最大差异均为1个24-bit整数单位**；spectrum 和 controls-v2 与原版一致。差异文件全部保留，没有筛掉失败后宣称所有音频一致。内部被比较的源表和谱值全部一致，尚不足以解释最终多音差异。

实际调用的是独立签名调试副本，原版通用二进制哈希未变，无 Pedalboard。`npm test` 及新脚本语法检查通过；已有浏览器引擎测试只证明当前独立引擎可发声，不证明本研究链或 Pianoteq 声音等价。

仍未恢复这一步各运行时模型表、全部控制的通用存档生成；u、历史、方向、control30、非零 slopeBlend 等未覆盖分支不能声称验证。接下来需把加权后的源表继续接到额外五个模态、历史状态和函数最终输出，再闭合整个原始激励流程。网页音源接入、全部预设、完整琴槌—弦—制音毡耦合及最终立体声音频等价仍未完成。

复验入口：`scripts/pianoteq_replay_spectrum_controls.mjs`。支持 `--weight-captures before after`、`--position-report`（计算输入）或 `--position-capture`（实际捕获输入），报告会区分来源。商业模型及运行表保留在私有分析目录，不随代码发布。
