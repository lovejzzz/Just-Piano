# 存档到模态源刚度、弦偏移与 spread：pass17

`dsp/source-controls.mjs` 从已解码 B 模型与 A 预设计算 G+28、G+40、G+120、G+148，不读取这些目标值作为输入。当前完整入口明确要求 ageing=0；系统 `powf/expf/log10f/log2/exp2/log2f` 仍须显式提供。它是系数生成阶段的可执行恢复，不是完整声音引擎或所有预设的听感等价证明。

## 实际数值验证

私有 `debug-pass17-tuning/runtime.json` 在 `8a3c60` 捕获 315 条记录，覆盖 note9..113 的三个完整遍历，errors为空、进程正常退出。存档重放结果 `source-controls-complete.json`：

| 实际目标 | 逐 bit 比较数量 | 不同数量 |
|---|---:|---:|
| owner+7a0 的完整128项 double刚度表 | 128 double | 0 |
| 315次构建的 G+28 与 G+40 | 1260 float | 0 |
| 六条运行曲线 x/y 与 component ratios 对存档 | 549 float | 0 |
| 后期 A4 / note70、两模式的 G+28/40/120/148 | 32 float | 0 |

合计1841个float与128个double均一致。后期 G+120/G+148 来自 `debug-pass14-modal-source/runtime.json` 与 `debug-pass16-coupling-inputs-note70/runtime.json`，没有拿构建前状态冒充最终控制值。三个遍历的重复音符 G+28/G+40 逐bit一致；运行曲线与整张double表只捕获了一份configuration，不能据此声称每次遍历都重新捕获了曲线状态。

六条曲线的实际运行属性均为 dimension1、flags0、special0，并与存档逐元素对照。实现不从存档 version32771 推断这些属性。验证调用独立系统数学 oracle，共284种不同调用；oracle只是平台数学依赖，不含目标算法或目标输出。

## 来源与算术

| 输出 | 存档来源与关键位置 |
|---|---|
| G+148 | `1c5458..1c5490`：`curve(B1b98, G14, mode3)` 的float结果直接保存 |
| G+120 | `1c53d4` 调用 `38750c`，结果向量复制到G+120；见下文 |
| G+28 | `4ba180..4ba1b0` 构造128项表；`8a3c18..8a3c48` 将表中note项乘double scale，再转float保存 |
| G+40[j] | `8a3af8..8a3b34`：按ratio选择表项、乘同一double scale、转float，再由`8a3bac..8a3bbc`复制向量 |

刚度表生成调用 `04c5c8 → 83d144`：前者返回 `exp2(centsDouble / 600) − 1`，全部为double。`83d144` 的输入是 B1b24、B1b2c、B1b30、B1b38、B1b3c、B14e0、B1b40曲线，以及 A+f40 与 A+f48曲线；没有从捕获刚度倒推参数。

`83d144` 先以float计算用户与基础的power/shape：用户值为 `clamp(f32(Af40 × curve(Af48,note)), .1, 30)`，两条power路径均调用 `powf(value/10, f32(.85))×10`，随后以float FMA补 `max(1−power,0)×.3`。以B1b30为pivot生成shift，其中 `83d2dc` 为 **FRINTA，最近整数、半数远离零**；不能使用反编译文本中的简单int截断。

shift进入 `expf` 与八次幂调节。B1b40的Y数组非空时，在`f32(note+shift)`求曲线，以 `expf(f32((log10f(common)+curveValue)×ln10f))` 转成gain；之后转double计算 `min(log2(sqrt(gain+1))×1200,2400)`。空曲线路径为另一条带float FMA、float sqrt、expf的解析函数，已按指令实现，但本次真实模型没有覆盖该分支。

G+40 的ratio来自 B2548复合值 `vectors[0]`，运行地址B+29d0；`3d33ec..3d3490`将其复制到tuning+258。每个目标note为：

```text
componentNote[j] = clamp(roundAway(fma32(log2f(ratio[j]), −12, float(G8))), 0, 127)
G40[j] = float32(scaleDouble × stiffnessTable[componentNote[j]])
G28    = float32(scaleDouble × stiffnessTable[G8])
```

