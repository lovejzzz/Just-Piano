# pass254：谱控制从存档生成并接入连续链

[谱模型生产器](../dsp/archive-excitation-spectrum.mjs)独立生成六组、八个float32值。运行时激励生产器在构造时计算一次；连续链把它们传入谱计算，并把同一个自产scale传给支持模态计算。原生值只用于对照，不再作为这九个消费者输入。

这减少了普通钢琴分支的中间捕获依赖，尚不等于完整琴槌接触、弦反馈、制音毡或整机已闭合。

## 来源与精度

| 输出 | 存档来源 | 原生边界 |
| --- | --- | --- |
| scale / Gf0 | B1ca0[noteIndex−1] | 1c5548..558c |
| slopeBlend / shared274 | B15cc | 714e04附近 |
| referenceTable / G190，三项 | B1030按音符求三维线性曲线 | 1c6194、91ac5c..91ac9c、09edcc |
| lowerBase / G1014 | B1ad0曲线 / 20，再乘double ln(10) | 1c5f88..5fc4 |
| lowerScale / Ge7c | Ba10曲线先转线性增益expf，再logf | 1c844c..849c |
| lowerUSupport / shared4f8 | B4290版本3的scalar32c，即B45bc | 7154a8..54c0 |

lowerBase先进行float32除法，再转double乘常量，最后转回float32。lowerScale保留原生expf/logf往返的舍入，不能直接用分贝值乘常量代替。三维参考曲线使用已有向量插值次序：新项先落地，再融合旧项。只接受已覆盖的普通曲线版本、完整三维向量、有效键索引和版本3复合对象。

## 新原生观察

[两点只读采集器](../scripts/pianoteq_capture_excitation_spectrum_controls.py)在1c84a0读取配置结果，在695108读取实际谱消费者。后者额外读取共享参数和模式。只用两个硬件断点，不执行目标函数或写目标内存；沿用独立调试副本。

新五音符21、60、69、72、108采集含15条配置记录和10次实际消费者调用，按MIDI顺序覆盖两种模式。[核对器](../scripts/pianoteq_verify_excitation_spectrum.mjs)从当前存档独立生成预测，170项对照、0差异。进程正常终止，exitStatus=0，两组错误列表为空。父音板采集的completed=false保留，不能把本批称作完整音板采集或五音符PCM等价验证。

## 连续音频回归

| 已有A4场景 | 检查数 | 差异 | 新导出音频对原生 |
| --- | ---: | ---: | --- |
| 默认五击完整尾音 | 14,251,184 | 0 | 30条WAV，1,272,576个float32样本完全相同 |
| 低位置连续窗口 | 614,583 | 0 | 3条WAV，49,152个float32样本完全相同 |

两组连续输出和尾音输出也与pass253一致。禁止访问测试在拒绝读取原生controls对象的条件下，各新增80个自产谱值对照通过；全部禁止访问计数仍为0。测试继承的源表、力度、随机状态、硬度和历史对照同时通过。

## 因果与反向检查

- 同时改动第一组原生谱目标的八个值及append.scale：完整报告恰九处差异，49,152个自产音频样本保持不变。这也检查了scale的后续消费者没有漏接。
- 私有解码模型的B1ad0曲线Y加.01：十处lowerBase字段差异，当前窗口音频不变。该场景不能证明这个下限分支实际生效，结果保留。
- 私有解码模型的A4键scale乘1.001：305,319项检查中94,503处差异；实际比较19,968个连续音频样本，其中19,959个改变。随后epoch0/age7104的严格pruning布局检查拒绝。没有完整负例报告，没有放宽布局检查，也未统计停止之后的样本。

这些源编辑只针对私有解码输入，未修改商业资源或预设，不是修改原生预设后得到新音频的等价验证。

## 证据与下一步

私有证据：pass254-runtime-v1；pass254-spectrum-capture/five-notes-v1；pass254-five-notes-spectrum-report.json；pass254-default/low-report.json；两套stems与audio-audit；两份access审计；pass254-negatives/results.json及原始失败日志。商业模型、预设、原始捕获与音频不提交。

仍待独立生成谱表达量lowerControl和u的来源、baseTable与extraTables；非零slopeBlend的活动分支未新增验证。当前生产器整体仍限制五击A4及明确的主机/乐器/模式条件，注册表和其他运行时条件尚显式输入。五音符仅覆盖本批系数，不扩大连续音频结论。完整接触力/反馈/制音耦合、最终立体声、全音区/预设、AudioWorklet与保存重载和实时性能验收仍未完成。
