# double pow 与无外部数学的耦合回放（pass128）

2026-10-17。本轮没有新的 Pianoteq 捕获或完整音频等价结果。

## 实现与独立系统对照

新增 `dsp/native-double-pow.mjs`，按本机 ARM64 libsystem_m pow 指令顺序实现补偿 log2、高低项与指数相乘、分表指数重建及两段缩放舍入；包括次正规底数、2 的幂、负底数整数幂、符号零、无穷、NaN 语义和范围边界。没有 Math.pow 默认回退，也没有将一般幂替换成直接乘法或 exp(y*log(x))。

普通自进程探针读取自己加载的系统库，无 Pianoteq 附加或代码/寄存器写入。私有 `pass128-double-pow/extraction.json` 保存代码/数学表/探针源码摘要。log 系数 11 个，129 条记录位于 pow+0x2b870（每条压缩 inverse/低 log 与高 log）；exp 系数 5 个，128 对数学表位于 pow+0x2c0b0。原始系统代码不提交。

`pianoteq_verify_double_pow.mjs` seed 128，与普通独立 C 系统 pow 核对：**151800 项、0 差异**，其中 5405 项 NaN 仅语义，不主张 payload/异常标志一致。Math.pow 候选有 6 个返回值位差，包括原生特殊值语义；不据此宣称普遍误差率。

| 输入组 | 检查数 |
| --- | ---: |
| 既有耦合参数 | 1 |
| 随机 IEEE 参数对 | 20000 |
| 普通正底数/正负指数 | 20000 |
| 正 IEEE 底数四次方根 | 20000 |
| float32 底数立方 | 20000 |
| 负底数整数幂 | 10000 |
| 次正规底数 | 10000 |
| 1 附近及大正负指数 | 32772 |
| 2 的幂底数 | 8392 |
| 特殊值组合 | 390 |
| 溢出/次正规边界附近 | 10245 |

私有 `pass128-double-pow/validation-a` 保存完整原始输入和系统结果。输入 SHA256：`9f16bdb52221c54ece75c9da64e4d21c045ac03ed698afdc18a30b1df4289d80`；输出：`d490814c9df380008fea2c09b58325bc56d4af8062ab741399517fc4ba3f18eb`。不是全 IEEE 穷举或新钢琴覆盖。

## 耦合全数学自算

`pianoteq_replay_impedance.mjs --native-double-pow` 可与已有五个原生数学选项组合。新模式实际调用自身通用 pow，未把捕获中的 pow(0,.25) 当常量返回捷径。报告 `platformTranscendentalOracleRequired` 按实际外部调用数生成；极点报告继续区分计算依赖与 powf 结果的独立比较用途。

`pass128-native-pow-guard/baseline/report.json`：36 行、72 个原始 p/q、72 个 jitter p/q 全同。176 个唯一数学调用全部自算，外部调用 **1→0**。包装器拒绝全部六种外部数学运算后基线仍通过；分别省略六个选项时失败，无完整报告；翻转一个比较目标末位恰有一项不匹配，自身预测不变。七项反向检查通过，原始输入摘要保持一致。

`pass128-native-pow-poles-report.json`：108 个频率、108 个衰减、108 个 lambda、36 个中心全同，耦合数学不再依赖外部 oracle。求根仍为独立 Durand–Kerner，非原生 QR 移植；powf 独立对照仍明确为比较用途，模型及其它观察来源没有消失。

## 释放/重击激励接入

`pianoteq_replay_release_merged_chain.mjs --native-double-pow` 新增自算模式，保留显式旧候选模式。私有 `pass128-native-pow-merged-report.json` 重放既有 pass89 同次记录，18279 项零差异，包括最终 frequency/decay/amplitude/phase 四表各 915 值。五次速度立方由新模块生成。

`pianoteq_test_merged_native_pow.mjs` 禁止全局 Math.pow 后自算基线仍通过，五次实际计算参数再次由独立 C pow 核对逐位同。旧候选模式被拒绝；翻转一个 feedback 比较目标仅一项失败且 pow 预测不变；改变 post amplitudeGain 源后 153 项输出改变。三项反向检查通过，原始捕获摘要未改变。

## 验证边界

`npm test` 通过，新增独立系统合成 fixture、负底数、符号零及次正规舍入检查。本轮历史耦合和历史激励捕获未拼作新的同次完整声部证据；没有新实际 WAV、全预设或网页等价结果。完整琴槌接触力/弦反作用/制音毡耦合，以及模型/音频观察输入依赖仍未闭合。

原 pass121 E 的 LLDB/目标/debugserver 本轮已确认仍存活，目标启动挂起无新记录，未重复启动或改冻结采集依赖。完整目标仍未达成，不合并、不发布。
