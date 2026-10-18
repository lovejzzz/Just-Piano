# 多项式尾部与rateScale来源接入（pass248）

连续回放的四个释放多项式尾系数改为模型存档来源，rateScale改为由自身合并衰减行计算。默认完整五击和低位置256块音频均保持逐采样一致。释放时长仍来自原生输入，尚未宣称整个释放模型独立生成。

## 来源与运算

714870..7148ac从模型B38e0复制四个float至共享向量R+a0；43dff8..43e048复制至V94c。该字段在存档B2f10中相对偏移9d0，类型为四元素float向量，不是曲线。私有导出器现在包含六条基础曲线及这个向量，仍禁止仓库内/覆盖已有文件的商业输出。读取模块验证四个有限float32并返回独立数组，旧来源可继续使用原有路径。

43def0..43df4c及673d00对所选衰减行求最小值，并至少夹至1，按以下float32运算次序生成rateScale：

```
minimum = max(1, min(selectedDecayRow))
correction = float32(float32(float32(minimum*20)*duration)/LN10)
rateScale = max(0, float32(90-correction))
```

LN10为原生位模式0x40135d8e；零行时correction=0。复用已有`initializeReleaseModel`，不将捕获rateScale作为预测输入。

新选项`--computed-release-model`要求存档多项式尾部。第二个频谱分支完成时提前执行自身`mergeReleaseExcitation`，首个系数计算前从自身header选取衰减行并初始化模型；后续复用这个模型，最终初始化阶段也复用同一合并结果，不重复消耗随机状态或pow。五个多项式项中仅duration仍从首次输入取得，其后每块审计其一致性；四个尾项及rateScale都用自身值覆盖后真正送入`DynamicReleaseVoice.refresh`。

报告分别标明`releasePolynomialTailObserved=false`、`releaseRateScaleObserved=false`、`releaseDurationStillObserved=true`。旧合并字段`releasePolynomialAndRateScaleStillObserved`保留true，因为polynomial[0]仍观察得到。没有把这个组合字段改为全独立。

## 新原生初始化验证

使用同一低位置私有预设，在新进程的两个只读硬件点35ef10/43e048捕获五次初始化。实际terminal=true、exitStatus=0、complete=true、错误为空，日志无预设加载失败；__text检查沿用原授权调试副本，没有目标代码/数据/寄存器修改或Pedalboard。

可复用验证器`pianoteq_verify_release_model_initializations.mjs`绑定已通过的自身模型报告、存档SHA、当前预设SHA及新原生日志。80项严格比较零差异：50个模型值、15个衰减行元素和15个头部整数。所选行来自自身合并结果，未用新采集的行替换预测。只修改一个新原生rateScale目标，恰好一项审计失败。

这是跨运行初始化审计，`sameRunModelGenerationVerified=false`。duration仍由历史输入提供；它与新运行相符，不等于其来源已经闭合。本次五个衰减行的最小值均小于1，原生数值验证覆盖最小值夹至1的分支；其它音区的更大最小值仍需验证。

## 连续音频与负对照

| 场景 | 检查 | 实际音频 |
| --- | --- | --- |
| 低位置、首声部256块 | 611,794项零差异 | 3条WAV，49,152个float32采样逐字节一致 |
| 默认历史完整五击 | 14,250,804项零差异 | 30条WAV，1,272,576个采样逐字节一致 |

独立Python读取WAV的PCM并直接与相应原生copy.render/audioTail比较，无归一化。低位置覆盖非零增益和松键阶段，仍不代表全部声部完整尾音或最终立体声。

在低位置捕获副本中，只修改首次输入的四个尾系数和rateScale，共五项审计差异，计算音频完全不变。只修改存档多项式一个系数，完整回放退出1，报告88,105项差异，其中34,583个音频采样不同。没有放宽音频或状态门控。

私有证据包括`pass248-low-report-v2.json`、`pass248-default-report.json`、对应stems/audit、两类负对照；新的初始化捕获位于`pass249-release-model-capture/low-v1/`，验证结果为`pass248-fresh-init-verification.json`。商业字段、预设及原始捕获不提交。

释放时长的界面映射/随机化/限幅、源上下文中的剩余原生输入、同次完整独立模型、完整琴槌接触/弦反馈/制音毡耦合、最终立体声、全音区和工厂预设、AudioWorklet、保存/重载及实时性能仍未完成。未合并或发布。
