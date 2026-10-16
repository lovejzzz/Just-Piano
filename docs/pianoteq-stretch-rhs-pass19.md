# 存档刚度到拉伸约束与频率表：pass19

`dsp/stretch-rhs.mjs`恢复`326fe0`的音程比、谐波编号、刚度频率约束、平滑及完整RHS构造。使用上一轮存档算法计算的128个刚度double，不再把实际RHS、矩阵或解当计算输入。新模块接入[矩阵与求解](pianoteq-stretch-system-pass18.md)后，实际128键表逐位一致；再接后续调律，2520个字段仍逐位一致。

这仍是一个默认配置的实际验证。两个内部注册表权重、运行时曲线模式与平台数学依赖尚未消除；未宣称网页已获得原版完整音频。

## 存档绑定

`3d2f7c`把预设A400的index/curve绑定到T50/T58，把A46c复制到T38，把模型B1b34复制到T20。`64b380`核对了index/curve复制的实际布局；A400是含index与curve的一个存档字段，不能误读成两个平级JSON字段。

`9540e4`把模型B1be8与预设A458的平滑量组合。先分别转float并clamp到0..1，以float减法取补量，再用一条FMSUB计算：

```text
smoothing = fma32(−float32(1−clamp(B1be8)), float32(1−clamp(A458)), 1)
```

`archiveStretchControls`从解码存档取得上述数值和曲线。曲线运行模式仍由实际捕获明确注入，不能从存档version推断。参考频率、拉伸量、音程、平滑及完整曲线与实际T逐位核对。

## 音程与谐波选择

`327034..3270d4`先算double exp2(interval/12)，乘4后转float并FCVTAS，得到四分之一间隔的比值。随后用FRINTA与double FMA进行最近整数连分数近似，直到余数为0或误差小于1e−5；不是反编译表面的截断连分数。此次interval12对应ratio2、numerator2、denominator1，非整数比值分支尚未运行验证。

`545600`实际只返回常量15，不是注册表lookup。谐波上限为无符号整数除法`15 / abs(roundAway(numerator))`，本次为7。对note0..114，求实际权重曲线、FCVTAS后取上限，再乘rational denominator，生成115个整数。`019a34`要求dimension1，并转到已恢复的scalar curve evaluator。

## 刚度与约束

对r=0..94（一般为0..106−interval），取低端note=r+8、高端note=r+8+interval。B是存档计算出的double刚度，stretch先按原路径为float值再提升double：

```text
lo = B[r+8] × double(stretchFloat)
hi = B[r+8+interval] × double(stretchFloat)
p  = double(float32(partials[r+8]))
q  = ratio × p
lowPartial  = q × sqrt(fma64(lo, q×q, 1)) / sqrt(lo+1)
highPartial = p × sqrt(fma64(hi, float32(p×p), 1)) / sqrt(hi+1)
raw[r] = float32(native_log2(lowPartial/highPartial))
```

上下端平方的精度不同：低端q平方是double，高端p平方是float后提升。根号内使用向量FMLA；根号、乘法、除法按原顺序独立舍入。不能改成一个只看刚度差的近似公式。

当smoothingFloat>0.0001时，先将每项减去raw[0]并舍入float，再执行[带冲激峰延迟补偿的平滑](pianoteq-stretch-smoothing-pass19.md)，最后加回raw[0]并舍入float。RHS前107项为0，第107项为double log2(float referenceHz)，余项是这些float值提升double。

## 实际对照与音频边界

四次新捕获各一个固定硬件点，均正常exit0、errors为空：counts在327188，raw在327de0，filter在89755c。counts首次音频未与基准相同，重新独立counts-v2后相同。失败原记录保留，没有覆盖或用它声称无扰动。raw阶段字段`normalized`是刚复制、尚未减首项的数组；初次raw记录还误带已被覆盖的d13标签，不用于任何rational计算或验证；最终采集脚本只在counts阶段读取该寄存器。

成功链使用counts-v2、raw、filter，加上pass18实际weights/table及pass17存档刚度报告：

