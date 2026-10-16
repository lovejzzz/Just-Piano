# Pianoteq 制音参数追踪：第四轮

**当前结论：已建立 note-off 释放状态到模态衰减系数的实际计算闭环，并确认编辑模型 root+160 到渲染模型 I+130 的深复制路径。** GUI DamperPosition 已从模型成员+1110追到逐模态余弦/指数权重及系数刷新；完整接触力仍未恢复；早期同偏移keynoise误线索已排除。释放与衰减函数已有真实NY渲染栈佐证，尚无具体字段数值轨迹。

目标是从已确认的编辑状态参数 `Damper Position`（内部 ID 109）和 `Last Damper`（ID 111）推进到计算代码；不将上一轮 bzzmode 约束自动当成制音器。

## 检索入口与边界

上一轮 `FUN_1003957c4` 的根节点解析分别返回 `S+0x1270`、`S+0x12c8` 的标量引用，`S+0x1278` 是 Damper Position Fine 的曲线对象。这里 S 是解析器根描述首指针，尚未证明等于音频侧 G 或逐音符 B 对象。

本轮在同一 ARM64 副本的只读 `otool -tv` 反汇编中检索上述两个偏移，得到 32 条指令候选。结果保存在本地证据 `pass4-damper-offset-candidates.txt`。多数是复制、比较、构造或序列化；没有发现直接以 `ldr s*,[base,#0x1270]` 紧接浮点运算的消费者。这个检索结果不等于参数没有影响：编译器可能提前调整基址，或通过通用引用求值器间接读取。

不能仅因偏移相同就认定基址等于 S。特别是 `S+0x1278` 为曲线对象，整体向量复制或读取头部整数，不等于在计算制音位置。

## 反例：相同偏移实际进入按键噪声随机化

追踪候选 `0x100714ff0` 所属 `FUN_100714530` 后，发现其从接口虚表 `+8` 返回的 M 对象取 `M+0x1270..0x127f`，复制到另一配置 R 的 `+0x2c4..0x2d3`。接口对象 `+0x10c` 为零时，还把该记录首 32 位清零。R 的其他字段与上一轮 DSP 侧 `G+0x1240` 所指配置一致，包括 `+0x5a8` 和 `+0x678` 等布局。

进一步以 R+0x2c4 找到实际消费者 `FUN_10094650c`。它通过 `FUN_1006da4b4` 获取扰动值 d，并执行：

```text
d = clamp(d, -96, 32)
当 d ≠ 0 时：
    gain = clamp(base_gain × exp(d × 0.5 × 0.115129255), 0, 100)
    object[+0x74] = 再次获取的扰动值 / 40
```

之后将 R+0x680 和 R+0x690 传给 `FUN_1002041d8`。生产函数 `FUN_100714530` 在填充 R+0x680 的路径上明确输出 `keynoise_sample=`，因此这里是按键噪声资源/随机变化的路径，不是已经确认的制音位置系数计算。第二次扰动调用会推进随机态，不可把两次值假定相等。

`FUN_1006da4b4` 本身也不是“曲线求值器”：它读取 16 字节配置的启用、模式和两端点字段，推进四个 uint 的 xorshift 状态，最多进行 10 次候选/拒绝步骤。在输入位于端点范围时，其接受概率具有三角分布形状；输入不在范围时另有退化处理。以上仅用于确认此处的真实职责，不将未核验的返回 ABI 当作源码签名。

这条完整消费者证据表明：**不能将 M+0x1270 直接当成 S+0x1270 的 Damper Position。** 目前尚缺 S 到 M 的转换或同一性的证据。继续沿这个同偏移分支将分析带到按键噪声，而不会自动回答制音器耦合。

另一个候选 `FUN_100712774` 只将来源对象的多组曲线/vector（0x1190、0x1280、0x11e0、0x1230）复制到目标，包括 `+0x12c8` 字段的搬运，没有制音力或衰减系数计算。它的对象身份仍不能按偏移强认。

## 本轮结论与证据

本轮排除了两个看似相关的直接偏移路径，未建立新的“Damper Position → 制音器状态/力”的闭环。这一限制不能用噪声增益公式或上一轮 bzzmode 公式替代。

原始 REA 结果在本机 `~/.local/share/just-piano-analysis/`：

| 文件 | evidence_id |
|---|---|
| `pass4-damper-transfer.json` | `ev_853f88d4091b1d10257c7811cae9b57897bd77d7d54163aa8230c87e2dcb729e` |
| `pass4-damper-transfer-b.json` | `ev_0af5b0c3a510c1a95c735b5cf63bfc09581716302413c953ea3794fab76c5334` |
| `pass4-damper-coefficients.json` | `ev_19fe9d72627c4a4f63e97739147fcccb38ade60a02f1cfca7b98eaddbae3fade` |
| `pass4-curve-evaluate.json`（文件名沿查询时暂用名，内容实际为随机扰动） | `ev_abce55a7f326b36309ede91ef2649a05f8e41a12c7ab090d9db2aa043c2216e1` |

