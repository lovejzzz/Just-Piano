# pass113：实际活动起音包络与端点音轨

完整复刻仍未完成。本轮验证正常保存的 Attack Envelope .25 场景，目标是实际起音整形，不以旁路、函数结构或参数名称代替音频证据。

## 原生来源与选择

独立调试副本代码段未改变；原生进程2812正常exit0，LLDB退出。六个固定只读硬件点：selection 7181d8、model 718230、entry 30bd30、before 30c104、gains 460f08、time 460f1c。共5130条记录：五次源选择、五次模型观察及1280块的四个音频阶段。五声部各256块，从counter0至16320，最终16384；7467次普通Continue记录包含窗口之外被跳过的观察。采集依赖的五份Python源在退出后摘要一致。

源采样率48000，H+3064覆盖值0，非legato；G+1204=0、G+1208=0.1080402135848999、G+120c=0、G+1210=10。因此本场景选中全局起音时长，并非声部覆盖。FCVTZU(f32(duration×sampleRate))得到5185；原生double attackRate为0.9998082628827839。

时间对象H+2d88中，+18是attackRate、+20是decayRate、+28是递推value（以上偏移十六进制）。718274初始化为1的是decayRate，未写入value；本次实际初态value=0，age0渲染时自行重置1。首次解释把这两个字段混淆，得到3850项不匹配，失败报告保留；随后修正初始化解释，未放宽任何比较。

## 计算与真实音频验证

pianoteq_replay_active_time_envelope.mjs根据选择源生成启用、时长和初始化写入字段，生成终端gain/step/target，再独立携带动态状态。音频入口、模型slope/scale、启用控制与未写入value初态仍来自观察。double exp使用显式--exp-candidate，仅当前一个实际时长输入得到验证，不能称一般数学实现已恢复。

完整组件1075205项零差异，其中11520项double精确比较；1280块，330个主包络活动块，870个起音结束后的块。时间阶段改变155256个样本，终端增益阶段改变126702个样本。次包络活动分支未覆盖。

14项反向测试全部符合预期，包括目标单点、double单ULP、源时长与音频输入扰动、缺模型、错误地址、未审计停顿、错误矩阵与缺结束后覆盖。未写入初值改为.5产生两项初态差异，但age0重置使预测音频不变；未把它误作音频源依赖。

实际导出五声部×（三个组+三路辅助）共30条mono float32 WAV，每条16384帧。独立Python读回真实RIFF/fmt/fact/data，以time端点原生捕获逐字节比较：组245760、辅助245760，合计491520个采样一致。扩展验收器后另回归C的audioTail端点，1272576个采样仍逐字节一致。

## 保留的失败与下一边界

完整原生WAV严格对照失败：两份均128512立体声帧、48kHz/24-bit，但146642个交错样本不同，最大整数差6299，首差frame10240，归一化RMS差3.6343405129650666e-05。未裁剪、拟合、归一化或放宽容差。pass112正常A/A控制本身亦未通过，不能把此差异唯一归因于一个组件。

本轮是有观察音频入口的有界组件，不是从琴槌源独立生成的完整声音，未与C跨运行拼接。仍需恢复存档到全局起音字段的完整生产、其他时长/legato/延迟/结束分支、同次完整源链、空间和最终立体声，并覆盖全部琴键/力度/踏板/预设后接入浏览器。

私有证据：debug-pass113-active-time-a/、pass113-active-time-a-initial-failure.json、pass113-active-time-a-exact-report.json、pass113-active-time-negatives-a/results.json、pass113-active-time-stems-a/、pass113-active-time-stems-a-audit.json、pass113-active-time-a-native-wav-audit.json、pass113-c-stem-auditor-regression.json。商业预设、模型、完整捕获与原生音频不提交。
