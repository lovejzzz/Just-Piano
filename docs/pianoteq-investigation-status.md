# Pianoteq 深入分析：问题与验证状态

目标：本机 Pianoteq 9.2.5 ARM64。更新：2026-10-16，pass37。参数保存实验已修复；完整琴槌—琴弦—制音器耦合与网页声音等价性仍未完成。

| 问题 | 已验证证据 | 剩余缺口 |
|---|---|---|
| 参数编号到数值曲线 | 元数据、lookup、曲线公式、汇编及15个接口采样点 | 全部参数与逐音符插值 |
| 参数修改写入 | 13项命名参数；硬度与制音位置已跨越编辑模型→渲染模型的实际深复制链 | 模型合成分支、其它参数系数关联 |
| 参数保存不生效 | 官方standalone音频设备running、等待提交、保存；18个端点在新进程正确恢复 | 本机3秒等待不是通用完成保证，必须保留读回断言 |
| 真实音频干预 | 9项物理参数两端点，另10组松键/CC64测试，实际24-bit PCM | 音色统计不能代替模型逐样本验证 |
| 模态状态递推 | 持键8块35907float同；三场景释放窗口各15块、205825项同，含自己的能量、删模态、补偿及完整组输出 | 两场景同次控制、较深踏板跨运行输入；完整初始化、调度、带输入与最终立体声仍缺 |
| 模态组到声部缓冲 | 54存储延迟按四样本取整为52，计算组输出接到块传输；四组46080项同 | 模态源跨运行、活动后处理与非单位组混合未验证，GUI宽度作用点及最终立体声仍缺 |
| 多分量模态耦合 | 复系数多项式、伴随矩阵输入、复结果→频率/衰减、跨分量双重和归一化 | 已实测κ=π、γ=0；pass10复系数8/8 double逐位同；pass8的164个频率/衰减输出逐位同；原生QR、端点混合helper和特殊分支仍缺 |
| 二次效应 | Quadratic Effect→q→Fa+Fb、WaWb乘积、相位和；干声单变量测试部分预测成立 | 全部内部频率对和幅度乘积的定量验证 |
| 重击状态反馈 | 旧年龄/力度/释放/持续音色增益→新激励，含余弦调制具体式 | 尚未发现能定名为旧弦位移→琴槌压缩的完整联立方程 |
| 非线性约束链 | 记录生产→位置正弦权重→加权正交化→阈值反馈→模态状态 | bzzmode身份，不能直接等同琴槌或制音器 |
| 音板递推 | 系数、递推、输出变换与部分模型字段 | 网格构造、边界条件 |
| 琴槌硬度 | 五节点插值→截断对数谱→指数权重→幅度/相位初始P/Q；具体公式已恢复 | 当前预设全表、完整瞬时接触力与旧弦反作用 |
| 制音释放 | 同进程节点→挂起→消费→系数链11组9922项逐位同，含两种真实CC64输入且各自PCM同；pass34异常与pass35中途停止仍明确保留 | CC64完整曲线、速度来源、异常状态/时序原因、非零x及完整毡接触方程 |
| 制音位置 | 命名参数→音符曲线→余弦×指数模态权重→系数刷新；57个实际权重最大误差5.96e−8，采集PCM与原版一致 | p<0.125附加曲线、所有状态分支与完整动态轨迹 |
| 琴槌与制音器完整耦合 | 上述数据流与真实音频干预 | 接触力、接触/离开状态、各弦反馈与制音力的完整方程尚未闭合 |

本轮始终使用官方独立程序/CLI；没有使用 Pedalboard 或替代插件宿主。没有把未验证的反编译实现写入网页引擎，也没有“完全复刻Pianoteq”的验证结果。

pass4 新增 28 份硬度×力度样本的交叉比较（其中19份新渲染），另37份边界搜索新渲染与一次快速击键运行栈采样。全部使用官方CLI正常退出。A4/NY Steinway 的实测转换：Piano 71→72停止影响，Mezzo 44→45开始、98→99停止，Forte 71→72开始。结论限定于已测试点、参数值及首秒24-bit PCM，不代表全部预设或逐样本模型复刻。

