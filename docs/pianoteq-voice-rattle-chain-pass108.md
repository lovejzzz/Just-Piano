# pass108：同次声部计算接入Rattle

A已正常exit0，完整同次回放11368637项零差异；最终立体声仍未通过。目标仍是完整物理声音与网页复刻。

在pass107从声部起点至consumerCross的六槽方案上，末尾槽改为consumerCross→audioGain(460c84)→audioEntry(30bd30)→audioReturn(30c104)→rattleSource。其余出生、初始化/刷新、工作返回、复制和系数点保留。总登记/活动硬件点仍为六，更新继续在普通Continue之前执行并审计，无目标代码、数据或寄存器写入。

音频入口/返回记录实际三个组、模型配置、环池状态和共享表；表仅第一次出现时读取数值，不提交商业数据。每个声部必须从counter0完整覆盖，Gain/Entry/Return与消费块逐条配对。

新回放设计用同次自算cross组供给中间增益，进一步供给Rattle，不用观察到的cross、Gain或Entry组作预测输入。Rattle参数由真实源提交链的自有current值按声部/消费年龄关联；入口control及cachedControl只比较。Rattle动态状态从零初始化并自行携带，滤波器系数/历史、触发、波形叠加沿用已验证算法。共享波形表和固定模型配置仍观察，未宣称全部模型来源独立。

后处理主动分支仍未实现；本次已知场景要求中间处理器关闭、空EQ。此前pass107的39项测试不能作为本轮新增连接的通过证据。新增反向用例检查Rattle入口采样/参数不影响预测，改变共享表或配置会影响输出，以及缺失端点/不支持的主动分支必须拒绝。

已导出audioReturn实际端点的15条自算组件音轨，独立RIFF/PCM读取与原生对应采样直接核对。该端点仍不是最终立体声，完整WAV和参考必须单独严格审计。

## A次完整采集与回放

原生69441正常exit0；48570条记录，3349系数入口与3349工作块、3314次消费以及相同数量Gain/Entry/Return全部齐全，五声部从counter0连续覆盖。无错误、挂起音频上下文或未应用槽替换，六槽36503次替换、43874次普通Continue审计。源事件3316次对应3314实际提交与2次合法跳过。采集四份源文件与冻结哈希一致。

完整同次计算共11368637项检查零差异，Rattle连接部分2552292项零差异。控制值来自自有源提交状态，Gain/Entry音频来自同次自算cross输出；中间采样与入口control/cachedControl仅比较。333次真实触发、40752个主组样本发生附加信号变化、73个控制归零活动尾块匹配。初始动态状态、系数、历史及消耗位置自行推进。

导出audioReturn真实端点的15条计算float32组音轨；独立Python读取RIFF/PCM并与原生audioReturn.channels核对636288个采样，全部字节相同。完整立体声仍未接入该链，辅助输入、固定模型配置和共享源表仍观察。

完整A原生WAV与参考同为148224帧，但49597个交错采样不同，最大24-bit整数差4，首差异帧21029，归一化RMS差5.981418594477695e-8；严格失败，不用组件通过覆盖。

旧E路径回归8816354项零差异，按原端点重新导出15条组音轨，独立读取636288采样字节同。57项反向测试全部符合预期：比较目标扰动不改变预测，共享表与初始模型scale扰动改变预测；缺失端点、非零初始动态状态、不支持的主动处理分支均拒绝。包括两项实际停止线程读取的来源审计测试。

私有证据：debug-pass108-rattle-chain-a/runtime.json、owned-resumes.jsonl、collector-provenance.json；pass108-rattle-chain-a-report.json、pass108-voice-rattle-stems-a-audit.json、pass108-a-audio-audit.json、pass108-early-e-regression.json。商业表、原生WAV、完整捕获和反编译内容不提交。

本次有两次实际停止线程读取：epoch2/counter5888/stop8364及epoch4/counter1472/stop12372。两者均在已登记的工作返回点0x100472fd0，由当前停止帧读取，delivery为stopped-frame、原生stop reason为1；记录、实际PC、连续counter和Continue审计互相绑定。错误counter及缺失delivery来源均被负向测试拒绝。这证明恢复分支本次实际执行，不证明macOS调试漏回调的根因已经解决，也没有补造历史输出。
