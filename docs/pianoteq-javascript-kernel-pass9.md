# 第九轮：JavaScript 内核的实际状态与输出重放

本轮新增 `dsp/modal-kernel.mjs`，重建无输入的 16-lane、四 sample 展开模态内核。它是可以执行的局部实现，不是完整琴槌、制音、音板、预设引擎；**尚未替换网页正在使用的独立音源**。不能将下面的位级吻合扩大为完整网页声音复刻。

## 实际输入与结果

使用[运行递推报告](pianoteq-recurrence-runtime-pass9.md)的第二次真实采集，`runtime.json` 共128条记录，每条16个lane、64sample块。输入为当次运行的旧P/Q和A/B；检查对象为同次运行的最终P/Q及实际输出缓冲。

- 4,096 个最终状态 float32，逐位一致。
- 8,192 个输出 float32，逐位一致。
- 连续外层16-lane组，以前一组捕获的输出作为当前组累加底值；新调用从零缓冲开始。线程、栈指针、输出地址、P/Q和系数地址步长、剩余组数用于区分连续组。
- 这验证了逐lane递推、四样本时序、四组横向求和次序和输出累加舍入，不只是末态相近。

相同采集运行本身正常exit0，其最终24bit PCM与官方原版逐字节一致。内部float输出重放与最终PCM等价性是两个单独检查，未把JavaScript内核输出直接称为完整PCM。

## 为什么普通 JavaScript 乘加不够

float32输入的乘积可精确存入double，但double加法舍入后再转float32，在极少数中点情况仍会与真正的单次舍入FMA不同。`fma32` 使用误差无损的TwoSum保留加法舍入残差，仅在float32中点校正，保留正常数、次正规数、溢出和有符号零的边界处理。

以macOS `libSystem.fmaf`为独立参考，固定随机种子1792122185生成200,000组三个float32字模式，再加2组特意构造的double舍入中点：有限/非NaN结果没有位差；NaN不要求payload相同。普通 `Math.fround(a*b+c)` 在两个特意构造的中点失败。这个有限测试集不构成覆盖所有2^96输入的数学穷举证明。

实际内核必须保留每四sample的运算次序：第一步先单独舍入 `A*P` 后FMA加 `B*Q`；后三步先舍入 `B*Q` 后FMA加 `A*P`。各组横向相加次序也来自实际指令。仅使用同一数学二阶差分式并不足以保证相同float结果。

## 重现

```sh
node tests/modal-arithmetic.mjs
node scripts/pianoteq_replay_modal_kernel.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass9-recurrence-v2/runtime.json" \
  /tmp/pianoteq-js-replay.json
```

第二项需本机已有授权采集的JSON。公开仓库不嵌入该原始内存快照或商业预设表。验算器任何状态或输出位差都会非零退出。原始FMA参考向量、重放结果和脚本副本保存于 `~/.local/share/just-piano-analysis/js-kernel-pass9/`。

## 仍缺的接入条件

完整浏览器引擎仍需要精确生成每个预设、琴键、力度和控制状态下的初值、频率、衰减、输入权重、噪声与音板/麦克风/效果路径；还需覆盖带输入、末尾不足四组、门限淘汰、改频和非线性约束路径。本轮没有用猜测的参数填补这些缺口，也没有把当前网页的原始音色宣布为已匹配。