pass5 新增32次官方CLI渲染，全部exit0：16次踏板/同异音重击、12次关闭五效果后的控制、4次Quadratic Effect单变量长音。控制预设都保存后在全新进程读回全部215参数，分别只改变5个效果开关或1个物理参数。干声重击经整数时移/单增益拟合仍有残差，但不足以唯一认定接触力；和频实验则用q=0主峰事先固定Fa+Fb预测频率，部分可分辨目标与预期增强一致，全部阴性/重叠结果保留。

完整接触力验证仍未通过。pass5的官方原版LLDB attach拒绝已在pass6经用户授权的独立调试副本上解决：硬件断点取得五节点/力度/返回值，4次float32计算逐位吻合；采集时PCM与原版相同。内部极点、位移、速度、力的完整数值轨迹仍未取得，不能声称完整三体接触模型已验证。

pass7取得真实N=3复系数，8个实/虚double中7个逐位一致，余项绝对误差7.86e−22；真实常数κ=π、γ=0。该次多线程硬件断点停止，未完成频率/衰减返回采集。制音释放和位置分别单断点采集正常退出，24个释放输出逐位一致、57个位置权重最大误差5.96e−8，两次PCM均与官方原版逐字节相同。先前双断点采集音频不相同的失败记录保留，不作无扰动结论。

pass8以单一固定内部断点完成32组复系数、复根、排序和频率/衰减输出采集（N=2/3，共82分量），正常exit0且PCM与原版逐字节相同。164个输出double逐位吻合，独立求根最大绝对差2.39e−15。依据实际值和原指令纠正先前排序表述：按衰减加1e−16频率的key递减，不是按频率递增。

pass9完成真实无输入块内核的JavaScript重建：128条运行快照，4096末态和8192输出float32全部逐位同，采集PCM与原版相同。另完成13份完整FXP结构和MD5验证，定位六项物理标量的精确4字节窗口；尚未解出完整预设模型表。网页功能检查通过并修复多设备/通道踏板和丢失pointer capture后的挂音；当前网页仍为独立音源，未与Pianoteq逐样本匹配。

pass10新增可执行JS激励谱和耦合极点模块：实际8/8复系数double逐位同，独立N=2/3求根后164个频率/衰减输出逐位同；原生QR算法尚未移植。真实263个L、给定原生H后的512个W乘积逐位同，Math.exp仍有39处末位差。完整FXP详细尾部已按实际reader逐字段消费，42份suffix=0；基础instrument仍有资源依赖，不能由此称预设模型完整。

pass11/12把真实制音全局能量补偿、8263个有效衰减与R、16526个A/B系数接到JS，所有已记录分量逐位同，系数捕获PCM与原版一致。系统4-lane exp/logf准确依赖已恢复并经独立库oracle检验，原谱权重和尾部R的末位差消除。内部8-lane exp另有1024个真实值逐位同，但该补充捕获PCM不一致，失败边界保留。完整声源生成、全部模型/预设、网页实际声音匹配仍未完成。

pass12资源存档进一步落地：1105成员MD5全部验证；D4完整50份A预设解码，扩展K2/Kawai后当前91份。NY基础B+de8曲线插值生成的5节点与pass6真实值逐位同。B大量suffix、22个version66 bank和fx特殊状态仍未解，不能将91份A和局部B当完整800预设及声音。

详细报告：

