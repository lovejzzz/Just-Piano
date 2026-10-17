# 独立弦端点的耦合输入（pass151）

2026-10-17。补上独立分量端点进入阻抗计算前的 dB 偏移。新增路径通过独立 C 数值对照，已有联合耦合分支的真实输入回归通过；**没有新增独立弦声部的原生内部轨迹或音轨等价验证**。

## 原始生产步骤

新的 REA/Ghidra 12.1.4 分析正常 exit0，函数 `FUN_1001026dc`。证据 ID `ev_b6766dc3b0d20a0a88d72d0717b280043a66573caedeeef882936219a3402d1d`，私有报告 SHA256 `303f58b17d9c979523a198ebc385a3956a0983126076c5aed90bf30581dbe892`。目标仍为既有只读 ARM64 文件。

ARM 指令和反编译共同确认：

- `102b40..102b78`：cache+248 向量复制到栈上的独立分量系数向量；它对应已解码基础 compound 的第三个 vector。
- `10316c..10318c`：按分量数量调整长度；不足时以最后一项填充，不是用 1 补齐。
- `1031b0`：系数为 float32 常量 10。
- `103300..103310`：读取当前系数，计算 log10f，再单独 float32 乘 10，作为 `194870` 的额外 dB 输入。
- `194c6c..194c9c`：按原 FMA 顺序插值左右音高所选频率曲线，再执行独立 float32 加法合入额外 dB。

因此对独立端点：

```
baseDb = f(10 * native_log10f(f(componentScale[j])))
phaseDb = FMA32(left, f(1-fraction), f(right*fraction))
s3 = f(baseDb + phaseDb)
```

联合端点仍使用 baseDb=0。这里恢复的是缓存系数到 dB 的运算，不把它当成瞬时琴槌/制音毡接触力。

## 代码与验证

`dsp/coupling-inputs.mjs` 新增 `separateComponentExtraDb`，使用已有自算 `nativeScalarLog10f`，没有 JS Math.log10 或外部计算依赖。`couplingArguments` 接受显式 componentPowerScale，并要求独立端点恰含一个分量；零、负数、非有限或缺失系数明确拒绝。其余三个输入沿用既有频率、刚度、模态中心计算。

独立 C/system-math 程序分别使用 log10f、float 乘/加、fmaf、double fma/sqrt 生成参考值。100055 组输入比较四个阻抗参数、log10f 与 baseDb，共 **600330 个 float32 值零差异**。包含正 subnormal、最小 normal、最大有限 float、随机系数、曲线插值及短向量最后值复用。测试报告明确标为独立数值对照，非 Pianoteq 独立分量声部采集。

完整历史联合端点捕获 `debug-pass16-coupling-inputs-v2` 回归：36 次调用、144 个实际输入及两个 powf 对照均吻合，保持原完整覆盖条件。首先选择的更早 33 调用捕获缺少三个模态，严格返回 exit1；其报告 `coupled-regression.json` 保留，没有缩减预期调用数。完整捕获的新报告另存为 `coupled-regression-v2.json`。

新增合成测试覆盖 10 而非20的倍率、最后值复用、联合端点不需要功率向量、错误布局拒绝及禁止 JS Math.log10。npm test 通过。完整商业输入、REA 和数值报告只保存在本机 `pass151-separate-component-inputs/`。

本轮变更不进入原连续分轨重放所消费的缓存表路径，因此没有重复把旧分轨结果计为新音频通过。独立端点输出混合、真实独立弦声部轨迹、完整接触耦合、全部预设及网页最终声音仍需继续验证，不合并、不发布，未使用 Pedalboard。
