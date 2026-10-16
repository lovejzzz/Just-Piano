# 自算位置权重、初始半径与最终P/Q：pass92

本轮把pass91原始P/Q继续接入位置权重、能量归一化、半径、衰减后的Q及递推系数A/B。正式同次捕获五个声部、952个初始化lane，**27944项检查零差异，90项负对照拒绝**。没有独立完整WAV或网页声音等价结论。

## 同次采集

`pianoteq_capture_release_final_initial_chain.py`保留六个固定硬件点，将原始初值8634d8替换为最终初始化864d28。其余仍为击键前、两路权重、释放系数、包络和复制事件。只采集initial_flag=1、sample_counter=0的已登记声部，按modal=voice+168和epoch精确绑定。

正式A进程38455正常exit0：5击键、10权重、5最终初始化、121系数（117活动）、3350连续包络块、3301复制，errors/pending/重复返回均为0。六点最终均为hardware并关闭，只有既有受限普通Continue，无目标写入或内部调用注入。

## 本机向量余弦

新增`dsp/native-vector-cos.mjs`，按macOS 25F80 ARM64的`_simd_cos_f4`指令还原两个分支。整组四lane都不超过阈值时走float范围约减与多项式；任一lane超限，整组使用256个double系数的指数表、double FMA与float多项式。不能将每个lane单独选分支，也不能用Math.cos或已有模态三角helper替代。

扩展独立系统库oracle，新增cos4并保留exp4接口。`pianoteq_verify_vector_cos.mjs`验证30285组、121140个结果：120958项逐位同、182项NaN语义同，零差异；含21298快分支组、8987慢分支组，以及本次活动位置分支的190组真实参数。Math.cos候选有33503项差异。另8个exp4结果回归通过。

这不是float32全集穷举，不比较NaN payload、errno或异常标志。动态库指令/表只通过自己的独立helper读取；没有在Pianoteq注入函数调用。只读观察helper曾因启动期间排队的无效文本正常返回exit2，保留记录；正式批量系统数学oracle独立运行exit0，不将前者当作数学对照成功。

## 权重公式与索引storage

新增`dsp/modal-position-weights.mjs`计算当前position>=.125、无需额外曲线的分支：

```text
angleScale = float32((double(position) * double(2π)) / double(referenceFrequency))
rolloffScale = float32(-1 / rolloff)
weight = float32((0 - vcosf(float32(frequency * angleScale)))
                 * vexpf(float32(frequency * rolloffScale)))
最后按float索引 <= float32(cutoffIndex - 1)作位掩码
```

最初错误地在angleScale中提前做float32乘除，产生172项失败；改为原指令的double顺序后剩71项失败。这些报告保留，没有放宽容差。

进一步查明两个遗漏：839c04只在组间填1e6索引哨兵；末尾调用195570把最终逻辑长度到四lane尾部清零。因此末尾padding的索引0可以通过权重掩码，即使其频率、振幅和能量均为0，其权重仍可为-0.9999999403953552。组间padding则被清为+0。新`selectVoiceModes.indexStorage`保留这两种不同的存储语义，原indices仍供有效lane收集使用。

同时，gain和extraGain均为0的初始分支不会调用位置权重函数；其初始清零storage必须保留，不能无条件计算。本窗口第五个声部就是该分支。上述两点修复后，952个位置权重全部逐位吻合，末尾padding的半径/A/B差异也消失。

参考频率由自己的合并表referenceRow*columns取得（4174f4），cutoffIndex来自自己的合并表头lower（43dcb0配置复制）。原生这两个字段仅比较，不反馈。position和rolloff仍观察。

## 自算最终初值

`pianoteq_replay_release_final_initial_chain.mjs`复用同次连续包络、复制、旧release与支持历史生成再击；随后两路激励/后处理/合并/相位、随机推进、筛选及映射均自算。每个四lane组先由自己的振幅/相位/F/J产生原始P/Q、能量、S/K/inverse。

以自算释放率与增益替换原生7e4/7b0输入。用自己的映射decay、能量、K和位置权重，调用`refreshDampedModes`生成归一化、有效衰减、半径和A/B，随后执行Q=rawQ*radius。原生R、P/Q、能量、权重、归一化和A/B只作目标。

27924项float32及20项随机uint32检查零差异，包括全部952个P、Q、R及各952个A/B；238组中912lane走成对八lane路径、40lane走外部四lane指数路径。输出`initialPredictions`保存自己的最终状态，供后续连续计算接续。

当前releaseShape=1、extraGain=0；其它频率形状与额外增益分支仍拒绝。音高、比例、时间步、decay scale、块长度/因子和部分上游模型字段仍观察。没有把本轮描述为无观察依赖的完整声部。

## 90项负对照与传播

通过基准后，90项扰动均拒绝。单独改动位置权重目标只增加一处差异，不传播到自己的R/Q。单独改动原生gain、release或归一化目标也只触发对应对照，不改变自己的计算。

- 位置源扰动改变26个权重和归一化，继续改变178个Q、181个半径及A/B、184个有效衰减。
- rolloff源扰动改变26个权重、184个有效衰减、34个半径和24个Q。
- merge primaryGain源扰动改变30个P/energy；通过能量归一化继续改变37个Q、184个有效衰减和8个半径。
- 高档Rattle源改为0经连续释放和再击传播到各183个P/Q/energy。
- 缺失/重复lane、错误group/owner、非初始标记、非零年龄、错误input mode、随机来源、计数和不完整窗口均拒绝。

旧四声部筛选/映射回归也通过。没有拿局部目标回填自己的状态。

## 实际音频仍失败

正式A原生WAV与同配置原版参考均为148224帧、双声道24-bit/48kHz，完整PCM比较失败：126888个交错采样不同，最大整数差15，首差frame13036，归一化RMS差2.3705519522028756e-7。PCM SHA256为a1993517b409c9784d78b5b97f5c065b448506537226b3712122ed12b8c6fd5f。

这仍是原生输出，不是JS独立WAV。下一步是将自己的最终初值接入完整连续声部输出、控制更新、音板及立体声；完整接触力、弦反馈、制音毡和全部预设仍未闭合。double pow仍为显式候选，预加权源/模型初始化/部分控制与首次seed仍有观察输入。网页音源未替换，未进行最终合并或Pages发布。

REA新增两份工作流证据：ev_899f47afd6a4886e27931cd4efb7100818ad0f0cff822b83e21d40cce053c464（分配、筛选、权重），ev_3eec46a28d1f52df295771bbd5faf60144a829a42b31250f6bf54b33e9d88d85（索引尾部与参考频率）；并逐条核对原ARM64指令。导出共353条记录。私有pass92-*保留全部源证据、失败报告、正式捕获、系统数学oracle、负对照及WAV审计。商业模型、WAV和反编译全文不入库。
