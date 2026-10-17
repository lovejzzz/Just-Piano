# pass110：Rattle之后的实际包络计算

目标是在同次从声部起点计算的链上继续越过416d3c及2523b4，以真实460f1c输出比较，随后连接空间与立体声。完整复刻仍未完成。

## 观测与计算边界

新增可选PIANOTEQ_VOICE_TAIL_ENVELOPES=1，要求已有早期消费、Rattle及延迟替换模式。audioReturn之后，同一个槽依次观测460f08（两类终端增益包络之后）、460f1c（时间包络之后），再回源调度；仍只有六个登记及活动用户硬件点。各端点验证声部、消费年龄、组矩阵与辅助矩阵身份。额外两条记录/块使预计总量超过原50000保护上限，因此仅本模式把记录保护上限设为60000；连续工作块、初始化、阶段覆盖与正常Continue审计要求保留。

[dsp/voice-tail-envelopes.mjs](../dsp/voice-tail-envelopes.mjs)实现416d3c首次启用时的float32/FMA系数生成、共享322148四lane递推及辅助矩阵末行提交。三个组不能各自把同一个gain推进一次；每行都从同一个起点开始，仅辅助调用提交新gain。primary/secondary的初始gain=1、step位模式501502f9、target位模式2edbe6ff、ready=0来自07a60c初始化指令，不从音频目标复制。该初始化的REA证据ev_2c1fd167624bde04536ed935d0bd6fd033a736bb174fc863ff1b4f51a5ce0f02。period从源采样率生成；slope/scale仍是初次模型观察输入。

启用事件仍来自本次audioReturn观察；它们可能先于按activationAge自动启用发生，不能只用年龄阈值替代。ready、step、target和gain随后自行携带，后续原生动态字段只比较。辅助音频入口仍观察，因为cross之后还有未连接的辅助处理；主组三路由同次自算Rattle提供。

2523b4采用double状态、double样本乘法及float32落地，两个时间边界先重置递推值；不把包络倍率先缩成float32。时间包络的初始状态仍观察，后续自己推进。时间状态的三个double字段逐double精确比较，整数计数精确比较，避免先转float32掩盖差异。特殊c68处理路径尚未实现，遇到主动配置明确拒绝。

## 本轮证据状态

A进程80061已在采集断言后清理并正常exit0，捕获不完整，不能计为通过。四个主要采集器已冻结，全部Python脚本有启动时哈希，采集中不修改它们。

早段单个真实活动主包络块（epoch0/counter13184）以观察输入作组件检查，392项零差异，包含自算step/target/gain和384个组/辅助输出样本。进一步以观察音频入口、计算初始化和自有携带状态检查1434块，1230372项零差异，其中583块主包络活动。此prefix不完整，上游音频仍观察，不是完整同次源链通过；secondary及时间包络活动块均为0。

新增合成指令语义测试覆盖逐行提交、携带gain下溢、首次系数生成、时间阶段边界；npm test通过。首次合成测试错误地预期低于原生gain下限的携带值继续发声，实际共享斜坡正确清零；按已核实的下限语义修正测试预期，未修改算法迎合测试。它不替代真实活动音频验证。

旧pass108 A的完整同次链回归正常exit0，11368637项零差异（pass110-legacy-rattle-regression.json）。新完整捕获、完整源链重放、负向测试、导出组音轨和最终WAV审计仍待完成。新增负向用例尚未运行。

私有证据：debug-pass110-tail-envelope-a、pass110-active-primary-prefix-component.json、pass110-tail-computed-init-prefix-component.json。原生模型、表、音轨和完整捕获不提交GitHub。

## 时间包络的源设置线索（静态）

REA读取715f98的完整指令确认7181d8–718298：H+3064非零时覆盖G+1208；若H+2ff4>0则选择G+120c。G+1204非零、选出的时长非零或G+1210<10任一成立时启用。样本数使用FCVTZU截断f32(时长×采样率)，不同于前面组包络的ceil规则。非零时长的attackRate=系统double exp(-0.9942522733438669/样本数)，value初始化1、counter初始化0；零时长使用常量向量，不能仅由伪代码推测所有字段。

