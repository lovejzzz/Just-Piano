# 位置、rolloff和释放增益接入存档来源（pass244）

本轮把当前五击主链的两个位置权重输入和三个释放增益输入改为自身存档计算。默认场景完整内部音频继续逐字节一致；零/负位置的原生载入语义仍未恢复，明确拒绝，没有将原始基础曲线直接当作运行时回退。

## 已验证的计算与来源

新增 `archiveModalDampingControls`。正值预设位置分支按321e78的ARM顺序计算：

```
position = min(0.5, max(float32(0.001),
                      float32(float32(A1110)*curve(A1118,note))))
rolloff = curve(B3140,note)
gainScale = curve(B3190,note)
cubicGainScale = curve(B31e0,note)
cubicScale = curve(B3230,note)
```

四条基础曲线位于B2f10 mar_param的相对+230/+280/+2d0/+320。1c5cc0..5d74产生G+fb8/+fbc/+fc0/+ff8/+ffc；07ac68..ac70初始化主位置，718474..8490按分支选择后写入V+8d4；43df50..df80复制rolloff及三个增益，其中rev64交换的次序保留。只支持明确的 `initialized-primary-no-overrides` 运行条件，位置事件修改尚未接入。

REA分析651f90、653900、5337f0、321e78，随后分析1f9988、93251c、44f8a4，两次会话均正常terminal0，所有项ok。响应SHA分别为 `5003986a03b82473505c179088a9a0bc9b00e03050e1f5c7c45e505f6582e5b0` 和 `2c2661eaa1938c96b5f0392b8551354d4849fcf62d727ddab9a570a113f897c5`。没有从这些函数名推断完整机械接触力。

## 新原生数值验证

默认与上限采集使用43e048单个只读硬件点；后续诊断采集最多4点。均在独立调试副本运行，__text核验不变，无目标写入、PC/寄存器修改或Pedalboard。

| 场景 | 位置/rolloff | 比较 |
| --- | --- | --- |
| 默认NY、note69 | 0.21276596188545227 / 4250 | 11项零差异 |
| A1110=1的私有副本、note96 | 0.5 / 3333.333251953125 | 11项零差异 |
| A1110=0.0001的私有副本、note69 | float32的0.001 / 4250 | 11项零差异 |

每次11项包括G层5项、模态对象5项及主位置1项，三个目标均实际terminal=true、exitStatus=0、采集错误为空。原生WAV均为48kHz、双声道24bit且非静音。参数副本在新进程中加载。下限生产值虽通过，完整模态位置权重在position<0.125时的额外曲线分支仍未实现，不能扩写成该场景完整音频已匹配。

## 零值试验失败与明确限制

将文件A1110改为0后，初稿按原始B30f0线性曲线预测0.210317462682724，但观测G、模态对象和主位置均为0.21150840818881989，三项失败。后续日志复核发现目标拒绝了该FXP，这些值不能代表请求的零值预设。失败报告保留，没有拟合修正。

v4的调试回调错误为空，但目标报告了预设载入失败；测量到的note69 getter进入非零预设分支，乘数为0.20455972850322723，并使用一条88点运行时曲线；它并非本机原始B30f0的11点数据。记录的曲线flags均为log_x=0/special_mode=0，因此不能把差异简单解释为对数插值。1f9988在静态上存在默认曲线归一化路径，但该候选点在v4未命中，未证明它是本场景的实际生产者。这组观察不能证明有效零值输入存在载入规范化，须先解释预设拒绝条件。

v3探索采集未按note筛选，超过64条上限，带错误，不能作为通过证据；采集器现已在异常时关闭其观察站点，避免重复继续同一错误。v4改为只取note69，正常退出、回调错误为空、3条曲线记录，但目标预设加载失败。新DSP对非正A1110直接抛出“unverified native loading semantics”，不读取运行时曲线回填预测。导出保留B30f0供后续研究；当前候选只消费另外四条基础曲线及两个正值预设字段。

