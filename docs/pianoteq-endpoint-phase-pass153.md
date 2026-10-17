# 端点相位与零幅度状态（pass153）

2026-10-17。实现相位混合的配对值运算。**尚无原生动态端点轨迹或新实际音轨验收；没有接入网页音源。**

## 指令核对与更正

使用 pass152 REA/Ghidra 四函数报告中的 `85d044`，证据 `ev_d69071f1ac48ed9ee403850047cf597fdda28e49c7337dbe835cba63f82cbd7f`，原始报告SHA256 `3b21db791682facda6edecd66e7be75856c3ccf28e78035ba7160909dbbb00fd`。结合既有完整 ARM listing 逐条复核。

pass152 曾根据反编译输出推测 SIMD 与标量有不同 π 精度。**该初判被原指令否定**：`85d288..2e8`、`85d334..34c` 和 `85d384..390` 都把余数从float转为double，减同一个double π，然后转回float。不能把反编译显示的CONCAT/float表达式当成实际运算精度。另一个反编译陷阱是显示int转换；真实 `FRINTM` 是浮点向下取整，不是向零截断，也不限制到32位整数范围。

相位输入和混合输出都使用：

```
shift = f(phase + floatword(0x40490fdb))
turns = floor(f(shift / floatword(0x40c90fdb)))
remainder = FMA32(-turns, floatword(0x40c90fdb), shift)
wrapped = f(double(remainder) - double_pi)
```

因此 `wrap(0)` 的float位模式是 `0x33bbbd2e`，并不是0。这个微小值来自float π偏移和double π减法，不能人为归零。

## 幅度状态决定相位

`271fe0` 在原始两侧幅度向量上产生状态码，`2725f4..264c` 的向量和标量循环一致：

- 0：两侧幅度均非零。
- 1：联合端点幅度为零。
- 2：独立端点幅度为零。
- 3：两侧均零。

`85d878..8a4` 在插值前处理已wrap的相位：状态1复制独立相位给联合相位，状态2反向复制，状态3把两侧都置0。随后使用原始blend，执行 `FMA32(t, coupledPhase, f(f(1-t)*separatePhase))`，最后再wrap。它没有对±π两侧执行通用最短弧插值。

`dsp/endpoint-morph.mjs` 新增 `endpointAmplitudeTypes`、`wrapEndpointPhase`、`morphPairedEndpointPhases`。调用方必须传显式幅度状态，不能用混合后非零的tiny值重新推断原始零状态。

## 验证

独立 `.S` 文件分别转写 ARM scalar wrap 和四lane SIMD wrap；是新编译的独立指令程序，不是加载/执行商业二进制片段。C包装层单独执行状态选择和fmaf混合。103380组输入包含四种零状态、blend边界、±π/±2π、±0、subnormal和全部有限float32范围随机值。

**723660个float32结果及103380个状态编码逐位相同，零差异。** 比较包含两侧标量wrap、完整相位混合、四个SIMD lane及正负输入。私有报告 `pass153-endpoint-phase/math-audit.json`。此报告明确 `wholeAudioVerified=false`，不将独立指令对照称作真实Pianoteq声部轨迹。

新增测试固定独立oracle位模式，覆盖跨±π直接线性混合、零状态复制/清零后再wrap、非零wrap(0)、非法布局与非有限值拒绝。全部 npm test 通过。源表组装、原生索引排序/相等键顺序、真实端点声部和完整声音仍待完成；本轮没有重复导出不消费新代码的旧分轨来算新音频通过。

## 后续排序与组装证据

另一个 REA/Ghidra 单会话批量分析 `7fd9c4`（排序）、`048848`（重排/填充）、`304b48`（幅度），3/3成功且会话exit0。证据 `ev_05ecb9f4a4bd3f956b8c3fb1dcfb409fb70af7e234a0afa1a37dfc3d6df48971`，私有 `pass153-endpoint-phase/batch_decompile.json` SHA256 `71dfeab30a9a82cc19d7ae49dd8c26d14d1a97c679715000799eb761d2b0daf8`。

排序不是可以默认替换成stable sort的操作：它有2/3/4/5项专门分支、小于24项插入排序、129项阈值的pivot选择、递归深度和fallback。剩余被调用helper为 `1b1fb4`、`2ba584`、`88bfa0`；它们以及相等键次序仍需核对和实现，不能把新反编译结果当成已移植。

`048848` 的输出按最长列分配矩阵，并将缓存+60索引用于各列重排。较短非空列的填充由类型决定：频率按首频率和末频率外推，衰减重复末值，幅度/相位补零；空列保留初始零。具体外推的融合顺序仍需ARM核对，未直接按反编译表达式移植。
