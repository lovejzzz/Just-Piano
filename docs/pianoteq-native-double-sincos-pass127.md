# 耦合中的 double sincos（pass127）

2026-10-17。本轮没有新的 Pianoteq 动态捕获或完整声音等价结果。

## 指令实现

`dsp/native-double-sincos.mjs` 实现本机 ARM64 libsystem_m `__sincos_stret` 的有限 double 计算路径。与 tan 共用的数学缩减表和多项式已逐字确认相同，但求值顺序不同，不能复用 tan 的分子/分母作为 sincos 返回值。

中范围保留 head/tail 补偿缩减：正弦先 FMA 加 tail 再加 head；余弦平方使用 `FMA(head,head,2*(head*tail))`。大数先用整数 limb、高位乘法、进位及补码确定象限；正弦按乘积高/低位分别生成 head/tail，余弦使用整数乘积的高位平方及指数位调整。没有调用 Math.sin/Math.cos，也没有把原生返回值作计算输入。

普通独立探针读取自己加载的系统库，无 Pianoteq 附加、代码/寄存器写入或保护绕过。私有 `pass127-double-sincos/extraction.json` 保存代码、前缀和探针源码摘要。多项式偏移 0x388 / 0x498，19 个缩减 limb 位于 -0x378 起，范围常数位于 -0x2e0 起。原始系统代码不提交。

## 系统对照

`pianoteq_verify_double_sincos.mjs` 复用 pass126 seed 126 保存的原始 IEEE 合成输入，替换为本轮既有耦合回放的 26 个 sincos 调用作为真实输入组；合成输入文件摘要同时保存。独立普通 C 进程调用系统 __sincos 返回两个 IEEE 字。

`pass127-double-sincos/validation-a/report.json`：**128894 个输入、257788 个结果、0 差异**。非 NaN 逐位比较，32 项 NaN 仅语义，不主张 payload 或异常标志一致。Math.sin/Math.cos 候选共 10374 个返回值位差。

| 输入组 | 输入数 | 返回值检查数 |
| --- | ---: | ---: |
| 已有回放 sincos 参数 | 26 | 52 |
| 普通角度 | 20000 | 40000 |
| 中范围角度 | 20000 | 40000 |
| 随机 IEEE | 30000 | 60000 |
| 正负次正规数 | 10000 | 20000 |
| 缩减边界附近 | 32776 | 65552 |
| 大数每个二进制指数 19..1023、正负符号 | 16080 | 32160 |
| 特殊值 | 12 | 24 |

不是全 IEEE 穷举，也不是新的钢琴音符或预设覆盖。输入 SHA256：`e381007efae57f54405525e4cca9bf0efb2fabab404f2515b49619068b289deb`；系统输出：`5d76a2e590b6e4f591efb81be34ae1053c75f7b10220569f09b44e970eb1b111`。

## 接回耦合及限制

`pianoteq_replay_impedance.mjs --native-double-sincos` 保存自算 sin/cos 两个结果，保持非原生模式可显式复查。`pianoteq_test_impedance_native_math.mjs --with-tan --with-sincos`：外部包装器拒绝 exp/log/log2f/tan/sincos 后基线通过；分别缺少五个选项时确实失败，无完整报告；扰动单个比较目标恰好一项失败，自算预测全不变。六项反向检查通过，原始输入摘要未改变。

`pass127-native-sincos-guard/baseline/report.json`：36 行、72 个 p/q、72 个 jitter p/q 全同；自算唯一数学调用 175 项，外部调用从 27 降至 1（当前捕获的 `pow(0,0.25)`）。没有把这一特殊输入当作一般 pow 实现。

`pass127-native-sincos-poles-report.json`：108 个频率、108 个衰减、108 个 lambda、36 个中心保持一致；求根仍为独立 Durand–Kerner，非原生 QR 移植。`npm test` 通过，包含独立系统输出的合成 fixture 和特殊值测试。

历史运行没有拼作新的同次全链证明；模型与其他观察输入、完整琴槌接触力/弦反馈/制音毡耦合及最终网页音频仍未闭合。原 pass121 E 三个进程仍存活，目标停在启动阶段；系统仍报告 Developer mode disabled，未证明其为根因。未重复启动或编辑冻结采集依赖。完整目标未通过，不合并、不发布。
