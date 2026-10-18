# pass252：逐击混合与共享硬度系数改为独立生产

新增[存档混合控制模块](../dsp/archive-excitation-blend.mjs)，接入pass251的运行时激励生产器及连续链。它计算blendFloor、inputBlend和两个sharedBlendCoefficients；四个原生字段现在只用于比较，不再作为分量混合、邻弦幅相和硬度谱的输入。

## 指令来源与数值

继续使用已校验的ARM64列表及已有REA分析所对应的本机构建，没有修改目标执行数据。

- 714494c..71449b4将B19c8曲线的三个向量及模式复制到shared+f0。57e5a4..57e5b8以H78（本次力度）调用019a34，结果写H90；716550将H90作为激励入口的第二浮点参数。新模块从当前存档B19c8和前向MIDI/manager计算的力度求值。
- 019a34对标量曲线转44f8a4，边界模式3；普通标量分支使用float32除法计算插值位置，再做既有FMA混合。这里复用linearModelCurve，未误用另一条缓存倒数插值路径。B19c8的普通标量版本和实际运行模式在新采集中核对。
- 激励参数块起于H2fb8，参数+28即H2fe0。blendFloor取音高生产路径已显式提供的velocityRuntime.host2fe0，不从本次比较字段回读；宿主条件仍是外部明确输入，本轮实际为0。
- 7144908..7144920：shared+b8 = FMA(float32(A9bc), float32(-0.8), 1)。A9bc对应A9a8版本10的scalars[4]，沿用[pass243已验证映射](pianoteq-archive-velocity-producer-pass243.md)。7144934..7144938将B1a18写shared+bc，成为第二项系数。

连续链把四项自产控制覆盖到实际硬度/谱输入，也传入逐击源表计算；不是仅生成一个对照报告。每次击键两模式使用同一明确宿主表达式条件。原有历史prepared-source路径不变。

## 新只读原生观察

[采集器](../scripts/pianoteq_capture_excitation_blend.py)使用三处硬件观察点：7144924、71449b8和57e5bc。读取存档标量到shared的边界、B19c8与shared曲线，以及五个实际声部的力度、H90、H2fe0和系数；补采还读取发声实例的完整shared曲线。

第一次采集正常退出，但构建shared对象与发声shared对象的地址不同，原先要求同一地址的核对失败。没有把它计成通过。原始记录及拒绝原因保留在pass252-blend-capture和pass252-rejected-same-address-assumption.json。

确认原进程结束后另开新目录补采实际发声对象。新版[核对器](../scripts/pianoteq_verify_excitation_blend.mjs)分别核对构建边界和发声边界：两个早期构建上下文、一个实际shared实例、五个不同声部，共110项零差异。包括完整X/Y和模式；发声力度由当前MIDI与前向manager独立计算。构建到活动配置的交接过程没有直接观察，报告保留builderToActiveConfigurationHandoffVerified=false，没有以内容相同冒充对象交接已验证。

两次原生进程均terminal、exitStatus=0，无普通或blendErrors。继承的音板采集协议未运行完，parentSoundboardCaptureComplete=false保留。新采集不含独立音频对照，audioSamplesComparedHere=0。

## 连续声音验证

| 场景 | 全字段检查 | 差异 | 实际内部音频 |
| --- | ---: | ---: | --- |
| 默认五击连续尾音 | 14,250,844 | 0 | 30条WAV，1,272,576个float32样本逐字节同 |
| 低位置连续窗口 | 614,243 | 0 | 3条WAV，49,152个float32样本逐字节同 |

每例新增40项混合控制比较。两例所有连续输出和尾音输出与pass251完全相同；本轮又导出并直接核对真实原生分轨。仍是既有A4场景的生产路径替换，不扩大音域、预设或最终立体声范围。

更新后的依赖测试给blendFloor、inputBlend和sharedBlendCoefficients也安装抛错getter。默认、低位置各自2160个源值、5个力度、20个随机词、200个硬度值和40个混合控制值全部吻合，禁止字段访问及原始观察文件读取均为0。局部访问测试中的repeat衰减和宿主条件来自摘要绑定的本次自算连续报告；连续链实际直接传入repeat及音高路径的明确宿主条件。

## 因果与拒绝检查

- 同时修改首次权重记录的四个原生混合比较值：完整报告恰好4处差异，自算49,152个音频样本不变。
- 只把解码B19c8的Y加.001：截至age7104，305,183项检查中94,973处差异，已比较104块/19,968个输出样本，全部不同；随后严格pruning布局检查拒绝，没有完整报告。
- 只把解码B1a18加.01：截至age3648，158,822项检查中50,118处差异，已比较50块/9,600个样本，其中9,599个不同；随后同样拒绝。两项证明模型参数进入后续声音计算，不是界面保存验收，也不冒记完整负例音频。
- 新原生观察中的H90目标、活动曲线目标、A9bc目标各改单项：各恰好1处差异，五份独立预测全部不变。
- 缺少宿主条件、未知B19c8版本、缺少共享系数、非有限力度四项均明确拒绝。

## 证据与剩余

私有证据：pass252-runtime-v1、pass252-blend-capture-v2/baseline-v1、pass252-fresh-blend-report-v2.json、pass252-default-report.json、pass252-low-report.json、两份stems-audit、两份source/low-access-audit、pass252-final-validation.json、pass252-negatives/results.json、pass252-fresh-negatives/results.json和pass252-helper-guards.json。商业表格、预设、曲线和原始WAV不提交。

剩余注册/运行常量、初始化与路由控制、非零表达式条件、配置交接和其他音区/模式尚未全面验证。继续去除其他硬度、谱及声部控制的观察依赖，连接完整全局输出；最终立体声、全音区/力度/踏板/工厂预设、AudioWorklet、保存重载及实时性能仍未完成。不合并、不发布。
