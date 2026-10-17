# pass107：从基础模型生成重击相关控制

目标仍是本机Pianoteq 9.2.5 ARM64；完整物理声源、全部预设和网页等价性尚未完成。

静态STR浮点指令扫描找到唯一向对象+378写入的候选1c64fc。检查1c5320的指令确认，模型访问器返回的B+2100八条曲线，经019a34（44f8a4）按音高求值，依次写入G+378、37c、380、384、388、38c、390、394。07aac0/07aae8分别把G+37c写到H+2f20、G+378写到组包络rate。

B+2100是已经完整解码的version3八曲线记录；新模块archive-repeat-model.mjs使用已有精确float32/FMA曲线插值生成这些字段，不含商业曲线常量。调用必须明确提供runtimeMode；曲线存档版本本身不能证明运行时log-X/特殊模式。

当前测试预设rattle-midi.fxp的独立结构/MD5检查与文件SHA核对通过，身份为steinwayny、原始预设NY Steinway D Mix。所用B来自已验证的58模型私有解码，原始presources.dat SHA仍d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d。

对C次现有真实记录做独立模型字段核对：五声部A4、两组谱来源，包络rate、采样率计算duration、重复击键比例、三项历史随机化控制、G+394随机控制，以及四个旧声部保持时长，共64项float32逐位一致。G+384本轮没有对应原生观测，不计验证。验证仅note69与请求的linear-clamp模式；不是全部音高或全部模型通过。

另以C的观察consumer输入，替换原先从首块读入的rate，改用存档现场计算，再自行推进释放附加与组包络：1674189项零差异、636288输出采样相同。报告明确groupEnvelopeRateComputedFromArchive=true、groupEnvelopeModelRateObserved=false，但fullCaptureComplete=false，输入仍观察。C因缺一个上游系数入口而拒绝的整链结论不变。

完整链重放新增显式--archive-repeat-model=source.json选项：读取私有B字段、核对预设SHA，运行时按音高计算组包络rate。其它七项字段此时仅单独核对，尚未替换完整链中全部相应观察输入。E完整同次采集和带存档速率的回放现已通过8816354项零差异；初始运行时rate只比较，不作为计算输入。负向整链B的39项已全部符合预期。完整立体声仍失败。

复现字段核对：

```sh
node scripts/pianoteq_replay_archive_repeat_model.mjs decoded-base-values.json inspected-preset.json native-capture.json report.json
```

私有证据：pass107-fixture-preset-structure.json、pass107-rate-model.asm、pass107-archive-repeat-c-report.json、pass107-archive-repeat-source.json、pass107-archive-consumer-component-report.json。商业模型表、FXP、原生音频与反编译内容不提交仓库。

观察输入组件的四项反向验证已实际运行：修改首块运行时rate目标只产生1项比较失败，计算PCM SHA保持不变；修改存档速率曲线产生296186项差异且预测PCM SHA改变；未知运行时模式和缺失曲线均拒绝。此处没有把不完整C改成完整捕获，报告始终保留其上游失败。私有证据pass107-component-source-negatives-report.json。

REA/Ghidra本轮对1c5320与07a60c的完整批量反编译正常返回，证据ev_2c1fd167624bde04536ed935d0bd6fd033a736bb174fc863ff1b4f51a5ce0f02。07a60c伪代码把duration显示为普通int cast，精确舍入仍以原始FCVTPU指令为准；没有把该伪代码直接当作截断实现。

E的64项模型字段核对也全部通过（captureComplete=true、captureErrors=[]）。E导出15条从声部起点开始的计算组件音轨，独立读回636288采样字节同；具体范围及完整原生WAV失败见pass106记录。REA已导出380条证据并正常关闭到pass107-snapshot.json。

首次整链反向测试A因力度源从约0.75改成0.95后触发模态布局不符而提前拒绝，未生成供哈希比较的报告，测试原预期many-different，因此该轮测试失败保留。此为预期分类错误，未放宽正向零差异或布局比较。测试B将该大幅改动明确列为reject，并新增2^-22小幅改动要求预测音频改变；独立小幅试验已产生172196项差异且预测音频改变。测试B全套39项已通过，A失败保留。

整链B的直接源/目标实验：运行时rate比较值改变仅1项失败、预测PCM不变；存档速率曲线改变导致582830项差异且预测PCM改变。未知模式、曲线不足与预设身份SHA不符均拒绝。旧pass102同次链回归8101111项零差异。