- [模态组到输出块传输](pianoteq-post-modal-transport-pass37.md)：四组46080项同；真实延迟54→52及计数器加64已核对。Stereo Width 保存后215项恢复，但本次未改变内部组混合量；中止启动与错误偏移匹配保留。
- [释放到连续模态输出与能量压缩](pianoteq-release-render-pass36.md)：三场景各15块，205825项同；窗口状态只初始化一次，E及模态移除由自己末态生成。三次停止全部保留，较深踏板明确为跨运行控制轨迹；最终立体声未验证。
- [同次释放节点、挂起消费与制音系数](pianoteq-release-queue-pass35.md)：11组9922项同；半踏板托住位置0.407666、较深踏板保持1，抬起后归零。dt由块长/采样率计算；一组中途停止即使数值615项同仍严格失败。
- [释放推进与声部交接](pianoteq-release-handoff-pass34.md)：八步自传递状态与系数桥接；异常运行在计数3712处位置及三个系数不同，实际PCM第4243帧开始偏离。完整音频审计保持失败；两次调试器停止与首次空捕获全部保留。
- [追加模态存档与谱修正](pianoteq-support-archives-pass33.md)：八张支持表由模型存档和已识别修正计算，13792项同；接回普通及快慢重复链。两份异常PCM与pass25旧异常完全相同，首差位于松键后，根因仍未证明。
- [重复击弦完整源表链](pianoteq-repeat-source-chain-pass32.md)：快/慢各11849项同，硬度到完整谱、追加、随机与连续历史接到函数最终四表。保留首次跨运行6处失败；20次最终音频均不严格相同，含两次明显差异，原因未定位。
- [真实重复击弦随机与历史更新](pianoteq-repeated-strike-pass31.md)：快/慢两组真实触发；随机修正各2000项同，连续历史桥接各3043项同，无逐次历史重置。原版重渲染亦有不稳定输出，音频严格一致性未通过；完整重复链尚未接通。
- [追加模态与最终源表桥接](pianoteq-excitation-append-pass30.md)：8次击弦14144项同，含单弦成对复制和最高音第二模态族；主次计算输出接到后续归一化及35907float连续渲染。13次采集11次PCM同，两次多音最大差1单位；重复击弦历史未完成。
- [完整谱控制、指数加权及弦间准备](pianoteq-spectrum-controls-pass29.md)：8次击弦10624项逐位同，A4计算源表桥接1024项同；20次采集17次PCM完全一致，3次多音最大差1整数单位并保留。额外五模态及后续状态未闭合。
- [硬度到激励谱标量](pianoteq-excitation-hardness-pass28.md)：8次击弦16组、48标量逐位同，默认位置修正桥接438项同；四类实际PCM与原版一致。完整谱构建、随机/重复分支和网页发声仍未闭合。
- [击弦位置幅度修正与真实保存](pianoteq-excitation-position-pass27.md)：官方保存三个预设后215参数新进程恢复；两个端点216振幅、288直接中间量逐位同，端点采集PCM与原版相同。修正错误modified门槛；相位标志及692ffc后续仍未闭合。
- [原始激励入口的分量混合与存档系数](pianoteq-excitation-component-mix-pass26.md)：八例16次调用，983个振幅、96个存档系数逐位同；覆盖三列高/低分段及非整节点插值。尚未跨越692ffc余下处理接到最终表，多音PCM的一整数单位差异保留。
- [次级追加、随机相位与完整最终表](pianoteq-final-excitation-pass25.md)：五例14440项逐位/整数全同；计算的四张最终表已接到35907float连续渲染。两路原始激励及随机初始化仍外置，首次A4采集出现明显PCM差异并保留，v2与原版基准一致。
- [和频生成、能量归一化与展开](pianoteq-post-excitation-pass24.md)：五例完整步骤输出4234项逐位同；计算的频率/衰减前缀已接到连续渲染，35907float全同。后续额外分量、振幅和相位仍外置，多音PCM的一整数单位差异仍未解决。
- [模态筛选和分组索引](pianoteq-mode-selection-pass23.md)：五例949个有效索引独立计算；筛选与映射合计5849项逐位同，接回8块连续渲染35907float全同。多音序列首次原版与后续一致运行有1个24-bit单位差异，异常完整保留。
- [激励表到声部初值与连续输出](pianoteq-voice-source-mapping-pass22.md)：源表重排、J 与参考衰减共921float逐位同；接入后8块连续渲染35907float全同，最终激励表和筛选索引仍外置。
- [动态频率轨迹到连续输出](pianoteq-dynamic-pitch-pass21.md)：64个按住/释放记录、384float逐位同；替换捕获pitch后8块连续渲染33699float仍全同。
- [模型曲线到动态音高控制源](pianoteq-pitch-source-controls-pass21.md)：68项真实曲线、力度缩放和初始化输出逐位同；共享控制及host78仍外置。
- [标量expf纯浏览器实现](pianoteq-native-scalar-exp-pass21.md)：64个实际返回及60461个独立系统oracle输入零差，区别于四lane指数与Math.exp。
- [幅度/相位到动态P/Q与连续分组输出](pianoteq-modal-initial-pass20.md)：184初始分量、8块连续渲染、7次频率投影及1536个完整分组输出样本，33690个float逐位同，不以捕获状态重置；初始激励表和控制轨迹仍外置。
- [原程序的纯浏览器三角近似](pianoteq-native-modal-trig-pass20.md)：736个实际sin/cos逐位同，Math.sin/cos负对照70处不同。
- [八lane尾部](pianoteq-eight-lane-tail-pass20.md)：保留实际额外padding读取与求和顺序，已接入完整分组验证。
- [存档刚度到拉伸RHS和完整频率表](pianoteq-stretch-rhs-pass19.md)：存档控制、115个谐波编号、95个约束及平滑、203项RHS、128键表逐位同；不再以捕获RHS或刚度表作计算输入。两个注册表权重、曲线运行模式及平台数学仍外置。
- [带冲激延迟补偿的平滑](pianoteq-stretch-smoothing-pass19.md)：6double系数、101float字段及delay逐位同，含非FMA/FMA次序与尾部延展。
- [拉伸矩阵、求解与128键频率表](pianoteq-stretch-system-pass18.md)：107个正弦、41209个矩阵元素、203个解及128个频率逐位同；计算表接入后2520个调律字段仍全同。刚度RHS与注册表权重仍来自捕获。
- [拉伸系统LU与残差回算](pianoteq-stretch-linear-pass18.md)：41209个LU double、203个pivot、203个解与203个Ax逐位同。
- [存档到源刚度、失谐和spread](pianoteq-source-controls-pass17.md)：128个中间double、1841个float逐位同，包含105音高三次刚度构建；ageing与系统数学依赖仍明示。
- [调律、拉伸消费和参考音校正](pianoteq-source-tuning-pass17.md)：105音高的2520个实际字段逐位同；拉伸表本身仍来自捕获。新源控制已接到A4/note70四参数及A4后续p/q验证。
- [模型到复耦合四输入](pianoteq-coupling-inputs-pass16.md)：A4的144输入与note70非零插值的140输入全部逐位同；A4预测输入继续经过p/q、扰动和极点计算仍通过。G/cache和部分数学依赖仍待消除。
- [复耦合p/q、确定性扰动与极点输入](pianoteq-modal-impedance-pass15.md)：36条实际调用、72个原始p/q及72个扰动后p/q逐位同；使用计算出的p/q后108频率和108衰减仍逐位同。部分数学函数仍需系统oracle。
- [存档到复耦合控制值](pianoteq-impedance-controls-pass15.md)：A4两个分支的四项控制值及3000点相位曲线与实际入口逐位一致；非零ageing及其他音高仍待验证。
- [全部工厂A、层和FX状态](pianoteq-factory-banks-pass14.md)：800顶层A、59内嵌A、69FX，包含prom/ryal/olos，全部实际record末端闭合。
- [全部58个基础B存档](pianoteq-all-base-archives-pass14.md)：58份均无未解析suffix；537负例拒绝；额外KVR2资源及运行语义仍需恢复。
- [存档谐波幅度到运行时权重](pianoteq-source-weights-pass14.md)：35个实际权重逐位同，double log/exp依赖及非恒等分支保留范围限制。
- [原始衰减到幅度、相位和归一化](pianoteq-modal-source-pass14.md)：A4两分支各阶段108个输出逐位同，完整声部未验证。
- [G/cache输入到lambda、中心与模态频率/衰减](pianoteq-source-poles-pass14.md)：108 lambda、36 center double逐位同，108频率和108原始衰减float32逐位同；p/q生产者及原生QR仍缺。

