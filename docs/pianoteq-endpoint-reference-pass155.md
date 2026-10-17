# 混合端点参考频率与幅度归一化（pass155）

2026-10-17。将端点混合接到自算参考频率、参考行和幅度归一化，并核对既有原生归一化捕获。**端点表及部分运行控制仍为显式输入；没有完成全部缓存生产、新原生动态采集或完整音频验收。**

## 静态依据

`1026dc` 沿用 pass151 REA 证据及完整 ARM listing。本轮另以 REA/Ghidra 单会话分析调用者 `7a4014`，1/1成功、会话exit0。证据 `ev_a8f4d95db6dc893177c527779f5dbf130482891684945a7667dc74bd87f2f697`，私有 `pass155-endpoint-reference/batch_decompile.json` SHA256 `b41a6d9123053bd2f30711428cbed6b1e3b5c7d160c2c932164e5257f76fbe43`。

参考频率与用于阻抗的、除以刚度平方根的base不同：

```
coupledRef = f(f(frequency + mean(scaledOffsets)) / ratio[0])
separateRef[j] = f(f(frequency + scaledOffsets[j]) / repeatedRatio[j])
```

`102e84..e90` 为联合float加/除后转double；`1032f4..2fc` 每次独立循环覆盖另一个double参考，循环结束保留**最后一个分量**。已有 `prepareModalInputs` 现在暴露这些中间float参考，不通过除过sqrt的base反推，原base数值不变。

0/1端点选择自身参考；中间blend的 `1045c8..d0` 先计算float32补权重，`104620..4654` 转double、独立乘法加double FMA：

```
reference = FMA64(double(coupledRef), double(t),
                  double(lastSeparateRef) * double(f(1-t)))
```

`103c68..c9c` 将参考转float，以每行第一列频率的float绝对距离选择最近行，等距保留先出现者，空表索引−1。`endpointReferenceFrequency` 严格要求完整且顺序正确的端点集合，没有回退到G频率或首个独立分量。

## 归一化与接口

`7a4780` 调用生成器，之后 `7a4784..48d0` 扫描整张幅度表的最大绝对float值；float除法生成 `scale=f(1/maximum)`，再float乘法更新每项。不是分别归一化每列或每行。空表直接跳过。全零非空表会产生无限scale和NaN输出，保留该实际运算，未人为静音或夹限。

`prepareEndpointSourceTables` 串联 pass154 四表混合、自算参考及已有归一化算术，输出原幅度与独立的 `normalizedAmplitude`、最大值、scale和参考行。后续G相位控制仍未应用，返回 `laterPhaseControlsApplied=false`、`completeCacheVerified=false`；不能将接口称作完整缓存生成器。

## 验证

独立C/system-fma对照10000组：10000个double参考、10000个参考索引及155067个float归一化结果无差异，其中7870项NaN只检查语义。含1..5分量、短ratio末值复用、不同blend、空表、全零表、subnormal和极值幅度。offsetExponent=0是显式条件，随机化/其它运行分支未据此扩展为通过。

历史 `debug-pass14-modal-source`（生成后）与 `debug-pass14-source-normalized`（归一化后）：

- 从各自原有manifest复核runtime及observed.wav SHA；两份历史observed WAV相同。不是本轮新录音。
- 两捕获各含A4主/次模式26×3、10×3，完整布局、控制与向量一致，后续G相位偏移全部为0。
- 108个新计算归一化幅度与原生目标逐位同；324个频率/衰减/相位值在两边界保持同，两参考行均同。
- 预测只用生成端点及其控制；归一化捕获只用于比较。两组端点四表仍标为观察输入，不把跨运行回放当作新独立声源。

私有报告 `historical-normalization.json` 明确 `newAudioRendered=false`、`wholeIndependentAudioVerified=false`。它不替代新中间blend轨迹、完整原生声音或网页验收。

准备输入增加reference字段后，原完整36次耦合输入（144float）、36次极点（108频率/108衰减/108lambda/36中心）回归仍无差异；极点回放仍明确p/q来自旧捕获，N≥2求根仍为独立算法，不声称原生QR已完成。新增单元测试覆盖均值/最后分量、不同刚度base、等距首行、全局最大值、空表跳过和非法端点拒绝，npm test通过。

全部商业模型、原生捕获、REA正文、编译产物和数值报告留本机。未使用Pedalboard。仍需完成独立端点补行/生成、后续G相位控制、剩余运行输入、完整耦合以及最终声音验证。
