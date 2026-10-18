# pass259：第三张附加谱表独立生成；活动控制仍未闭合

[control30谱生产器](../dsp/archive-excitation-control30.mjs)从模型/预设生成Ge60完整表，并接入连续生产器。当前自产附加谱表为floor、blend、control30；其余四张及表达控制仍有原生输入。control30是现有代码的字段名，本批未据此猜测UI参数名称。

## 存档到系数

8bd70c读取预设A11c4乘A11c8按音符求值，float32乘法后钳位到原生[约.001,.5]，作为Ge4c。B830、B880普通曲线按音符求值得到Ge50宽度输入和Ge54强度输入。模型曲线及预设曲线版本明确限定32771。

1c7de4..8184生成Ge60，长度取独立主源的保留行数，第二模式也使用同一完整表。令f为float32舍入：

```
center = clamp(rawCenter, float32_bits(0x3c23d70a), .5)
width  = min(max(widthInput, float32_bits(0x3c23d70a)),
             min(rawCenter, float32_bits(0x3efae148)))
scale  = f(strength * sqrt(f(center-width) / (.5-width)))
left   = max(0, f(center-f(width*.5)))
right  = min(1, f(center+f(width*.5)))
size   = f(right-left)
inverse = f(f(1/size)*.5)
omega  = double(f(2*harmonic)) * pi
integral = f((size-(sin(omega*right)-sin(omega*left))/omega)*inverse)
residual = f(1-integral)
square = f(residual*residual)
table[harmonic-1] = f((f(square+square)-.5)*scale)
```

保留float/double转换、先除后乘及各次单精度落地，不能按实数代数化简。复用已有nativeDoubleSinCos的sin分量；本批验证的是最终表值，不宣称已证明它与独立sin入口在所有参数/输入上均等价。

## 88键原生核对

[新采集器](../scripts/pianoteq_capture_control30_table.py)在695108一个硬件点读取实际缓存表、三个输入、主源行数和活动control30值。[核对器](../scripts/pianoteq_verify_control30_table.mjs)从统一存档上下文独立生成主源行数及谱表。

绑定同一当前预设、48kHz和21..108的88键MIDI，176次主/次模式调用完整：12,238项检查，0差异。其中11,534项为表值，其余为输入与行数；重复读取同一音符表计入检查数，不能当作独立状态。原生进程正常结束，exitStatus=0、两组错误列表为空。所有活动control30均为0，activeControlAudioVerified=false保留。

另做五次A4 MIDI探测，依次包含基线、CC67、通道压力、CC1、CC64及相应复位；完整300项表核对仍零差异，但十次模式调用的control30仍全为0。该结果不能证明这些事件触发了相应声音分支，也未将探测音频算作独立声音等价证据。

## 接线、反向检查和音频

连续链已有的自产附加表接口现在同时传入control30完整表；主/次模式按各自count消费所需前缀。禁止访问测试拒绝整个原生extraTables对象，每组自产附加表检查从250增为510，禁止读取计数仍为0。

- 新88键记录的rawCenter、widthInput、strength和一个表目标各改一项：严格报告恰四处差异，自产预测不变。
- 原有低位置连续捕获中第一组control30表26项各加1：完整报告恰26处差异，49,152个自产音频样本不变。

| 已有A4场景 | 完整检查数 | 差异 | 新导出WAV对原生 |
| --- | ---: | ---: | --- |
| 默认五击完整尾音 | 14,252,134 | 0 | 30条，1,272,576个float32样本完全相同 |
| 低位置连续窗口 | 615,533 | 0 | 3条，49,152个float32样本完全相同 |

两套连续/尾音数组也与pass258完全相同。当前Ge60表26项均非零，但乘它的control30为0，因此这些音频回归不能证明该表的非零活动控制分支。没有把“系数相同”扩大为新的活动声音验证。

## 证据与下一步

私有：pass259-runtime-v1；control30-capture/all88-v1与midi-controls-v1；两份control30报告；两份default/low报告、stems/audio-audit/access；negative-targets与chain-negative。模型、预设、原生源表及音频不提交。

下一步需继续恢复表达控制来源并取得非零活动控制验证，移除u/history/positive/negative四张附加表及其他捕获依赖。全音区连续声部、最终立体声、全部预设、AudioWorklet、保存重载和实时性能仍未完成。
