# 释放控制到和频、主次合并与相位：pass89

本轮把自算两路激励继续送入和频生成、幅度归一化、主次合并和相位变化，比较父准备函数末端四表。不是独立完整发声或最终音色等价。

## 同次来源和输出

[采集器](../scripts/pianoteq_capture_release_merged_chain.py)保持六个固定硬件点：击键前35ef10、系数6e5360、包络返回472fd0、复制4604d4、权重完成695108，以及准备末端717cb4。最后一点替换pass87的单路末端696308；本轮不同时观察每路的最终中间表。

在每次695108读取同次的post来源控制、和频行索引/曲线及merge来源控制。新阶段717cb4读取真实合并四表、seed、历史及两个反馈目标。按同一声部epoch绑定两个模式，要求mode0/1齐全且与末端线程/声部对应。独立不可变ARM64指令核对了716578主路激励→716588后处理→716778次路激励的调用顺序。

正式A进程20572，普通--multicore 0、同Rattle FXP及MIDI，正常exit0；errors为空、逐块counter连续、重复返回0、pending0；六点均hardware并最终关闭。仅使用既有受限普通Continue，没有目标写入：

| 内容 | 数量 |
| --- | ---: |
| 击键 / 两路谱调用 | 5 / 10 |
| 系数 / 活动系数 | 121 / 117 |
| 连续包络块 / 声部复制 | 3351 / 3304 |
| 自算旧release读取 / 支持历史更新 | 4 / 4 |
| 基础/支持随机推进 | 452 |
| 主路→次路seed桥接 | 5 |
| 相位随机推进 | 1830 |
| 每击合并后的行/列 | 61 / 3 |
| 每张最终四表的总元素 | 915 |

## 自算链和跨模式随机状态

新增[mergeReleaseExcitation](../dsp/release-merged-excitation.mjs)：使用自算主路四表和自己补零的幅度storage，调用postExcitationTables生成和频、频率spread及归一化；然后以自算次路表执行mergeExcitationSources，最后以自己的频率/相位执行varyExcitationPhases。真实合并表、反馈目标和末尾seed只比较，不反馈。

[重放器](../scripts/pianoteq_replay_release_merged_chain.mjs)从自己的连续包络/复制/旧release及历史生成再击，再生成谱、支持模态和随机变化。主路计算出的末尾seed与次路观察入口比较，然后**实际以自己的主路seed计算次路**，不再按每路重置。次路自算末尾seed又交给相位变化；首次主路seed仍为每声部观察输入。每声部主路history在真实准备末端事件才提交，下一击读取自己的已提交history。

**18279项float32比较零差异**，包含合并后frequency/decay/amplitude/phase各915个值、支持历史及反馈目标。表头、模式、seed和逐块counter结构断言另计。5个声部均完成两路seed桥接，实际相位随机分支执行1830次推进。

## 幂函数仍是显式候选

后处理需要double pow(float32(velocity),3)。独立系统pow试验显示，直接(x*x)*x不能替代：最初100254个输入有285个double结果不同，虽数学等价但与系统实现的末位不同。

本轮重放必须使用--pow-candidate，显式提供Math.pow；没有在新模块里暗设近似默认。[公开oracle](../scripts/pianoteq_cube_pow_oracle.c)与[核对器](../scripts/pianoteq_verify_cube_pow_candidate.mjs)在100259个float32底数、double指数3输入（含本轮5个实际参数）中，Math.pow结果与系统pow零差异，其中405个NaN按语义比较；直接乘法仍有285差异。另以原有double CLI oracle单独核对5个实际调用，均逐位同。

该试验不恢复一般double pow，也不证明所有底数/指数或其它浏览器的Math.pow一致。报告doublePowCandidateUsed=true、powCandidateExplicit=true；历史exp2f/log10f仍使用pass88恢复实现，historyMathCandidatesUsed=false。两种数学边界没有混为一谈。

## 61项负对照和传播

所有负对照先要求本轮真实基准通过，61项全部拒绝：

- 高档Rattle源改为0会改变183个最终合并幅度及5个最终历史值。
- 支持历史randomScale源扰动影响612个合并幅度、20个最终history，并使后续旧history/支持输入/继承生产目标各15处不同。
- post amplitudeGain源扰动改变153幅度；merge primaryGain改变30幅度；phaseSpread源扰动改变183相位。
- 单独改变末端控制快照或一个最终四表/反馈目标，只产生一处比较差异，不进入自己的下游运算。
- 缺少次模式/合并事件、错误所有者、seed、支持索引、history、counter/维度及不完整窗口均拒绝。

本轮实际merge mode为2、spreadVariation关闭；其它merge/表达和spread随机分支未覆盖。来源曲线、预加权表、参考频率和多数模型控制仍观察。

## 新渲染的完整音频仍失败

与同配置未调试原版参考（--multicore 0）比较，均正常exit0、148224帧、双声道24-bit/48kHz，但112903个交错样本不同，最大整数差12、首差frame13036，归一化RMS差1.6064760168764798e-7。PCM SHA256为2f6ce1082940a4235601439e8ec0968b6b9474faaa6ff8620c09231da535c4af。

WAV仍由原生生成，未有JS独立完整音频；不将局部准备表通过解释为最终声音通过，也不以误差小放宽验收。当前网页音源尚未替换。

## 剩余缺口与证据

尚未由自己生成全部预加权源/模型曲线、每声部首次seed、模型初始化及控制上游；一般pow和其它分支未恢复。合并后的四表还需进入实际模态选择、声部初值/连续递推、音板和最终立体声。完整琴槌接触/弦反馈/制音毡方程、全预设运行语义、独立声音、网页集成及最终合并/Pages发布均未完成。

私有debug-pass89-release-merged-a、pass89-*保存不可变目标指令、完整捕获/硬件属性、真实pow参数、两种cube假设对照、61项负对照及完整WAV审计。商业模型和WAV未入库。本轮未新增REA静态记录；复用既有父准备函数证据并用只读指令/实际运行核对。无Pedalboard、目标代码/数据/PC/寄存器写入或内部调用注入。
