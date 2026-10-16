# Pianoteq 9：实际音频与参数控制验证

> 后续进展：本报告保留 pass2 的失败记录。参数持久化现已在官方 standalone 路径修复，并通过 18 个物理参数端点的独立读回和实际音频验证，详见 [pass3 报告](pianoteq-parameter-persistence.md)。

日期：2026-10-15。目标：本机 Pianoteq 9.2.5/20260909。这里记录实际 PCM 和失败的控制实验，不把函数名、API 读回或静音输出当作声音算法已验证。

## 已通过：官方 CLI 离线音频

原创复现脚本：`scripts/pianoteq-audio-experiment.py`。有效证据目录：`~/.local/share/just-piano-analysis/audio-pass2/no-prefs/`，其中每个实验都有 MIDI、WAV、完整 CLI 参数和日志；汇总为 `measurements.json`。

运行方式（现有隔离环境）：

```sh
~/.local/share/just-piano-analysis/audio-venv/bin/python scripts/pianoteq-audio-experiment.py --out /absolute/new/output/directory
```

条件：`--headless --no-prefs --preset 'NY Steinway D Mix' --rate 48000 --bit-depth 16 --dither OFF`；不启用归一化。A4/MIDI 69 在 0.5 秒起音，默认 1.5 秒松键，测试长 10 秒，导出约 10.203 秒双声道 PCM。CC64 延音在 0.25 秒按下、5.5 秒松开。持续按键对照在 5.5 秒松键。CC67 软踏板在起音前设置。

所有下面的数值来自非零真实音频；没有通过播放扬声器作听感评分。

| MIDI 力度 | 峰值 dBFS | 起音 0.5–0.7 s RMS dBFS | 早期谱功率重心 Hz |
|---|---:|---:|---:|
| 32 | -20.63 | -29.51 | 498.93 |
| 64 | -14.25 | -23.60 | 572.36 |
| 96 | -8.67 | -18.76 | 662.07 |
| 127 | -4.43 | -14.51 | 715.31 |

谱重心使用双声道均值、0.55–0.95 秒 Hann 窗、FFT 功率权重，仅统计 100–12000 Hz。它是指定窗口的测量量，不等于完整音色评价。MIDI 力度同时影响响度与频谱，因此不能据这张表单独反推出琴槌接触力公式。

| 力度 96 对照 | 1.6–2 s RMS dBFS | 2–3 s RMS dBFS | 4–5 s RMS dBFS |
|---|---:|---:|---:|
| 1.5 s 松键 | -60.48 | -81.88 | -93.36 |
| 持续按键至 5.5 s | -40.71 | -41.86 | -52.28 |
| 1.5 s 松键，CC64 保持至 5.5 s | -38.82 | -40.68 | -49.20 |

这验证了松键与延音踏板对实际衰减的区别。全混音中仍包含预设的拾音、混响与机械噪声，不能把差值全归结为某一个制音器或共鸣系数。踏板实验起音前已出现约 -70 dBFS RMS 的声音，需保留机械/踏板噪声这一混杂因素。

CC67 软踏板使同力度起音谱重心从 662.07 Hz 降至 579.01 Hz，峰值由 -8.67 降至 -10.60 dBFS。重复击键与踩踏板重复击键也已渲染，尚未用其拟合耦合模型。

力度 96 的两次独立基线渲染逐样本完全一致；WAV SHA-256 均为 `beaeffe8b73cafad6355887fca879753b17e301e2ec159488d98e1c73f3b7a77`。这只证明当前条件下这两次渲染可重复，不证明所有状态/预设都无随机性。

脚本把完全零信号的对数下限表示为 -300 dBFS；这不是物理噪声底。16 位量化使约 -90 dBFS 附近的尾音统计不适合高精度衰减拟合。

## 已通过：归一化输入到界面显示值

官方 JSON-RPC `setParameters` + `getParameters`，独立 `--no-prefs` 实例。以下是实际 API 读回；每次先重新加载 NY Steinway D Mix。

