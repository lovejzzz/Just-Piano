# Pianoteq 9 运行时参数核对

> 后续核对：使用 `--no-prefs` 的独立实例显示这些物理参数可用；此前 `(locked)` 是当时独立偏好实例的观察，不代表所有实例或当前授权状态。见 [后续音频及参数实验](pianoteq-audio-validation.md)。

使用安装程序公开的 `--headless --serve` JSON-RPC 接口，在独立偏好文件和 `127.0.0.1:8129` 上启动分析实例。仅调用 `getInfo` / `getParameters` 读取信息，未播放音符或修改参数。

`getInfo` 确认版本 9.2.5、ARM64、当前预设 `NY Steinway D Mix`、`modified: false`。`getParameters` 返回 215 个条目。

| 参数 ID | 接口名称 | 显示值 | 单位 | 归一化值 |
|---|---|---:|---|---:|
| `hammer_hardness_piano` | (locked) Hammer Hardness Piano | 0.27 |  | 0.47941399 |
| `hammer_hardness_mezzo` | (locked) Hammer Hardness Mezzo | 1.10 |  | 0.63654399 |
| `hammer_hardness_forte` | (locked) Hammer Hardness Forte | 1.70 |  | 0.62500000 |
| `strike_point` | (locked) Strike Point | 1/9.3 |  | 0.55724299 |
| `impedance` | (locked) Impedance | 1.10 |  | 0.51249999 |
| `impedance_cutoff` | (locked) Impedance Cutoff | 1.00 |  | 0.50000000 |
| `q_factor` | (locked) Impedance Slope | 1.10 |  | 0.51659852 |
| `string_length` | (locked) String Length | 2.70 | m | 0.50000000 |
| `sympathetic_resonance` | (locked) Sympathetic Resonance | 1.20 |  | 0.54087919 |
| `duplex_scale_resonance` | (locked) Duplex Scale Resonance | 1.00 |  | 0.49999997 |

这些是实际加载预设后的公开控制参数值，不是从 NKS 元数据猜测的值。归一化数值与显示值的映射不等于底层物理系数映射；除接口明确给出的单位外，不推定 SI 单位。部分名称带 `(locked)`，本次没有尝试修改或解锁。

接口结果不等于全部逐音符模型、系数数组或 DSP 内部状态。没有完成参数扰动及音频对照实验，因此不能据此宣称复刻声音。

原始响应保存在本机 `~/.local/share/just-piano-analysis/runtime-getInfo.json` 和 `runtime-getParameters.json`。