没有启动新的 REA 实例、Pedalboard 或音频宿主，也未修改 Pianoteq 文件。当时下一步是编辑状态 S 到运行时模型 M/G 的转换入口；本轮末节已补齐编辑模型到运行时模型的复制桥接，制音位置字段的具体消费者仍待追踪。

## 实际 note-off 的释放状态推进（新增正向路径）

事件分派 `10053f47c` 调用 `1005b5698`。此处对象 C 是 engine `+c88..c90` 向量的一个 `0x140` 字节元素。C+20 是键状态链表首指针，链表节点 N+18 为 next、N+20 指向 voice，不能与 C+0 的 voice 链混用。

释放函数先匹配节点 ID、清除 N+28 中此次事件的位；剩余位为零才改变释放速率。设 `T0=C.float38`、`T1=C.float3c`、`k=C.float40`、`a=voice.float78`。voice 存在且 k≠1 时 `T=T0*(1+(k−1)*a^4)`，否则 `T=T0`。传入 release=0 被置为1，非1时令 `v=clamp(release,1/127,1)`、`p=log(T0/T1)/(-4.8441873)`，再置 `T=T/v^p`。最终 `N.float8=-1/max(T0,T,T1)`。这是已确认的计算关系；T 的物理时间单位及 a 的物理身份仍待上游证明。

消费者 `1005e1d18(delta,engine,note)` 读同一 C+20 链。在 C.byte1c=1、C.byte1d=0 的普通分支，先推进 `z=max(0,N.float0+delta*N.float8)`，再限制上界 `1-A`，将结果同时写 N.float0/+4；之后 N.float0 另外受上界 `1-B`，因此 N+0 与 N+4 在该分支可不同。这里 A 来自 `clamp((*(engine+c08).floatc0+C.float30)*(1-*(engine+c08).floatbc),0,1)`，A<0.01 时置零；B 来自 `clamp(*(engine+e00).floate8*(1-C.float34),0,1)`。其他 flag 分支可强制1，delta=0 分支只限制状态、不作速率积分。

随后遍历 N+20 的 voice 链（voice+30f0）。根据 voice.byte2fa4 选择 N+0 或 N+4，并与另一全局控制量取最大、限制到1，得到控制量 u。普通分支写：

- voice.byte2f98=1（待处理标记）；
- voice.byte2f99=条件标志；
- voice.byte2f9a=(N.float8≥0)；
- voice.float2f9c=u；
- voice.byte2fa0=另一条件标志。

voice.float14c≥0.5 则覆盖 u 为该字段，并强制部分标志。某些较弱 voice 分支会置 voice.bytec98。`10090cab4` 只是根据终止状态和仍存 voice 清理/回收链表节点，错误字符串为 `manager_key_state.hh`；它不是物理接触积分器。

原生指令 `10020e02c` 读取 voice.float2f9c，写 voice.float2ec8；后续可受 voice.float3084 等限制。`1004602f4..100460320` 读取该 +2ec8，调用 `1005337f0(voice+168, u, flags)`，构成继续向 DSP 对象推进的确切候选。此处仍不把 u 命名为制音器压力/位移：已证实的是事件→释放速率→有界状态→voice 控制量，尚未得到状态→耗散系数或制音器力的映射。

## 释放状态已经连到衰减系数

后续 REA 确认 `10020df90` 消费 dirty 状态，并在 guard 满足时将 +2f9c 发布到 +2ec8；`1005337f0` 将值写入 V+8cc，将两个标志写 V+924/+925（V=voice+168）。特殊的 `flag924≠0 && u=1 && bit(V931)` 会将 V8cc 改为0，不能忽略。

`1006e4f5c` 在合成更新中、`1004e285c` 渲染前执行。其活跃系数分支由 V924 或 V8c4>0 控制。令 u=V8cc、h=(V8c4)^3：

```
r = min(u, 1 - clamp(h * V91c, 0, 1))
q = r^4
D = V914 + q*(V94c + q*(V950 + q*(V954 + q*V958)))
V944 = D
V7e4 = V910 * 0.115129255 / D
V7b0 = max((1-u)*V90c, h*V920)
```

系数非活跃分支直接清零 V7e4、V7b0、V944。这是四次变量再进入四阶多项式的实际控制映射，不是凭参数名推测的线性 damping。0.115129255≈ln(10)/20；目前尚未证实 D 对应哪种标称时间或 GUI 参数。

此前 `100863008` 已连接到最终模态递推。本轮确定 V7e4 正是它读取的标量衰减项。在该刷新器的一般初始化路径中，每 lane 的临时衰减为 `d_i=V7e4+V48_array[i]*(V7f8*max(1,V780))`。V7ec≠1 时，会按 V20_array[i] 与 V7f0/V7f4 的分段关系覆盖其中 V7e4 的贡献，后面还存在 V7b0、V7e0 和归一化修正。因此不能将一般情形简写成单一 d_i。

