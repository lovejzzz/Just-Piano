# 释放控制到真实再击硬度计算：pass84

本轮将自己的释放包络/复制/再击结果送入实际两路硬度计算，且移除新路径对Math.cos候选的依赖。尚未接入完整激励谱、模态发声或最终立体声；不能称完整声音复刻。

## 补上实际再击所需cosf范围

此前nativeScalarCos只实现|x|<120，旧真实再击窗口出现约143～346的余弦参数，历史重放明确使用Math.cos候选。复用pass54保存的macOS25F80 libsystem_m cosf反汇编/常量，新增120≤|x|<2^26的双段归约：

```
n = roundEven(abs(float32(x)) * doubleword(3fe45f306dc9c883))
r = FMA64(-n, doubleword(3ff921fb54442d18), abs(float32(x)))
r = FMA64(-n, doubleword(3c91a62633145c07), r)
```

然后使用原有多项式和象限选择，保持原指令双精度/FMA及最终float32次序。该路径对应cosf+84..124；不把≥2^26的表驱动归约或非有限分支算作已恢复，继续拒绝这些输入。sinf仍只支持|x|<120，未扩展。

[实现](../dsp/native-scalar-sin.mjs)经[独立系统cosf验证器](../scripts/pianoteq_verify_scalar_cos_medium.mjs)验证：包含本轮8个真实重复分支参数的331126个测试输入，145935个属于新增范围，全部逐位一致；同组Math.cos转float32有286差异。测试含正负/零/次正规数、120与2^26边界邻点、π/2倍数邻点和固定种子位模式。≥2^26、±Infinity、NaN五项拒绝检查通过。旧小范围4247项回归零差；此前带旧窗口5个参数的331123项也通过，两个集合不相加宣称不同样本总数。

Oracle为普通独立C程序调用系统cosf，不在Pianoteq目标内注入调用。331126项是实测覆盖，不是所有float32输入的穷举证明。历史候选重放结果保持原标记，新路径明确使用nativeScalarCos。

## 同次控制链实际进入硬度消费

[采集器](../scripts/pianoteq_capture_release_hardness_chain.py)六个固定硬件站点为：击键前10035ef10、模型初始化10043e048、系数1006e5360、包络返回100472fd0、声部复制1004604d4、硬度消费100693ff8。

为保留六点，本轮不采pass83的运行更新站点。在每次系数观察处，从该声部击键时绑定的R所有者读取R+e4，比较源x、声部+2f38和模态V+8c4；不能将这称为本轮逐次重建了全部动态更新。pass83的3314更新事件不拼接进本轮。这里进一步观察的全局输入边界在报告明确标记globalXAtCoefficientObserved。

原生进程95606正常exit0，六点hardware且最终关闭，errors为空、collector/replay连续counter检查通过、重复返回0：

| 事件 | 数量 |
| --- | ---: |
| 击键 / 源模型初始化 | 5 / 5 |
| 系数 / 活动系数 | 121 / 117 |
| 系数处源x变化 | 11 |
| 连续包络块 | 3351 |
| 声部复制 | 3307 |
| 后续击键旧release读取 | 4 |
| 硬度消费 | 10，5声部各mode0/1 |

[重放器](../scripts/pianoteq_replay_release_hardness_chain.mjs)使用DynamicReleaseVoice从源配置初始化模型，自己计算系数、携带连续包络、生成复制值并送入4次旧release读取。repeatedStrikeControl的自算repeatFlag/age/attenuation继续交给excitationHardness；消费处原生controls只比较，不回填。Math.cos没有用于本轮余弦计算。源表、硬度曲线与其它硬度控制仍观察。

**21846项float32比较零差异。** repeatFlag、模式/声部绑定、连续counter等另行结构检查未加入float计数。硬度输出为primary、secondary和referenceFrequency，不将这三项标量称为完整谱或波形。

## 端到端负对照，而非只改局部输出

38项负对照全部拒绝，先要求原始基准exit0。报告新增mismatchesByName，区分差异传到何处：

- 源配置时长、多项式尾、采样率扰动分别产生2315/1465/1891差异；每项都改变下一击old-release、再击attenuation，以及primary/secondary各2个硬度输出。
- 将所有系数处Rattle=1的源值改为0产生4414差异，贯穿D/rate/gain、包络、复制、old-release、再击attenuation，最终primary/secondary各2项变化。
- 仅改变一次最初globalX产生63差异，**未**传播到本窗口后续硬度；保留这一有限敏感性，不把每次源变化都宣称终端可见。
- 初始化/系数/包络/复制/硬度目标单项扰动通常仅产生1处比较差异；这与源扰动的传播不同，支持目标仅作比较的边界。
- 缺失初始化/返回/复制/硬度、模式重复、错误所有者/epoch、无效counter和不完整窗口均拒绝。

这证明所选普通MIDI/Rattle干预下释放控制能影响真实硬度算术，未证明完整琴槌接触力、弦位移反作用或制音毡联立计算。

## 实际音频仍严格失败

同一官方保存FXP和正常MIDI，官方CLI完整148224帧、双声道24-bit/48kHz，正常exit0，无Pedalboard。与pass80原版参考比较：103629个交错样本不同，最大整数差10，首差frame13036，归一化RMS差1.466903176364706e-7。PCM SHA256为94a3cccc572b7584b678024c33aff49daa280b9e91d7b70693da74b084450623。

WAV仍由原生生成，完整一致性失败；未以小误差、听感或局部控制通过替代验收。本轮没有独立完整WAV或网页音源替换。

## 剩余缺口与证据

R全局值、u/flag、初始化源配置/选中衰减行、硬度源表/曲线、旧声部选择及除release外的旧状态仍是观察边界。动态更新、setter和立方消费站点本轮未同时采集。cosf大范围分支、随机/编辑硬度等其它分支仍缺。下一步应将这些自算硬度标量继续接入实际谱表及带输入模态输出，并定位完整PCM差异；全预设语义、完整耦合、独立声音、网页集成、最终合并/Pages发布仍未完成。

私有debug-pass84-release-hardness-a和pass84-*保留捕获、硬件属性、守卫Continue、系统oracle及负对照/音频审计。商业模型和WAV未入库。REA未新增静态记录；复用既有目标站点证据及已保存系统数学反汇编。没有目标代码/数据/寄存器/PC写入或目标内调用注入。
