# 复耦合参数：实际输入到 p/q 及极点链的数值闭合

新增 `dsp/modal-impedance.mjs` 恢复 `1002ff628` 的具体算术和调用者的确定性随机修正。使用从真实 B+A 存档重建的控件及相位曲线、实际函数参数和独立系统数学 oracle，**36 次调用的72个 p/q double全部逐位一致**。再经过随机修正，**72个极点输入p/q也全部逐位一致**；将这些重建值代替捕获p/q继续求根，108个频率和108个原始衰减仍全部逐位一致。

这里仍使用实际捕获的函数参数 s0..s3，以及尚未全域移植的系统超越函数。不能称为所有存档到完整声音已经无需捕获数据。

## 证据与失败保留

本轮 REA 对 `2ff628/09b1bc` 的伪码和原始ARM64指令共同用于恢复算术，没有另开重复Ghidra会话。

REA 对应记录为 `ev_da8e15c473bf3ace422848a32fe00abcd4e78309476592711899c0dc67cd2760`。本轮已导出 `pass15-evidence-bundle.json` 与 `pass15-snapshot.json`（197条保留记录），正常关闭原生分析会话；记录数不代表模型覆盖率。

主线程使用独立的单点硬件采集：

- `194ca8`：调用前，保存36组s0..s3、对象控件、相位曲线及两个band向量。
- `2ff89c`：读取极坐标半径，36条实际运行值均为float32 **1.0**。
- 最初的`194cac`返回点因`Darwin start_wqthread / EXC_BREAKPOINT`停止，0条完整返回；该失败保留，不用于成功声明。
- `2ffa0c`返回前的v2运行正常结束，但只有35个唯一键，缺`note69/mode1/modal7`。最初重放虽70个已匹配输出都相等，仍因缺失返回而exit1，结果保留为`replay-report-after-v2.json`。
- 同点v3正常结束，得到全部36个唯一键。v2/v3共同35个键的70个double全部一致，联合覆盖36组后才获得完整PASS。

before、radius、after-v2、after-v3各自完成的渲染均与相同FXP/MIDI的官方原版PCM逐字节一致，48kHz、24-bit、双声道113152帧，证据保存在各自目录`audio-equivalence.json`。失败的旧after运行没有借用这些成功结果。

## 输入与实际算术

函数入口x0是对象，**s0..s3是四个float，不是四个double**。本轮保留四个实际参数为显式输入：s0为基频样输入、s1为参考尺度、s2为目标频率、s3为额外dB。s0与G+78相符、s1与float32(base*coordinateScale)相符、s2与float32(center)相符；本重放器仍读取before实际参数，尤其没有将s3假称为已从存档重建。

对象的四个控件和相位表可以切换为主线程`dsp/impedance-controls.mjs`从B+A计算的输入。此模式实际用重建的数值继续计算p/q；捕获值仅用于对照。两个mode的8个不同控件、2×3000个相位坐标和2×3000个相位值全部float32位相同。曲线的runtime flags=0、special=0、dimension=1由本次实际运行确认，**没有用序列化version32771推断运行标记**。

设对象控件为strength(+20)、minimumReference(+38)、tilt(+50)、mixture(+c8)，先计算：

```text
ratio   = float32(target/max(minimumReference, reference))
slopeDb = min(float32(-tilt * native_log2f(ratio)), 0)
db      = max(double(slopeDb), -200) + double(extraDb)
gain    = native_exp((db/10)*ln(10)) * double(strength)
```

strength必须大于1e−20，gain必须大于1e−40；原代码失败路径没有被替换为任意默认值。

若band向量非空，依据**最小band频率是否小于50**决定是否乘s0，不是依据最大频率。每个中心先做float32乘法；仅当中心大于2.5×reference时，计算以reference为宽度的高斯项，平方偏移≥100则高斯项为0，然后把相应dB指数增益乘进gain。本次实际两个band向量均为空，因此这段虽按指令实现，**没有运行数值验证**。

相位曲线按mode3端点钳制及原float32插值求值。角度计算顺序是先将`degrees/180`舍入float32，再乘double π。不是直接在double中计算`degrees*pi/180`。

接着计算：

```text
polar = radius * (cos(theta) + i*sin(theta))
u = 1/sqrt(fma(tan(theta), tan(theta), 1))
complement = float32(1-mixture)
phaseGain = native_exp(fma(log(u), double(mixture), double(complement)*0))
scale = clamp(gain, 1, 1e12) * phaseGain
p = real(polar) * scale
q = imag(polar) * scale
```

原代码还计算`pow(complement,.25)`，并在u=0时应用其float32结果与最小值保护。模块保留该计算路径，但本次未覆盖u=0、非有限极坐标、特殊曲线分派和相关异常分支，不宣称完整IEEE边界已经恢复。

## 静态值不能代替运行值

