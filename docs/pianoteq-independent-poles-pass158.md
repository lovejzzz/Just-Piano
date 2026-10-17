# 自算阻抗到独立端点极点（pass158）

2026-10-17。把独立分量的输入曲线、功率dB、阻抗、逐模态微扰和N1极点接到pass157分量表/组装路径。新入口不接受原生p/q或目标极点作为计算输入。**预备端点、阻抗控制、曲线、polar radius和部分运行条件仍显式提供，原生独立声部轨迹及新实际音频未验证。**

## 原指令核对

复用已有REA/Ghidra工作产物和不可变ARM64目标的完整listing，重点核对 `194870` 的独立分量消费；没有启动新目标或写内存。

- `194be0..4bf8`：按base、模态坐标、刚度及首分量spread计算double中心频率。
- `194bfc..4c34`：先计算float采样率一半，与float频率上限取小，再转double乘0.99；double中心≥阈值则立即停止。不是先把中心转float，也不是过滤后续坐标。
- `194c38..4ca8`：将中心转float用于曲线与四阻抗参数，保留上轮独立功率 `10*log10f` 偏移。
- `194b28..4b5c` 在每次194870调用重新初始化微扰随机态；`194cf4..4d30` 每个活动模态抽一次，构造double因子，分别double乘p和q。每个独立分量重新开始相同序列，不能跨分量继续随机态。
- `194d44..4d68` 调用极点计算；N=1使用pass150恢复的复倒数直接路径，不走N≥2求根、绝对频率/衰减floor或排序。

`dsp/native-impedance-math.mjs` 集中提供已恢复的六项数学依赖（float log2、double exp/log/tan/sincos/pow），无外部进程或JS超越函数回退。

## 代码消费链

`constructIndependentPoles` 消费 `prepareModalInputs` 自算的有序独立端点，从其fundamental派生四参数，调用现有阻抗实现，乘自算随机因子，使用N1极点生成各分量frequency/rawDecay。保留可审计中间值和模态截断结果，不从比较目标读取预测值。

`prepareEndpointSourceTables` 新增 `independentSource.poleControls` 路径：

```
prepared endpoints + explicit controls/curves
  → couplingArguments → modalImpedance(native math)
  → own jitter → N1 pole → own component amplitude/phase
  → component scaling/padding → endpoint morph/sort
  → reference row + amplitude normalization + optional G phase controls
```

该路径拒绝同时传入componentPoles或components，防止自算路径悄悄使用已提供的极点/分量表。行上限来自原始模态坐标长度；显式传入不同rowLimit会拒绝。已有显式极点/分量接口保留，但返回标记区分 `independentPolesComputed` 与下游构造/组装。`completeCacheVerified` 仍为false。

## 独立验证

新增C oracle使用正常链接的系统log10f/log2f/exp/tan/sincos/log/fma和编译器复除运行时，独立计算四参数、复阻抗、随机因子及N1频率/衰减。

1000组显式端点场景、14149个活动模态：**84894个float32及84894个double结果全部逐位一致**。比较包括四float输入、两个float极点输出、double中心、微扰前p/q、随机因子和微扰后p/q。此corpus的曲线为常量、频带修正为空，且C接受显式准备端点；不扩展为一般曲线/全部预设/原生独立声部通过。最终复核以原始坐标数组而非trace中的mode作为C输入，`math-audit-v2.json` 在相同corpus再次通过；首份报告保留。报告明确 `nativeIndependentTrajectoryVerified=false`、`wholeAudioVerified=false`。

新增端到端数值夹具：简单单位阻抗下，440Hz各模态自算频率440/880/1320/1760、衰减2/4/6/8，继续产生自身幅度、两列缩放和归一化；没有提供p/q或极点表。另验证功率向量改变只影响相应分量、每分量随机序列重置、到首次超限就停止、Nyquist限制、double阈值边界、输入互斥与行上限。禁用JS Math.pow/exp/log/log2/sin/cos/tan后整条新路径仍通过。

准备数据增加fundamental字段后，旧完整36次耦合144个输入回归及历史归一化108幅度/324其它矩阵值/2参考索引保持通过。它们依然是旧耦合捕获/跨运行回放，不作为新独立端点原生覆盖。npm test通过。

剩余：将存档和运行控制生产绑定到新极点入口、一般曲线/频带新路径覆盖、完整缓存坐标/特殊分支、新原生独立端点轨迹、完整耦合与最终声音验收。模型及报告留本机，未使用Pedalboard，未将此模块直接宣布为网页Pianoteq复刻。
