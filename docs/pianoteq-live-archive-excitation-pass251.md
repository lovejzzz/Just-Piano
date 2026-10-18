# pass251：存档声源直接接入连续计算

新增[运行时激励生产器](../dsp/archive-excitation-producer.mjs)。连续链的 `--archive-source` 从当前资源/预设构造主26行、次10行的联合声源，直接执行已有的调音、刚度、谐波权重、阻抗、微扰、原生三次QR求根、幅相与归一化计算。随后按MIDI事件、前向随机流及连续链的重复击键衰减，计算逐击四张激励表。

它替代本场景原来的 `--prepared-source` 历史结果报告入口；两个选项互斥。旧入口保留作历史回归。此次不是新增求根算法，而是将已验证的算法接到实际连续运行，使声源参数参与当前计算。

## 来源和剩余依赖

[存档导出器](../scripts/pianoteq_export_excitation_archive_inputs.py)读取本机当前资源和FXP，输出一个模型的完整解码字段；当前预设、模型、资源和银行身份必须与连续链中的音高、制音及释放时长来源一致。[运行条件提取器](../scripts/pianoteq_export_excitation_runtime.mjs)只从已有记录提取明确的常量/模式，不导出四张声源结果表。[绑定器](../scripts/pianoteq_bind_archive_excitation.mjs)验证资源、FXP、MIDI和提取后的上下文摘要。

生产器在构造时自行计算两个缓存源，逐击再计算分量混合、邻弦幅相、力度衰减和频率随机微扰。重复击键attenuation来自本次连续计算的repeat状态；力度和主声部随机种子来自MIDI与前向manager状态，次路微扰用已恢复的音符索引LCG。正常硬度五节点也从同一存档计算，不载入历史报告中的predictedSource数组。

原始观察文件的路径/SHA只作来源记录；生产器不需要读这些原始文件即可工作。**这不表示观察控制已全部消除**：注册常量、曲线/instrument/host模式、采样率、阻抗polar radius、G相位偏移、多项式kappa/gamma仍为明确输入；逐击blendFloor和inputBlend仍来自当前记录。本次支持五次A4/velocity96、普通分支、All=0，拒绝未实现模式。整个审计工作流仍读取捕获目标用于比较，其他组件也仍有观察依赖。

商业模型、预设、上下文和结果均在仓库之外，公共代码没有内置这些数值。

## 连续计算与实际音频

| 场景 | 全字段检查 | 差异 | 实际内部PCM比较 |
| --- | ---: | ---: | ---: |
| 默认五击连续尾音 | 14,250,804 | 0 | 30条WAV，1,272,576个float32样本逐字节同 |
| 低位置连续窗口 | 614,203 | 0 | 3条WAV，49,152个float32样本逐字节同 |

两次均 `preWeightSourceCalculatedDuringReplay=true`，不再需要历史声源预测报告；五击/两模式共10张逐击源表在当前运行中计算。默认WAV用独立Python读回对照实际audioTail目标，低位置导出器直接逐PCM字检查。新路径的所有连续输出及尾音输出还与pass250报告完全相同。比较仍限同一已有A4原生场景，没有新增原生采集或扩大音域/预设覆盖，也不是最终立体声。

去除生产器对原始观察文件的读取、补充模型/银行身份约束后，两次连续计算再次全部通过，所有样本与导出时的报告相同。最终代码冻结为pass251-runtime-v2。

## 依赖与因果检查

[独立依赖测试器](../scripts/pianoteq_test_archive_excitation.mjs)给原生source四表、硬度曲线、力度/attenuation及随机状态字段设置抛错getter，再调用生产器。它另外限制生产器只能读取当前资源、FXP、MIDI和已提取的上下文，禁止读取原始观察文件。

默认和低位置两例分别得到2160个源值、5个力度值、20个随机状态字和200个硬度值逐位一致；禁止字段访问及原始观察文件读取均为0。repeat衰减在这个局部访问测试中取自摘要绑定的本次自算连续报告；真正连续链直接传repeat对象。每例10次重复mode消费和一次重复start均被拒绝。该测试本身没有音频比较，不能代替上面的实际WAV结果。

两个声学反向检查：

- 只改一个原生frequency比较值+1：完整低位置报告恰好1差异，49,152个自算输出样本全部不变。
- 只改解码基础模型A4首项谐波权重×1.01：源表幅度与后续状态、声音随之改变。到age448，19,252项检查已有6,339处差异；此前实际比较的384个输出样本全部不同。随后严格pruning布局检查拒绝，没有完整报告。未放宽布局条件，也没有将部分结果当成完整验证。此例修改的是私有解码输入副本，不是界面参数保存验收。

错误的资源、预设、上下文及MIDI摘要四项均拒绝。

## 证据与后续

私有输入：pass251-excitation-runtime-context.json、pass251-excitation-current-inputs.json、pass251-excitation-low-inputs.json。结果：pass251-default-final-report.json、pass251-low-final-report.json、两份stems-audit、pass251-final-validation.json、pass251-source-access-audit-v2.json、pass251-low-access-audit-v2.json、pass251-negatives/results.json和pass251-binding-negatives/results.json。v1冻结代码和早期报告保留，没有覆盖失败证据。

下一项直接耦合依赖是逐击混合控制。已有ARM证据表明71654c/716550将H+88/H+90传给激励入口；H+90由57e5a4..57e5b8通过shared+f0曲线按H+78求值。仍需闭合该曲线的存档来源及blendFloor，再补全其他初始化/路由依赖，并验证完整立体声、全部音区/力度/踏板/预设和浏览器实时保存性能。尚未达到完整复刻，不合并、不发布。
