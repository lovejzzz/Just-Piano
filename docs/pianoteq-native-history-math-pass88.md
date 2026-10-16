# 支持历史的系统数学实现：pass88

本轮恢复本机macOS25F80 ARM64的exp2f/log10f值计算，移除当前释放→最终激励路径默认使用的数学候选。完整独立声音仍未完成。

## 指令和常量来源

普通独立system-math-oracle程序在main硬件断点停下后，只读获取libsystem_m的函数指令与数学表，再正常continue到exit0；未运行或注入Pianoteq内部调用。exp2f/log10f模块file地址分别为19029f360/19029f4b0。保留指令、原始常量和读取脚本；首次脚本文件名含连字符导致导入失败，该尝试没有产生常量，确认进程终止后才改名重试。

LLDB按函数名反汇编会把紧随函数的常量表误解为指令。实现仅依据真实控制流/返回边界及单独memory read的数据，不把表内unknown/伪指令当代码。未新增REA记录，复用既有piano调用路径与本轮系统库只读证据。

[exp2f](../dsp/native-scalar-exp.mjs)使用与已有expf完全相同的128个表字，逐字确认后共享TABLE。区别是将x直接加doubleword42c8000000000000，利用双精度舍入得到1/128网格，再按原生位操作构造2的幂尺度。残差多项式使用3fcebfbdff30d656和3fe62e4453e10dae，保留double乘法/FMA及最终float32舍入。|x|≥256、Infinity和NaN走值语义特殊分支。

[log10f](../dsp/native-scalar-log10.mjs)恢复65组倒数/对数表、四个double多项式系数、log10(2)常量及c0c10000整数偏置。保留原生尾数分段、子正规归一化、整数指数和double FMA次序。处理±0→-Infinity、负值/NaN→NaN、+Infinity→+Infinity。没有用logf乘常数或Math.log10替代。

两函数模拟浮点值，不模拟异常flags/errno；NaN载荷位不保证一致。当前钢琴路径使用有限输入。

## 独立系统库验证

[bulk C oracle](../scripts/pianoteq_history_math_bulk_oracle.c)以普通系统函数计算，每个输入/输出通过IEEE float32字传递，使用-O0及-fno-builtin-exp2f/-fno-builtin-log10f编译。[验证器](../scripts/pianoteq_verify_native_history_math.mjs)包含范围归约半格邻点、表分段边界、各指数、子正规值、溢出/下溢邻点、正负零、Inf/NaN、固定种子位模式/区间采样，以及pass87实际48个调用参数。

| 函数 | 输入数 | 逐位匹配 | NaN语义匹配 | 差异 |
| --- | ---: | ---: | ---: | ---: |
| exp2f | 412745 | 412742 | 3 | 0 |
| log10f | 273863 | 248857 | 25006 | 0 |
| 合计 | 686608 | 661599 | 25009 | 0 |

同组输入中float32(2**x)与系统exp2f有1326处差异；float32(Math.log10(x))在本组未出现差异，不能因此替代已恢复的log10f或宣称所有输入均一致。686608项不是全部2^32输入的穷举。

共享expf文件的回归也通过：旧原生64个实际返回和60461个系统oracle输入零差异（含NaN类别比较）。未改变原有expf算法。

## 接回真实击键、历史与最终四表

[支持构造模块](../dsp/release-controlled-support.mjs)默认使用恢复出的两个函数。[实际重放器](../scripts/pianoteq_replay_release_final_chain.mjs)无选项或--native-history-math均使用原生数学重建；保留--platform-math-candidate只为重现历史实验，不是默认实现。

在原始pass87同次完整捕获上重放，**16960项float32比较仍零差异**，包括3352个连续包络块、3301次复制、4次旧release读取、4次自算支持历史更新、452次随机推进、最终四表各615个值。报告现在nativeExp2fLog10fImplemented=true、platformMathCandidatesExplicit=false。55项负对照在新的原生数学路径全部拒绝；未仅重跑候选路径来给新实现背书。

没有重新渲染原生音频或声称新的声学验证；沿用pass87真实WAV的失败边界：完整148224帧虽与原版同长度，但105268样本不同、最大整数差10。没有独立完整WAV，也未替换网页音源。

## 仍未完成

当前已去掉这两个支持历史数学候选，但其它模块/分支的数学依赖不能据此一并称为恢复。仍缺预加权源生成、本轮模型初始化/逐次控制上游、跨调用随机状态生产、其它支持分支、主次合并、后续相位/和频归一化和完整声部/立体声贯穿；全部预设语义、完整接触耦合与最终声音等价也未完成。

私有pass88-*保存只读库指令/常量、独立oracle、真实捕获的新数学重放及负对照，原始pass87证据不改写。商业模型和WAV未入库。没有Pedalboard、目标代码/数据/PC/寄存器写入或注入调用；最终合并/Pages发布仍待完整验收。