相关指令证据ev_3aac4b4fa95db52443d5c0cf1f2826288197d26e4c8f229b718dbf296bb30185。1c5320已有证据显示G+1208来自存档对象1470的scalar与第一曲线之和（另有阈值/范围处理），G+120c来自第二scalar与第二曲线，G+1210默认为10。35ed60将按键效果模块+698传至新声部H+3064，但受模块+690对象的启用位控制。因此需要通过正常参数路径准备能真正启用此分支的预设，不能把地址名称或合成测试当作动态证据。

“Attack Envelope”标签确实属于普通参数清单index167，但目前只追踪到界面和注册元数据引用，尚未证明它与上述H+3064覆盖值的数值映射。下一参数干预必须在新进程读回、检查实际底层字段并取得音频，不能把候选名称当作结论。当前长采集的Python源仍冻结，未为增加字段而中途编辑或重启。

## A失败与B恢复路径实验

A共36426条记录、2180个工作块。consumer/audioGain为2143块，audioEntry/Return/AfterGains/Tail仅2142块。epoch3/counter30592之后，没有取得该声部的Rattle入口；下一入口已为epoch4/counter24640，而待处理epoch3年龄已变为30656。实际停顿PC仍为登记的30bd30、caller为460de4，三组前段输入非零。守卫禁用全部观察点，保存failure-stop.json后才普通Continue清理，80061正常exit0，LLDB关闭。没有把缺失阶段补造为通过，也没有足够证据认定漏回调的根因。

A完整148224帧原生WAV严格失败：69438个交错采样不同，最大24-bit整数差7，首差异frame14989，归一化RMS差8.793513699026185e-8。完整链回放明确拒绝不完整输入，exit1，不生成通过报告。

在确认A终止后才修改采集器：增加可选PIANOTEQ_READ_STOPPED_MAIN=1，主线程当前停止帧的PC必须精确等于仍登记的硬件点，且当前stop尚未投递该点的观察，才读取该当前帧。每次读取单独关联记录、stop、实际PC、线程、stage、epoch及counter；不允许读取PC+4补做历史。既有六槽与普通Continue守卫不变，读不到的历史仍拒绝。

验证器扩展主线程读取来源审计。用pass108真实六槽轨迹回归通过36503次替换、43874次Continue；把真实工作线程读取冒充主线程、改错恢复counter均拒绝。此检查证明审计类型守卫，不证明新主线程恢复分支已经在真实目标执行。

B进程85682已用新冻结源启动（debug-pass110-tail-envelope-b），后因重复观察被主动停止，清理后exit0，尚未通过；完整链、反向测试和音轨导出必须等待新的完整捕获。新增主线程恢复负向用例仅在B实际含恢复事件时执行，未把未执行分支算作验证成功。

## B重复观察拒绝与C限定恢复范围

B实际读取了6次当前主线程copy帧，PC与Continue来源确实吻合，但逐逻辑块检查发现它们全部重复了已投递的copy观察；例如epoch3/counter3072原始记录stop8997，随后其他线程停顿期间同一PC又被stop8998、8999重复读取，三份除site外全部相同。因此“当前PC与stop编号吻合”不能单独证明这是新的逻辑执行。

B记录16065条，consumer/audioTail各935块，copy为941条。没有删除重复记录或放宽一块一次copy的完整性条件。主动停止旧驱动时，宿主中断恰好发生在硬件槽替换：旧点已经删除、新点尚未建立（暂时5个点），明确记录为人为中止后的失败状态，不算六槽完整采集。检查当前停止PC为原登记的4601ac后，禁用剩余点，普通Continue清理至85682正常exit0，LLDB关闭。

B完整WAV同为148224帧，但44903个交错采样不同、最大整数差2，首差异frame25359，RMS差4.729018041221921e-8，严格失败。保留manual-stop.json、repeated-main-read-diagnostic.json、main-read-prefix-audit.json及pass110-b-audio-audit.json。早先prefix来源审计只能证明读取位置真实，不能视为新执行或完整捕获通过。

