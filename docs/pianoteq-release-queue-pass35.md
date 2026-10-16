# pass35：同次运行的释放节点→挂起状态→制音系数

本轮将 pass34 的释放递推推进到同进程、按顺序的状态交接和系数计算，并用两个真实踏板输入验证分支。新增的是独立 DSP 与验证工具，尚未接入网页。完整琴槌接触力、弦反馈、制音毡模型与网页声音完全匹配仍未完成。

## 实测范围与结果

| 捕获 | 场景 | 检查数 | 数值 / 完整窗口 / 原生退出 / PCM |
|---|---|---:|---|
| schema 2，三次 | 无踏板 | 各 884 | 全通过 |
| schema 2，两次 | CC64=64、96，随后抬起 | 各 884 | 全通过 |
| schema 3，三次 | 无踏板、64、96，加入同次系数点 | 916 / 908 / 888 | 全通过 |
| schema 4，三次完整捕获 | 同上，加入生产端时钟 | 942 / 934 / 914 | 全通过 |
| schema 4，首次 64 | 调试器中途停止 | 615 项数值同 | 完整窗口、原生退出及 PCM 审计失败 |

完整的 11 组累计 9922/9922 项逐位同，均确认原生进程 exit 0，调试捕获时原生程序生成的 24-bit PCM 与各自原版基准相同。将中途停止的一组也纳入，[完整审计](../scripts/pianoteq_audit_release_queue.py) 明确 exit 1、11/12 通过，不把其 615 项局部一致当完成。

此外有三次早期 schema 1 捕获，每次 104 条交接记录，原生正常退出且 PCM 同；缺少后续数学重放所需的控制字段，不计入 9922 项。本轮合计 15 次调试捕获，14 次正常完成，一次中途停止。两种踏板刺激分别新增官方原版 CLI 渲染作为实际参考。

## 独立计算的链

[release-position-transfer.mjs](../dsp/release-position-transfer.mjs) 实现挂起位置和标志生成、消费位置的算术；[release-key-state.mjs](../dsp/release-key-state.mjs) 连续推进节点；[physical-controls.mjs](../dsp/physical-controls.mjs) 计算 duration、rate、gain。

[同进程重放器](../scripts/pianoteq_replay_release_queue.mjs) 只在窗口起点初始化一次节点/声部状态，然后持续传递自己的位置、挂起状态、释放标志和消费结果。实测节点输出与挂起位置仅用于比较，不逐步注入计算。消费者取得的是自己生成的挂起值，制音系数取得的是自己的消费位置，不再用跨运行的第几个更新来对齐。

节点速度、两个 cap、pedalDrive 等上层输入与系数多项式/缩放仍来自捕获。JavaScript 重放输出内部数值，尚未生成完整音频；原生 PCM 一致只验证这些成功捕获未改变该次原生输出，不能当作 JavaScript 波形一致的证明。

在 `1005e2164`，挂起位置已经写入，额外标志尚待写入，因此该标志从原生 w2 读取；在 `10020df90` 观察消费入口；在 `100533818` 观察 setter 已写入的值；在 `1006e5344` 观察系数。最终 schema 4 使用四个固定硬件点，无指令单步或进程内计算。捕获脚本是 [pianoteq_capture_release_queue.py](../scripts/pianoteq_capture_release_queue.py)。

### 节点推进与时间步长

活动释放节点仍使用 pass34 的 FMA32 和两级限幅。生产端 `1001bb650` 先把块长累加到 manager+d00，再计算：

```
dt = f32(f32(blockSamples) / sampleRate)
```

`1001bb6fc` 确实为 fdiv；实测 blockSamples=64、sampleRate=48000。schema 4 从这两个入口量自行生成 dt，并逐位核对原生寄存器值，不以捕获的 dt 驱动递推。另一个调用者 `1006b9038` 以 dt=0 刷新状态，本轮没有将它混为每块推进。

三组完整时钟捕获中，生产端累计计数始终比所观察声部 V+10 计数大 448 个样本，即七个 64 样本块。保存的是两个计数各自的实际值；该偏移不能单独证明 pass34 的异常根因。

### 挂起值与踏板托住位置

实际 mode=1 分支的浮点算术为：

```
pedal = f32(fma64(pedalAmount, -0.08, 1) * pedalDrive)
if ignorePedal: pedal = 0
pendingPosition = min(1, max(nodePosition, pedal))
```

