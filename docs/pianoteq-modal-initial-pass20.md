# 幅度/相位到动态P/Q与连续分组输出：pass20

新增`dsp/modal-initial.mjs`与`dsp/neon-reciprocal.mjs`，将此前静态推导的初始振荡状态和改频投影变成无系统数学oracle的浏览器计算。真实对照覆盖184个初始分量、8个连续64sample块与7次频率刷新，**33690个float全部逐位一致**。三个分组的完整输出合计1536个样本（每组512），不是把部分16lane组输出当作整个声音。

输入仍包含实际激励后的幅度、相位、频率、J、衰减以及块间控制轨迹。最终立体声、其它模型/预设、完整声板/效果与接触力均未由本阶段证明。

## 同次初值捕获

`pianoteq_capture_modal_initial.py`的initial阶段仅一个固定硬件点`8634d8`：当前四lane初始P/Q已写入，原幅度还未被R覆盖。保存theta、phi、两组sin/cos及幅度、P/Q、能量、S/K/正弦倒数。46条四lane记录覆盖同一V的184项，包括原分组中的3个padding。

同脚本final阶段另一次运行，固定点`864d28`在初始标志清除前保存阻尼后P/Q、R、A/B与组布局。仅保留initial_flag=1的一条184lane记录。原生capture不修改寄存器、内存、许可或代码。原安装应用不变。

## 可执行初值

每组的相位步长为以下float次序，其中tauFloat的位型为`40c90fdb`：

```text
step = f32(f32(timestep * tauFloat) * pitch)
theta[i] = f32(fma32(J[i], f32(adjustmentRatio−1), F[i]) * step)
P[i] = f32(amplitude[i] * sinApprox(phi[i]))
Qpre[i] = f32(amplitude[i] *
             fma32(sinApprox(phi[i]), cosApprox(theta[i]),
                   f32(cosApprox(phi[i]) * sinApprox(theta[i]))))
energy[i] = f32(amplitude[i] * amplitude[i])
Q[i] = f32(Qpre[i] * R[i])
```

三角近似来自[已逐位验证的1d0364](pianoteq-native-modal-trig-pass20.md)，不是Math.sin/cos。正弦S直接保存，余弦绝对值小于等于`floatBits(3089705f)`时替换成正门限K；正弦倒数针对`f32(S+floatBits(2edbe6ff))`执行一轮ARM倒数估计校正，不能替换成普通除法。

`initialModalRadii`复用已恢复衰减算术：实际本阶段positionGain/extraGain=0、releaseShape=1，baseDecay按float FMA计算。每个八lane前缀统一选择smallExp或expPolynomial，剩下的四lane尾则使用nativeVectorExpLane。随后从R/K计算A=−R²与B=2KR。184个实际R及A/B均对照；R不取捕获值代入P/Q或渲染。

## ARM倒数的独立验证

`neonReciprocalEstimateNormal`实现普通8bit FRECPE seed的整数分桶，`neonReciprocalNormal`接着执行`f32(seed*fma32(−input,seed,2))`，对应FRECPS再FMUL。支持有限normal输入、normal seed；明确拒绝其它指数域，未声称实现所有NaN/次正规/溢出或FPCR.AH高精度变体。

