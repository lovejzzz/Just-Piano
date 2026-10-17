# pass121：预设到终端制音包络的模型映射

本轮新增参数生成模块及完整回放接入口；新的同次原生采集E尚未取得观察记录，不能称为新的参数或音频验证通过。旧D完整回放回归仍数值吻合，但仍保留pass120的捕获拒绝及正常参考音频失败。网页、合并及部署没有变化，完整复刻未完成。

## 从REA证据核对的实际计算

本轮读取既有REA/Ghidra的pass111证据，并在摘要为8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094的原始ARM64副本上复核相关指令；不是新的在线REA查询，也不是原始C++源码。

`673d00`读取选定的模态衰减行，取最小值，再限制为至少1；`718010..718050`在源行数为0时用1，否则调用这个helper，将结果写主终端包络slope。次终端包络slope由零寄存器写为0。这里不是琴槌接触力或制音毡碰撞力公式。

时长先由已有`archiveDampingDuration`从正常保存的FXP编辑值/曲线和配对基础模型逐键表生成，再由`1c5b40..1c5b6c`求float32的2/referenceFrequency下限：参考频率非正时下限0，否则取helper时长与下限较大者。

`1c5b88..1c5c14`的乐器分支在flag等于1时覆盖该时长。note<60时，ratio=float32((note-21)/39)，结果为单次float32 FMSUB的2.1-ratio*1.26；其余音符使用(note-60)/48以及实际指令位模式3f570a3d和3df5c288。后一range常数不能直接替换成一般float32(.12)。主终端scale取min(duration,1)，次终端scale取duration。

`archive-terminal-model.mjs`实现以上计算。选定衰减行、参考频率与乐器flag仍是明确的上游观察输入；较晚的时长覆盖尚未独立产生。它不把实际durationTarget用作预测输入，而在回放中仅拿它比较；遇到尚未恢复的后续覆盖，应留下数值失败，不用目标覆盖预测。

## 同次采集与回放接口

固定点采集器在既有selection点增加模型上下文：从原指令使用的sp+d8读取源表，保存列数、行数、选定行及该行衰减值，另读取同次参考频率、乐器flag和只用于比较的G+fac。没有增加硬件观察点。cabinet记录也新增实际sourceDescriptor，避免把采样缓冲区指针误作描述符。

新增`--archive-terminal-source=`回放选项，检查预设文件身份、捕获命令及基础来源文件摘要。在声部年龄零计算四个终端slope/scale字段，初始化包络时使用生成值；实际终端字段仅比较。缺少新同次输入的旧D捕获已实际被拒绝，未合成、回填或跨运行拼接上下文。

E的13份Python传递依赖已在启动前冻结；启动中的采集器及依赖没有被编辑。当前LLDB仍停留在process launch，目标进程存在、尚无音频或模型观察，不能从空runtime文件推断运行完成，也没有重复启动。系统只读检查返回Developer mode is currently disabled；这是一项实际状态，**尚不能单独证明它是挂起根因**。已向用户提供需管理员授权的开启命令，等待外部状态变化后复验。

## 已执行的检查与局限

合成测试通过：选定衰减行最小值及至少1限制、空行分支、正/非正频率下限、乐器分支边界常数、比较目标不影响预测，以及缺行/越界/非有限值拒绝。这些不是新的原生动态分支验证。

未启用新参数模式的旧D完整捕获回归：14421825项比较零差异，27918项double精确比较；完整128512帧生成PCM与同次原生零差异，正常参考仍142263个声道采样不同。报告仍captureAccepted=false、passed=false、finalStereoAudioVerified=false，没有更改旧D结论。启用新模式使用旧D时则明确报Actual same-run terminal model inputs required，不生成通过报告。

新模式的同次系数对照、反向扰动与实际完整音频验证仍需完成；上游模态衰减表和参考频率的独立生成、较晚覆盖、其他模型/效果/预设、完整琴槌—琴弦—制音器闭环与浏览器集成仍未解决。

私有证据：pass121-terminal-source-evidence.json及三份原始指令记录、pass121-archive-terminal-source.json、pass121-d-regression-report.json、debug-pass121-terminal-model-e/。商业表、预设和完整捕获不提交。