mode=0 从节点另一存储值取位置；该分支本轮未动态覆盖。方向由节点速度符号生成；释放标志还使用 double 常数 0.999、两个限量及 mode 位运算。没有把这些控制量自动定名为物理接触位移或力。

[原创短 MIDI 生成器](../scripts/pianoteq_write_release_pedal_fixture.py) 在 tick 0 设置 CC64，在 tick 19 击 A4、77 松键、90 抬踏板，PPQ=480、默认 120 BPM：

| 场景 | 松键后实际行为 |
|---|---|
| CC64=64 | pedalDrive=0.40766608715057373；节点继续降到 0，但挂起/声部位置被托住在该值 |
| CC64=96 | pedalDrive=1；节点降到 0，挂起位置保持 1、释放标志为 0 |
| tick 90 抬起 | 在观察到的 voice counter=4096，两场景 pedalDrive 和挂起位置均归 0 |

这里验证了非零踏板输入对内部位置和系数的实际影响，没有恢复任意 CC64 数值到 pedalDrive 的完整曲线。两个场景 pedalAmount 都为 0，不能声称 -0.08 修正的非零输入分支已验证。

### 消费与制音系数

消费函数只在 pendingSamples>blockSamples 时保存相减后的计数；到期分支保留原计数，并非总是将其钳到零。到期、pending=1 且 skip 位为 0 时消费挂起位置，再执行 latch/blend、附加 cap、type=2 cap 和释放标志逻辑。模块只实现位置/标志部分，不含原函数的声部退休、列表维护、重新激励等副作用。

本轮实际消费延迟计数为 0，额外 cap/blend/强制释放分支未激活。这些分支按原指令写出的算术不等于已经取得动态验证。held 节点也明确限于当前实测的两个 cap=1、位置=1 情况，其它情况重放器拒绝。

同次观察到的系数更新次数分别为无踏板 8、64 踏板 6、96 踏板 1。自己的消费位置直接进入多项式/速率/增益计算，逐位核对实际值。完整声部的带输入状态、毡接触力和最终立体声计算仍不由这个模块提供。

## 失败处理与负对照

首次 schema 4 半踏板捕获在 voice counter=4032 附近以 EXC_BREAKPOINT 停在 `100533818`，LLDB 自身退出 0，原生程序未正常退出。数值重放曾只检查已取得的部分记录并报告 615 项一致；原报告保存为 `replay-partial-before-completeness-check.json`，随后补上窗口完成门槛。现在该输入明确 `windowComplete=false`、exit 1。原失败和不完整 WAV 均保留，独立新目录的补采正常完成。

总审计另外直接读取真实参考/观察 WAV，并检查原生退出日志，避免将“窗口完整”误当“最终音频已完成”。两项一 ULP 负对照分别修改实测节点输出和消费者挂起位置，均被拒绝（各 941/942），后续预测仍使用自己的状态。

本轮没有重现 pass34 的 `db1839…` 异常 PCM，也没有解释它。不能因为这批完整运行音频相同就消除此前的失败。下一步仍需关联异常发生时的生产时钟与声部执行，并补齐 CC64 映射、速度生成、实际毡/弦接触和最终声音路径。

## 可追溯证据

REA/Ghidra 新证据：挂起写入点 `ev_caec7108bbc1d36d4a921d40de6b064d048cf4459c285f883e89b7b144934b46`、消费复制指令 `ev_b96f2620c566fbd48e9a07db3f22d9761337620c48492390e777a77c66d8586f`、生产调用者 `ev_60b06b30cc0fe812cf0818acff1d83a1b2089df108e0d9f440e2348939defde8`、dt 除法 `ev_334735056a26597b4d843440449cf9055c2046f9dd3b4a38cc64e0b8071357ac`。累计 bundle/snapshot 含 243 份证据。

私有材料保存在 `/Users/tianxing/.local/share/just-piano-analysis/`：`debug-pass35-*`、`pass35-queue-positive-audit.json`、`pass35-queue-audit-including-stopped.json`、两个 `pass35-*-negative-control.json`、REA bundle/snapshot 与 `pass35-manifest.json`。原厂模型和预设未随代码发布。

始终使用授权独立调试副本和硬件断点；没有 Pedalboard、软件断点、补丁或绕过完整性检查。原安装 executable 的 SHA-256 复核保持 `fb13e0e4dd5a3b5138fb4b2cd2f1d055dcb21128a8316308cbbc28cff6436b90`。
