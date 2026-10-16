# 模型控制到动态音高及连续渲染：pass21

`dsp/dynamic-pitch.mjs`实现`6e4f5c`中音符年龄相关的频率扰动。配合[模型控制源](pianoteq-pitch-source-controls-pass21.md)及[标量expf](pianoteq-native-scalar-exp-pass21.md)，本配置的频率轨迹已由算术生成，不再逐块读取捕获V780作为渲染输入。**64个按住/释放记录共384float逐位同；计算轨迹接回8块连续渲染后，33699float仍逐位同，包括1536个完整分组输出样本。**

这不等于整段立体声音频或全部预设已经复刻。力度输入host78、共享速度控制、初始模态表、计时和其它控制仍有明确捕获来源。

## 实际配置和初始化

此前V780从`1.0001599788665771`逐块下降，引起旧P/Q向新相位坐标投影。上游现在已定位到：B2f10 mar_param中的+b80/+bd0，即运行对象全局B3a90/B3ae0。不能因顶层fields没有3a90就误认是预设A曲线；三次完整运行曲线的x/y及模式与B嵌套字段匹配。

这些曲线在实际note69生成G1008/G100c，再按host78分支传入V938/V93c。力度缩放H80经51a700的曲线、logf和expf计算后写V940。共享标志由B158生成V934，V930则初始化清零。V930是动态扰动禁用状态，与note-off的V924不同，API命名为`initialDisabled`。

该配置的实际控制为strength=`0.0018125000642612576`、relaxation=0、velocityScale=`0.29713115096092224`、V934=1。它使用指数路径；不能只因note仍按住就套用另一条无指数公式。

## 指数路径的精确运算

令f表示float32舍入，age为uint32音符样本年龄；D是V25c，a/b/v分别为V938/V93c/V940：

```text
t = f(timestep * f(age))
E = nativeScalarExp(f(−D*t))
vE = f(v*E)
numerator = f(a*f(vE*vE))
denominator = fma32(t,b,1)
offset = f(numerator/denominator)
factor = f(1+offset)
pitch = f(basePitch*factor)
```

注意`v*E`先舍入、再平方、再乘a。反编译外观上的`a*v*E*v*E`若按另一顺序展开，可能改变结果。分母是一条float FMA；指数输入是独立float负乘。

基础pitch先由V82c+V8bc的cent总量计算，非零时调用exp2f；本次两者始终为0，所以basePitch严格为1，无需系统oracle。非零cent路径仍要求显式exp2f依赖，未用exp(x*ln2)冒充其逐位实现。

当扰动绝对值不大于double常量1e−5时，原函数置V930并返回基础pitch。非指数路径的按住分支使用`f(a*f(v*v))/fma32(t,b,1)`，释放时还受V931、V925及V8d8影响。模块按静态分支实现，当前实际64条样本只验证指数路径且均未触发禁用门限；这些其它分支不算已实际覆盖。

## 标量指数缺口的修复

固定点`6e5584`在系统expf返回后、任何v乘法之前保存实际s0与时间s8。64个实际结果中，直接`float32(Math.exp)`有1处不同，四lane的nativeVectorExpLane有8处不同，另一expPolynomial有6处不同；没有把它们视为可互换。

本轮独立研究当前系统库的scalar expf，恢复double范围缩减、128项数学表和double FMA，得到`nativeScalarExp`。它的64个实际返回及60461个独立系统对照输入均通过，不再依赖运行时库调用。独立C oracle源码已公开在`scripts/pianoteq_scalar_exp_oracle.c`；系统指令byte和库映射证据仅保存在本机。

## 连续输出验证

`pianoteq_replay_pitch_source.mjs`先核对完整曲线及68项初始化值；`pianoteq_replay_dynamic_pitch.mjs --source-report`使用该报告预测的控制量，计算64个时间点的动态pitch，并对照实际时间、expf返回和V780，共384个float，零差。

`pianoteq_replay_modal_initial.mjs --pitch-report`进一步以计算出的pitch替换初值及8块更新中的实际V780。其余捕获控制保持明确边界。7次频率变化按此前验证的旧状态投影继续，从自己的P/Q延续；不从捕获状态重置。最终`continuous-final-bridge.json`为33699float零差，包含三个分组各512样本，共1536个输出值。

一个ULP负例只修改实际held age640的V780，动态重放明确exit1，准确报告唯一不同：计算`3f8004e0`、目标被改成`3f8004e1`。源参数的H80单ULP负例另行保存。没有放宽成功标准。

## 捕获与音频

四个独立采集各仅一个固定硬件观察点：

| 阶段 | 观察点 | 实际记录 |
|---|---|---:|
| 动态pitch返回 | 6e5158 | 按住32、释放32 |
| scalar expf返回 | 6e5584 | 按住32、释放32 |
| 初始参数复制后 | 43dff4 | 1 |
| 两条模型曲线 | 1c5f30 | note69三次 |

四次均正常exit0、errors为空。每份WAV为48kHz、24-bit、双声道113152帧，PCM SHA256均为原版基准`1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`。这证明对应采集未改变该音频，不证明JS已经产生相同整段立体声WAV。

```sh
node scripts/pianoteq_replay_dynamic_pitch.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass21-dynamic-pitch/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass21-pitch-exp/runtime.json" \
  /tmp/dynamic-pitch-report.json \
  --source-report "$HOME/.local/share/just-piano-analysis/debug-pass21-pitch-source/source-final-replay.json"
```

连续渲染的命令沿用pass20，附加`--pitch-report /tmp/dynamic-pitch-report.json`，不删去`--tail-capture`。

## 证据及余项

6e4f5c/0867a4的新REA batch为`ev_d731c791d111a41194cc25467711aca91ba07c2c375265cf905484303cbea168`；43dcb0/51a700/57e4d8/714530的batch为`ev_b6fbf0d8ea621be69f73b00aedcd1b36263e429ea99268110fda47da13d03fb8`。精确指令次序复核保存的ARM64 listing。本轮bundle/snapshot有212条保留记录，正常关闭；计数不是覆盖率。原安装应用SHA未变，四份采集及失败负例保留在本机SHA清单。

当前只完成此note/velocity/default配置的source→动态pitch→连续内部缓冲验证。host78的MIDI力度生成、共享速度参数/曲线的完整存档映射、V25c来源、非零cent、禁用门限和其它分支、释放后模态淘汰/重排、全部初始激励、声板/麦克风/效果、所有预设及网页整段音频仍需继续。网页仍用旧独立引擎，尚未合并发布。
