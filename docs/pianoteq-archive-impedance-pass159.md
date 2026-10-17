# 存档阻抗接入与一般曲线/频带（pass159）

2026-10-17。将既有存档控制生产接入新独立极点入口，并扩展独立C对照到非恒定曲线和频带。**仍有运行输入/模式/常量显式依赖；没有新的原生独立声部轨迹或实际音轨验收。**

## 存档到新入口

`dsp/archive-impedance-source.mjs` 复用已有 `impedanceControls`、`archiveCouplingGrid`，组合：

- 基础/预设曲线、音高锚点和模式修正→strength、minimumReference、tilt、mixture。
- 基础模型相位曲线、频带频率/增益及音高选择的频率曲线网格。
- B+2548第三向量→独立分量功率系数。此映射来自既有pass151证据，未把功率当幅度系数。

压缩存档version不是运行曲线模式。新接口必须显式给定普通scalar模式（flags=0/1、special=0、dimension=1）、pitch曲线模式和polar radius；没有从版本号猜测或默认固定radius。非零Ageing分支仍由旧生产器明确拒绝，尚需额外随机状态。

`constructIndependentPoles` 的 `archiveContext` 与手动impedance/grid/modes/power四组中间值互斥，避免存档路径被外部中间值覆盖；检查基础模型分量数与已准备端点一致。四表入口继续消费自算极点/分量/组装，并返回 `independentImpedanceFromArchive`，完整缓存验证标记仍为false。

本轮组合既有恢复算法，没有声称重新发现其公式，也没有修改目标程序。

## 完整历史原生返回值绑定

`pianoteq_replay_archive_impedance_source.mjs` 读取本机NY基础存档、pass135预设以及既有完整before、after-v2/v3、radius、frequency-grid捕获。严格要求A4主/次26/10共36个唯一调用、完整36个返回、重复返回无冲突，不放宽早期不完整捕获。

`historical-controls-v2.json` 通过：

- 两个不同配置；四控制逐调用比较144项，即8个不同控制值重复消费。
- 相位/频带/频率网格数据全部相同；218194个数组元素比较包含各调用重复，不代表同量不同模型数据。
- 自算控制/曲线与捕获四参数进入自身数学，72个p/q与原始原生返回逐位同。

四参数、运行模式和radius仍观察。所选预设是既有后续解码存档，与历史运行没有同次身份保证；此处实际证明的是所消费的阻抗控制/曲线相同，未推断整个模型/预设或其它状态相同。报告明确 `sameRunPresetIdentityVerified=false`、`nativeIndependentTrajectoryVerified=false`、`newAudioRendered=false`。首份报告也保留；v2增加唯一调用和26/10覆盖断言后仍通过。

## 非恒定曲线与频带的独立对照

新增C oracle独立执行：普通线性与log-X scalar曲线、音高左右曲线选择/混合、额外功率dB、相对/绝对频带高斯修正、相位曲线和原有阻抗/微扰/N1极点。C使用系统logf/log2f/exp/tan/sincos/fma和正常编译器复除，不执行Pianoteq代码。

1000组、14035个活动模态：**84210个float32与84210个double值全部逐位同**。500组相对频带、500组绝对频带，每个场景两条频带；频率曲线/相位曲线使用不同线性/log模式和三个非恒定节点。比较仍包括四float参数、两float极点、double中心/阻抗/微扰等。v2补入note=0/127网格端点，完整corpus再次通过，原报告保留。

这不是全部曲线模式或全部IEEE穷举；普通scalar以外模式、非零Ageing、其它模型分支仍缺。不是新的原生N1捕获，也不把一般曲线C对照当真实音轨验证。

## 接线检查和剩余

新增合成存档测试验证主/次模式、功率向量、预设编辑传到自算衰减，以及新入口实际贯穿参考/归一化。缺失radius/模式、混入手工中间值、Ageing状态明确拒绝。禁用JS超越函数后该存档路径仍通过。npm test通过。

仍需把调律、刚度/偏移、模态坐标、jitter、幅度控制和其它运行来源接到同一生产上下文，并解决剩余模型/缓存分支、原生独立声部轨迹和完整声音验证。网页声音未完成等价性验收，不合并、不发布，未使用Pedalboard；商业输入和报告留本机。