| 参数 id | normalized=0.25 | normalized=0.50 | normalized=0.75 |
|---|---:|---:|---:|
| hammer_hardness_piano | 0.05 | 0.30 | 0.90 |
| hammer_hardness_mezzo | 0.32 | 0.80 | 1.37 |
| hammer_hardness_forte | 0.80 | 1.60 | 1.80 |
| string_length | 1.19 m | 2.70 m | 5.58 m |
| impedance | 0.60 | 1.00 | 3.00 |
| impedance_cutoff | 0.48 | 1.00 | 1.84 |
| q_factor（界面 Impedance Slope） | 0.27 | 1.00 | 3.66 |

证据：`audio-pass2/parameters/measurements.json` 的 `mappings` 与各案例 `.parameters.json`。显示值经过舍入，仅三点不能确立任意输入的完整函数，也不证明已经提交给 DSP。

## 未通过：物理参数变化到音频的因果验证

原创脚本 `scripts/pianoteq-parameter-experiment.py` 保存单变量实验 FXP，使用相同官方 CLI 离线渲染。第一轮所有修改案例的音频与同力度基线完全一致。进一步检查发现这是**无效的参数干预实验**：

- `setParameters` 读回改变，例如 impedance normalized=0.25、显示 0.60。
- `getInfo` 持续 `modified=false`、`computing_parameter_update=false`；等待约 2.5 秒未改变。
- 保存的 FXP 在全新进程中重新加载后，impedance 实际恢复为原值 normalized≈0.5125、显示 1.10。
- `getAudioDeviceInfo` 显示 `status=stopped`、设备为空；`getPerfInfo` 的回调计数为 0。

因此“界面/API 待处理值已改变，但模型状态尚未提交”是合理解释，尚未用代码证明。不能把这轮相同音频解释为物理参数不影响声音。脚本现已增加新进程读回检查，发现保存值不符时会跳过音频结论；尚未重跑该修订版。

独立新 `--prefs FILENAME` 路径最初还产生全零 WAV（48/60/62/64/67/69/72 多音高都如此）；默认 dither 对照只有最多 3/32768 的噪声。改用官方 `--no-prefs` 后相同 MIDI/预设可正常发声。原因未完全定位，不把它武断归因于授权状态。`--no-audio-prefs` 与离线导出组合也曾报无效选项并退出 1。

## 插件宿主尝试与停止

在独立 `~/.local/share/just-piano-analysis/audio-venv` 安装 PyPI `pedalboard 0.9.26`、`mido 1.3.3`、`numpy 2.5.4`，尝试使用已安装的官方插件离线处理以避免硬件设备依赖：

- VST3 加载返回总线配置错误：不支持 2-channel output，主总线同时报告 0 input / 2 output，进程退出 1。
- AU 插件能够正常加载，官方 CLI 导出的 `.aupreset` 能恢复 NY Steinway D Mix 的界面参数。
- AU setter 能读回 impedance 0.60；但真正调用 `process` 时原生进程 SIGBUS，退出 138；普通 MIDI 与 512 样本空 MIDI 处理均失败。没有有效 AU 渲染音频。
- 用户贴出崩溃报告后已停止该路线，不再重试宿主、二进制或状态转换。所有本次启动的 RPC/GUI 实例均已通过自己的端口 quit 并确认退出，崩溃子进程也已终止。

`audio-pass2/au-impedance-state.plist` 和 `au-impedance.fxp` 是最后一次崩溃前保存的**未验证中间产物**，不是可用模型或验证成果；未继续加载。导出的工厂 AU 预设仅位于分析目录，没有分发或导入网页应用。

## 当前证据边界

本次已验证力度、松键、CC64、CC67的真实波形/频谱变化，也取得七类参数的归一化显示映射。**完整琴槌—琴弦—制音器耦合方程，以及物理参数到 DSP 系数的单变量声学因果链仍未验证完成。** 下一步需要一个不崩溃且能够处理音频回调的官方宿主环境，并要求参数保存后在全新实例读回正确，再做音频差分。
