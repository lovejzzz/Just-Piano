# 端点混合后的相位控制（pass156）

2026-10-17。实现 `1026dc` 的后置G相位控制，并接入端点四表/参考/归一化接口。**六个G控制和double相位常量仍要求显式输入；没有非零控制的原生动态轨迹或新实际音轨验收。完整缓存仍未验证。**

## 指令依据

沿用 pass151 的 REA/Ghidra `1026dc` 证据 `ev_b6766dc3b0d20a0a88d72d0717b280043a66573caedeeef882936219a3402d1d`，私有原报告SHA256 `303f58b17d9c979523a198ebc385a3956a0983126076c5aed90bf30581dbe892`。本轮逐条复核已有完整 ARM listing 的 `103dcc..1040dc`；没有新执行商业代码或对目标写内存。

字段消费：G+418为全局角度，G+400为偶数模态的直接float相位偏移；G+430/+448分别为奇/偶模态第二分量的角度，G+460/+478为对应频率系数。这里的命名是消费公式，不声称UI或存档生产映射已全部恢复。

令 K 为显式double相位常量：

1. G418非零时，计算 `f((K/180)*double(G418))`，再逐项float加到所有相位，包括非整数模态。
2. 对每个原始模态坐标执行ARM `FCVTZU` 的饱和uint32转换，再 `UCVTF` 回float与原坐标比较。不相等则跳过该行后续控制。
3. 偶数坐标行，对所有列执行 `f(G400 + phase)`，即使G400为0也保留加法。
4. 至少两列且该奇偶组角度/频率系数不同时为0时，只修改第二列。分别计算 `degreePart=f((K/180)*double(angle))` 和 `delayPart=f((K+K)*double(delay))`；`103ef0..3f14` 用 `FMA32(-frequency[row,1], delayPart, degreePart)`，再单独float加到当前相位。

最后没有phase wrap。不能用独立float乘减、将所有偶数控制换成角度单位，或把第二列修正广播到全部分量。

转换边界也不能简化为 `Number.isInteger`：float32的2^32在转换时饱和到0xffffffff，回转float又为2^32，比较成立且走奇数分支；负0作为0通过，负整数一般不通过。这些规则来自 `103f40..3f54` 的真实转换顺序。

## 实现与验证

`dsp/source-phase-offsets.mjs` 实现坐标分类与整张相位表处理，输入完整布局、原始模态坐标、六项控制及double常量。输入相位不被原地修改。`prepareEndpointSourceTables` 增加显式可选 `phaseOffsets`：提供时将修正后的相位返回并标明已应用；省略时保留上轮行为。`completeCacheVerified` 仍为false。

独立 `.S` 使用ARM的两个转换序列，C包装层使用double除法/乘法、float舍入和系统fmaf，验证100000组输入：

- 250321个相位float32结果、100000个饱和uint32和100000个资格判断全部一致。
- 覆盖166668次全局加法、64778次偶数相位加法、37665次第二列修正，49018行跳过非整数/饱和后不匹配坐标。
- 包含1..4列、非零/零控制、不同显式double常量、全范围有限float坐标/频率/相位及2^32边界。

私有 `pass156-source-phase-offsets/math-audit.json` 明确 `nativeNonzeroPhaseTrajectoryVerified=false`、`wholeAudioVerified=false`。这是独立ARM/C算术对照，不是原生Pianoteq声部捕获。

新增固定C位模式测试贯穿端点接口，包含四类坐标、各列不同影响和大于2π的不wrap输出；另有缺失控制/常量/坐标拒绝。原历史归一化回放仍通过108幅度、324其它矩阵值和2参考索引；该回放未启用新非零控制，不作为非零控制覆盖。npm test通过。

剩余：控制/常量自身的完整生产来源、独立端点补行与生成、新动态内部轨迹、完整耦合和最终立体声/网页验收。没有将未消费新控制的旧音轨算作新音频验证，未使用Pedalboard。