按原指针算术，`signed32(c1d9e4)+u64(c1d9f0)+0x10`指向`100c1db78`。ARM64文件该处最初4字节`cdcccc3d`表示float32约0.1。**实际运行点读到的却是1.0。** 因此模块要求调用方提供真实radius，重放器使用独立采集的36条一致值；没有把静态0.1或常见1隐藏为通用默认。

将静态0.1作为负对照，72个p/q输出全部不同。当前证据不擅自解释该全局值为何在初始化后改变。

## 确定性随机修正与极点桥接

`couplingJitterFactors`复现`194b3c..194d30`：以float32 FMA生成`note*10+10000`种子，三次LCG初始化四个uint32状态，随后每个模态推进一次xorshift128。U先舍入float32，最终factor用double FMA计算`1+amount*(U−.5)`。每次`194870`模型构建重新播种，不能每个分量分别播种。

本次使用实际note69和cache+140。由新算法的raw p/q乘factor，**72个值与前轮`194d68`捕获的极点p/q double逐位相同**。没有读取极点p/q来拟合factor或反推raw输出。

`scripts/pianoteq_replay_source_poles.mjs`新增可选`--impedance-report`，严格检查完整36键／72值、archive计算模式、无失败及结果schema，再使用报告中重建p/q替换原来的捕获参数。旧的捕获p/q模式保留。主线程另删除报告中的一条jitterChecks，同时保留表面的passed与计数；脚本仍按schema拒绝、exit1且不生成输出报告，负例保存在本机`negative-incomplete-impedance.json`。桥接结果：

| 验证 | 通过／总数 |
|---|---:|
| archive控件，float32 | 8/8 |
| archive相位坐标／值，float32 | 12000/12000 |
| 函数返回p/q，double | **72/72** |
| 随机修正后的极点p/q，double | **72/72** |
| G/cache到lambda，double | 108/108 |
| G/cache到center，double | 36/36 |
| 新p/q继续求根后的频率，float32 | **108/108** |
| 新p/q继续求根后的原始衰减，float32 | **108/108** |

求根仍为独立Durand–Kerner，未冒称原native QR。各阶段来自相同配置的独立运行，没有伪称为一次函数调用的完整联合快照。

## 系统数学依赖与浏览器边界

`scripts/pianoteq_system_math_oracle.c`是独立平台函数调用器，不包含目标程序代码或模型数据。`-O0`和volatile参数避免常量折叠；原始binary64位用于输入输出。`nm -u`确认实际调用`log2f/exp/___sincos_stret/tan/pow/log`。本轮完整重放有176个不同数学请求。

这些依赖仍由显式回调提供。将其替换为普通JS Math，**72个p/q中有17个double末位不同**，重放器如实报告。不同点分解如下：

| 依赖 | JS与系统不同／不同请求的输出数 |
|---|---:|
| log2f | 0/36 |
| exp | 7/61 |
| sincos | 0/52 |
| tan | 6/26 |
| pow | 0/1 |
| log | 1/26 |

不能因为部分依赖在本组输入上相等，就称其全域已移植；也不能将独立C oracle作为已可在浏览器运行的系统数学实现。模块中的一般log-X相位插值可复用前轮`nativeScalarLogf`，但本次实际phase flags为0，未新增log-X运行覆盖。`impedanceCurvePair`对应`09b1bc`的普通选择算术，目前也未有真实选择快照对照。

## 重放命令

```sh
clang -O0 -Wall -Wextra scripts/pianoteq_system_math_oracle.c -o /tmp/piano-math-oracle
node scripts/pianoteq_replay_impedance.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass15-impedance-before/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass15-impedance-after-v2/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass15-impedance-radius/runtime.json" \
  /tmp/piano-math-oracle /tmp/impedance-report.json \
  --additional-return "$HOME/.local/share/just-piano-analysis/debug-pass15-impedance-after-v3/runtime.json" \
  --source-poles "$HOME/.local/share/just-piano-analysis/debug-pass14-source-poles/runtime.json" \
  --source-controls "$HOME/.local/share/just-piano-analysis/debug-pass14-modal-source/runtime.json" \
  --base-models "$HOME/.local/share/just-piano-analysis/base-model-full-values-pass13.json" \
  --preset "$HOME/.local/share/just-piano-analysis/dry-full-fxp-pass13.json"

node scripts/pianoteq_replay_source_poles.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-poles/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-modal-source/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-amplitude/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-poles/powf-inputs.json" \
  /tmp/source-poles-report.json --impedance-report /tmp/impedance-report.json
```

未传archive选项时，重放器使用捕获控件，并在报告明确标注；不能将该模式当作存档控件生产验证。原数据与完整逐项结果保存在本机`debug-pass15-impedance-oracle/`。本次未修改原安装程序、安全设置或许可路径；没有用Pedalboard。
