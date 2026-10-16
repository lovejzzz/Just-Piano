# pass77：释放控制源字段到初始化系数

新增[initializeReleaseModel](../dsp/release-model-controls.mjs)，从逐音符配置、全局模型数组和选中衰减行计算释放控制初值。在5个实际新声部上，50项float32比较全部吻合，13项负对照全部拒绝。**这次只验证初始化，尚未与pass76连续包络接在同一运行；整段PCM仍失败，完整琴槌/弦/制音毡接触计算与网页等价仍未完成。**

## REA与源字段映射

当前不可变ARM64的REA证据：

- `ev_9f45dca2ebedab7053d2c355a264a4d8fda48e6dbfbc091b492f3fbd652f4c4e`：`43dcb0`初始化器、`673d00`衰减行归约。
- `ev_c0e4fb7c2db03645c0a76bb75e5afc0c4294e41cb6d985442f60c7bca6e9852e`：`288f38`位置权重刷新。

第二项及完整ARM64指令纠正了pass76初版的一句推断：`288f38`写V788权重和V926标记，不能把它称为多项式生成器。真正的初始化来源在`43dee8..43e044`：

| 目标 | 来源/计算 |
| --- | --- |
| V914 = c0 | 逐音符配置P+34 |
| V94c/V950/V954/V958 = c1..c4 | R+a0指向的4个float；R=*(G+1240) |
| V90c = gainScale | G+fb8 |
| V91c = cubicScale | G+ffc |
| V920 = cubicGainScale | G+ff8；与上一字段经rev64交换后存储 |
| V8fc = timestep | f32(1 / f32(G+98)) |
| V910 = rateScale | 下述衰减修正式 |

P是实际初始化器第2参数，G=*P，M=*(P+8)。若M+4行数非零，`673d00`选取M+10行号、M+0列宽、M+48指向的衰减矩阵一行，顺序求最小值并下限1。设f为float32舍入：

```
minimum = max(1, minimum(selectedDecayRow))
correction = f(f(f(minimum * 20) * f(P34)) / floatword(40135d8e))
rateScale = max(0, f(90 - correction))
```

`40135d8e`为实际float32常数，约ln(10)。M+4=0时correction=0。没有用Math.log替代这个常数，没有把连乘或除法改成double链，也没有从原生rateScale倒推minimum。

4个多项式尾系数的原生复制前要求R+a8与R+a0相差16字节；采集器保留并核对该限制。上游如何由GUI曲线/预设生成P、G和R，仍未在本轮自计算。

## 原生活动验证

[采集器](../scripts/pianoteq_capture_release_model_controls.py)仅用2个固定硬件点：`35ef10`登记新声部，`43e048`读取源字段与刚写完的目标。每个模态对象必须等于已登记声部+168，只初始化一次；没有仅凭相同数值匹配对象。5次A4快速再击使用既有干声FXP和MIDI，独立调试副本的`__text`按原哈希核验。

进程66347正常exit0，无读取错误，无额外Continue。LLDB明确列出两点均为hardware、各命中5次。保存5条声部登记与5条初始化记录，finish后全部站点关闭。

[重放器](../scripts/pianoteq_replay_release_model_controls.mjs)严格核对对象、顺序、矩阵行范围与长度、完整窗口。每声部5个多项式系数及rateScale/gainScale/cubicScale/cubicGainScale/timestep共10项，合计**50项逐位相同**；原生目标只比较。

本次实际矩阵为61行、3列、选中行0。5次行最小值约0.2591..0.2594，均被下限1夹住，因此rateScale均为85.81991577148438。实际多项式均为[0.48124998807907104,25,75,0,900]。这些重复值仍要求地址绑定，但**不能把它们当作多个不同控制工况，或声称已动态验证minimum>1/零行/速率截断分支**。

13项负对照全部拒绝：源duration/gainScale/cubicScale/cubicGainScale/sampleRate、多项式源、整行移至1以上、零行数、速率目标、多项式目标、错误模态地址、错误行长、不完整窗口。duration扰动使c0和rateScale两项失败，其余数值扰动各1项；结构错误直接拒绝。负对照证明实现消费这些输入，不是对应原生分支的新增动态采样。

## 音频和剩余边界

同次原生WAV完整142080帧，双声道24-bit/48kHz。PCM SHA256：

```
25eadf37ef8142990cc7f982e566e0ac8c24afc6fbf3ac9a6d36efcfeb142a2e
```

| 参考 | 不同交错样本 | 最大整数差 | 首差帧 |
| --- | ---: | ---: | ---: |
| pass73同刺激原版 | 166180 | 6320 | 10244 |
| pass76 B | 128643 | 12 | 13007 |

严格音频比较仍失败，没有把数值初始化通过解释为完整音色通过。没有独立完整声部WAV。pass76的连续状态与本轮初始化是两次运行，尚不能合并计数或宣称同次端到端闭合。下一步需要在同一观察窗口把这些源字段的自算结果送入系数刷新与连续包络，并继续恢复源控制生产和真实非零x反馈。

REA已导出335条证据并关闭，保存pass77快照。私有证据为`debug-pass77-model-controls-a/`、`pass77-*`，包括源矩阵/配置快照、完整日志、数值报告、13项负对照与PCM审计。公开代码通过Python/JS语法检查。没有目标写入、PC/寄存器修改、内部调用注入、软件断点、完整性/授权检查修改或Pedalboard。