- [存档曲线到真实硬度表的JavaScript验证](pianoteq-archive-hardness-pass13.md)：10个硬度值及5个节点逐位同；FMA次序经真实值及寄存器定义复核，范围限定note69/All=0。
- [基础B存档解析扩展](pianoteq-base-prefix-pass13.md)：NY/HB分别195/194条曲线；未知suffix仍明确保留，不等于完整模态模型。

- [资源目录、完整工厂预设与基础B](pianoteq-builtin-resources-pass12.md)

- [制音位置、能量全局补偿与递推系数](pianoteq-energy-damper-pass11.md)
- [原生指数/对数的浏览器数值实现](pianoteq-native-math-pass12.md)

- [浏览器复系数和极点模块](pianoteq-browser-poles-pass10.md)
- [真实硬度对数谱、幅度乘积和音频对照](pianoteq-excitation-runtime-pass10.md)

- [JavaScript内核与真实输出重放](pianoteq-javascript-kernel-pass9.md)
- [实际块递推、FMA顺序和PCM对照](pianoteq-recurrence-runtime-pass9.md)
- [完整FXP结构与六项精确字段差分](pianoteq-full-fxp-pass9.md)

- [复根、排序、频率/衰减和音频验证](pianoteq-root-outputs-pass8.md)

- [多分量复系数的运行数值验证](pianoteq-runtime-poles-pass7.md)
- [制音释放与位置权重的运行数值和PCM验证](pianoteq-damper-runtime-pass7.md)

