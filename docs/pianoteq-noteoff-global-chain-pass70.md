# pass70：note-off 响应与独立powf接到连续全局模态

将pass69的逐块观测节点速度改为自己的note-off事件状态。节点ID/事件位判定、非线性释放响应、持续时间钳制及速度写入，接入8步释放、原始键值、键曲线、dirty队列、系数与三个连续模态内核。128块4806307项逐位一致，完整原生PCM与官方参考同。完整琴槌接触力、各弦反作用、全部预设和网页等价仍未完成。

## 实际事件与更正的持续时间公式

REA/Ghidra `5b5698` 和原始指令确认：匹配节点ID/tag，清除此次事件对应的mask位；剩余mask为0才改变速度。另一个开关可跳过当前非负速度节点。ID/tag为0xfffe时使用通配匹配并继续遍历。

令T0=C38、T1=C3c、k=C40，a为节点所关联voice的78字段。字节偏移均为十六进制。[实现](../dsp/key-noteoff-velocity.mjs) 按原生float32顺序计算：

```
T = T0
if k != 1 and voice exists:
    a2 = float32(a * a)
    a4 = float32(a2 * a2)
    T = float32(T0 * fma32(float32(k - 1), a4, 1))
if release == 0: release = 1
if release != 1:
    p = float32(logf(float32(T0 / T1)) / float32(-4.844187259674072))
    v = clamp(release, float32(1/127), 1)
    power = powf(v, p)
    T = float32(T * float32(1 / power))
duration = min(T1, max(T0, T))
velocity = float32(-1 / duration)
```

这里T1为上界。早期pass4把最后的两次fcsel误写成 `max(T0,T,T1)`，现已在原报告明确更正。5b5720–5734先选max(T0,T)，再选min(T1,...)；按旧公式本次会被60钳住，无法得到实际速度。

本次block60事件为ID0、tag0xfffe、clearMask1、negativeOnly0。release实际为0.9921875，T0≈0.01、T1=60、k=1；p=1.79586660861969，powf=0.9860134124755859，最终速度−98.6013412475586。不是单位释放量，也没有用捕获速度或power回填。

105个已有节点的初始速度/ID/mask只初始化一次。新增零状态节点使用已验证的正推进常数1e10；其出生ID/tag/mask仍为观测元数据。自己的note-off更新mask与速度，随后127块的原生速度/mask仅作比较，节点积分从自己的速度表读取。k≠1的幅度修正按指令实现，但本次k=1，未取得活动正例。

## powf 的纯JavaScript实现与独立系统oracle

新增 [nativeScalarPowf](../dsp/native-scalar-pow.mjs)。在自己的C数学程序上读取本机libsystem_m的powf指令及数学表，没有调试或调用Pianoteq内部函数：

- float32位型范围缩减、128组倒数/log配对表、整数指数贡献；
- double多项式与原生FMA64次序；
- 乘指数后限制到±32768，按FRINTA作ties-away取整；
- 128项exp表的位级指数合成、余量多项式、最后float32舍入；
- 负底数整数奇偶、次正规输入、零/无穷/NaN等分支。

不是Math.pow或exp(log(x)*y)替代。数学常数表不含Pianoteq模型或预设。已有nativeScalarLogf负责本次对数依赖。

独立本机系统powf验证固定seed70的120101组：60000组释放范围、40000组广范围正底数、10000组负底数整数幂、10000组次正规底数、100组特殊边界及一个实际调用输入。120084组逐位相同，另17组NaN语义相同；NaN payload位不声称一致。直接 `Math.fround(Math.pow(...))` 在同一集有497处差异。

[独立C oracle](../scripts/pianoteq_powf_bulk_oracle.c)、[输入生成器](../scripts/pianoteq_generate_powf_oracle.py)、[重放器](../scripts/pianoteq_replay_scalar_pow.mjs) 均已提供。例：

