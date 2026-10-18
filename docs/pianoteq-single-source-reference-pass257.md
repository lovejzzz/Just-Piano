# pass257：修正单分量源调用，A0频率缺口闭合

pass256留下的A0频率/基础谱1,006处严格差异已消除。同一份五音符原生捕获、相同3,252项检查现在全部逐位相同，没有改目标、放宽容差或用原生频率替代正式输入。

新原生初始四表采集进一步通过6,186项严格检查；A4两个连续音频场景保持完全一致。**这尚不是A0完整声部或最终立体声等价验证。**

## 错误在调用语义，不在复数倒数公式

194b04..194b0c计算double `endpoint.base * float32(coordinateScale)`，194b68把它保留在sp28；194d5c将其传入d2。逐行谐波坐标则在194bd8..194bdc产生，并通过194d64传入d4。

6d2c10把d2保存到d13、d4保存到d12。N>=2走多项式构造，使用的是后者。N=1的6d2f50..6d2fb8则直接使用前者：

```
reference = endpoint.base * float32(coordinateScale)  // double乘法
r = 1 / (p + i*q)
frequency = float32(FMA64(reference / -pi, Im(r), center))
rawDecay = float32((reference + reference) * Re(r))
```

已有singleComponentPole的数值算术和C位模式夹具本身正确，但参数名mode掩盖了d2的含义。[联合源调用](../dsp/coupled-pole-source.mjs)此前错误传入逐行谐波坐标；现在单列分支传固定reference，多列仍保留原调用。辅助数值函数为兼容已有调用保留mode参数名，注释明确它在此调用处表示参考频率。

同一194870的[独立分量调用](../dsp/independent-pole-source.mjs)也有相同错误，一并修正。它的实际独立端点/混合模型本批没有新增原生采集；这里的覆盖是静态调用核对及合成回归，不能挪用纯联合模型的五音符结论。

单列快速路径不使用kappa/gamma/多分量decay floor，因此取消N1对这些无用参数的强制要求。N2/N3的完整参数检查保留。每个单列trace记录singleComponentReference，便于检查固定参考和逐行坐标没有再次混淆。

## 原先失败的严格测试

| 音符 | 检查数 | pass256差异 | 修正后差异 |
| --- | ---: | ---: | ---: |
| 21 / A0 | 1,977 | 1,006 | 0 |
| 60 | 580 | 0 | 0 |
| 69 | 352 | 0 | 0 |
| 72 | 299 | 0 | 0 |
| 108 | 44 | 0 | 0 |

正式预测仍从存档和独立初始源生成。核对器原有“原生频率输入”的分离诊断仅作定位，未用于修复或正式通过判断。

## 新原生初始四表

[新只读采集器](../scripts/pianoteq_capture_initial_source_tables.py)使用695108一个硬件点，读取主源初始frequency/decay/amplitude/phase完整矩阵及基础谱缓存。[核对器](../scripts/pianoteq_verify_initial_source_tables.mjs)自行构造主源，用归一化振幅及后置相位结果与实际缓存比较。

五音符21、60、69、72、108各经过两种实际消费者调用，共6,186项检查，0差异，分别3,219 / 1,354 / 820 / 695 / 98项。计数包含两种消费者重复读取同一主源缓存；它不是同时验证两套初始源，也不是6,186个独立状态。报告primaryInitialTablesOnly=true、secondaryInitialTablesVerified=false、runtimeSourceOptionsStillExplicit=true。

原生进程terminal、exitStatus=0、错误列表为空，10次调用与绑定MIDI顺序一致。当前上下文中的注册量、运行模式和后置相位等条件仍显式，不宣称已关闭全部观察输入。正斜率消费者标志仍false。

单独在新捕获的一个初始频率目标和一个相位目标各加1，严格报告恰两处差异、退出码1，自产预测不变；诊断分支不会影响strict pass。

曾尝试直接观察6d2fbc：记录到1,067次跨初始化调用后，驱动因未归属EXC_BREAKPOINT拒绝恢复。该批terminal=false，日志与脚本仅保留私有，不作为通过证据；确认进程已不存在后才启动上述695108新采集。没有修改停点归属规则或目标代码。

## 连续音频及回归

| 已有A4场景 | 检查数 | 差异 | 新导出WAV对原生 |
| --- | ---: | ---: | --- |
| 默认五击完整尾音 | 14,251,874 | 0 | 30条，1,272,576个float32样本完全相同 |
| 低位置连续窗口 | 615,273 | 0 | 3条，49,152个float32样本完全相同 |

最终版本的连续与尾音数组与新导出时及pass256相同。A4为三列联合源，这证明本次单列修复未影响已验证路径，不扩大成A0连续音频结论。

联合源测试覆盖N1固定参考、无多项式参数运行、N2/N3及混合端点回归；独立源的平坦实阻抗用440Hz固定参考，原错误的逐谐波衰减[2,4,6,8]更正为[880,880,880,880]，共享归一化预期按该解析场景更新。复倒数/单极点既有位模式夹具和端点参考测试通过，没有修改这些夹具来适应新结果。

## 证据与剩余

私有证据：pass257-runtime-v1..v4；pass257-five-notes-base-tables-report；pass257-initial-source-capture/five-notes-v1及initial-tables各版本报告；default/low报告、最终报告、stems/audio-audit；pass257-negative-targets；失败single-source-capture。商业模型、预设、原始采样和源表不提交。

下一步仍需把A0及其他音符扩展到完整连续声部验证；当前五击生产器仍限定A4。次源初始化、其余附加谱表/表达控制、完整接触反馈耦合、最终立体声、全部预设、AudioWorklet与保存/重载/性能验收仍未完成。
