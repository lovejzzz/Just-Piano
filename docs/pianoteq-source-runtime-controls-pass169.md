# 存档生产截止频率、微扰和衰减下限（pass169）

2026-10-17。关闭联合声源的三项观察输入：频率截止、耦合微扰量和衰减floor ratio。已有采样率、运行模式、注册表常量等依赖仍明确，不将局部闭合当作完整声音复刻。

## 原生来源与计算

REA/Ghidra重新分析7a4014、182960、7576b4，三项全部ok并Terminal 0。响应SHA-256 `f9dc2228ecdf367ed6c59e37345b01e9244e84535d8f49ec23d2e63a16862120`，证据 `ev_ac068c02021c7c7cae81d605c4c6570f312ec6eba86fef0ed7661c60ce90918e`。7a4064..7a41dc另按ARM核对字段选择、float夹限和写入位置：

| 输出 | 原生生产 | 本机NY A4 |
| --- | --- | --- |
| cache+f8 frequency cutoff | 主模式取B164；次模式取B2b8c，即解码B2a38.scalar154 | 主15000，次5000 |
| cache+140 jitter amount | instrument mode=1才复制B2a3c，即B2a38.scalars[1]；否则+0 | 两路float32 0.12 |
| cache+110 decay floor ratio | B2740逐音高scalar曲线（B2548.curves[6]），float限制到[1,1000000] | 两路1000000 |

`archiveSourceRuntimeControls` 消费基础模型及显式cache/instrument模式、普通scalar曲线模式。序列化version不是内存标量，jitter不是scalars[0]；独立测试将该首项改掉，jitter保持原值。无效模式、缺失所选字段及非有限数据拒绝，不猜默认值。

`prepareArchiveSourceTables` / 原独立入口新增 `sourceRuntimeCurveMode`：选中后从上下文自身快照生成三值，实际传到独立/联合极点及原生求根的衰减floor；拒绝同时给手工cutoff、jitter或decayFloorRatio。旧显式诊断入口保留，返回标记区分来源。

相位常量另确认182960通过注册表键 `c8f78330d732bd62` 读取double；幅度整数scale用键 `52a55c62a0076230`。历史读取分别为π和1，**本轮尚未闭合注册表初始化，未直接固定默认值冒充已恢复**。7576b4按instrument mode=1选择B2838的相位曲线分支也重新确认。

## 真实源表和因果负对照

`historical-source.json` 使用 `--archive-runtime-controls`，不再将捕获cache三值传入预测。主26行/次10行完整四表、rawDecay和归一化结果保持通过；新增三值的两模式比较也全同：共654项float32、216项double、2参考索引，零差异。原648项源表比较范围未缩小。

只改主路捕获jitter目标+0.1：自身全部预测不变，仅新增runtime比较一项严格失败。只改基础模型的jitter标量+0.1：自产107频率、108衰减、108幅度及107归一化幅度改变，源表/中间参数合计612项失败，phase保持原值。目标修改不影响预测，源修改实际改变声音计算输入，两份拒绝报告保留。

五击/两模式动态源表绑定仍2160值零差异，报告与连续绑定器携带 `candidateSourceRuntimeControlsComputed=true`，剩余观察输入明确移除这三项。自算新入口不能静默混用捕获中间值。

重新消费本轮源表的连续回放 `voice-report.json` 通过14214461项检查，零差异；本轮实际写出30条内部float32 WAV，独立Python读回1272576个采样（group/auxiliary各636288）与历史原生内部采样逐字节一致。全部声部从counter0开始，无归一化。该结果是同一旧A4捕获范围内的新生产路径回归，无新原生采集；终端time/auxiliary入口及其它模型/控制观察边界保留，`finalStereoAudioVerified=false`。

## 验证范围与剩余

新增测试包括主/次字段选择、instrument门控、恒定和分段曲线的上下限、字段独立性、缺失/无效输入，以及完整存档纯联合/中间混合消费。自产控制与显式同值控制的五张输出表逐项相同；互斥入口拒绝。全部npm test通过。

仍需恢复注册常量的实际初始化、运行曲线/instrument模式来源、其余模型/曲线与求根剔除分支，以及完整接触/制音闭环、全局输出和最终立体声。全音区/力度/踏板/全部预设及网页声音尚未验收；不会据此合并或发布。商业输入与原始证据保留本机。
