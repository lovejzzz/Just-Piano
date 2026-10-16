# 第九轮：完整 FXP 的结构、摘要与精确单字段差分

本轮只读本地已有实验存档，未修改原程序、FXP、许可证或预设资源。分析对象仍为 Pianoteq 9.2.5/20260909。新增脚本 `scripts/pianoteq-inspect-fxp.py` 可独立重算下面的结构与摘要；输出不包含完整系数表。

## 完整存档与 NKS 选择记录的区别

`audio-pass3/verified-rest/baseline.fxp` 长 36,659 字节，没有 `LEAN-PRESET`。其结构为：

| 块 | 文件起点 | payload 字节数 | 末端 |
|---|---:|---:|---:|
| XFTP | 0x44 | 36,583 | 0x8f33 |
| dlla | 0x85 | 36,518 | 0x8f33 |
| tdtM | 0x8d | 2,075 | 0x8b0 |
| PrsU | 0x8b0 | 34,427 | 0x8f33 |
| prom，PrsU 内 | 0x8f5 | 111 | 0x96c |
| ryal，PrsU 内 | 0x96c | 16 | 0x984 |
| olos，PrsU 内 | 0x984 | 17 | 0x99d |

`tdtM` 除元数据外确实有 **1,873 字节 extra-data**，与此前 NY Steinway NKS 的空 byte vector 不同。尚未解析这些字节，不称其为模态数据或音板参数。

`PrsU` version=79，三字符串仍识别 `steinwayny` / 空串 / `Grand Steinway D (New York)`，flags=0。与 NKS flags=1 提前返回不同，它走详细分支。version79、下一32位字段为0的本例，依次读 `prom`、`ryal`、`olos`；之后至 PrsU 末端尚有 **34,198 字节**。这些不是“只有215个旋钮名称”的记录，但其存在也不能证明完整基础乐器数据全部内嵌。

`FUN_10055ec14` 中相关直接调用为：`prom → FUN_10032e5f0(S+0x50), FUN_1001e96e8(S+0x68)`；`ryal → FUN_10028d37c(S+0xd0)`；`olos → FUN_10017734c(S+0x108)`；随后 `FUN_10032b958(S+0x130)`，再读标量、曲线与其它状态。只知道容器和调用地址不等于已恢复这些集合的模式定义。

## 已独立验证摘要覆盖范围

baseline 16字节一致性字段在 0x75；实测精确等于 **MD5(dlla payload)**，即文件 `[0x8d,0x8f33)`，而非包含 dlla 8字节头部的范围。这补上先前报告中尚未独立验证的 digest 边界。

同目录 **13份** baseline/单参数端点存档均通过块边界、版本、详细分支与 MD5 重算。文件中的名字长度改变会移动绝对偏移，比较时必须先解析块与字符串，不能复制 baseline 的绝对文件偏移。

## 六项修改定位到单个 float，而非整表替换

将详细分支中 `olos` 结束位置作为相对0点，13份存档的剩余尾部均为34,198字节。每份端点与 baseline 的差别都仅落在下列一个4字节窗口中；尾部其它所有字节相同。按 little-endian float32 解释：

| 参数 | 尾部相对偏移 | baseline | normalized .25 | normalized .75 |
|---|---:|---:|---:|---:|
| Damper Position | 698 | 0.204081640 | 0.0371627212 | 0.210224107 |
| Damping Duration | 1139 | 0.699999988 | 0.125996485 | 3.81776762 |
| String Length | 2687 | 2.70000005 | 1.19325364 | 5.57973385 |
| Impedance | 4068 | 1.10000002 | 0.600000024 | 3 |
| Impedance Cutoff | 4072 | 1 | 0.482063204 | 1.84143436 |
| Q Factor | 4076 | 1.10000002 | 0.267058223 | 3.66068077 |

