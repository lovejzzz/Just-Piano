# 模型到四个复耦合输入

pass15仍直接使用`2ff628`调用前捕获的s0..s3。本轮新增`dsp/coupling-inputs.mjs`，用基础B的频率曲线、G/cache源参数以及先前恢复的模态准备计算这四个float。A4两个分支的36次调用、144个输入均逐float32位相同；将计算结果继续送入pass15实现，72个原始p/q、72个扰动后p/q、108个频率和108个原始衰减仍全部逐位相同。

仍保留G/cache输入、曲线运行标记、系统powf与部分double数学函数依赖。此结果没有证明整个存档到声部的生成已经完成，也没有证明网页声音一致。

## 曲线的真实来源

`71475c..714768`通过model vtable的B getter取得基础模型；`71479c..7147ac`将B+2eb0/2eb8的音高坐标复制到共享对象+48，`7147b0..7147d0`将B+2ec8/2ed0的曲线数组复制到共享对象+60，曲线stride为0x50。`4ba248`取得owner+38，`4ba2e8`将其写入G+1240。

因此`194ad8..194af0`交给`09b1bc`的grid是`*(G+1240)+48`，存档位置为 **B+2a38结构内的curve_list478，即B+2eb0**，不是预设A的任意相似曲线。模块直接使用已解码字段，没有从dB或p/q拟合曲线。

本次运行的完整25条曲线与全部音高坐标共1097个float值，与存档逐位相同。两个mode分别核对。曲线的dimension=1、flags=0、special=0来自实际采集，未由序列化版本推断。

## 算术与分支

```text
s0 = float32(G.frequency)
s1 = float32(base_double * double(cache.coordinateScale_float))
s2 = float32(center_double)
L = curve(left, s2, mode3)
R = curve(right, s2, mode3)
blend = fma32(L, float32(1-alpha), float32(R*alpha))
s3 = float32(entryDb + blend)
```

base、center由`prepareModalInputs/modePoleInputs`重新计算；不是从本次s1或s2倒推。`194b04..194b0c`先进行double乘法，`194b6c..194b70`才转换成float。center计算见`194bd8..194bf8`，转换见`194c44`；两个曲线调用在`194c50/194c68`；混合和最后加法在`194c70..194c9c`。

耦合端点的entryDb在`102ee8`明确清零，由`102f00`传入。分量独立路径则在`10330c`调用系统log10f，计算`float32(10*log10f(power[j]))`；power来自cache+248，源存档为B2548.vectors[2]，不足分量数时重复末值。新增模块明确拒绝这一未动态覆盖的分支。

A4的音高选择是left=right=16、alpha=0；另加note70真实采集覆盖非零插值，见下文。

## 运行验证与缺失记录

`scripts/pianoteq_capture_coupling_inputs.py`在`194ca8`使用单个硬件点，读取四参数、选择索引、alpha、入口entryDb及完整频率grid。仍只运行已授权的独立调试副本，启动前验证__text身份，不写目标内存。

第一轮正常退出，只有33个唯一模态调用，缺mode0/modal23、24、25。其132个输入全部吻合，但重放器按模型截止条件要求36条，报告`passed:false`并exit1。缺项结果留在`debug-pass16-coupling-inputs/js-replay.json`。

v2正常退出，完整36条调用全部通过，报告`debug-pass16-coupling-inputs-v2/js-replay.json`。两轮PCM均与相同FXP/MIDI的原版一致：48kHz、24-bit、双声道113152帧，PCM SHA-256为`1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`。这证明对应采集的非扰动，不是新模块完整音频输出的等价证明。

另以`PIANOTEQ_CAPTURE_NOTE=70`观察初始化期间生成的note70。其两分支均选择left=16、right=17、alpha=`0.3333333432674408`，真正使用了两条不同的曲线。由完整坐标表及中心频率截止条件预测35次调用，实际35次，140个参数全部逐位一致；完整grid仍是1097值逐位相同。本次prepare所需G/cache及向量来自同一采集的configuration，系统powf由公开C调用器独立计算、保留输入输出位，不通过s1/s2拟合。结果在`debug-pass16-coupling-inputs-note70/`。该次也正常退出且上述PCM哈希相同；音频MIDI仍为A4，note70证据来自真实初始化调用，不能声称已验证网页note70声音或note70完整p/q输出。

故意取消插值、只使用左曲线作为负对照，35个s3全部不同；结果在`negative-no-interpolation.json`，没有把该差异抹成容差内通过。

重放器按计算得到的中心频率截止条件生成所需模态集合，缺项、重复项或截止外调用均不会通过。p/q重放器新增`--coupling-input-report`，校验完整144输入后实际使用预测输入继续计算，捕获输入仅作对照。

```sh
node scripts/pianoteq_replay_coupling_inputs.mjs \
  "$HOME/.local/share/just-piano-analysis/base-model-full-values-pass13.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-modal-source/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-poles/powf-inputs.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass16-coupling-inputs-v2/runtime.json" \
  /tmp/coupling-inputs-report.json
```

随后给[pass15命令](pianoteq-modal-impedance-pass15.md)添加`--coupling-input-report /tmp/coupling-inputs-report.json`，再将生成的impedance报告交给source-poles重放器。本机完整后续报告为v2目录下`impedance-replay.json`和`source-poles-replay.json`。

本轮复用已有REA证据而未重复开启Ghidra：`194870`为`ev_17c01201a559d65cbc6692c419265a7a7acf42fd8d0a55bb8368eb234829aefe`，`1026dc`为`ev_978d392659b04ec9355d528ceeb26a9c6ccaef3847e1c747b062da398c19a2ed`，`09b1bc`见`ev_da8e15c473bf3ace422848a32fe00abcd4e78309476592711899c0dc67cd2760`。均保存在pass15-evidence-bundle.json。共享对象生产者的上述地址来自同一ARM64的pass3原始汇编切片，不伪称新增REA记录。