- [调试副本、截图报错与首次动态数值验算](pianoteq-debug-copy-pass6.md)

- [硬度、位置与和频激励的具体公式](pianoteq-excitation-pass5.md)
- [初始P/Q、重击与渲染状态公式](pianoteq-render-coupling-pass5.md)
- [多分量极点与幅度归一化公式](pianoteq-modal-pole-coupling-pass5.md)
- [重击/踏板的实际音频控制](pianoteq-audio-pass5.md)
- [和频预测的单变量音频验证](pianoteq-quadratic-audio-pass5.md)

- [琴槌硬度完整数据链](pianoteq-hammer-pass4.md)
- [释放状态与制音位置公式](pianoteq-damper-pass4.md)
- [实际音频与运行栈验证](pianoteq-audio-pass4.md)

- [参数持久化修复与真实音频](pianoteq-parameter-persistence.md)
- [参数到内部写入字段](pianoteq-model-setters-pass3.md)
- [耦合计算与运行栈证据](pianoteq-coupling-pass3.md)
- [参数曲线](pianoteq-parameter-mapping.md)、[音板公式](pianoteq-soundboard-equations.md)、[合成状态公式](pianoteq-state-recurrence.md)
- [先前音频试验](pianoteq-audio-validation.md)、[崩溃报告核对](pianoteq-audio-host-crash.md)

## 验证与证据保留

本地原始证据根目录：`~/.local/share/just-piano-analysis/`。pass2原始记录保留；pass3逐请求REA响应、官方CLI命令/日志、FXP、MIDI、WAV与运行栈独立保存。`audio-pass3/sha256-manifest.json` 的197个文件已重新核对，全部哈希一致；`combined.json` 的18个目标端点重新检查新进程恢复值，全部通过。

脚本 `scripts/pianoteq-live-parameter-experiment.py` 固化修复路径。后续整理增加验证端口占用检查、验证器存活检查和全部参数读回对照；这些整理通过Python语法检查，未冒充原音频实验的原样执行。实际运行脚本留在原证据目录。

REA pass3已导出 `pass3-evidence-bundle.json`（71条证据）和 `pass3-snapshot.json`；正常关闭原生目标和stdio会话，确认Ghidra分析进程退出。证据条数不代表物理模型覆盖率。


pass4 证据已导出为 `pass4-evidence-bundle.json` 与 `pass4-snapshot.json`（共127条，包含此前保留记录）。三个音频目录 `audio-pass4/`、`audio-pass4-boundaries/`、`audio-pass4-runtime/` 的77、113、7个文件已独立重算SHA-256，全部匹配。截至pass4尚无内部状态动态捕获；pass6/pass7已补充上述局部数值验证。仍没有独立引擎与原程序逐样本一致的结果；完整耦合仍缺琴槌激励数组变换之后的接触/反馈计算。


