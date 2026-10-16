# pass73：旧声部状态到再击激励控制

本轮恢复并验证 `35ed60` 的再击生产者，接到已有硬度谱标量计算。两个真实运行场景共10次击键、127项比较逐位相同，15项负对照全部拒绝。**完整音频严格一致性仍失败，不能称琴槌—弦—制音毡完整复刻。**

## 实际计算与指令次序

新增 [repeatedStrikeControl](../dsp/repeated-strike-control.mjs)。输入为已经匹配到的旧声部计数、时间窗口T、释放控制r、旧力度、最多16项历史，新力度和主机采样率fs，以及踏板/阈值。旧声部选择本身仍为观测输入。

再击标志要求mode=0、存在旧声部、旧计数非零、`f(T*fs)>f(count)`，并且满足踏板超过阈值或 `double(f(r))<0.99`。最后一个比较的门限是double 0.99，不改成float32门限。分支关闭时age、旧力度、attenuation和继承历史均保持初始化零/空。

开启时（f为float32舍入）：

```
age = f(f(count) / f(fs))
oldVelocity = f(old.velocity)
history = copy(old.history)
q = f(oldVelocity / max(f(newVelocity+oldVelocity), floatword(38d1b717)))
w = min(1, f(q+q))
u = f(f(T-age)/T)
u2 = f(u*u)
e = 0                         if r == 1
    1                         if f(r*(-90)) == 0
    expf(f(f(r*(-90))*floatword(3debc8e3))) otherwise
attenuation = clamp(f(u2 * f(w*e)), 0, 1)
```

`35f69c..35f6ac`明确先乘w和e，再乘u2。早期反编译文本的连续乘法没有表达这次舍入次序，不能照其左结合计算。expf使用已有本机标量实现；输入与原生返回另设固定观察点比较，不以原生返回代替计算。

同时纠正早期文档的年龄分母：`35f49c`从经理+c08读取host到x12，`35f5a4`读取host+c；**不是逐键模型对象+c**。本次前者48000，后者69。首轮误将后者标成modelRate的诊断捕获已私有保留；正式v2删除错误字段，并重新采集验证。

## 真实旧状态传给硬度谱

[采集器](../scripts/pianoteq_capture_repeated_strike_control.py)只读附加到正常启动的独立调试副本。该实例使用`--no-prefs`、独立8174接口端口，正常Devices选择系统默认输出，API确认running、48kHz/512帧。输入MIDI通过官方loadMidiFile/midiPlay播放，无Pedalboard或目标函数注入。

五个固定逻辑站点是生产者前/后、exp输入/返回和硬度消费；按阶段启停，运行时最多3个硬件站点。采集器逐阶段记录enabled集合；重放根据实际记录重新推导完整集合与次序。每次声部初始化的输出和后续消费通过同一newVoice地址/线程绑定。

[重放器](../scripts/pianoteq_replay_repeated_strike_control.mjs)自己的gate、age、attenuation和历史复制结果先比较实际生产者输出，再将自己的repeatFlag/age/attenuation交给`excitationHardness`。消费现场相同字段只作比较，两个硬度输出及参考频率也只比较。

cosf仍必须通过`--cosf-candidate`显式选择`f(Math.cos(x))`候选，不声称通用原生cosf已恢复。硬度曲线和位置修正后源表仍观察；继承历史的生产/连续随机更新尚未与本轮连接。

## 两个场景与覆盖条件

| 场景 | 击键 | 活动再击 | 过期旧声部 | exp调用 | 硬度调用 | 比较项 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fast正式v2 | 5 | 4 | 0 | 3 | 6 | 77 |
| expired | 5 | 2 | 2 | 0 | 5 | 50 |

fast第2击实测age=0.11866666376590729、attenuation=0.5943316221237183，exp输入−0.2676791846752167、返回0.7651532292366028。后续两次继承各5项历史。expired中旧计数68032/65024均超过T=1、fs=48000的窗口，旧声部存在但再击标志关闭；两个有效再击r=0，不调用expf。

首轮原型假定每次击键都出现两次硬度调用，实际只有7次，未标为完整或用于正式通过。正式采集在官方sequencer确认不再播放后显式finish，要求5次生产者及每个声部恰好一个主路；出现的次路最多一个，逐一核对。正式v2出现6次、expired出现5次，原因尚未查清，**不能直接认定为缓存**。没有将不存在的次路算成已验证。

最初快场景验证器强制每个窗口至少一次exp，因此拒绝了合法零exp的expired场景；失败保留。最终使用明确刺激profile：fast必须4次活动/3次exp/0次过期，`--expired-window`必须2次活动/0次exp/2次过期。缺失真实exp、错误profile和不完整窗口仍拒绝，没有放宽快场景检查。

正式两次finish前pending均空、无采集错误，关闭站点后正常detach；正常API quit后该GUI执行会话返回−1，不声称GUI exit0。所有后述音频CLI均正常exit0。

15项负对照：改旧计数/旧力度/释放值/T/fs分别产生6/5/6/4/6处差异；继承历史、exp输入/返回、生产者attenuation目标、硬度输出目标的单项扰动各一处。mode、硬件阶段、profile、不完整窗口及将过期窗口T扩大后错误启用分支均严格拒绝。

## 音频验证未通过

两份同一MIDI/同一dry预设分别用**无调试器**的原版和副本CLI渲染，48kHz/24-bit双声道，各自exit0：

| 刺激 | 帧数 | 原版对副本不同交错样本 | 最大整数差 | 首差帧 |
| --- | ---: | ---: | ---: | ---: |
| fast | 142080 | 166797 | 6320 | 10244 |
| expired | 268800 | 362980 | 34 | 18010 |

为区分副本影响，又分别重复原版CLI：fast相对初次原版165558样本不同、最大6320、首差10244；expired为366675、最大47、首差18514。该原版自身不稳定与pass31/32的未解现象一致，但尚未确定根因，不能据此忽略差异或归因于最终量化。

本轮活动采集来自实时正常音频回调，不是上述离线WAV的同次窗口；没有拼接成无扰动音频结论。127项计算吻合与完整PCM失败分别报告。未生成由新再击模块独立贯穿整个声部的WAV。

## 复验与边界

[刺激生成器](../scripts/pianoteq_write_repeat_fixture.py)新增`--expired`；两个生成结果都已与实际测试MIDI逐字节比较相同。例：

```sh
python3 scripts/pianoteq_write_repeat_fixture.py /tmp/expired.mid --expired
node scripts/pianoteq_replay_repeated_strike_control.mjs "$P/debug-pass73-repeat-control-v2/runtime.json" /tmp/fast.json --cosf-candidate
node scripts/pianoteq_replay_repeated_strike_control.mjs "$P/debug-pass73-repeat-expired/runtime.json" /tmp/expired.json --cosf-candidate --expired-window
```

REA重新反编译生产者，证据`ev_48873a85c694fe2a4ff2ee3a9d87d8e419afc6d7291fc40dde4a2c561062144b`，与原始ARM64指令交叉核验；累计332条证据已保存快照并导出。私有材料为`debug-pass73-repeat-control/`、v2、`debug-pass73-repeat-expired/`、`audio-pass73-repeat-control/`及`pass73-*`。

这条反馈是旧声部年龄/力度/释放及音色历史影响新激励，**不是旧弦位移→毡压缩→接触力的完整联立积分**。模式非零、r=1和其它模型/音域的活动正例，完整历史生产、原始模态/模型生成、全部接触分支、原生音频不稳定、浏览器集成和最终合并部署仍待完成。
