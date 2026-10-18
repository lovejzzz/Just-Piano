# pass250：连续链改用存档与独立调音生成的释放时长

新增浏览器兼容的[组合计算模块](../dsp/archive-release-duration.mjs)，直接调用已有的刚度、stretch、调音和基础时长实现。连续链的 `--duration-source` 现在从当前存档字段计算释放多项式的首项，不再从 `r.inputs.polynomial[0]` 取得该值。旧字段仅用于结果比较。未提供新选项的历史路径保留。

## 实际计算与来源

依次从存档计算128项刚度、stretch约束/RHS/矩阵/解/频率表、等律基频、stretch因子、锚定比例及逐键调音，得到G+78。然后计算基础时长，与float32(2/G+78)取较大值，执行已确认关闭的声部随机变化分支，最后截到[float32(.01),15]。

它不读取原生刚度表、stretch表、G+78或释放时长作为计算种子。注册权重、注册调音常量、曲线运行模式及特殊乐器/随机化关闭条件仍是显式观察输入。condition=0以外、特殊乐器覆盖、启用的声部随机化尚不支持，明确拒绝。不能据此宣称所有物理建模输入已独立生成。

[导出器](../scripts/pianoteq_export_duration_archive_inputs.py)的 `--tuning-context` 输出v2私有输入。[绑定器](../scripts/pianoteq_bind_duration_source.mjs)检查当前资源、FXP、上下文文件及五份上下文观察文件摘要；连续链还要求时长源与制音源使用同一资源/预设。商业曲线、逐键表、预设和原始音频不提交。

上下文只保留五类输入：pass17 stretched配置中的六条源曲线运行模式、pitch模式及注册音高常量；pass19 counts中的stretch曲线模式；pass18 weights中的middleWeight/gramScale；pass17 anchor中的registry_multiplier；pass249的特殊乐器及随机时长启用状态。原生表和频率不进入组合模块。上下文文件保留这五份原始记录的SHA，仍明确属于跨次观察依赖。

## 验证结果

| 范围 | 比较数 | 差异 |
| --- | ---: | ---: |
| 当前存档组合计算，对历史105个不同音符的调音遍历及128项stretch表 | 2,648 | 0 |
| A4基础时长、频率、下限及五个声部初始化 | 29 | 0 |
| 新A0活动频率下限及五个不同声部初始化 | 29 | 0 |
| 默认连续链全字段检查 | 14,250,804 | 0 |
| 低位置连续链全字段检查 | 611,794 | 0 |
| 默认30条实际尾音分轨，float32样本 | 1,272,576 | 0 |
| 低位置3条实际模态分轨，float32样本 | 49,152 | 0 |

调音核对器为[pianoteq_verify_archive_duration_tuning.mjs](../scripts/pianoteq_verify_archive_duration_tuning.mjs)，边界核对扩展自pass249。105个音符各有三条重复遍历，重复记录没有计成315个不同音符。尾音导出后的WAV再次直接对比原生audioTail记录；低位置导出器直接检查每个PCM字。分轨不是最终立体声。

两份连续报告均为 `releaseDurationStillObserved=false`、`releasePolynomialAndRateScaleStillObserved=false`，五份releaseModelSources均标记durationInputObserved=false。实际样本对照范围与pass248相同；此次替换通过了这些既有音频范围，不等于新增全预设或全音区音频覆盖。

## 新原生活动分支

只在私有FXP副本中将编辑时长改为float32(.01)，重算正常存档校验和，使用A0（MIDI21）采集。原生基础返回0.016499999910593033，独立调音得到27.26831817626953 Hz，float32(2/frequency)=0.07334519177675247；原生频率下限、声部结果及初始化均与独立计算逐位一致。

首次五次较慢击键只用了两个循环复用的声部地址，被现有“五个不同声部”核对条件拒绝，证据保留在native-v1。确认该进程正常退出后，改为五次紧邻击键；native-v2实际覆盖五个不同地址，29项通过。没有放宽核对器的不同声部条件。

两次原生进程均exitStatus=0，普通错误和durationErrors为空。仍只用四个只读硬件观察点，未修改原应用、目标代码、寄存器或运行数据，没有Pedalboard。继承的音板采集协议未完成，`parentSoundboardCaptureComplete=false`保留。新A0记录只用于初始化边界，本轮没有A0连续PCM等价结论。

## 因果与拒绝检查

- 仅修改一个原生释放时长比较值：连续报告恰好1差异，49,152个独立输出样本全部保持不变。
- 修改存档编辑时长输入+.001：自身系数、连续状态及实际输出随之改变。到age9728，累计394,248项检查中106,342处差异，已比较145个输出块/27,840个样本，其中26,532个输出值不同。之后触发既有的严格pruning布局检查并拒绝，没有完整报告；没有将部分比较冒记为完整音频验证。
- 单独改变一个调音频率目标、或一个stretch表目标：各恰好1差异，完整独立预测摘要不变。
- 特殊乐器、声部随机化、运行时ageing和存档condition四项未覆盖分支均拒绝；错误预设摘要、资源摘要、上下文摘要、上下文数值、缺失调音字段或掩盖观察依赖六项输入也均拒绝。

## 私有证据与后续

`pass250-duration-historical-inputs.json`、`pass250-duration-low-inputs.json`、`pass250-duration-floor-inputs.json`、`pass250-duration-runtime-context.json`；`pass250-duration-tuning-audit-v2.json`、`pass250-duration-boundaries-report-v2.json`、`pass250-duration-floor-boundaries-report-v2.json`；`pass250-default-report.json`、`pass250-low-report.json`、两份stems-audit和`pass250-negatives/results.json`、`pass250-tuning-negatives/results.json`。冻结JS闭包在pass250-runtime-v1，原生A0采集在pass250-duration-floor-capture。

补充资源/模型/音高来源一致性检查后，两组完整连续计算再次通过，最终报告为pass250-default-final-report.json和pass250-low-final-report.json。连续输出及尾音输出与导出WAV时的报告完全相同，记录在pass250-final-validation.json。四项分支拒绝与六项绑定拒绝分别保存在pass250-unsupported-branches.json和pass250-binding-negatives/results.json。

下一步仍需处理启用随机化与特殊乐器分支，并继续去除声部初始化、琴槌/弦反馈/制音毡耦合中其余观察输入。最终立体声、全目标音区/工厂预设、AudioWorklet、持久化和实时性能未完成；不合并、不发布。
