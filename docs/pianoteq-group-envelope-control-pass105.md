# pass105：重击组包络控制与连续增益

本机Pianoteq 9.2.5 ARM64，2026-10-16。独立调试副本保持原始代码段；五个固定只读硬件点，无目标内存/寄存器写入，无Pedalboard。

此前完整消费链对前四个旧声部只看到较晚的包络状态，需观察gain种子。本次单独从声部birth、控制入口/返回、组处理入口/返回记录完整五声部，控制调用者35f8d8、组处理调用者4609dc严格匹配。

6edcf8激活规则：active低位已置位则返回，否则active置1、elapsed置0。strength截断到至少float32位模式358637bd；rate乘strength取负，再除以转为float32的duration；非零时乘3debc8e3后调用本机expf作为step，零时step=1。原有gain不重置。使用已恢复nativeScalarExp和每一步float32舍入。

2173次组处理从各声部counter0开始，允许调用者合法旁路的间隙；没有把缺口当作实际执行。每次三个组各64采样，由自有gain/step/elapsed连续推进。总443412项零差异，417216个实际输出采样相同。10次激活，其中6次携带此前已衰减gain；本次没有在active状态下的no-op控制调用，该分支仅静态恢复。

出生断点早于配置写入，观测为零状态；第一次应用的gain=1、step=0、active=0、elapsed=0作为固定初值接受检验，仅rate和duration从该入口作为模型输入。后续所有gain/step目标只比较，不能修改预测。strength及音频组仍为观察输入；尚未与源到模态的整链同次连接，不称完整独立钢琴。

既有pass102完整源→消费链回归8101111项零差异（仍保留其观察边界）。16项扰动验证全部符合预期，包括改动输出、携带gain/step、重激活gain和控制返回step目标时仅出现对应失败且预测音频不变；改动strength、模型rate或源音频则预测改变；缺失返回/出生、未审计stop和错误地址均拒绝。

捕获4371记录，4379次正常Continue审计，无错误或挂起上下文；原生52771正常exit0。完整WAV148224帧与参考长度相同，但103600个交错采样不同，最大24-bit整数差8，首差异帧13036，归一化RMS差1.5055820295086342e-7；完整音频严格失败。组件通过不能覆盖该失败。

私有证据：debug-pass105-group-envelope-a/runtime.json及owned-resumes.jsonl、pass105-group-envelope-a-report.json、pass105-group-negatives-a/results.json、pass105-a-audio-audit.json。商业模型、原生WAV和原始反编译内容不提交。下一步用已验证的控制取代完整消费链中晚观察的包络种子，并继续恢复strength和模型配置的生产。
