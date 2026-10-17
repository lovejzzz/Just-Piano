# 统一存档声源上下文（pass160）

2026-10-17。将既有刚度、stretch、调律、弦间偏移、模态描述和幅度/相位量生产集中到同一模型/预设快照，并提供纯独立端点的下游接线。**注册常量、运行模式及其它运行控制仍显式提供，谐波权重最终生产仍缺；不是完整引擎或新音频验收。**

## 同一生产上下文

`dsp/archive-source-context.mjs` 复用此前已恢复的模块，没有把捕获中的刚度表、stretch表或G控制读作预测输入：

1. 从基础/预设曲线计算128个double刚度。
2. 从存档stretch控制和自身刚度生成约束、RHS、矩阵、LU解与128项stretch表。
3. 从存档默认等温律、原生数学、该表及锚点生成每键基准/拉伸/最终频率。
4. 从同一快照生成刚度、偏移、spread、分量刚度，提取模态坐标/比值/幅度与功率系数并生成prepared端点。
5. 生成联合/独立幅度控制及相位量。独立分量使用N1 eta分支，未拿多分量eta冒充单分量生产。

五个调律注册值（middleWeight、gramScale、pitchScale、referenceNote、anchorMultiplier）必须提供，未把历史2/1等数值写成无条件默认。所有相关运行曲线模式也显式验证。当前调律只支持已恢复的默认等温映射、整数note/index及ageing=0；其它调律/ageing不能自动降级。

上下文在构建时复制模型、预设和模式，内部表通过WeakMap保存。返回审计表是副本，不能用捕获表替换内部计算结果；外部修改原模型不会把新参数与旧stretch表混在同一上下文。参数变化应重建上下文。**这只是新API的一致性约束，没有据此声称网页保存流程或Pianoteq配置提交问题已全面修复。**

`archiveTunedNote` 可单独生产调律；`archiveNoteSourceInputs` 生产声源输入。`prepareArchiveIndependentTables` 对存档blend=0的纯独立端点串联自身准备参数、存档阻抗、N1极点、分量表、补行、参考与归一化。它保留外部权重与运行控制依赖。blend>0需要联合端点，此入口明确拒绝，未将本机NY默认blend=1偷偷改成独立分量。

## 完整历史核对

`pianoteq_replay_archive_source_context.mjs` 从NY基础模型和dry预设重建上下文；原始捕获只提供注册值/曲线属性及比较目标。没有输入已算好的stretch或stiffness报告。

第一次回放因错误硬编码23..127范围而exit1，无验证报告；保留 `initial-range-rejection.json`。查明配置+e8/+100实际为9..113后，按配置建立完整105键区间，仍严格验证final与stretched各315条、三次完整有序遍历，没有减少覆盖要求。

`historical-context-v2.json` 全部通过：

| 比较 | 数量 |
| --- | ---: |
| 自算double刚度 | 128 |
| 自算stretch RHS | 203 |
| 自算stretch矩阵 | 41209 |
| 自算LU解 | 203 |
| 自算float stretch表 | 128 |
| 105键两种边界的三轮调律投影 | 2520个float |
| A4主/次声源的物理/幅度/相位量及模态字段 | 120个float |

合计41743个double及2768个float32值零差异。120项只覆盖两个A4配置，不能扩展成全键声源/音轨通过。相位instrumentMode=1与部分幅度/相位曲线模式沿用显式条件，不是新动态观察。注册值和曲线模式来源依赖仍写入报告；跨历史运行未拼成新的同次完整声部证据。

## 新测试与边界

公开测试使用合成零刚度/默认等温模型，验证上下文生成128项表、音高编辑+1200c传到新频率、旧上下文/审计副本与原对象修改相互隔离，以及纯独立入口确实消费自产调律、物理、幅度和存档阻抗。禁用JS超越函数后上下文重建和调律仍通过。缺注册值/模式、伪造上下文、不同note/index和需要联合端点的分支拒绝。npm test通过。

尚未闭合的输入包括最终谐波权重、phaseConstant/integerScale、jitter/频率上限/部分G相位控制及注册常量自身来源；联合端点的一体化生产、原生QR、完整缓存与原生独立声部轨迹也仍需推进。`harmonicWeightsComputed=false`、`completeVoiceVerified=false`及完整缓存未验证标记保留。

没有新录音、完整立体声/网页声音等价性通过或Pedalboard使用。商业模型、捕获和计算报告留本机，不合并、不发布。