有的float只改变3个字节，因为其第四字节相同。不能把 changed-byte count 当字段宽度。以上参数身份来自先前全新官方进程读回全部215参数且只有目标改变的受控存档；本轮没有重新渲染音频，也不把静态差分称为新的音频验证。

这些是存档中的有效标量，**不是 GUI 的0–1数值**，也不是最终每条弦的频率/衰减/幅度/相位。该观察支持逐参数值读取，但没有证明这些窗口在其它版本、乐器、配置分支、曲线节点数变化时仍固定。

## 系数恢复的具体下一步与边界

1. 对存档解码应优先展开 `FUN_10032b958` 与通用曲线 reader `FUN_1000b1090`，将34,198字节尾部逐字段消费并保留精确边界；不能只扫描浮点数猜字段。
2. 逐音符的四组基础数组已知从 `G+0x708` / `G+0x980` 经 `FUN_10004f984` 复制。应在该函数入口，以一个固定硬件断点抓取Q的维度、四向量和索引字段，验证其是否能从上述存档曲线重建。这比215参数API更直接，但仅单音单模式采集不能代表全键盘全部预设。
3. 音板原配置C与模型B的关系需继续从 `FUN_1001ba68c` / `FUN_1007f04ec` 追踪。已知B来自 `FUN_1004f7d10` 的0x340字节记录，不能把本报告的archive根S、运行逐音符G、音板C互相混用偏移。A/B算子、几何/边界、激励与观察点仍缺，不能由这次6个存档float宣称音板已复刻。
4. `prom` 内仍有乐器身份字符串，并不意味着其111字节是完整物理系数；完整模型资源解析/构建生产者尚未闭合。本轮不导出商业预设表，也没有把800份lean NKS当作完整系数。

本轮脚本另外拒绝了4种损坏输入：短头部、截断末端、被修改的dlla payload、越界XFTP长度。它刻意拒绝未核对的格式/分支；另一个旧实验 `audio-pass2/au-impedance.fxp` 被报告 trailing bytes，未放宽规则掩盖差异。

## 重现

```sh
python3 scripts/pianoteq-inspect-fxp.py --compare-first \
  "$HOME/.local/share/just-piano-analysis/audio-pass3/verified-rest/"*.fxp
```

本机结构与差分证据保存在 `~/.local/share/just-piano-analysis/full-fxp-structure-pass9.json`。REA原证据：`preset-model-tree-read.json`（`FUN_10055ec14`）、`preset-inner-read.json`（`FUN_100675f1c`）、`preset-core-save.json`（`FUN_100333d8c`）；本轮使用现成反编译，没有启动新Ghidra会话。

## 后续完成：按代码 schema 消费全部详细尾部

本轮随后启动单独 REA/Ghidra 会话（同一 immutable SHA、JVM `-Xmx4G`），展开原生读取器，不再只比较6个窗口。脚本现在从 `olos` 末端逐字段读取，直到 PrsU 的真实末端；**42份本地 FXP 全部零未解析尾部**，其中包括上述13份受控基线/端点。旧 AU 实验的那一份仍被严格拒绝。此处“零尾部”只指 `olos` 后的详细状态；`prom/ryal/olos` 的内部语义与 metadata extra-data 仍有未解码内容。

为避免混用既有报告的编辑根S、运行M、逐音符G，以下把 type-0 `FUN_10055ec14` 的目的对象称为 **A**。所有对象偏移来自该读取函数及其直接子读取器，不是文件固定偏移。

基线实际读取 **114个顶层字段**，嵌套包含：

- **154条曲线，8,751个Y值**；这些曲线均以version `0x8003` 保存。本轮已在本机完整解码X/Y/index序列，公开报告只保留计数和schema。
- A+0x9a8 子对象由 `FUN_1005f6284` 读取，version10；含5个初始float、8元素向量、4条曲线、一个105项网格及附加曲线/配置。网格每项是float坐标加曲线，坐标从9至113；曲线点数随项变化，最高135。不能据整数坐标就断言这是完整基础模态表。
- 调律对象、MIDI范围与映射、效果槽、输出位置/混合子记录、字符串对等均按其读取器消费。基线从0x99d读到0x8f33，与PrsU末端和FXP末端精确重合，没有靠搜索下一个块标签跳过未知字节。

