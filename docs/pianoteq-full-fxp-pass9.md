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
