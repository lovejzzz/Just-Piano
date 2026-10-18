# 存档 pitch 控制接入五击连续声部（pass242）

本轮把 pass241 的自身音高轨迹接入五击连续主链，不再从每次原生频率刷新读取 pitch。`archiveVoicePitchControls` 用存档曲线、自算事件力度和合并声源表参考衰减生成轨迹配置。共享速度映射参数/曲线、零音分条件等仍为明确的历史输入；完整模型、物理接触闭环和最终立体声仍未完成。

## 参考衰减来源纠正

上一轮把 `V+25c` 称为平均衰减不准确。ARM `9517a4..9517d4` 和已保存的 REA 生产函数明确：非空声源取 `source.decay[referenceRow*columns]`，空声源另有1的回退。现有 `mapVoiceSource.referenceDecay` 已恢复该数值，本轮直接使用它，不新增平均值算法或从原生字段回填。当前主链支持非空声源，空表分支不作覆盖声明。

五个声部各自的参考衰减来自本次自身合并表。其源表由既有 pass169 的绑定验证入口生成，仍是跨历史上下文桥接；`sameRunModelGenerationVerified=false` 保持不变。

## 生产与接线

新增纯DSP模块 `dsp/archive-voice-pitch.mjs`，组合已有 `archivePitchSourceControls` 与 `velocityScaleFromControls`：

- 从 B+2f10 内嵌的 +b80/+bd0 曲线产生 strength/relaxation，并按已恢复的 host78 条件混合。
- 事件力度来自主链自身 `newVelocity`，当前正式回归由已绑定的 MIDI/存档速度入口生成。
- float logf/expf 使用已有独立实现，生成各声部速度尺度。
- referenceDecay 来自自身合并声源；采样率来自显式运行配置。
- 零音分条件必须显式提供；非指数模型、未恢复的速度模式及无效输入直接拒绝。

连续回放新增 `--pitch-source=private-archive-inputs.json`。每声部创建自身 `DynamicPitchTrajectory`，从年龄0起每块推进64采样及锁存状态；自产pitch实际用于初始P/Q、改频投影和阻尼系数计算。原生pitch只作比较。报告记录输入SHA，并明确 `pitchTrajectoryObserved=false`、`pitchReferenceDecayFromOwnSource=true`、`pitchVelocityProducerControlsStillObserved=true`；adjustmentRatio及其余控制边界未删除。

剩余速度输入包括 host模式/增益、G控制、shared控制和速度曲线，来自已有pass21观察，而非本轮独立从当前存档生成。不能把“strength曲线来自存档”扩写成全部pitch上游已独立闭合。

## 发现并修正控制值与系数缓存的区别

第一版新增检查错误地要求“不刷新时，当前pitch控制必须等于上次已应用pitch”。得到151项该检查差异；原有全部内部状态和音频比较仍零差异。失败报告保留为 `pass242-continuous-report.json`。

原因是指数偏移小于等于1e-5时，生产控制可恢复到1并锁存停用，但不因此单独要求改频；渲染器只在实际刷新时更新缓存系数。因此保持两个时钟/状态：控制轨迹每块推进，应用系数沿用上次刷新值；其它控制触发刷新时再消费当前pitch。现在还检查“自身有效pitch偏移不得遇到跳过刷新”，同时保留原有逐lane和逐采样比较，并未放宽精度或缩减原检查。

将只读采集窗口扩至512次，并在共同返回读取刷新标志。新原生目标正常terminal=true、exitStatus=0，errors/pending均为空；年龄0..32704连续、步长64。512次pitch/锁存/年龄及刷新约束共2,048项通过。年龄24512发生锁存，pitch从1.0000100135803223变为1；该块有其它刷新条件，刷新标志为真。整个停用区间另有51块刷新、78块跳过，故不能将锁存直接等同于刷新标志。采集只用2个只读硬件点，无目标写入，不使用Pedalboard。

## 完整内部音频回归与因果负对照

正式回归 `pass242-continuous-final.json`：14,216,545项检查，零差异，五个声部均使用自产pitch轨迹。实际写出30条内部float32 WAV；独立Python解析RIFF并直接与原生audioTail记录比较，1,272,576个采样逐字节相同，全部从counter0开始、无归一化。音频位于私有 `pass242-continuous-stems-v3/`，独立读回审计为 `pass242-stems-audit.json`。

只把输入存档strength曲线乘1.001，其它源表/捕获保持不变：同样14,216,545项检查中6,365,743项失败，1,272,576个内部采样中420,876个变化，退出1。报告和因果摘要分别为 `pass242-continuous-negative.json` / `pass242-negative-summary.json`。没有通过校正、目标回填或改变容差恢复通过。

新增测试覆盖源参考衰减的独立作用、力度/音高曲线敏感性、显式条件、拒绝原生host78/host80回填、非指数模型、未恢复速度分支及非法输入。轨迹测试和受影响脚本语法检查通过。为避开iCloud占位文件，使用当前工作树的私有依赖快照；10份未修改源码从已推送固定提交恢复，并逐一核对Git blob哈希，未替换用户改动。一次停滞的自有Git读取先终止并确认终端后才重建快照。

## 尚未完成

本轮关闭五击主链的逐块pitch及原生V+25c依赖，未关闭共享速度映射来源、其它音分/调制分支、动态配置变化和全预设覆盖。主链仍有其它观察控制、调度及终端辅助入口；没有同次从当前模型/MIDI独立生成完整声部或最终立体声的结论。琴槌接触力—弦—制音毡的物理身份与完整耦合、全音区/预设、AudioWorklet及网页实时验收继续开放，未合并或部署。