```sh
clang -O0 -fno-builtin scripts/pianoteq_powf_bulk_oracle.c -o /tmp/piano-powf-oracle
python3 scripts/pianoteq_generate_powf_oracle.py /tmp/piano-powf-oracle /tmp/powf-oracle-new.json
node scripts/pianoteq_replay_scalar_pow.mjs /tmp/powf-oracle-new.json /tmp/powf-report-new.json
```

该吻合范围针对已观察macOS 25F80的系统实现；不把有限测试宣称为所有float32组合或其它系统版本的穷举证明。

## 同次事件、中间量与音频块

[采集器](../scripts/pianoteq_capture_noteoff_global_chain.py) 使用九个固定逻辑地址，按阶段启停，同一时刻最多四个硬件点：

1. 块之间启用raw入口、note-off入口/返回，共三个。
2. 事件内增加pow输入点，随后替换为pow返回点；每次替换最多四个。
3. raw入口关闭事件点，启用键入口、模态入口和返回，连同raw共四个。
4. 首次全局入口仅初始化，随后关闭。

255次块阶段转换与4次事件数学转换合计259条，采集器逐次断言，重放器按事件记录重新推导完整顺序并核对每个enabled集合。没有目标内存写入、调用注入、软件断点、原应用修改或Pedalboard。

正式v2进程140正常exit0，128块完整，无采集错误或受限继续。第一个v1进程97360也正常退出，但没有pow输入/返回目标，字段C3c曾用minimumTime误名；它仅保留为初始诊断，正式v2使用maximumTime并核对实际中间量。最初仅覆盖单位release的DSP原型不能覆盖实测0.9921875，已私有保留并由完整响应替换，未作为通过结果。

## 完整数值与PCM审计

[重放器](../scripts/pianoteq_replay_noteoff_global_chain.mjs) 中原生pow输入、pow返回、事件后速度及后续速度/mask都只比较；自己的事件结果直接驱动释放节点和全局模态链。

| 检查 | 项数 |
| --- | --- |
| pass69同范围原始键/模式/完整系数表/连续模态输出 | 4699172 |
| raw前后节点速度、ID、tag、mask | 107108 |
| note-off前后节点位置/速度/ID/tag/mask | 24 |
| 原生powf输入及返回 | 3 |
| 合计 | 4806307，零差异 |

其中4296350项float32、509957项标量相同；51次控制生产、889次系数刷新、791次限速、114块非零mono输出。更改GlobalRawKeys只增加可选独立速度表参数，原pass69重放仍4699172项同。

同次原生完整113152帧、双声道24-bit、48kHz PCM与官方参考零差异：

```
1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6
```

这是完整原生捕获运行的音频审计；新数学链仍有观测mono输入与已有目标，没有生成贯穿note-off链的独立完整WAV，不能以原生PCM同宣称完整浏览器音色已复刻。

16项负对照全部拒绝。改T0/T1/k/release分别产生15630/13232/14205/18479项差异；改ID、clearMask、negativeOnly导致调用与数学阶段不再对应，严格拒绝。mask前态、pow输入、pow返回、事件后速度、后续raw速度的单项扰动各恰好一个差异。事件时间、硬件阶段、缺失事件及不完整窗口也均拒绝。最终powf取整实现后重放全部正例、16项负对照和音频审计，未放宽条件。

REA证据 `ev_ee368ce75e06b917eeba6b82d30d55e94cf54369a06a715cb52709f37f24616e`；累计322条证据与快照已保存关闭。私有材料为 `debug-pass70-noteoff-global-chain/`、v2、`pass70-powf-oracle/`及 `pass70-*`。未提交目标系数表、预设、IR或WAV。

## 剩余边界

事件release/ID/tag/mask输入的更上游MIDI转换、T0/T1/k的模型生成、非默认k与其它释放参数、节点出生元数据、链表清理和完整声部挂起/退休仍待闭合。非零踏板、活动额外键处理、其它模型/音符/力度与全部预设、完整琴槌—各弦—制音毡接触力、全局驱动/空间返回、贯穿独立WAV、网页声音等价及最终合并部署均未完成。