上述6项差分现在得到真实字段身份：

| 参数 | 代码schema目的地 |
|---|---|
| Damper Position | A+0x1110 float |
| Damping Duration | A+0x1334 float |
| String Length | A+0xf40 float |
| Impedance | A+0x588 子对象 +0 float |
| Impedance Cutoff | A+0x588 子对象 +4 float |
| Q Factor | A+0x588 子对象 +8 float |

剔除文件绝对offset元数据之后，对13份已解码对象作递归比较，12份端点各只有对应上述**一个数值**改变；其余标量、所有曲线节点和值、输出配置等解码值均相同。这个验证比只有尾部changed-byte window更强，但仍不是逐样本发声验证。

### 曲线压缩的完整已观察 schema

`FUN_1000b1090` 读32位版本。低位为0..3；`0x8000`标志的现代分支只接受低版本3，另有独立version4分支。未压缩版本依次读float X向量、float Y向量；版本≥2再读uint32 index向量。

现代分支调用 `FUN_1001c4f3c`：

1. 先读1字节flags，只允许0x78中的bit。
2. bit3：X为空；否则bit4：X只有一个接下来的float；否则先读uint32 count。
3. 普通count路径，bit5为0时读count个float；bit5为1时读first/step两个float，之后按 **float32逐次加法** 生成X，不用double的 `first+i*step` 替代。
4. bit6为1时index向量为空；否则每个X读一个uint32 index。

接着 `FUN_1004d61b8` 读uint32 Y总数。每个run先读一个float并追加它；若已达到总数即结束，否则读1字节run标记。高位0表示再读低7位数量的literal float；高位1表示再重复刚读值低7位次。超出总数的run被拒绝。X为空、Y只有一个值是本机实际出现的合法常量表示，不能误报损坏。运行对象后续如何建立索引、插值模式或兼容迁移，并不属于本次仅恢复存档表示的结论。

`FUN_10032b958` 则是version≤2的命名元数据集合：先读A+0x130内部相对+0xf0、+0的两组字符串对，version2再读+0x30，之后+0x60/+0x90/+0xc0/+0x120/+0x150/+0x180/+0x1b0，共10组。每组 `FUN_1000d6af0` 自带version≤1和两个length-prefixed字符串。基线该段124字节，20个字符串全部为空；不能把这一段命名为力学曲线。

### 验证边界和后续用途

`--include-values` 可把所有解码值输出到**本机研究文件**；默认输出只给结构、offset、曲线计数与哈希。完整表已在本机 `full-fxp-values-pass9.json` 保存，没有加入Git仓库。脚本对不同乐器/旧版本/未核对的子对象版本会拒绝，不声称通用解析800个工厂预设。

得到8,751个存档曲线值并不等于已得到基础乐器资源里的全部B向量。基础节点源仍是 `FUN_10059f2cc` 读取的B对象；该reader与这次type0 A reader不同。完整浏览器复刻下一步仍需要将A的精确曲线绑定到已知生成器，并取得/验证B资源和G基础四数组的生产关系。音板网格、A/B算子、边界与观察点也没有因这次存档解析自动获得。

新增REA本地证据：`pass9-archive-readers.json`、`pass9-archive-helpers.json`、`pass9-archive-subobjects.json`、`pass9-archive-effects-prom.json`、`pass9-archive-curvegrid*.json`、`pass9-archive-final-subobjects.json`、`pass9-archive-output-*.json`、`pass9-archive-mic-*.json`。另外为独立求根实现采集的 `pass10-eigensolver*.json` 同会话保留。会话导出 `pass9-archive-evidence-bundle.json`（170条保留记录，非覆盖率），再正常关闭并生成 `pass9-archive-snapshot.json`。
