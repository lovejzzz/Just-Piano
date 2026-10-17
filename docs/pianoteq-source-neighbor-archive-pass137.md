# 存档复数曲线到第三列幅相（pass137）

2026-10-17。在 pass136 的分量混合之后，接入第三列的邻列混合。五次击键、主次两路的540个幅度与540个相位全部逐位相同。完整四表绑定仍失败，不能替换声部输入或声称独立声音已完成。

## 控制的具体来源

依据不可变 ARM64 列表，`1c5a98..1c5b3c` 在实际音高 G+14 处求基础 B+1928、B+1978 的两维曲线；helper `2fae08` 检查运行维数为2，调用向量曲线插值，再返回实部和虚部。

每条曲线的控制为：

```
amplitudeControl = nativeScalarLogf(hypotf(real, imaginary))
phaseControl = atan2f(imaginary, real)
```

第一条写 G+1d4/+1d8，第二条写 G+1dc/+1e0。四个自算值与旧 pass29 A4 实际控制全部逐位一致。曲线普通线性模式仍显式指定，本轮没有新采集其运行标志，没有新 REA 查询；证据是缓存分析、原指令及历史动态记录。

新增 `dsp/excitation-neighbor-controls.mjs`，不接受目标幅相作为控制生成输入。`hypotf/atan2f` 必须显式传入，缺失即拒绝。此次使用独立 C 程序调用系统数学库，四种唯一调用记录及可执行文件 SHA 保存在报告。它不附加 Pianoteq，也不读取其内存；这是尚未移植的浏览器数学依赖，不能写成外部数学零调用。

## 实际第三列计算

原指令 `694150..6942a8` 与 pass29 已验证的算式相同。新模块提供仅包含这一阶段的接口，以免为尚未恢复的衰减输入填单位默认值：

```
gain = expf(FMA(blend, amplitudeBlend, f(amplitudeFloor * floor)))
phase = FMA(blend, phaseBlend, f(phaseFloor * floor))
angle = f(phase + float32(pi))
turns = floor(f(angle / float32(2*pi)))
delta = f(FMA(-turns, float32(2*pi), angle) - double(pi))
A[row,2] = FMA(mix, f(gain*A[row,1]), f((1-mix)*A[row,2]))
P[row,2] = FMA(mix, f(P[row,1]+delta), f((1-mix)*P[row,2]))
```

接口只接受三列完整输入；其它列数不静默推广。mix由本次击键的 `max(blendFloor,inputBlend)` 生成，floor/blend来自同次实际控制。幅度输入为 pass133 独立生成并归一化的源，经 pass136 存档系数混合；相位输入为 pass133 的源相位生成结果。

## 严格比较结果

对同一份干净 pass110 C 完整捕获，五击×两模式：

| 数组 | 比较数 | pass136差异 | 本轮差异 |
| --- | ---: | ---: | ---: |
| 频率 | 540 | 540 | 540 |
| 衰减 | 540 | 540 | 540 |
| 幅度 | 540 | 180 | 0 |
| 相位 | 540 | 180 | 0 |
| 总计 | 2160 | 1440 | 1080 |

本轮新增吻合360项，不能把原先已吻合的720项重新计为新增。没有比例拟合、目标回填或容差放宽；报告仍 `passed=false`、`compatible=false`、`substitutedIntoVoice=false`、`finalStereoVerified=false`。频率扰动、顺序约束及衰减缩放仍须独立恢复；幅相吻合不证明跨运行的所有模型状态相同。

## 验证与证据

最终 `pass137-neighbor/audit-b.json` 保存全部差异及自算控制。`guards.json` 十项检查通过：基准仍严格拒绝、全部幅相相同、四控制与历史原生一致；目标翻一位恰多一差异且预测摘要不变；改存档复数曲线会改变预测；去掉新阶段恢复1440项差异；缺数学依赖拒绝；系统调用明确记录；所有报告均未替换声部。负例夹具与原始结果分别保留。

`npm test` 通过，仅证明既有引擎与数学回归未损坏，不是本研究链的最终声音验收。

所有商业曲线、原生捕获及 C 可执行文件留在私有目录。原 LLDB 39072、目标39079及debugserver39080仍存活，目标CPU时间0、开发者模式关闭，未重复启动或编辑冻结采集依赖。没有新实际音频，未使用 Pedalboard，未合并或发布。
