# 计算源表接入连续声部与实际分轨（pass140）

2026-10-17。把 pass139 自算的十张源表接入连续声部回放，替代本路径的原生预加权四数组；实际生成30条分轨，与同次原生组件1272576个float32采样逐字节一致。主路随机种子等观察依赖、跨历史运行来源及最终立体声缺口继续保留。

## 接线及严格绑定

新增 `pianoteq_bind_prepared_sources.mjs`，检查源表报告的原始捕获SHA、十个唯一epoch/mode、2160项覆盖、四数组长度/有限值、逐数组预测摘要和逐列零差异。它要求原报告明确标记观察RNG及有限上下文，不接受伪装成独立全链的元数据。

连续回放新增 `--prepared-source=<verified-report.json>`，每次 weights 消费对应表一次，先与原生快照逐项比较，再同时传给 `buildReleaseControlledSpectrum` 与 `buildReleaseControlledSupport`。后者的支持模态选择也读取计算频率，不能只替换最终加权幅度。结束时要求十表全部消费，没有缺表回退。

本轮使用私有 `pass139-frequency/audit-b.json`，报告SHA `8eed22d98d64da9c470f7ac69c20be4f86d3ce25e8dea30edaeaf1ee2dc7eb1d`，绑定原始捕获SHA `845ecef901e2215062d7cae298bc6f232be44357a39cef07fb523bfc067a869f`。报告与WAV manifest均记录 preparedSourceBridge：跨历史桥接、观察RNG、系统邻列数学依赖、指定普通音符/host0分支、非完整声音等价。

`preWeightSourceStillObserved=false` 仅表示不再读取这四张原生数组作计算输入；`preWeightSourceDerivedFromObservedContext=true` 同时保留，不能据前一个字段宣称来源完全独立。

## 实际回放与音频

在禁止 Math.pow 的包装进程中，使用已恢复nativeDoublePow、存档重复包络模型、自算终端斜率与真实owned-resumes审计。原生采集仍为干净历史 pass110 C，没有启动新的 Pianoteq。回放进程exit0：

* 14214212项比较，0差异；包含新增2160项源表比较，十表全部实际消费。
* 生成30条float32 mono WAV，包含五声部的三组输出及三组辅助输出。
* 独立Python读取实际WAV，与原生audioTail逐采样对照：group636288、auxiliary636288，总计1272576采样字节相同。
* 30条WAV负载摘要与pass134既有组件输出全部一致。这是换用计算输入后保持原输出，不是新增30个演奏场景。

实际分轨是连续声部组件输出，不是最终左右声道文件。辅助入口和部分时间/模型/调度控制仍观察。原完整PCM比较失败没有被本轮组件通过覆盖，`finalStereoAudioVerified=false` 和 `continuousEnvelopeAndVoiceOrBrowserEquivalence=false` 保留。

## 反向验证

绑定器八项检查通过：错捕获SHA、缺模式、重复模式、改预测但未更新摘要、隐藏随机依赖、报告内比较失败、重复消费、未完整消费，全部拒绝。

另作实际完整回放扰动：仅改首张计算表首幅度一个float32最低位，并更新该负例夹具自身摘要，使其经过正常绑定和计算路径。回放exit1、1212273项差异，其中源表幅度比较恰1项；预测audioTail有89050个float32采样字节不同。这证明输入实际传播到声部和音轨，没有在后面从原生表重置或回退。

更早的1%幅度扰动在 worker post-block pruning layout 检查处被拒绝，未生成完整报告，stderr及夹具均保留；没有弱化裁剪一致性门槛来让它跑完。两个负例均未导出“通过”音轨。

## 证据与边界

私有 `pass140-prepared-source/` 保存正常report/replay.log、30条stems、stems-audit、binding-guards、propagation-verification，以及两个负例的输入和stderr，较小扰动另有完整失败报告。运行期间未编辑加载的JS依赖，冻结Python采集依赖未修改；没有使用Pedalboard。

语法、diff检查及npm test通过；既有网页引擎回归不作为Pianoteq声音等价证明。

原LLDB39072、目标39079、debugserver39080仍存活，目标CPU时间0、开发者模式关闭。没有新REA查询或原生采集。本轮没有网页音源替换或最终立体声验收，不合并、不发布；后续仍需消除随机初始化等观察依赖、验证完整声音和全预设。
