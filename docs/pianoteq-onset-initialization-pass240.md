# 起音包络初始化独立计算（pass240）

本轮关闭连续声部回放中原来直接读取的双精度旋转步长和一阶滤波器系数。新增 `dsp/modal-onset-initialization.mjs`，从自身已经算出的起音时长、显式采样率和 square 分支计算初始化；不读取原生状态快照。尚未完成琴槌接触力、弦反馈和制音毡的完整物理闭环，也未接入网页 AudioWorklet。

## 原生依据与计算

REA/Ghidra 重新分析 `951c80` 所属生产函数、`09a3f0` 滤波初始化及 `29d444` 逐样本包络，三项均 ok。私有响应 `onset-initialization-response.json` SHA-256 为 `5745b47a57398d3d909eaf5c1c15313136b75c0591e97cc488ab17603cb705f7`。另分析普通声部渲染与 bounce 调度；未将 bounce 事件或 bzz 分支当作普通琴槌接触力已经恢复的证据。

按 ARM `951cb8..951d50` 的计算顺序：

- 时长 N 的双精度角度为 `(π/2)/N`；旋转步长使用已有独立 `nativeDoubleSinCos`。
- 普通平滑分支的归一化截止为 `min(f32(4000/f32(sampleRate*0.5)),f32(2/3))`。
- `t = nativeDoubleTan(min(cutoff,0.95)*π/2)`；反馈系数为 `(t−1)/(t+1)`，两个前馈系数均为 `(feedback+1)/2`，三项分别转 float32。
- 普通分支 settle=6，初始剩余时长=N+6，振荡器 sine=0、cosine=1，滤波历史清零。
- square 分支跳过滤波器，settle=0。模块提供该分支及分块一致性测试，但本轮没有该分支的新原生音频覆盖；其未使用的滤波存储不作相等声明。非零起音延迟仍未覆盖。

## 新原生采集

`scripts/pianoteq_capture_modal_onset_initialization.py` 只设两个只读硬件断点，分别在计算前记录 N/采样率/square，计算完成后读取 72 字节状态。采集器校验调试副本 __text；不写目标数据、寄存器或指令。不使用 Pedalboard。

三次独立进程均确认实际目标 terminal=true、exitStatus=0，无采集错误或未完成配对：

| 采样率 | 原生时长 N | 初始化审计 |
| --- | ---: | --- |
| 48000 | 81 | 4 double、5 float、4 状态值零差异 |
| 44100 | 74 | 4 double、5 float、4 状态值零差异 |
| 32000 | 54 | 4 double、5 float、4 状态值零差异 |

其中 double 包含旋转两项及初始 sine/cosine，float 包含三个滤波系数和两项历史，状态包含两个计数及两个分支标志。快照仅供独立验证器比较。原始状态、商业预设、原生 WAV 和报告留在本机私有分析目录。

负对照保留有效文件哈希：只改目标的一个步长和一个滤波系数，验证器恰报两项差异并退出1；只改输入 N+1，则两项旋转步长及剩余计数共三项失败。截止限幅、时长/采样率独立作用、无效输入和跨块历史一致性另有测试。

## 连续音频回归

连续回放新增显式 `--computed-onset-initialization`。启用时，时长仍来自独立源表计算，步长和滤波系数全部来自新模块；原生两类数值只作审计。报告写明 `onsetInitializationComputed=true`、`onsetDoubleStepAndFilterCoefficientsObserved=false`。旧诊断入口保留。

复用 pass110 五击 A4 的完整历史捕获及 pass169 经过绑定校验的源表，不缩减原先检查：14,214,486 项检查，零差异。实际写出30条内部 float32 WAV；另用 Python 解析 RIFF 数据并直接与原生 audioTail 记录比较，1,272,576个采样逐字节一致，全部从 counter0 开始、无归一化。该回归是历史内部声部输出范围；三次新采集验证初始化，并未声称三种采样率的完整独立音频都已闭合。

本机结果为 `pass240-continuous-report.json`、`pass240-continuous-stems/`、`pass240-stems-audit.json`，三个新采集位于 `pass240-onset-*-v1/`。此回放仍有明确的模型/控制观察输入、调度与终端辅助入口边界；`finalStereoAudioVerified=false`。完整预设、全音区/力度/踏板、最终立体声和浏览器实际声音验收继续保留为未完成。

## 检查

`node tests/modal-onset-initialization.mjs`、已有 `native-double-sincos` / `native-double-tan` 测试、Python语法检查、连续回放及上述独立原生/音频/负对照通过。未运行会触碰无关 iCloud 占位文件的全仓库检查；未合并或部署。