确认B终止后，C将主线程恢复限定为consumer、consumerPost、consumerCross、audioGain、audioEntry、audioReturn、audioAfterGains、audioTail。每个角色正常观察后立即被替换，固定copy/before/final及工作点不进入此主线程分支，验证器也拒绝这些角色冒充新主线程观察。旧pass108的36503次替换及2次真实工作线程读取回归通过，伪造主线程角色拒绝。此修改尚需C实际验证，未宣称底层调试问题根因解决。

C位于debug-pass110-tail-envelope-c，采集器重新冻结（后续完成结果见下）。驱动每40秒完成一次安全检查后，才检查stop-driver文件并决定继续；如需停止，可在下一边界返回提示符，不必在槽替换途中中断。新完整捕获、主线程恢复实际覆盖、严格全链及音频结果仍待完成。

## 组与辅助信号的独立音轨验收准备

终端导出现在分别写入五声部×（三个组+三路辅助）共30条float32 mono音轨，真实比较端点仍为audioTail。辅助音频入口是观察输入，之后包络处理与状态推进由计算提供；manifest保留此边界及时间初态仍观察的标志，不称为独立立体声。

新增独立Python验收器pianoteq_audit_voice_tail_stems.py，逐块从原生channels及auxiliary.values重建预期PCM，读取真实RIFF/fmt/fact/data，核对全部30种身份、从counter0的连续覆盖、原始float32字节及摘要。新分支的真实正向验收仍待C完成，未以合成文件冒充音频证据。

共享导出器的旧Rattle路径回归已经完成：从原先通过报告重新导出15条真实组音轨，独立旧Python验收器核对636288个float32采样字节同，端点audioReturn不变（pass110-stem-writer-legacy-rattle-audit.json）。未修改正在采集的任何既有Python脚本；新验收器是未被采集器导入的新文件。

## C完整采集、同次计算与真实组件音轨

C原生88953正常exit0，完成原始finish检查后complete=true，无错误或挂起上下文；LLDB已退出。55203条记录、3349个系数/工作返回块，copy/consumer/Gain/Entry/Return/AfterGains/Tail各3314块，五声部均从counter0连续覆盖。六槽43136次替换、50432次普通Continue审计；3317个源事件为3314次提交及3次合法跳过。

C有两次真实工作线程停止帧读取：epoch3 coefficients/counter192/stop5310，epoch4 envelopeResult/counter14144/stop32123，均通过实际PC、当前stop及Continue来源审计。主线程恢复事件为0，因此C不能证明该新恢复分支解决了A的缺失入口根因；固定copy观察保持逐块唯一。启动时列出的全部Python源在采集终止前哈希一致，未中途修改。

独立同次源→工作块→延迟/释放/组包络/cross→Rattle→终端包络回放正常exit0，共14212052项零差异。新增终端部分2843412项零差异，1093个主包络活动块；step/target由float32/FMA/expf计算，动态gain自行携带。次包络与时间包络活动块均为0，不能由旁路吻合宣称活动公式已动态验证。九次启用字段变化仍是观察输入，模型slope/scale、辅助入口及时间初态仍观察。

Rattle部分2552292项零差异，333次触发、40752个变化主组采样及73个控制归零的活动尾块。主要音频来自本次自算cross，不以原生Rattle入口/返回采样驱动；随后主组三路继续来自该计算结果。终端输出不从观察结果重置自有状态。

已实际导出30条audioTail float32 mono组/辅助音轨；独立Python按真实RIFF/fmt/fact/data重新读取，组636288、辅助636288，共1272576个float32采样全部与原生对应数据逐字节一致，五声部起点均为0。不是立体声，也未做归一化、对齐或容差处理。

C完整原生WAV仍严格失败：148224帧相同，但62348个交错采样不同，最大24-bit整数差5，首差异frame14989，归一化RMS差6.488028840691472e-8。组件通过不覆盖此失败。完整立体声和网页仍未接通。

新的完整C反向测试正在运行，尚不计为通过。私有证据：pass110-tail-chain-c-report.json、pass110-tail-chain-c.log、pass110-voice-tail-stems-c/、pass110-voice-tail-stems-c-audit.json、pass110-c-audio-audit.json、pass110-tail-chain-negatives-c/。
