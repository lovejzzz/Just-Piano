# 速度生产控制改由当前存档生成（pass243）

2026-10-18。本轮移除 pass242 pitch 子链仍读取的历史速度曲线、G+a0/G+c0、shared+8c/+90/+140。新增 `archiveVelocityProducerControls`，从当前资源中的基础模型和实际FXP产生这些值；主链仍显式提供 hostMode、host2fe0 和零音分运行条件。其它声部观察输入、同次完整模型和最终立体声验收未关闭。

## 数值来源

REA重新分析 `714530` 和 `5af358`，两项ok、会话terminal0；响应SHA-256为 `666e7f81557e36ec8da4bf82ed2b219dc109c140e19225cb5bc4e2aced5ecdf7`。同时按保存的ARM核对 `714840..485c`、`714b18..4b38`、`1c560c`及`1c5724..574c`。

| 生产量 | 存档来源与顺序 |
| --- | --- |
| G+a0 | `f32(Ac80 + curve(Ac88,note))` |
| G+c0 | `f32(f32(A9bc/f32(0.3))*curve(B1a80,note))`；A9bc为A9a8版本10的scalars[4] |
| shared+8c | B168的float32值 |
| shared+90 | `f32(1/f32(nativeLog10f(B168)*20))` |
| shared+140 | A1084；当前支持0 |
| shared+218速度曲线 | 复制B1788；Y逐项乘 `min(f32(Ac80/50),1)` 并转float32，X不变 |

曲线缩放使用全局Ac80，不能错误地使用已经加了逐音高修正的G+a0。原生只有上限，没有零下限；测试保留该顺序。曲线版本32771按既有严格存档模式模块解析，非普通标量曲线或未知共享模式直接拒绝。

`archiveVoicePitchControls` 新增存档速度入口，并与旧显式速度控制互斥。旧诊断入口保留；存档缺字段、未知版本或混入捕获控制不会静默回退。生产后的速度尺度仍使用已有独立float logf/expf。

## 三次新原生采集

新采集器只在 `43dff4` 设1个只读硬件点，读取完整生产结果。三次目标均实际terminal=true、exitStatus=0，无采集错误。原应用、许可和目标指令未修改，不使用Pedalboard。

| 场景 | 关键实际结果 | 独立比较 |
| --- | --- | --- |
| 默认NY，note69 | G+a0=30，G+c0=-1.5，速度尺度0.29713115096092224 | 38项零差异 |
| 私有预设副本，Ac80=45、A9bc=0.6，note69 | G+a0=45，G+c0=-3，速度尺度0.2719133198261261 | 38项零差异 |
| 默认NY，note96 | G+a0=33，但曲线倍率仍为float32的0.6 | 38项零差异 |

38项包含7个控制量、3个曲线标志、24个X/Y值和4个最终速度/pitch生产值。三份输入均另通过新导出器直接从当前资源和相应FXP生成，无历史捕获曲线参与预测。note96实际验证了非零逐音高Dynamics修正与全局曲线倍率的区别。

预设副本在新进程中加载，两个修改均由实际生产值确认。三份原生WAV均为48kHz、双声道24bit且非静音；默认与参数副本均113152帧，221695个PCM整数不同。该修改场景尚未验证独立最终立体声；host2fe0在三个场景均为0，非零外层增益音频不作覆盖声明。G+c0的物理命名未由本轮推断。

## 当前资源独立导出与连续音频

`scripts/pianoteq_export_pitch_archive_inputs.py` 仅消费资源文件、唯一基础模型身份、FXP及显式运行条件，不读取原生进程或捕获数据。它校验资源完整性、版本89模型和三字符串预设身份，导出5个基础字段与4个预设字段到新的私有JSON。商业输出禁止落入仓库，文件权限0600，已有文件拒绝覆盖；零音分分支必须由 `--zero-cents` 显式声明。未知类型/分支不猜测。

本机当前资源SHA为 `d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d`，历史五击FXP仍为 `c9073553f6d62c716b874f15418902d15e58edc97a56f79b112ccb3e4a01e751`。新导出的pitch输入SHA为 `abcc903e75dd6df9b82e656a3fd359af6abe3b8cc2107f83ee7135cf0d4bdc53`。

五击主链消费该v2输入：14,216,545项检查零差异。报告明确 `pitchVelocityProducerControlsFromArchive=true`、`pitchVelocityProducerControlsStillObserved=false`；运行条件仍显式。实际写出30条内部float32 WAV，独立Python解析RIFF并直接与原生audioTail比较，1,272,576个采样逐字节相同，无归一化、全从counter0开始。

本机证据为 `pass243-current-archive-report.json`、`pass243-current-archive-stems/`、`pass243-current-stems-audit.json`；三份新采集为 `pass243-velocity-{baseline,changed,note96}-v1/`。原始模型、预设、捕获和音频全部保留私有。

## 负对照、检查与边界

只改捕获目标G+a0及一个曲线Y值，恰好2项比较失败；全部预测完全不变。只把输入Ac80从30改为30.01，完整回放在实际模态剔除布局分歧处按原严格门控拒绝，退出1；没有完整差异报告，未编造差异数量或移除布局检查。

新增测试覆盖逐音高修正、全局倍率上限与负数顺序、增益标量、共享归一化、未知版本/模式、互斥入口和运行条件污染拒绝。旧显式速度入口回归、受影响脚本语法检查、导出器的仓库位置/已有文件/缺失显式分支拒绝均通过。导出器初稿对预设身份类型的错误在写出前失败，已按真实三字符串结构修正并完成当前资源导出和原生验证。iCloud占位资源读取先终止自有读取、确认终端，再按Git blob校验恢复未改动的解析器字节；未覆盖用户改动。

这关闭了当前pitch子链的速度生产观察依赖，不能升级为同次整机完成。其它激励/释放/位置控制、调度、辅助入口、完整接触力和制音耦合仍待闭合；当前连续声源表仍使用既有历史绑定，`sameRunModelGenerationVerified=false`、`finalStereoAudioVerified=false`保持。全音区音频、全部预设、AudioWorklet和网页声音尚未验收，未合并或部署。
