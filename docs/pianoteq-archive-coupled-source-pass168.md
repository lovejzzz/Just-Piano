# 存档联合声源接原生求根与实际分轨（pass168）

2026-10-17。把有限N1/N2/N3原生极点计算接到完整联合声源入口，默认NY的blend=1不再需要为了使用新上下文而强制改成独立端点。此次验证生成两套声源表，并将它们接到已有五次击键的连续声部回放，实际写出并读回30条内部WAV。**不是新的原生采集，不代表完整立体声、全部预设或网页声音已经一致。**

## 完整生产入口

`constructCoupledPoles` 从prepared的联合端点与模态坐标出发，保留double中心与float Nyquist/截止频率比较、首次超限停止；自产四个阻抗参数，调用恢复数学的阻抗，乘自产微扰因子，再按N1快速路径或N2/N3原生求根计算排序后的frequency/rawDecay。多项式kappa/gamma/decay floor ratio明确提供，曲线与polar radius也保留显式来源。

存档入口与手工阻抗/grid/modes互斥，并检查模型分量数。`constructCoupledSource` 继续使用自产权重、幅度控制与相位控制形成四表，拒绝混入现成极点或分量表；零活动行返回空表，不借用捕获输出。

`prepareEndpointSourceTables` 新增 `coupledSource`，与显式coupled表互斥，联合/独立两端均可由自身极点生产，再走已有混合/参考/归一化/后置相位。`prepareArchiveSourceTables` 将统一不可变存档上下文的调律、刚度/偏移、谐波编辑、权重、阻抗、原生极点及幅相控制接到同一入口，支持原选择的blend=1和中间混合；原 `prepareArchiveIndependentTables` 仍拒绝需联合端点的模型。

## 排序相等键边界

新N2测试遇到旧 `rootsToFrequencyDecay` 的相等键拒绝，未改fixture避开它。按4cfac4的直接N2/N3分支恢复严格大于比较及索引移动；这些小规模分支的等键保持原输入顺序。155组含−0/+0、重复键的小规模组合与稳定排序规范一致，另有三根等键实际入口测试。更高阶等键仍不宣称覆盖。原32条真实根回归保持164 double、164 float及82索引全同。

## 两模式历史完整声源表

`historical-source-v2.json` 从NY基础存档、干声预设与既有运行模式/常量生成主26行、次10行、每行3分量。比较目标不进入极点/幅相预测：

| 比较 | 数量 | 差异 |
| --- | ---: | ---: |
| frequency/decay/amplitude/phase、归一化幅度、rawDecay | 648 float32 | 0 |
| 每行lambda、double中心及微扰后p/q | 216 double | 0 |
| 两模式参考索引 | 2 | 0 |

全部36行使用 `recovered-native-cubic-qr`，没有旧Durand–Kerner根。存档及捕获来自不同历史运行，未证明同次完整preset身份；运行曲线属性、instrument mode、调律/weight/phase/amplitude注册常量、采样率、cutoff、jitter、decay floor、polar radius、多项式配置和G phase控制仍显式。

负对照保留：只改捕获amplitude目标一项+1，自身完整预测不变，恰一项比较失败；只改预设首谐波编辑+1，自产6个幅度、105个归一化幅度改变，共111项失败，频率/衰减/相位不变。没有把比较目标当计算输入，也没有比例补偿。

## 接回连续声部并读回WAV

新增明确 `--archive-coupled-source` 入口只接受本轮完整、零差异、原生QR的源表报告；旧报告的门槛保留。前缀混合、邻列幅相、力度衰减、逐击频率微扰、MIDI力度与正常All=0硬度生产继续独立计算。`source-audit.json` 的五击/两模式2160源表值与20随机词全部同。绑定器将新声源算法与剩余观察依赖传入连续报告/分轨manifest，不把它包装成无观察边界的整机。

新连续回放 `voice-report.json`：14214461项检查零差异。自新声源表接到已有支持/激励/初始化、模态推进和尾部包络，生成30条IEEE float32 WAV。独立Python实际读回全部文件并按历史原生内部采样核对：1272576个float32（group/auxiliary各636288）逐字节相同，所有声部从counter0开始，不归一化。30条新WAV也与pass149的对应文件整体字节相同；这证明新生产替换保持旧分轨，**没有扩大原生场景覆盖**。

历史capture SHA-256 `845ecef901e2215062d7cae298bc6f232be44357a39cef07fb523bfc067a869f`。仍有包络/路由/时间状态等观察输入；`finalStereoAudioVerified=false`、`sameRunModelGenerationVerified=false`、`completeVoiceVerified=false` 保留。历史完整立体声62348个PCM差异、最大整数差5仍未解决。

## 测试与剩余

本轮REA/Ghidra重新分析194870、4cfac4、6d2c10，三项全部ok并Terminal 0。响应SHA-256 `7d0a1f0acc6e0fe206636f77069f58c4f3e2c2ee96a06a9f3c0815a257d7d38c`，证据 `ev_0bfd93eef7873665ee3a074cb4f769a7990719cc11f8a5c49e714eec1048cd22`。N2/N3直接排序的严格比较与索引交换另按ARM4d02b8..4d0380、4d0740..4d086c核对；没有把一般introsort的等键顺序假设用于小分支。

新增测试验证N1/N2/N3真实新入口、jitter确定性、停止而非过滤、Nyquist、零行、联合四表、两端自产后的中间混合、权重/极点互斥、原存档纯独立保护，以及禁止JS超越函数/独立求根回退。统一存档的纯联合/中间混合入口也实际消费；全部npm test通过。

下一步仍需关闭运行控制与注册来源、剩余模型/曲线/系数剔除等分支，以及完整琴槌接触力—弦反馈—制音毡闭环；将连续声部接完整全局输出，进行全音区/力度/踏板/预设的实际对照，再接网页实时发声和保存生效验收。商业原始数据与WAV留本机，不合并、不发布。