| 对象 | 数量 | 逐位不同 |
|---|---:|---:|
| 存档调律控制 | 4 | 0 |
| 完整权重曲线x/y | 22 float | 0 |
| 128个存档刚度与三个阶段实际刚度表 | 384 double | 0 |
| 比值、numerator、denominator和上限 | 4 | 0 |
| 谐波编号 | 115 int | 0 |
| 两端缩放刚度 | 190 double | 0 |
| raw、原始副本、归零输入、平滑输出 | 380 float | 0 |
| 五系数与delay | 6 | 0 |
| 完整RHS | 203 double | 0 |
| 差分/约束矩阵 | 41209 double | 0 |
| 完整解 | 203 double | 0 |
| 128键频率表 | 128 float | 0 |

随后`tuning-archive-bridge.json`核对105音高、三个完整遍历，2520float全部逐位一致，报告`stretchRhsStillCaptured:false`。`stretchTableProducerReconstructed:false`仍保留，用于明确注册表/运行模式/系统数学依赖和非默认配置尚未覆盖。

同一调律报告继续送入模态耦合四输入重放：`coupling-a4-bridge.json`的36次调用/144输入及`coupling-note70-bridge.json`的35次调用/140输入均逐位一致。物理刚度、频率、分量偏移和spread取已计算值；其余G/cache及powf依赖仍沿用既有明确边界。

将预设A458改为0.1的负例仍由同一程序计算，报告exit1：五滤波系数不同、95个RHS约束不同、203个解不同、127键表不同。该负例是重放输入验证，不是新的原生音频参数实验。单ULP滤波输出负例见平滑报告。

counts-v2、raw、filter均输出48kHz、24-bit、双声道113152帧，PCM SHA256与原版基准相同：`1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`。首次counts的SHA为`19481af4235d57e6db522290e2d90dd07fd8cf548c0264f549b1e3863422c84d`，148623个交错样本不同，最大24bit差15089；原因未归定。这些比较检查采集音频，不等同JS整段声部PCM已经相同。

## 重放

```sh
node scripts/pianoteq_replay_stretch_rhs.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass19-stretch-counts-v2/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass19-stretch-raw/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass19-stretch-filter/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass18-stretch-weights/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass18-stretch-table/runtime.json" \
  /tmp/piano-pass18-math-oracle /tmp/stretch-rhs-report.json \
  --source-controls-report "$HOME/.local/share/just-piano-analysis/debug-pass17-tuning/root-source-controls.json" \
  --archives "$HOME/.local/share/just-piano-analysis/base-model-full-values-pass13.json" \
  "$HOME/.local/share/just-piano-analysis/dry-full-fxp-pass13.json"
```

两个可选参数分别替换刚度表及调律控制的计算来源；省略时报告明确指出仍使用捕获输入。系统数学oracle包含公开libm调用，不含目标代码。调律重放器`--stretch-report`接受本阶段通过的报告，使用计算表而非捕获表。

## 静态证据与余项

326fe0沿用`ev_8e68e2673db246dc6686204e9b6cc9b9ba63480c5af2f9c6f8973052778dd476`；545600/019a34/455fe4记录为`ev_fc8203e732abd99f8d29c4d3eb04ce301a0758cd1804531d3c627355ffd85c84`；9540e4/64b380记录为`ev_5b0b021366573cf8fc8604cf8ca7bb40a564750885235e9efadd7ae1e483111c`。FMA、FRINTA、FCVTAS与运算次序同时核对原ARM指令。

本轮REA导出pass19 evidence bundle/snapshot，208条保留记录并正常关闭；数量不是覆盖率。原安装程序未修改。失败证据、四次捕获、报告及SHA清单留在本机。

仍需其它音程、平滑值和全部模型/预设的实际验证、内部注册表权重来源、曲线运行模式、系统数学浏览器移植及完整激励/反馈/制音/声板音频闭环。网页仍用旧独立音源，本阶段没有合并发布或承诺完整声音一致。
