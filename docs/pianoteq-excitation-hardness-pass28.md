# 硬度插值到激励谱标量：pass28

本轮实现 `692ffc` 在位置修正之后、构建对数激励谱之前的两个硬度标量。输入为五节点硬度曲线、实际力度、两路混合控制及源表参考频率。该步骤不是完整琴槌接触力模型，也还没有接入网页当前使用的独立音源。

## 计算和实测

`dsp/excitation-hardness.mjs` 复现 float32 运算次序。设 `f` 为单精度舍入，两个输入分别为 blendFloor、inputBlend，对应共享系数为 c0、c1：

```
b0 = f(f(1-blendFloor) + f(blendFloor*c0))
b1 = f(f(1-inputBlend) + f(inputBlend*c1))
common = f(min(b0,b1) * f(1 / f(f(u+u)+1)))
primary   = f(common * interpolate(primaryCurve, velocity))
secondary = f(common * interpolate(secondaryCurve, velocity))
referenceFrequency = source.frequency[referenceRow*columns]
```

两个乘法与加法分开舍入，不能合并为 FMA；参考频率取源表指定行的第一列，不是各弦平均频率。`interpolateHardness` 补上低、高端点钳制：低于第一节点返回第一值，高于末节点返回末值。区间内保留原有 FMA 次序。

REA/Ghidra 新增精确指令证据 `ev_87ca66190887cb47122fd29f6e0cd3375ec3905a905b54171f0b359ffa8fffde` 确认 `693e8c` 为两路单精度加法。完整路径同时依据已保留的主激励及硬度插值反编译和 ARM64 指令。

硬件观察点为 `0x100693ff8`。默认 A4、四个音域案例（21/60/72/108）、A4 两个弱音控制案例及新增 MIDI velocity=1，共8次击弦、主次两路16组，三个输出共 **48 个 float32 全部逐位一致**。velocity=1 的实际内部力度为0；最高力度127的内部值为 .9921875，分别覆盖下、上端点。混合控制也覆盖 inputBlend=.8 和 blendFloor=1，并非只有默认近零输入。

默认 A4 的结果为 primary=.8790348172187805、secondary=.7657743692398071；两路参考频率分别为439.72979736328125和439.8615417480469。桥接验证先比较 pass27 自己计算的位置修正后四个源表，再用这些计算结果求参考频率，总计 **438 项全部逐位一致**。其中包含默认标量6项，不能与48项相加当成独立样本。

最初采集把 G+f88 的低32位误记为 randomEnabled，实际上它是配置向量的地址。该错误初次文件保留；正式 v2 及后续采集读取该指针指向的三个随机配置标志，全部为0，主路随机种子指针存在。没有将随机化未经验证地当成关闭。

一单位 float32 人为负例准确报告一处差异、退出码1。所有实际采集均正常 exit0、无读取错误，使用独立已授权调试副本，未使用 Pedalboard。

## 实际音频核查

比较48kHz、24-bit 双声道 PCM 数据，所有正式采集与对应原版渲染一致：

| 案例 | 帧数 | PCM SHA-256 |
|---|---:|---|
| 默认 A4 | 113152 | `1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6` |
| A4 弱音控制两次 | 169216 | `ca3cd2864cc761ef465584244c1ca0e2a7ea985833fc767af88b2bc6ee9f0a67` |
| velocity=1 | 43264 | `003b6e93f315b2e3d70f8e531fef6af8ad33a218706723d39270139de56fc5da` |
| 四音域 | 249856 | `8c098aa4730a8fb78bac70fe0e04c7e2cdd0c49519e629a4bf40fa7fe29061c5` |

velocity=1 和四音域均另开原版进程重新渲染；默认及弱音控制对照沿用已保留的原版输出。这证明本轮采集保持这些原生输出，不代表 JS 整体音频已经等价；此前其它观察点多音案例的一单位差异也没有因此被消除。

## 边界与下一步

本批 u=0、hardnessMode=0、随机配置关闭、repeatFlag=0、direction=0、力度不超过1。非零 u/特殊硬度模式和随机化会明确拒绝。重复击弦分支要求调用者显式提供 cosf；它、非零方向增益、力度大于1以及空表频率回退仅有静态实现，尚未实测。

硬度五节点与共享控制仍来自运行时；源表桥接也继续依赖更上游原生源表。后续还需恢复两个标量如何形成完整谱斜率、额外五个模态及历史状态反馈，才能闭合 `692ffc`。完整琴槌—弦—制音毡耦合、全部预设和网页完整音频等价均未完成。

复验命令（文件含本地商业模型提取数据，保留在私有分析目录，不提交）：

```sh
node scripts/pianoteq_replay_excitation_hardness.mjs "$P/debug-pass28-slopes-v2/runtime.json" "$P/debug-pass28-slopes-v2/position-bridge.json" --position-report "$P/debug-pass27-position-baseline-v2/replay.json"
```