## 连续主链和实际音频

新私有导出入口 `pianoteq_export_damping_archive_inputs.py` 从当前资源/FXP独立取字段，要求唯一模型、匹配预设、显式note及 `--initial-position`，商业输出只能写入新的仓库外文件。

回放新增 `--damping-source`。从击键前就创建自身控制模型，三个释放增益实际送入 `DynamicReleaseVoice.refresh`；位置和rolloff同时送入初始及后续位置权重，原生相应值只作审计。polynomial、rateScale、位置运行条件及其它尚未闭合的输入仍明确。

正式五击报告：14,230,710项检查零差异，30条内部float32 WAV。独立Python读回并直接与原生audioTail记录比较，1,272,576个采样逐字节一致，全从counter0开始、无归一化。报告 `dampingControlsFromArchive=true`、`positionAndRolloffControlsObserved=false`、`releaseGainControlsObserved=false`，并保持 `releasePolynomialAndRateScaleStillObserved=true`。

只改一个原生rolloff目标，恰好一项失败，自身预测不变；只把输入A1110乘0.99，回放在实际模态剔除布局分歧处严格拒绝，退出1。没有完整差异报告，未编造数量或取消原门控。

私有证据为 `pass244-continuous-report.json`、`pass244-continuous-stems/`、`pass244-stems-audit.json`、`pass244-damping-{baseline,clamped96,floor}-v1/`、零值v1..v4及负对照。新测试覆盖乘法、上下限、源字段独立性、非正位置拒绝、未知曲线模式和运行条件；受影响脚本语法检查通过。iCloud读取停滞后先终止自有操作、确认终端，再使用校验过的当前源码快照；未覆盖用户工作。

同次完整模型、零值载入生产者、位置事件/额外曲线、释放多项式和rateScale、完整琴槌/弦/制音毡耦合、最终立体声、全音区/预设和网页接入仍未完成。当前内部音频是历史捕获范围内的独立计算回归，`sameRunModelGenerationVerified`、`completeVoiceVerified`、`finalStereoAudioVerified`均未升级。未合并或发布。

## 日志复核修正（pass245）

进一步复核发现，零值v1至v4的原生控制台均明确报告 `Could not read fallback.fxp: corrupt FXP file: Corrupt Archive rd err#marap_oo.hh:4516`。即使进程退出0且产生非静音WAV，也不能证明请求的预设加载成功。此前将v4称为“干净”只检查了调试回调错误，没有检查目标程序的预设错误；这一证据口径现已纠正。88点曲线和非零乘数不能用于推导有效零值预设的运行语义。

默认、正值上限和正值下限三次日志没有预设载入错误，已有33项正值比较不受影响。回放验证器现在强制读取并绑定原生日志SHA，遇到预设读取/损坏错误立即拒绝。零值分支仍明确不支持。私有原始证据保持原样。

新三点只读采集进一步确认拒绝条件：`5616ac`读取A1110，等于零跳转`561744`，当已有错误字符串为空时进入`5617a8`并记录4516。零值v3在同一对象地址上依次记录0/0/0，flags=0，回调错误为空、terminal=true、exitStatus=0；此前v1/v2探索超出启动预设记录上限，保留为失败诊断，不列为通过。v3仅记录零值及原始正值，去重并限制32条，3个硬件站点，全程无目标写入。源为已校验的ARM反汇编，静态证据留在私有 `pass245-position-validation-static.json`；动态证据为 `pass245-position-loader-{zero,positive}-v3/`。

因此，对当前版本79/当前模型输入，零标量是被载入器拒绝的文件状态，不能按getter中存在的零值分支宣称它是可加载预设。无需再拟合那条无效场景中的88点曲线。当前优先未完成项恢复为有效输入的额外位置曲线、位置事件、释放多项式/rateScale及完整连续耦合。