分桶规则交叉参照[QEMU的ARM指令实现](https://raw.githubusercontent.com/qemu/qemu/master/target/arm/tcg/vfp_helper.c)中`recip_estimate`与`call_recip_estimate`：取尾数高8bit形成256..511的索引，用整数除法得到8bit倒数估计，再调整指数与符号。这里没有导入QEMU源码；新C oracle直接执行ARM NEON指令，与本JS独立。

`pianoteq_neon_reciprocal_oracle.c`不含目标程序代码或数据。从11个指数、全部256桶及各桶首项/次项/末项、正负两种符号生成16896个输入；seed和一次校正共33792个输出全逐位相同。实际184个sinInverse也全部一致。这是明确采样的硬件验证，不是穷举binary32。

```sh
clang -O0 -Wall -Wextra scripts/pianoteq_neon_reciprocal_oracle.c -o /tmp/piano-reciprocal-oracle
node scripts/pianoteq_verify_neon_reciprocal.mjs /tmp/piano-reciprocal-oracle /tmp/reciprocal-report.json
```

## 块间频率投影：失败与修正

首块16lane加尾部重放先得到6226float全同。但直接保持初始系数持续渲染8块，第二块就失败，保存`initial-continuous-replay.json`，共11805处位差。这个失败没有删除，也没有把容差改大。

真实控制记录显示pitch从`1.0001599788665771`逐块变为`1.0001521110534668`。原`863008`检测pitch或adjustmentRatio变动时，使用旧R/K/inverse及新S/K投影P，Q保持不变。`projectModalHistory`按`863770..37a8`执行：

```text
d = fma32(−Kold, Qold, f32(Rold*Pold))
u = f32(inverseOld*d)
v = fma32(Qold, Knew, f32(Snew*u))
Pnew = f32(neonReciprocalNormal(Rold)*v)
Qnew = Qold
```

之后才重新生成R与A/B。不能把投影式中的Rold换成Rnew，不能交换独立乘法与FMA，也不能在非初次刷新重新乘Q。输入控制轨迹由真实held系数快照提供；投影后的状态、S/K/inverse、R、A/B只作比较目标，计算从自己的前块末态继续。

加入准确投影后，同一个8块测试**33690个float全部逐位一致**，包含7次频率刷新和三个完整缓冲的1536个输出值。没有使用捕获的P/Q重置自己的状态。J的实际值为0，非零J及更大改频仍需实际覆盖。

## 八lane尾部及缓冲闭合

原函数余下一个四lane组时仍读取八lane，因此新增[renderEight](pianoteq-eight-lane-tail-pass20.md)。独立固定点`7c0ec4`保存16次尾部的实际before/after状态与after输出。已核对两组额外四lane的P/Q/A/B确实为0，而非先假定padding永远为0。

每块从零输出开始，先用计算状态执行11次16lane内核，再执行两次8lane尾部。按原顺序累加；中间输出、最终输出和末态均逐位比较。原始pass9内核捕获与新tail捕获属于同输入不同运行，没有伪称它们是同次联合快照。

## 音频与重放

initial、final、tail三个采集均正常exit0，errors为空；48kHz、24-bit、双声道113152帧PCM都与原版基准逐字节相同，SHA256为`1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`。这是采集非扰动证据，新增JS只比较上述内部缓冲，尚未产生相同的整段立体声WAV。

```sh
node scripts/pianoteq_replay_modal_initial.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass20-modal-initial/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass20-modal-final/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass11-coefficients-v3/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass9-recurrence-v2/runtime.json" \
  /tmp/modal-initial-report.json \
  --tail-capture "$HOME/.local/share/just-piano-analysis/debug-pass20-modal-tail/runtime.json"
```

报告`initial-final-replay.json`保留全部检查及三个计算输出数组，未将私有模型或捕获提交到Git。任一位差返回非零；三角阶段的单ULP负例另行保留。

## 证据及剩余工作

1d0364的REA记录`ev_8f5dea5ce56e78d849daf824d32f675cd6273f7fbcf38a81f4195aebdba65bbb`；7c0bcc记录`ev_4bb9816b5c87b861661f98a879f02cc4ce5990a45415ebc981eb73dd700aa688`。863008调用方复用`pass2-coefficient-refresh.txt`与完整ARM指令；证据没有依赖函数名称作物理定名。本轮REA bundle/snapshot保留210条记录后正常关闭。

初始化、动态投影、R和无输入渲染已有此配置的数值闭环；初始激励表、动态控制生产、带输入路径、门限淘汰/重排、制音释放全轨迹、声板/麦克风/效果、全部模型与预设仍需接入和验证。该投影是旧振荡状态参与新状态计算的实际反馈，但不能把它改名为已经恢复全部琴槌接触力。网页仍使用旧独立引擎，完整复刻目标未完成。
