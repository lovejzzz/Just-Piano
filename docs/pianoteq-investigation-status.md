# Pianoteq 深入分析：问题与验证状态

目标：本机 Pianoteq 9.2.5 ARM64。更新：2026-10-15，pass7。参数保存实验已修复；完整琴槌—琴弦—制音器耦合仍未恢复。

| 问题 | 已验证证据 | 剩余缺口 |
|---|---|---|
| 参数编号到数值曲线 | 元数据、lookup、曲线公式、汇编及15个接口采样点 | 全部参数与逐音符插值 |
| 参数修改写入 | 13项命名参数；硬度与制音位置已跨越编辑模型→渲染模型的实际深复制链 | 模型合成分支、其它参数系数关联 |
| 参数保存不生效 | 官方standalone音频设备running、等待提交、保存；18个端点在新进程正确恢复 | 本机3秒等待不是通用完成保证，必须保留读回断言 |
| 真实音频干预 | 9项物理参数两端点，另10组松键/CC64测试，实际24-bit PCM | 音色统计不能代替模型逐样本验证 |
| 模态状态递推 | 幅度/相位→P/Q初值、改频时历史投影、二阶递推及门限淘汰 | 全部替代实现及动态内部数值 |
| 多分量模态耦合 | 复系数多项式、伴随矩阵输入、复结果→频率/衰减、跨分量双重和归一化 | 已实测κ=π、γ=0；复系数7/8 double逐位同，余项误差7.86e−22；频率/衰减返回与端点混合helper仍缺 |
| 二次效应 | Quadratic Effect→q→Fa+Fb、WaWb乘积、相位和；干声单变量测试部分预测成立 | 全部内部频率对和幅度乘积的定量验证 |
| 重击状态反馈 | 旧年龄/力度/释放/持续音色增益→新激励，含余弦调制具体式 | 尚未发现能定名为旧弦位移→琴槌压缩的完整联立方程 |
| 非线性约束链 | 记录生产→位置正弦权重→加权正交化→阈值反馈→模态状态 | bzzmode身份，不能直接等同琴槌或制音器 |
| 音板递推 | 系数、递推、输出变换与部分模型字段 | 网格构造、边界条件 |
| 琴槌硬度 | 五节点插值→截断对数谱→指数权重→幅度/相位初始P/Q；具体公式已恢复 | 当前预设全表、完整瞬时接触力与旧弦反作用 |
| 制音释放 | note-off→有界释放状态→四次变量/四阶多项式→指数衰减→二阶系数；运行时24个输出分量逐位吻合，采集PCM与原版一致 | 非零x分支、物理单位与完整毡接触方程 |
| 制音位置 | 命名参数→音符曲线→余弦×指数模态权重→系数刷新；57个实际权重最大误差5.96e−8，采集PCM与原版一致 | p<0.125附加曲线、所有状态分支与完整动态轨迹 |
| 琴槌与制音器完整耦合 | 上述数据流与真实音频干预 | 接触力、接触/离开状态、各弦反馈与制音力的完整方程尚未闭合 |

本轮始终使用官方独立程序/CLI；没有使用 Pedalboard 或替代插件宿主。没有把未验证的反编译实现写入网页引擎，也没有“完全复刻Pianoteq”的验证结果。

pass4 新增 28 份硬度×力度样本的交叉比较（其中19份新渲染），另37份边界搜索新渲染与一次快速击键运行栈采样。全部使用官方CLI正常退出。A4/NY Steinway 的实测转换：Piano 71→72停止影响，Mezzo 44→45开始、98→99停止，Forte 71→72开始。结论限定于已测试点、参数值及首秒24-bit PCM，不代表全部预设或逐样本模型复刻。

pass5 新增32次官方CLI渲染，全部exit0：16次踏板/同异音重击、12次关闭五效果后的控制、4次Quadratic Effect单变量长音。控制预设都保存后在全新进程读回全部215参数，分别只改变5个效果开关或1个物理参数。干声重击经整数时移/单增益拟合仍有残差，但不足以唯一认定接触力；和频实验则用q=0主峰事先固定Fa+Fb预测频率，部分可分辨目标与预期增强一致，全部阴性/重叠结果保留。

完整接触力验证仍未通过。pass5的官方原版LLDB attach拒绝已在pass6经用户授权的独立调试副本上解决：硬件断点取得五节点/力度/返回值，4次float32计算逐位吻合；采集时PCM与原版相同。内部极点、位移、速度、力的完整数值轨迹仍未取得，不能声称完整三体接触模型已验证。

pass7取得真实N=3复系数，8个实/虚double中7个逐位一致，余项绝对误差7.86e−22；真实常数κ=π、γ=0。该次多线程硬件断点停止，未完成频率/衰减返回采集。制音释放和位置分别单断点采集正常退出，24个释放输出逐位一致、57个位置权重最大误差5.96e−8，两次PCM均与官方原版逐字节相同。先前双断点采集音频不相同的失败记录保留，不作无扰动结论。

详细报告：

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
