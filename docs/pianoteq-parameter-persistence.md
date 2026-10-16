# Pianoteq 参数持久化与真实音频验证

日期：2026-10-15。官方 standalone 9.2.5/20260909，原应用不修改。本轮没有使用 Pedalboard、AU/VST 宿主或插件状态转换。

## 已解决的实验问题

先前 `--headless --no-prefs --serve ...` 实例没有选定音频输出，设备 `stopped`，音频回调计数为零。API 能读回修改，但 `getInfo.modified=false`，保存后新进程恢复旧值。仅启动 GUI 也仍处于相同 stopped 状态。

本轮启动自己拥有的独立 GUI：

```sh
'/Applications/Pianoteq 9/Pianoteq 9.app/Contents/MacOS/Pianoteq 9' --no-prefs --preset 'NY Steinway D Mix' --serve 127.0.0.1:8141
```

通过正常 Devices 界面勾选 `Use system default output device`，选中本机 MacBook Pro Speakers，48 kHz、512 samples；未弹奏或播放扬声器。随后 API 返回 `status=running`。重新调用 `setParameters` 修改 impedance 到 normalized 0.25 后，`modified=true`，显示值 0.60。保存 full FXP 后在全新、无音频输出的 headless 实例中读回正确，随后官方 CLI 能导出不同音频。

这是设备启动、参数提交、序列化和真实音频之间的运行时证据。该对照不能单凭自身证明内部排队函数名；静态路由需结合 REA 单独确认。也不推断其它版本或授权状态。

**不能以 API 读回或一次 `computing_parameter_update=false` 作为完成条件。** 第一批等待约 0.5 秒时，弦长 0.75 的新进程读回检查失败，脚本在音频渲染前中止。更长等待 3 秒后的独立批次通过。3 秒是本机实验等待时间，不是一般性完成保证；每次都必须执行新进程读回断言。全部 215 项参数对照确认：每个成功单变量案例只有目标项变化（容差 1e-6）。

新脚本 `scripts/pianoteq-live-parameter-experiment.py` 要求已启动且设备 running 的自有 GUI 实例，等待提交、保存、新进程读回、再官方 CLI 导出。脚本不替用户选择设备、不启动/退出 GUI，也不修改普通用户偏好；新生成的唯一命名测试 bank 文件复制到证据目录后删除。实际执行的原始脚本保存在证据目录，避免把后续整理脚本冒充已原样运行。

## 18 个物理参数干预均通过

本机证据根目录：`~/.local/share/just-piano-analysis/audio-pass3/`。

- `verified/results.json`：三档硬度的六端点，以及首个弦长低值。另保留弦长高值首次失败的 FXP/验证日志。
- `verified-rest/results.json`：弦长、阻抗、阻抗截止、阻抗斜率、制音器位置、制音时长各两端点。
- `combined.json`：合并后的 18 个成功端点，包含新进程完整读回、唯一参数差异审计、CLI 参数、音频哈希与差分。
- `damper-audio/results.json`：另外 10 组松键/CC64 音频对照。
- `getAudioDeviceInfo.json` / `audio-started-set.json`：stopped→running 与修改状态对照。

参数输入均为归一化 0.25 与 0.75。A4/MIDI 69 起音 0.5 秒，持键至 5.5 秒；固定 MIDI、预设、采样率 48 kHz、24-bit PCM、dither OFF、不归一化。每个 FXP 都在新进程读回正确后才渲染。谱重心为 0.55–0.95 秒、100–12000 Hz 的功率加权量，不是完整音色评分。

| 目标参数 | 力度 | 基线重心 Hz | 低值重心 Hz | 高值重心 Hz |
|---|---:|---:|---:|---:|
| hammer_hardness_piano | 32 | 498.93 | 442.80 | 694.15 |
| hammer_hardness_mezzo | 96 | 662.07 | 652.84 | 665.19 |
| hammer_hardness_forte | 127 | 715.31 | 600.95 | 728.56 |
| string_length | 96 | 662.07 | 722.87 | 662.86 |
| impedance | 96 | 662.07 | 690.01 | 603.74 |
| impedance_cutoff | 96 | 662.07 | 623.35 | 636.42 |
| q_factor | 96 | 662.07 | 630.47 | 600.46 |

所有案例 WAV 均非零，且与对应力度基线存在实际 PCM 差异。不能由这些统计量反推出完整接触方程或认为参数变化具有线性声学作用。

## 制音器与踏板的额外验证

额外实验 1.5 秒松键；CC64 对照在 0.25 秒踩下、5.5 秒释放。使用上一步新进程验证的相同 FXP。

| 参数值 | 松键后 1.6–2 s RMS dBFS | CC64 保持时 1.6–2 s RMS dBFS | CC64 放开后 5.6–6 s RMS dBFS |
|---|---:|---:|---:|
| 基线 | -60.52 | -38.82 | -66.89 |
| damper_position 0.25 | -62.02 | -38.82 | -66.82 |
| damper_position 0.75 | -60.45 | -38.82 | -66.89 |
| damping_duration 0.25 | -66.56 | -38.82 | -69.19 |
| damping_duration 0.75 | -45.52 | -38.82 | -60.02 |

这说明制音时长在松键/踏板放开后有明显声学作用；踏板保持时同一窗口接近。制音位置差异较小，不应夸大。混音包含预设机械声、混响及拾音；表格不是孤立弦或制音力测量。

两个独立批次的力度 32、96 基线 WAV 逐样本一致；力度 127 从约 5.515 秒起存在尾音差异，全文件差分 RMS -120.82 dBFS，最大差异约 3.68e-5 FS。不能宣称渲染在所有条件完全确定。制音位置高值的持键实验全文件差分非常小，因此主要参考上述明确松键实验，而非把任意低幅差分都当成模型证据。

## 运行栈与诊断保留

`sample/`：122 秒密集 MIDI 官方 CLI 渲染，启动后立即采样 1 秒；主要覆盖初始化。`sample-render/`：602 秒密集 MIDI，进程启动后等待 3 秒，用系统 `/usr/bin/sample PID 3 1` 只读采样。两个目录均保存原始栈、运行命令、PID、渲染日志和退出码；均正常退出 0。它们可由 REA 对照 image-relative PC 绑定真实执行路径，采样本身不证明完整方程。

首轮 24-bit WAV 已正常导出，但旧测量器仅支持 16-bit，抛出 Python AssertionError；保留原件，新批次使用明确的 signed 24-bit 解码。这不是原生进程崩溃。没有重试此前崩溃的插件路径。

自有 GUI 经自身端口 `quit`，exec session 6030 已确认 exit 0。所有验证器和 CLI 进程均等待结束；未接触用户其它实例。当前结论解决了本轮参数保存与音频干预路径，**不等同于琴槌—琴弦—制音器完整耦合公式已恢复**。
