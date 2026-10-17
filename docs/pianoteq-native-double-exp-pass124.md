# pass124：本机double exp接入耦合与时间包络

完整复刻尚未完成。本轮移植当前主机arm64 `libsystem_m`的exp(double)算术，用于替换两条回放路径中的外部exp或Math.exp候选。新E依旧挂在LLDB启动，没有新的Pianoteq原生采集；以下分别是系统数学对照、旧系数记录回放和旧完整捕获的诊断回放，不合并成新的独立全声源声明。

## 只读取独立数学探针自身

新增`pianoteq_math_self_dump.c`，在自己的进程中用公开dlsym/dladdr定位系统exp并读取代码/数学表，限制读取首尾属于同一加载镜像，只创建新文件，不附加Pianoteq或改目标状态。实际读取4096字节，包含所需128对数学表项。通过自建Mach-O对象反汇编原始字节，核对范围处理、FCVTMS/SCVTF、补偿乘法、FMA多项式、指数位调整及次正规结果的最后取整。

新增`native-double-exp.mjs`，使用已有精确binary64 FMA模块，表项以原始double位模式保存。它不是对Math.exp的别名，不含Pianoteq模型、预设或观察到的返回值。整数转换后的零显式归一化为正零，避免Math.floor(-0)与SCVTF整数零的差别。输出比较范围包括正常结果、次正规结果、溢出/下溢和特殊值；不声称穷举全部binary64输入、保留NaN payload或复现浮点异常标志。

## 独立系统数学核对

新C程序只调用本机系统exp，不含分析目标代码。固定seed124的90466项中，90450项非NaN结果逐位一致，16项NaN语义一致，零失败。组成如下：

| 输入来源 | 数量 |
| --- | ---: |
| 旧耦合回放产生的exp输入 | 61 |
| 时间包络参数 | 3 |
| 常用音频数值范围 | 20000 |
| 广正常结果范围 | 20000 |
| 次正规结果范围 | 10000 |
| 随机IEEE位模式 | 30000 |
| 范围缩减边界邻居 | 10000 |
| 溢出/下溢边界邻居 | 387 |
| 特殊值 | 15 |

61组应用相关输入来自此前系数回放的数学调用日志，不是新观察的Pianoteq系统函数入口；本机C结果也与原日志中保存的系统结果相同。同一集直接Math.exp有4991项非NaN结果位不同。该结果证明本机库的对照吻合，不是数学正确舍入的形式证明或新钢琴音频测试。

初版A/B输入流摘要出现五处NaN quiet位差异，输出流摘要相同；差异记录保留。原因是在生成随机IEEE输入时先转JS Number再编码，NaN可被quiet。生成器改为直接保留原始十六进制输入字，不调整任何输出比较条件；C/D两次独立进程的完整输入/输出摘要均相同，90466项各自零失败。NaN仍仅比较语义，没有借此声称payload等价。

## 从耦合生产中移除exp程序调用

`pianoteq_replay_impedance.mjs --native-double-exp`实际用新模块产生exp结果，不再为exp调用外部数学程序。两个模式36条旧原生记录：72个原始p/q、72个扰动后p/q均精确一致；再接极点回放，108个lambda、36个中心、108个频率和108个原始衰减仍相同。

61个不同exp输入由新模块产生，本场景其余外部系统数学调用从176降为115；log2f、sincos、tan、pow和log仍需要外部程序。Math.exp在这61个输入中有7个结果与新实现不同；新模块直接参与系数生成。原有空band、模型/音高、跨运行与独立根算法等覆盖限制全部保留，没有宣称全耦合闭环完成。

## 完整诊断PCM中的时间包络

固定点完整回放新增互斥的`--native-double-exp`与旧`--exp-candidate`模式。新模式下五声部的起音attackRate由新模块生成，报告明确为nativeDoubleExpComputed=true、nativeDoubleExpCalls=5、expDoubleCandidateUsed=false；同时传两种模式会在读取捕获前拒绝。

使用原pass120 D完整捕获，14421825项数值比较零差异，27918项double精确比较，全部128512帧生成PCM与同次原生相同。另用Python独立读取实际导出的RIFF文件，257024个PCM24交错声道采样字节全部一致，PCM摘要e9255f062d2c9838b35762bbc50138c5b8af3e5cd3951e88a32dff25ea932d70。

D的三次未登记调试停止仍使captureAccepted、passed、finalStereoAudioVerified为false；正常参考仍有142263个声道采样不同。本轮没有修改原始捕获或正常参考，也没有用新数学模块的局部结果覆盖这些失败。Rattle音频入口、部分模型/控制、全局反馈等既有观察输入仍存在。

新系统数学单元测试已加入npm test，覆盖可区分Math.exp的合成位样例、次正规取整、零/范围/特殊值语义、错误类型及模式冲突拒绝。整套npm test通过；网页原独立六音色测试通过不等于Pianoteq音色等价。

## 仍未完成

新E还是既有启动进程，系统继续报告Developer mode disabled；挂起根因尚未证实，等待用户操作后复验，未重复启动或编辑冻结Python依赖。其他系统数学与模型生成、完整琴槌—琴弦—制音器闭环、正常参考差异、全部预设/键盘/力度/踏板及网页实时接入仍未完成，未合并、未部署。

私有证据：pass124-double-exp/（自进程代码/表、提取摘要、A–D数学核对及NaN输入差异）、pass124-impedance-native-exp-report.json、pass124-native-exp-poles-report.json、pass124-{final-,}native-exp-stereo-report.json、pass124-computed-native-exp.wav、pass124-native-exp-wav-audit.json。未提交原始系统机器码、商业表、预设、完整捕获或原生音频。
