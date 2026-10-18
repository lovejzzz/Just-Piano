# 自行推进音高轨迹与内部音频（pass241）

本轮复用 pass21 已恢复的 `dynamicPitchStep`，没有把旧公式重新命名为新物理发现。新增 `DynamicPitchTrajectory` 保存自身样本年龄和锁存状态，从一份显式固定生产控制量生成每块音高；非零音分转换使用已有独立 `nativeScalarExp2f`。它不接受逐块原生 pitch、外部年龄或状态重置。

## 新原生边界

REA 重新分析普通控制刷新 `6e4f5c`、去谐初始化 `765a30`、声部配置 `43dcb0` 和控制平滑器 `538e54`。两处内部地址均解析到 `6e4f5c`；4项批次和随后1项批次全部ok，REA正常terminal0。私有响应SHA-256：

- `pitch-and-detune-production-response.json`：`782389743350884a55c604ba8f9d096c69a94004aece5a4c75b75c40c0610620`
- `pitch-smoother-response.json`：`55a3dc4bdf8240e01de9fd4f04e0cb1a4ceb8ecaea0d930c1c113b1bc5263354`

本轮实际支持的是零音分、无调制、指数偏移分支。时间为 `f32(timestep*f32(age))`；幅度先乘 `expf(-decay*time)` 后平方，再乘strength，并除以 `fma32(time,relaxation,1)`；绝对偏移不大于1e-5时锁存停用，否则将 `f32(1+offset)` 乘基础音高。完整公式与其它分支仍由旧模块统一实现。这里的模态衰减参与音高变化，但未据此推断琴槌接触力或制音毡的物理身份。

新的两点只读采集器位于真正函数入口 `6e4f5c` 和共同返回 `6e5158`。v1曾只观察内部标签5428，得到61次更新；审计发现该标签不能覆盖所有函数调用，因此改成v2入口捕获，v1不充当连续窗口证据。

v2实际目标正常terminal=true、exitStatus=0，errors/pitchErrors为空、pending=null；取得128次连续更新，年龄0..8128、步长64。128次原生pitch和停用标志以及自身年龄共384项检查零差异。第一块正确包含平滑器从-1e6哨兵重置到0的情况。

预测只在第一次初始化读取一份固定控制配置，后续记录的生产字段仅审计恒定性，发现变化直接拒绝。年龄由自身加64，锁存由自身保留。生产控制量和初始平均衰减仍观察，报告明确 `producerControlsAndMeanDecayObserved=true`；未把它们升级为独立存档来源。采集只用两个硬件断点，不改目标数据、寄存器或指令，不使用Pedalboard。

## 实际模态音频

`pianoteq_replay_modal_initial.mjs` 新增互斥入口 `--pitch-controls`，直接从私有控制JSON构造轨迹，不读取已算好的目标pitch报告。新的128块轨迹控制源用于历史pass20的8块回放：184个模态lane、7次频率投影、3个完整分组，33,699项检查零差异。

实际输出3条512帧float32单声道WAV；独立Python解析RIFF，再直接读取每个原生分组最后一个内核的完整输出，共1,536个采样逐字节一致。控制来源是本轮新采集，模态初值/对照是历史捕获，这是明确的跨运行桥接，不是同次完整声部或最终立体声证明。

私有结果：`pass241-pitch-control-v2/verification-v3.json`、`pass241-fixed-pitch-controls.json`、`pass241-modal-audio.json`、`pass241-modal-stems/`、`pass241-modal-stems-audit.json`。商业模型、输入曲线、原始状态及音频均不提交。

## 因果检查与限制

只改v2一个原生目标pitch一ULP并更新合法描述符哈希：恰好一项比较失败，128项预测完全不变。只把输入strength翻倍：音频回放27,028项检查失败，1,536个采样中1,533个发生变化。没有改容差、裁剪或归一化。

新增测试验证自身计数推进、配置副本隔离、衰减后的锁存保留、非零音分自算和非法块长拒绝。受影响JS/Python语法检查通过。两次回放因iCloud占位模块读取停滞，均先终止并确认终端143，再恢复未修改的Git字节；负对照最终在18个当前依赖文件的私有快照上执行，源文件SHA另存。未修改用户其它工作。

连续五击主链仍读取动态pitch；本轮只把新轨迹接到8块模态音频回放。下一步需要将pitch生产控制和平均衰减接到存档/自身模态状态，再扩展五击、控制变化和制音轨迹，才能移除主链依赖。全音区、全部预设、最终立体声和AudioWorklet验收均未完成，未合并或部署。
