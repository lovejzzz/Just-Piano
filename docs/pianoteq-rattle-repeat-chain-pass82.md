# 动态Rattle、连续包络、声部复制与再击：pass82

本轮将pass81连续包络继续接入真实声部复制和下一次重击。不是完整琴槌接触力或弦—毡联立方程，也未生成独立完整WAV。

## 同次窗口与可执行状态模块

[六点采集器](../scripts/pianoteq_capture_rattle_repeat_chain.py)使用10035ef10击键前、10085ed9c动态源更新、1006e5360系数、100472f80/100472fd0包络前后、1004604d4复制。初始Rattle从击键前的R+e4读取；更新从同一所有者读取。为保留六点，未采pass81的独立source/active立方站点或pass80 setter；这些以前的观察不能冒充本轮同时观察。

正式A进程89276正常exit0，六点均hardware并最终关闭，complete=true、errors为空、所有pending为0：

| 内容 | 数量 |
| --- | ---: |
| 声部/击键 | 5 |
| 动态更新 / 实际x变化 | 3307 / 11 |
| 系数 / 活动系数 | 121 / 117 |
| 连续包络块 | 3352 |
| 声部复制 | 3303 |
| 下一击的旧释放值读取 | 4 |

新增浏览器兼容的[DynamicReleaseVoice](../dsp/dynamic-release-voice.mjs)，整合自己的x、系数和连续包络，提供updateRattle、refresh、process、copyRelease。模块不依赖文件系统、LLDB或原生结果快照。初始化包络为0，每声部仅一次；refresh以源模型/u/flag计算，process使用模块内自己的duration，copyRelease返回自己的包络状态。[重放器](../scripts/pianoteq_replay_rattle_repeat_chain.mjs)实际调用此模块，未另走仅用于验收的实现。

3303次自己的copyRelease同时与原生模态位置及声部release比较，并将自己的复制值按声部绑定保存；4次后续击键用它替换旧release输入，调用已有repeatedStrikeControl，自算repeatFlag、age、oldVelocity、attenuation及继承history，并与下一声部真实生产结果比较。原生release/包络目标均不回填。计数器逐块累加，复制时不能存在该声部未完成包络。

**20487项float32比较零差异**；块计数、配对、repeatFlag等另行结构检查不计入这个float总数。重复返回观察数0。

22项负对照均拒绝，包括整段改源/漏更新、模型/u/flag、三个系数目标、模态x、包络位置/计数/漏返回、复制两目标/全部缺失、旧release/错误旧声部、重击衰减目标和错误所有权。u扰动产生1944差异，flag扰动13500差异，显示状态会贯穿后续计算；不能把负对照数量当参数覆盖率。

## 实际音频与范围边界

普通官方CLI、pass80官方保存的Rattle踏板FXP及正常五次重击MIDI，无Pedalboard。独立副本原生WAV与原版参考均148224帧、双声道24-bit/48kHz，但**91892交错样本不同，最大整数差9，首差13036**，归一化RMS差1.3217558453141611e-7。PCM SHA256为f5668c3e33fa60773bbad04c5d9226f4b5dba0cb56927670da71bcd0f493c6c9。严格完整音频验收仍失败；该WAV也仍由原生引擎生成，不是新状态模块独立合成声音。

本轮模型多项式/scales、u、releaseFlag、timestep/baseDuration仍观察；未接入pass78源模型初始化，不能跨运行拼接宣称完成。旧声部选择、count/duration/velocity/history以及踏板/threshold仍为外部输入，仅旧release已从自己的连续状态产生。动态x在系数站点与实际模态字段比较，活动条件按观察flag位或自有x>0计算，但未独立生成flag。不是逐采样琴槌压缩/接触力或制音力验证。

宿主沿用pass81普通Continue守卫，原生无代码/数据/PC/寄存器写入，无注入调用。REA本轮未新增静态记录，复用先前固定站点证据。完整捕获、硬件属性、Continue侧录、负对照及音频审计保存在私有debug-pass82-rattle-repeat-a和pass82-*；商业模型和WAV未入库。

下一步应在同次非零刺激中加入源模型初始化，继续减少原生观察输入，再连接实际声部输出与最终立体声。完整耦合、全部预设运行语义、独立完整音频、网页音源替换及最终合并/Pages发布仍未完成。