`8a3950`先置scaleDouble=1。ageing分支启用时，`8a39fc..8a3a04`以float计算 `1 / f32(frequencyScale²)` 再转double；本模块拒绝完整入口的非零ageing，不把该分支静默置1。

G+120 的分量数取 B2548.indexmap[roundAway(note)]。B1bf8是uint32音符锚点，`88027c`选相邻两行及float比例；B1d30按锚点数分成等宽行。`387784..38778c`先 `fma32(1−alpha,left,f32(alpha×right))`，再乘：

```text
amount = clamp(f32(f32(curve(A490,note) × A470) × curve(B2560,note)), 0, 50)
skew   = clamp(f32(A474 + curve(A4e0,note)), −2, 2)
```

这里B2560是B2548.curves[0]。A470复合结构的JSON顺序是序列化顺序，**不是内存偏移顺序**。`86c184`的v7 reader明确读取：

| 解码成员 | 控制对象内存偏移 | 绝对A偏移 |
|---|---:|---:|
| a | +0 | A470 |
| b | +18 | A488 |
| curves_ab[0] | +20 | A490 |
| curves_ab[1] | +c0 | A530 |
| c | +4 | A474 |
| curve_c | +70 | A4e0 |

首尾分量保留；n≥3时只调整中间分量。令 `m=f32(1−abs(skew))`、`s=f32(min(skew,0)×first)`、`a=max(skew,0)`，标量路径为 `fma32(a,last,fma32(m,value,−s))`。向量化前缀依原编译阈值使用独立float mul/sub/add，不能强制全部FMA。最后`3882d4..3883b0`只施加上限400，没有对称下限。

G+120单独函数支持 ageing=0 或 B158非零、从而跳过随机化的分支；完整控制入口暂要求ageing=0。随机化偏移、非零ageing刚度scale、n较大时的SIMD偏斜路径尚无本次运行样本。offset指数缩放、频率G+78、hammer/damper动态耦合属于其它阶段。

## 重放

```sh
clang -O0 scripts/pianoteq_system_math_oracle.c -o /tmp/piano-pass17-math-oracle
node scripts/pianoteq_replay_source_controls.mjs \
  "$HOME/.local/share/just-piano-analysis/base-model-full-values-pass13.json" \
  "$HOME/.local/share/just-piano-analysis/dry-full-fxp-pass13.json" \
  /tmp/piano-pass17-math-oracle \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-modal-source/runtime.json" \
  /tmp/source-controls-report.json \
  --additional-capture "$HOME/.local/share/just-piano-analysis/debug-pass16-coupling-inputs-note70/runtime.json" \
  --tuning-capture "$HOME/.local/share/just-piano-analysis/debug-pass17-tuning/runtime.json"
```

重放器检查曲线数组/运行属性、完整128项表、完整有序note遍历及后期输出；保留全部不一致，不以float相同掩盖double误差。`--assume-linear-curves`仅供没有运行证据时诊断，会明确标记未验证曲线；实际验证采用`--tuning-capture`。

## 静态证据

- 原ARM64 SHA256：`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`。
- `83d144`：私有`pass17-0x10083d144.txt`，REA batch记录 `ev_dcd3eb01fd39fae0d085e9ea2efcb73a99891142e23ddbb3323efde893b64a30`；精度与舍入依`pass3-arm64-disassembly.txt`的上述指令核对。
- `04c5c8`：batch `ev_db64bf12ef5934554d85ee6a38ae2e47c13ae7d0dc1382e9f5c200fb23225a33`。
- `88027c`：batch `ev_59e56a98d06c65349050abf61abde505db4f5b09c3625b865f94c128b8a6d735`，保存在pass15 bundle。
- `86c184`：`pass9-archive-0x10086c184.txt`；batch `ev_4230613c0a7d14749baa9f044f8749fdf1a8d834bf4c946a123e545c6e893ddd`，保存在pass15 bundle。
- `38750c`、`1c5478`、`4ba180`、`8a3af8..8a3c48`使用已保存的完整ARM指令；这里没有为未单独反编译的函数编造REA记录。

初次重放曾因将control470 JSON顺序当作内存顺序产生4个G120中间项错误；该失败报告保留。修正依据v7 reader与真实曲线副本，未调整目标值或成功标准。
