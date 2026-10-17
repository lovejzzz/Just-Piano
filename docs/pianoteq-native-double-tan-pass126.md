# 耦合中的 double tan（pass126）

2026-10-17。本轮推进独立数学计算，没有新的 Pianoteq 捕获或完整声音等价结果。

## 实现

`dsp/native-double-tan.mjs` 按本机 ARM64 libsystem_m 的 tan 指令顺序实现：小角度正弦/余弦多项式比值、中范围分段 π/2 缩减、全有限 double 大数的 64 位整数乘法缩减、象限/符号选择及返回除法。用 BigInt 模拟整数高位乘法、进位、补码和 SIMD 整数位操作；FMA 复用自身实现。没有调用 Math.tan 或通过 log/exp 间接近似。

来源为普通独立探针读取自己加载的系统库，无 Pianoteq 附加、写代码/寄存器或保护绕过。私有 `pass126-double-tan/extraction.json` 保存代码、前缀和探针源码摘要；原始系统代码不提交。多项式相对 tan 的偏移为 0x1e8 / 0x2f8，整数缩减 19 个数学 limb 位于 -0x518..-0x488，范围常数位于 -0x480 起。

## 独立数学验证

普通 C 系统 tan 程序逐项返回 IEEE 字，不运行目标代码。`pianoteq_verify_double_tan.mjs` 使用 seed 126 原始 IEEE 输入，以及既有耦合回放实际生成的全部 26 个 tan 输入。

`pass126-double-tan/validation-a/report.json`：**128894 项、0 差异**。其中非 NaN 逐位比较，16 项 NaN 仅验证语义，未主张 payload 或异常标志一致。Math.tan 候选有 40653 个结果位差。

| 输入组 | 数量 |
| --- | ---: |
| 已有回放 tan 参数 | 26 |
| 普通角度 | 20000 |
| 中范围角度 | 20000 |
| 随机 IEEE | 30000 |
| 正负次正规数 | 10000 |
| π/4、π/2、π 与中/大范围边界附近 | 32776 |
| 大数每个二进制指数 19..1023、正负符号 | 16080 |
| 特殊值 | 12 |

这不是全 IEEE 穷举，也不等同新增全键盘、力度或预设覆盖。输入 SHA256 为 `e381007efae57f54405525e4cca9bf0efb2fabab404f2515b49619068b289deb`，系统输出为 `fd6f8c8c7019795ed3b8b6f9948d9da46a5531245b59c4e1550b1b5f06ed5c8c`。

## 接回耦合

耦合回放新增显式 `--native-double-tan`，报告记录原生 tan 模式及其实际计算的唯一调用。`pianoteq_test_impedance_native_math.mjs --with-tan` 保留旧默认模式，并增加新模式验证。

`pass126-native-tan-guard/baseline/report.json`：36 行、72 个原始 p/q、72 个 jitter p/q 无差异；唯一外部数学调用从 53 降至 **27**（26 个 sincos、1 个 pow）。自身计算共 149 个唯一数学调用，其中 tan 26 个。

包装器禁止外部 exp/log/log2f/tan 后基线仍通过；分别省略四个原生选项都确实失败，无完整报告；翻转一个比较目标末位恰有一项失败，自身预测保持不变。共五项反向测试通过，原始输入摘要未改变。

`pass126-native-tan-poles-report.json`：接上自算耦合后，108 个频率、108 个衰减、108 个 lambda、36 个中心仍与既有记录吻合。求根仍为独立 Durand–Kerner，不是原生 QR 移植。`npm test` 通过，含独立系统合成 fixture、大数、符号零及特殊值测试。

## 未完成项

历史数据不是新同次完整声部证明，sincos/pow、部分模型与观察输入仍保留。完整琴槌接触力、弦反馈和制音毡耦合尚未闭合；本轮没有新的实际 WAV 或网页声音验证。原 pass121 E 的 LLDB/目标/debugserver 已确认仍存活，目标还停在启动阶段；未重复启动或编辑冻结的采集依赖。完整声音仍不通过，不合并、不部署。
