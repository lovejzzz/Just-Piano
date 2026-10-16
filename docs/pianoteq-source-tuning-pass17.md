# 实际调律、拉伸与参考音校正

`dsp/source-tuning.mjs` 实现默认十二平均律基频、已生成拉伸表的消费、参考音校正及逐键音高编辑。对note9..113的105个音高，每项三个完整遍历，**2520个float32字段全部逐位一致**。实现仍读取独立捕获的拉伸表和注册表常数，并显式调用平台数学依赖；拉伸表生产者`326fe0`尚未移植，不能把本轮称作全部调律由存档独立生成。

## 三个独立观察点

- `8a3c60`：最终频率与刚度完成，315条记录，105个音高各3次，重复值一致。该点G是x8−18，不能将x20当作G；此时x20已经重新赋为stride1248。
- `9626b4`：每行拉伸后、整体参考音校正之前，315条记录；G=x23−5c。保留tuning+298的128项拉伸表，以及实际d8 pitchScale=1、d9 referenceNote=69。
- `4c3898`：注册表double乘数返回之后、参考音校正之前，3条记录。实际targetHz=440、anchorHz=`439.9999694824219`、registryMultiplier=1。

每轮一个固定硬件点。三个程序均正常退出，48kHz、24-bit、双声道113152帧，PCM SHA-256均为`1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`，与相同FXP/MIDI原版逐字节一致。这是对应采集的非扰动证据；没有声称新JS已输出同样的整段音频。

stretched点的G+28/G+40/G+78可能尚未构造，本轮不把这些临时内容作为最终值。最终刚度仅由另一个final点验证。

## 具体计算及精度

`4a0538`消费预设A318中的音律定义。当前模块明确只支持已经验证的默认十二平均律：12个100cent步进、默认MIDI映射、基准键60和参考键69；不支持的映射会失败。它没有将A4直接设成440，也没有用一个double的等分律公式代替原步骤：

```text
root = f32(referenceHz * exp2f(f32(referenceCents / -1200)))
G58  = f32(root * exp2f(f32(noteCents / 1200)))
```

此次A4的G58实际是`439.9999694824219`。这来自两次系统float exp2与float乘法，原版之后还有拉伸和参考音校正，所以最终G78又不同。

`96251c`的拉伸消费按以下次序进行，其中T是明确注入的已生成拉伸表，n为noteIndex，p为float音高：

```text
delta = f32(f32(p-f32(n))/12)
num   = f32(f32(f32(T[n])*exp2f(delta))*registryPitchScale)
den   = f32(exp2((double(p)-referenceNote)/12)*double(modelReferenceHz))
factor = f32(num/den)
stretched = f32(G58*factor)
```

`962670..96267c`先做float乘法、再转double乘注册表比例、再转float；不能交换这几个舍入。基准modelReferenceHz来自B1b34，由`3d311c..3d315c`复制到tuning+20。上式的exp2是double，exp2f是float，两者都保留独立平台调用。

`4c37e0`从实际映射取得参考键。本轮为note69，模块用自己计算出的该键stretched频率作为分母，并与实际s9直接核对；没有把捕获s9直接代入最终计算。比例为：

```text
anchorScale = f32(registryMultiplier * double(f32(targetHz/calculatedAnchorHz)))
```

本次计算比例为`1.0000001192092896`，同时乘到G5c和G60。G60的初值来自`2c3710..2c3740`，用G58除以double等分律参考；并非任意固定成1。

`8a3924..8a3a40`继续在note处求tuning+1f8音高编辑曲线，计算`exp2f(f32(cents/1200))`，再以float乘到G5c，写入G78。`39e8e4`从A3b0拷贝该曲线，模型有多分支时还可能有额外编辑；本轮只使用与实际完整曲线逐元素相同的A3b0。ageing不为0时模块拒绝，不把随机失谐默认为关闭。

A4的最终G78为`440.0000305175781`；note70最终为`466.20086669921875`。这些数值是公式的实际对照，不是嵌入模块的目标常量。

## 重放范围与下游接入

重放器检查音高范围、完整有序遍历、各阶段输入、曲线绑定与注册表常数。所有105个音高的G58、G5c、G60、G78、G80，以及拉伸阶段频率、比例和初始参考比值，共2520个float都逐位一致。保留全部不同项，缺失遍历不能通过；删除一条记录的负例已明确exit1，不生成成功报告。280个不同平台数学请求均保存输入输出位。

```sh
clang -O0 -Wall -Wextra scripts/pianoteq_system_math_oracle.c -o /tmp/piano-pass17-math-oracle
node scripts/pianoteq_replay_tuning.mjs \
  "$HOME/.local/share/just-piano-analysis/base-model-full-values-pass13.json" \
  "$HOME/.local/share/just-piano-analysis/dry-full-fxp-pass13.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass17-tuning/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass17-stretched/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass17-anchor/runtime.json" \
  /tmp/piano-pass17-math-oracle /tmp/tuning-report.json
```

`pianoteq_replay_coupling_inputs.mjs`新增配套选项：`--source-controls-report`读取[刚度、偏移和spread计算报告](pianoteq-source-controls-pass17.md)，`--tuning-report`读取本报告。验证后用预测G28/G78/G148、G40/G120及分量比例代替原捕获值继续算四参数；捕获值仅对照。A4的144个四参数及note70的140个四参数仍全同。A4后续72个原始p/q、72个扰动后p/q及108个频率/衰减继续逐位一致。lambda的另一条准备重放仍使用此前明确记录的G/cache输入，不将局部替换写成所有源字段均已从存档消除。

仍缺拉伸表`326fe0`的完整算法、系统数学的浏览器移植、非默认音律/MIDI映射、非零ageing、全部模型及最终声部PCM。网页仍使用旧独立引擎。

## 静态证据

同一ARM64 SHA `8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`，REA与原ARM指令共同核对：

本轮已导出`pass17-evidence-bundle.json`及`pass17-snapshot.json`（204条保留记录），正常关闭原生分析会话；计数不是覆盖率。原安装程序SHA保持不变。三个采集目录及失败负例、重放报告均有本机SHA清单保留。

- `4a0538`：`ev_d52b66c41477d1a2d68779af244f785ad76438e5ca7cc6f739550597f395cdb7`。
- `2c35c8/96251c`：`ev_cd607bab2f2d8da6cdc6fac7ea4d6d51e2ea0ea0daedd29016ebb5d2a0091687`。
- `5146b0/4c37e0/8a3650`：`ev_dcd3eb01fd39fae0d085e9ea2efcb73a99891142e23ddbb3323efde893b64a30`。
- `3d2f7c`：`ev_5ff3429964ab11892f6ac5cc2c83bbcc4d0c9e75d55b0cb0f22f8866e1312e25`。
- `39e8e4`：`ev_53610bab866481d06fe93cee6e75b599d695223b3734ce96b1d47399c304de97`。
- 尚未移植的`326fe0`已保留：`ev_8e68e2673db246dc6686204e9b6cc9b9ba63480c5af2f9c6f8973052778dd476`。反编译完成不等于算法实现或音频验证完成。