pass5新增REA响应与旧证据合并导出为 `pass5-evidence-bundle.json`、`pass5-snapshot.json`（156条保留记录，条数不代表物理模型完整度）。三个新音频目录的68、73、45个文件已由主线程独立重算SHA-256，全部匹配。原始调试失败日志是 `pass5-debugger-launch.log`。本轮文档及原始证据未被当成网页引擎的已验证复刻实现。

## pass38：宽度参数 A/B/A 实际音频对照

同一 running 官方实例中顺序保存 .5/.25/.5，三份均在新进程恢复215项参数。两份基准PCM逐字节相同，宽度修改音频稳定复现pass37结果。已排除本次实验中的一般保存流程差异；底层宽度计算与最终网页声音尚未完成。见 [pass38 对照](pianoteq-width-control-pass38.md)。

同轮新增声部消费延迟与增益实现，4个正式场景205344项逐位同，原生WAV同各自官方基准。释放主组附加信号仍有3199项待解释，未宣称整链等价。见 [pass38 声部消费](pianoteq-voice-consumer-pass38.md)。

## pass39：释放附加信号接通主组

恢复幅值整形、位置平滑、三节滤波设计与SIMD历史、复数振荡调制和相加；pass38缺口3199处样本差异全部自行算出。连接已计算延迟与后段增益，96块窗口80986项逐位同，原生WAV同官方基准。释放目标及初始物理控制量仍观察，最终立体声和网页整段音源未完成。见 [pass39 释放附加链](pianoteq-release-injection-pass39.md)。

pass39补充：标准初始化接入后，默认消费链80996项；五个正式场景179966项逐位同。Damper Noise A/B/A读回215项均正确，但恢复基准PCM有最大4整数单位差异，严格失败保留；运行证据显示其全局幅度恢复后多一个float32单位。完整GUI转换及隐藏状态回转原因仍待查。

## pass40：空间反馈及声部尾部

新接通合并/还原、三行打包五tap反馈、淡入与辅助分配，96块176640项逐位同，原生PCM同官方基准。新增本机scalar sinf快路径重建，2632项系统C oracle通过；首次淡入49项差异已解释并保留原诊断。辅助源及空间tap初始化仍观察，最终立体声与网页未完成。见 [pass40 空间尾部](pianoteq-voice-spatial-tail-pass40.md)。

pass40补充：独立连续计算路由缓存，默认与width25各147456项逐位同；连同两个空间尾部场景合计648192项，四个正式捕获PCM均同各自官方基准。宽度修改的空间输出相同，但路由延迟208/155/0变为42/32/0样本，底层采用向上取整。GUI到精确延迟的公式尚未恢复。六次原生尝试中，前期key-mix探测PCM出现已见过但原因未明的变体，严格失败保留，未用于正式重放。完整立体声及网页声音尚未验证。

## pass41：全局输出末段

新增全局路由缓存及三行相加的160块连续重放，默认与width25合计184320项逐位同，两份原生PCM符合各自官方基准。路由输入和另一个全局分支仍观察，尚未接上pass40声部链；函数末尾仍为三行内部信号，最终双声道和网页均未完成。见 [pass41 全局输出](pianoteq-global-output-pass41.md)。

## pass42：两声道路由与实际 PCM 前缀

恢复三行到两声道的固定路由和稳定末级音量，默认与width25合计412160项float逐位同；各10240帧计算PCM前缀与官方对应前缀完全一致。进一步只读捕获实际写入循环，确认INT32_MAX缩放与double FMA，3072项signed32吻合。五次原生完整WAV均符合对应基准，量化假设失败及八个负对照保留。全局输出到路由前的处理仍观察，不能认定完整声源或网页已复刻。见 [pass42 立体声与PCM](pianoteq-stereo-output-pass42.md)。

## pass43：空EQ与房间干声系数

计算空EQ初始化及关闭混响湿信号后的三行干声增益，默认与width25四次正式场景共510720项逐位同，原生完整PCM符合各自参考。结果接入后段两声道路由，两个10240帧PCM前缀继续相同。更早的CABN卷积和增益初始化仍观察，完整声源未完成。本轮七次原生尝试有三次不完整失败，全部保留。见 [pass43 全局与房间处理](pianoteq-global-room-pass43.md)。
