# pass74：重复渲染差异已出现在旧释放状态

本轮首次取得同一离线运行中的再击控制、两路硬度消费和完整原生WAV。两次各95项计算逐位相同；跨运行最早的**已观察输入差异**是第2击前的旧释放值。改变这一输入足以重现另一运行的再击强度和硬度标量。完整PCM仍不同，上游包络为何分歧尚未查清；不是完整声音复刻的通过结果。

## 固定站点完成离线采集

使用同一授权调试副本、dry FXP、fast MIDI、48kHz/24-bit双声道。先做无硬件点的LLDB控制：默认ASLR设置和`target.disable-aslr=false`均正常exit0，因此不能把ASLR认定为先前启动拒绝的原因。正式运行保留正常地址随机化，从分析目录启动，无应用代码、授权/完整性检查或系统安全设置改动。

首轮用pass73的动态启停点采集，出现断点ID2（after）而frame PC仍为before地址的事件。严格检查停止，记录一个before后拒绝继续计算；错误文件保留。关闭本轮站点后让程序正常完成exit0，该运行不计数值成功。没有改PC、寄存器或目标内存，也未把错误回调当作合法after。

[固定采集器](../scripts/pianoteq_capture_fixed_repeated_strike.py)始终启用三个地址：`35ef10`、`35f6bc`、`693ff8`。运行期间不重分配硬件站点，每次回调要求frame PC等于实际断点地址。结束确认原生exit0后才finish并关闭站点。它读取pass73同样的控制/源表，但不采exp输入/返回；exp实现及之前活动调用验证仍由pass70/73提供，**没有将计算调用数当作新的原生exp观察**。

| 完整离线采集 | 原生PID/退出 | 击键 | 硬度主/次 | 检查 | 硬件阶段 |
| --- | --- | ---: | ---: | ---: | ---: |
| A，直接采集原型 | 29290 / 0 | 5 | 5/5 | 95/95 | 11 |
| C，发布的独立采集器 | 30784 / 0 | 5 | 5/5 | 95/95 | 11 |

两次无读取错误、无受限继续，最多3个活动点。公开采集器和A执行的原型，除文档字符串外已按Python AST比较相同。一个尝试复用模块的B包装原型没有解析成功回调名称，首次站点只停住而未采到数据；关闭其站点后正常渲染结束exit0，0行文件和原型保留，未冒充完整采集。最终发布经过C实际运行的独立版本。

[固定重放器](../scripts/pianoteq_replay_fixed_repeated_strike.mjs)要求fixedSites标记、5次完整before/after、每击恰好一条主路和一条次路、真实对象/线程绑定，以及11次固定集合阶段。每次计算自己的再击控制并供给硬度谱，原生控制和结果仅比较。五点硬度曲线/源频率仍观察，cosf仍明确使用候选，全部已计算exp不读原生返回。

## 跨运行差异所在

[比较工具](../scripts/pianoteq_compare_fixed_repeat_runs.py)按击键序号和主/次模式绑定，忽略跨进程对象地址，不把两个运行混作一个输入。原生整数精确比较，浮点按float32位比较。完整3442项结构/数值检查得到152处差异；这些包含重复的amplitudeStorage目标，**不是152个独立状态**。

第1击的已捕获输入/输出全部相同。第2击前，已捕获生产者输入只差：

| 字段 | A | C |
| --- | ---: | ---: |
| old.release | 0.025966161862015724 | 0.02583368495106697 |
| 计算并实际验证的attenuation | 0.5935163497924805 | 0.5943316221237183 |

旧年龄、计数、力度、踏板及其余生产者输入相同。随后第2击两路源振幅有72个元素不同，完整振幅存储又重复报告72处；两个消费控制与各自primary/secondary结果也不同。频率、衰减、相位和曲线在本次比较中相同。

单变量反事实检验：复制A的第2击生产者输入，仅把old.release改成C值，确认整个输入对象随后与C相同；自行计算再击控制，再保留A的源表/曲线求两路硬度。预测的attenuation及两路primary/secondary/referenceFrequency共7项与C实际目标逐位相同。正常负例将C的release翻倍则产生7项差异。

这证明该标量差异可以沿已恢复算术传播到实际硬度结果。没有据此宣称72个振幅差异或整段PCM差异都已由该输入唯一解释，更没有证明未经调试的每次原版差异也来自同一原因。

## 旧释放值的上游位置

ARM64写入搜索定位到`4604cc..4604d8`：声部`+2f24`取自声部`+ab0`，即首个模态对象V=声部+168的`V948`。`472f20`包装函数在更新输出后推进这个包络：

```
if V944 != 0:
    if V948 < 1:
        delta = f(V8fc * f(blockSamples))
        denominator = min(V944, f(V914 * 5))
        V948 = min(1, f(V948 + f(delta/denominator)))
    else:
        V948 = 1
```

此处乘、除、加分别舍入，无FMA。V944自身来自更早释放系数生产。该包络的逐块状态、V944输入及复制时序尚未在本轮连续采集；目前只是进一步明确下一处活动取证目标，不能把静态更新式写成已闭合根因。

## 完整原生PCM依然失败

A/C都是同次完整离线WAV：142080帧、48kHz、双声道24-bit。两者167609个交错样本不同，最大整数差6320，归一化RMS差0.0000393402085079664，首差帧10244。

控制/硬度局部检查通过与完整PCM不一致分别保留。原版自身不稳定已在pass73无调试对照中证实；这不能豁免本轮音频判据。也不能把当前观察到的声源输入差异解释成仅末级量化问题。没有输出浏览器独立WAV，网页声音等价性和最终合并部署仍未完成。

10项固定采样负对照全部拒绝：release改动7处差异；历史、生产者输出、硬度输入目标、硬度输出目标的单项扰动各1处；错误阶段、fixedSites标记、缺少after、重复主路及缺少显式cosf候选均拒绝。两个正例、Python/JS检查及采集器AST一致性验证通过。

REA重新恢复包络更新与声部复制函数，证据`ev_003749d0b92eeb15cdd00c313813e1eb7edc38cb7c7afcfc5dab727581b1e125`，与保留ARM64指令交叉核对；累计333条证据已导出并保存快照。

私有材料：`debug-pass74-normal-aslr/`、`debug-pass74-default-aslr/`、失败的`debug-pass74-offline-repeat/`、固定A/B/C目录、`pass74-*`。不提交模型表、预设或WAV。此前失败没有用成功报告覆盖。

复验：

```sh
node scripts/pianoteq_replay_fixed_repeated_strike.mjs "$P/debug-pass74-fixed-repeat-a/runtime.json" /tmp/fixed-a.json --cosf-candidate
node scripts/pianoteq_replay_fixed_repeated_strike.mjs "$P/debug-pass74-fixed-repeat-c/runtime.json" /tmp/fixed-c.json --cosf-candidate
python3 scripts/pianoteq_compare_fixed_repeat_runs.py "$P/debug-pass74-fixed-repeat-a/runtime.json" "$P/debug-pass74-fixed-repeat-c/runtime.json" /tmp/source-differences.json
```