最终 lane 值经 `R_i≈exp(-V0c*d_i)`（近指数实现见 state-recurrence 报告）变为 `A_i=-R_i²`、`B_i≈2R_i cos(theta_i)` 的常规分支系数。到此已经建立：

`note-off → N+8速率 → N+0/+4有界键状态 → voice+2f9c → voice+2ec8 → V+8cc → V+7e4/+7b0 → 模态衰减指数 → A/B递推`

这证明释放状态确实参与实际声音计算，而不只停留于名称和函数结构。后续已连接 UI DamperPosition 的 S+1270 到模态权重生产者（见末节）；仍未恢复完整制音毡接触力、琴槌反馈和音板联立物理方程。上面的状态闭环与这些未解决问题必须分开报告。

新增原始证据：`pass4-note-stop.json`、`pass4-release-update.json`、`pass4-release-helper.json`、`pass4-release-dsp-transfer.json`、`pass4-damping-control.json`、`pass4-damping-refresh-gate.json`、`pass4-synthesis-update.json`，以及已有 `pass2-coefficient-refresh.json`。尚无这些具体状态值的运行时捕获，不把静态闭环声称为逐样本数值验证。

## S/M 偏移关系的新证据

后续从模型组装找到实际复制链，详见 hammer-pass4 的“编辑模型到渲染模型”。编辑根的模型成员位于 root+160，渲染接口的模型成员位于 I+130；二者经过 `1007aa33c` 的实际深复制连接，不能当作同一个对象的两个地址名称。因此命名字段 S+1270 的模型成员相对偏移为1110，S+12c8对应1168；此前把接口 M+1270 误联到 DamperPosition 的路径应继续排除（那是不同字段）。这一步解决布局/复制桥接；后续消费者与控制公式见下一节。

父线程已有真实 NY 离线渲染 sample-render 栈还捕获了 `1005e1d18` 与 `1006e4f5c`（如6e523c/6e5550）。它支持本报告释放状态/衰减刷新函数确实在该钢琴渲染中运行，但不是具体字段数值或每个分支的运行证明。


## DamperPosition 到逐模态权重的完整静态路径

`100321e78` 从接口 getter 取得 M，设音符为 n，曲线求值为 E：

```
p = E(B+30f0,n)                         if M1110 == 0
p = clamp(M1110 * E(M+1118,n),.001,.5)   otherwise
```

`1001c5320` 保存 p 到逐音符 G+fbc，`10007a60c` 复制到 voice X+2ecc；`100460110` 在 X+2ed4 为零时将该值交给 `100651f90`，后者直接写入模态对象 V+8d4。X+2ed4 非零则使用 X+2ed0，因此不能声称所有状态都无条件使用 GUI 位置。

`1006e4f5c` 检测位置变化并调用 `100288f38`。设 f_i 为 V+20 指针数组的第 i 个值，j_i 为 V+c0 数组的第 i 个值，N 为 V+928 的整数，得到 V+788 指针数组中的权重：

```
w_i = -cos(2*pi*p*f_i / V918) * exp(-f_i / V908) * indicator(j_i <= N-1)
if p < .125:
    w_i += (1-8*p) * E(V+9a8,f_i)
```

这里 `10041137c` 已核实直接调用系统 `_vcosf`，`10071033c` 为已核实的 `_vexpf` 包装。附加曲线位于掩码之后，不能把掩码错误地应用到整个相加结果。f_i 的具体物理单位、V918/V908 的命名和模型来源仍需追踪。

`100863008` 消费同一 V+788 权重数组。在 V+7e0 为零的分支，可直接看到用于指数/近似指数归一化的两组输入 `c*d_i` 与 `c*(d_i+w_i*V7b0)`，随后还有加权求和与归一化。这里 c 是该分支的负时间尺度；不将这段简化成所有分支统一的逐模态最终衰减公式。

这建立了命名位置参数→音符曲线→voice→位置权重→模态系数刷新的静态数据链，且与 pass3 中 DamperPosition 0.25/0.75 的真实 PCM 干预相容。音频干预证明有可听计算影响，不证明每个内部系数数值已经被动态测量。

同一音符构造函数还读取 M+1168（LastDamper）；-1 时采用 B+3d18 默认值，并令 G+123c = (音符 <= 阈值)。该标志后续全部分支尚未展开。

新增原始记录：`pass4-damper-position-evaluate.json`、`pass4-damper-position-consumer.json`、`pass4-damper-position-weights.json`、`pass4-damper-position-trig.json`；关联证据为 `pass4-note-model-builder.json`、`pass4-voice-configure.json`、`pass2-unstable-kernel.txt` 与 `pass2-coefficient-refresh.json`。
