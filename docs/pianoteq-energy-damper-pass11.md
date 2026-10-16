# 第十一轮：制音位置、模态能量补偿与实际递推系数闭合

本轮使用一个固定硬件点 `100864d28`，在刷新系数后的同一次调用取得模态衰减、位置权重、能量样数组、补偿值、R/K以及A/B。最终采集48组，含8组持键、40组释放，覆盖8,263个有效lane。结合第十二轮恢复的系统数学依赖，**所有已记录的有效衰减输入、R、A/B及全局补偿均逐位重建**。

这恢复了一条真实跨模态反馈：多个模态的能量样量共同决定全局制音补偿，该补偿再影响所有模态的递推系数。它仍不是已证明的琴槌压缩／毡质量／瞬时接触力积分，也不是完整网页音色复刻。

## 实际计算

在本次 `O.e0=0`、`O.f0=0`、`V7ec=1`、`V7e0=0` 的普通分支，令 `fl`为float32舍入、`fma`为float32单次舍入乘加：

```text
s = fl(max(1,V780)*V7f8)
d_i = fma(modal_decay_i,s,V7e4)
g = V7b0
w_i = V788_array[i]
E_i = V188_array[i]
t = fl(fl(fl(-2*tau)*block_length)*block_factor)
A0 = sum_i E_i * exp_native(t*d_i)
A1 = sum_i E_i * exp_native(t*fma(g,w_i,d_i))
c = fl(-logf(fl(A0/A1)) / fl(fl(fl(tau+tau)*block_length)*block_factor))
effective_decay_i = fl(d_i + fma(g,w_i,c))
R_i = exp_native(fl(-tau*effective_decay_i))
A_i = fl(-R_i*R_i)
B_i = fl(fl(K_i+K_i)*R_i)
```

当g=0时跳过上述补偿；当A0不大于double `1e−20`时补偿为0。求和不是普通double sum：按四lane分组使用FMA累加，再先加lane0/2、lane1/3，最后相加，保留padding。原代码还存在 `V7e0!=0` 的第二权重和 `V7ec!=1` 的频率选择分支，本次没有覆盖，重放器明确拒绝。

输入E是原程序缓存的能量样量，不在此报告强命名为SI能量。此前已恢复由两帧状态形成的二次型，但本次采集在系数刷新之后，不能用此时的P/Q冒充刷新前的E生产过程；本轮数值验证以实际E作为输入。

实际首个释放例中，基础衰减为 `2.721482038497925`，pitch为 `1.0001081228256226`，释放率 `0.07408920675516129`，位置增益 `0.8874121904373169`，该lane位置权重 `−0.20903430879116058`，全局补偿 `−0.12497011572122574`。最终有效衰减为 `2.485395908355713`。忽略位置权重和全局补偿，简单相加会得到约 `2.7958655`，确实不符。

## 原生指数并不只有一种实现

刷新R时，成对的两组四lane若所有指数绝对值不大于float32(0.15)，使用四阶FMA多项式：

```text
exp_small(x)=fma(x,fma(x,fma(x,fma(x,C4,C3),C2),1),1)
C2 bits=3efffff7, C3 bits=3e2ad818, C4 bits=3d2ad84f
```

超出范围的八lane调用内部 `1009a3048`：先clamp到约±88.376，再floor范围约减、FMA多项式和指数位缩放。末尾单独四lane则调用外部`vexpf`，后者是另一套算法，不能用内部八lane函数替代。`dsp/modal-coefficients.mjs`保留这一区别；外部四lane及logf的精确依赖实现见[第十二轮](pianoteq-native-math-pass12.md)。

最初用`Math.exp`/`Math.log`时，120个四lane尾值中23个R不符、48个补偿中3个不符。随后直接用系统C logf检查40个实际比值，补偿全部吻合，限定了这3个误差的来源。恢复相应数学依赖后，所有差异消失，没有放宽误差标准。

## JavaScript重放结果

`scripts/pianoteq_replay_coefficients.mjs`使用同一捕获输入，结果：

| 项目 | 个数 | 位差 |
|---|---:|---:|
| 有效衰减，使用实际捕获c | 8263 | 0 |
| 从全部E/位置权重独立计算c | 48 | 0 |
| 成对八lane路径R | 8143 | 0 |
| 外部四lane尾R | 120 | 0 |
| A/B，使用实际R/K | 16526 | 0 |

持键和释放的所有有效lane纳入检查；padding用于全局求和，但没有拿未使用的系数槽凑有效lane计数。尚未产生每个预设下的F、K、E和权重输入；这些仍来自真实观察，因此本轮不是完整模型生成的验证。

## 音频与补充指数实验的失败边界

三个系数捕获版本都使用相同干声FXP和短A4/力度96 MIDI，正常exit0，最终PCM与官方原版逐字节相同：

`1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`

另以较短Damping Duration预设触发内部八lane指数helper：128组、1,024个真实输出全部被JavaScript逐位重建，输入范围 `−0.38847729563713074..−0.1949712038040161`。这是该helper的直接运行验证；正常干声实验没有命中该helper的空记录亦保留。

**该补充指数捕获的最终PCM未通过相同性检查。** 官方重复和无断点调试副本相同，但带断点捕获从第4705帧不同，差值RMS `0.00023436012194692727`、峰值 `0.007555603981018066`。原因未确定，不能把它称为无扰动音频。此失败与前述系数采集自身通过PCM检查的结果分别保留，没有互相替代。

## 复现与证据

```sh
node scripts/pianoteq_replay_coefficients.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass11-coefficients-v3/runtime.json" \
  /tmp/pianoteq-coefficients.json
```

采集脚本为 `scripts/pianoteq_capture_coefficients.py`、`scripts/pianoteq_capture_exp8.py`，均先校验准确代码SHA，使用用户授权的独立副本、一个固定硬件点，只读程序状态。没有使用Pedalboard、软件断点、寄存器写入或修改原版应用。

原始目录：`debug-pass11-coefficients`、`debug-pass11-coefficients-v2`、`debug-pass11-coefficients-v3`、`debug-pass11-exp8`、`debug-pass11-exp8-release`，均在本机研究根目录。日志、真实JSON、WAV、音频对照、数学负对照和哈希独立保留。原始内存表、二进制和商业预设资源不放入公开仓库。
