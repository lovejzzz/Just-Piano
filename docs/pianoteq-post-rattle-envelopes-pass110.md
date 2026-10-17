# pass110：Rattle之后的实际包络计算

目标是在同次从声部起点计算的链上继续越过416d3c及2523b4，以真实460f1c输出比较，随后连接空间与立体声。完整复刻仍未完成。

## 观测与计算边界

新增可选PIANOTEQ_VOICE_TAIL_ENVELOPES=1，要求已有早期消费、Rattle及延迟替换模式。audioReturn之后，同一个槽依次观测460f08（两类终端增益包络之后）、460f1c（时间包络之后），再回源调度；仍只有六个登记及活动用户硬件点。各端点验证声部、消费年龄、组矩阵与辅助矩阵身份。额外两条记录/块使预计总量超过原50000保护上限，因此仅本模式把记录保护上限设为60000；连续工作块、初始化、阶段覆盖与正常Continue审计要求保留。

[dsp/voice-tail-envelopes.mjs](../dsp/voice-tail-envelopes.mjs)实现416d3c首次启用时的float32/FMA系数生成、共享322148四lane递推及辅助矩阵末行提交。三个组不能各自把同一个gain推进一次；每行都从同一个起点开始，仅辅助调用提交新gain。primary/secondary的初始gain=1、step位模式501502f9、target位模式2edbe6ff、ready=0来自07a60c初始化指令，不从音频目标复制。该初始化的REA证据ev_2c1fd167624bde04536ed935d0bd6fd033a736bb174fc863ff1b4f51a5ce0f02。period从源采样率生成；slope/scale仍是初次模型观察输入。

启用事件仍来自本次audioReturn观察；它们可能先于按activationAge自动启用发生，不能只用年龄阈值替代。ready、step、target和gain随后自行携带，后续原生动态字段只比较。辅助音频入口仍观察，因为cross之后还有未连接的辅助处理；主组三路由同次自算Rattle提供。

2523b4采用double状态、double样本乘法及float32落地，两个时间边界先重置递推值；不把包络倍率先缩成float32。时间包络的初始状态仍观察，后续自己推进。时间状态的三个double字段逐double精确比较，整数计数精确比较，避免先转float32掩盖差异。特殊c68处理路径尚未实现，遇到主动配置明确拒绝。

## 本轮证据状态

新原生A进程80061正在采集，尚未完成，不能计为通过。四个主要采集器已冻结，全部Python脚本有启动时哈希，采集中不修改它们。

早段单个真实活动主包络块（epoch0/counter13184）以观察输入作组件检查，392项零差异，包含自算step/target/gain和384个组/辅助输出样本。进一步以观察音频入口、计算初始化和自有携带状态检查1434块，1230372项零差异，其中583块主包络活动。此prefix不完整，上游音频仍观察，不是完整同次源链通过；secondary及时间包络活动块均为0。

新增合成指令语义测试覆盖逐行提交、携带gain下溢、首次系数生成、时间阶段边界；npm test通过。首次合成测试错误地预期低于原生gain下限的携带值继续发声，实际共享斜坡正确清零；按已核实的下限语义修正测试预期，未修改算法迎合测试。它不替代真实活动音频验证。

旧pass108 A的完整同次链回归正常exit0，11368637项零差异（pass110-legacy-rattle-regression.json）。新完整捕获、完整源链重放、负向测试、导出组音轨和最终WAV审计仍待完成。新增负向用例尚未运行。

私有证据：debug-pass110-tail-envelope-a、pass110-active-primary-prefix-component.json、pass110-tail-computed-init-prefix-component.json。原生模型、表、音轨和完整捕获不提交GitHub。
