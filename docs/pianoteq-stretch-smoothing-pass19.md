# 调律RHS的平滑滤波：pass19

`dsp/stretch-smoothing.mjs`恢复`10089701c`的低通滤波及冲激峰延迟补偿。它接收float输入向量、smoothing、明确的补尾方式，以及显式的系统double `sincos`依赖；不读取目标滤波输出作为计算输入。

## 调用约定与布局

`326fe0`在`327ef4..327f04`设置：x8=返回vector descriptor（父栈sp+110）、x0=输入float vector descriptor（父栈sp+130）、s0=smoothing、w1=1。x8是C++聚合返回地址，不能按反编译表面顺序当成普通第一个参数。

`89701c`内部保存x19=输出descriptor、x22=输入descriptor、x21=尾部扩展标记。`89733c`与`89755c`处w26为冲激峰下标delay；局部sp+48保存5个float系数，顺序是`b2, −a2, b1, −a1, b0`。原始double numerator位于sp+88..98，denominator位于x29−80..−70。

`89733c`开始正式滤波前，返回vector已经分配，但输出尚未写入；`89755c`则正式滤波已经结束、状态尚未释放。因此前者适合检查系数和delay，后者可同时检查实际输入输出。

## 系数生成

smoothing先舍入float并clamp到float常量`1e−5 .. .999999`。随后以double计算：

```text
angle = double(smoothingFloat) × π
(sin, cos) = native_sincos(angle)
damped = sin × 0.7071067811865475
inverse = 1 / (1 + damped)
b0 = ((1 − cos) × .5) × inverse
b1 = (1 − cos) × inverse
b2 = b0
a0 = 1
a1 = (cos × −2) × inverse
a2 = (1 − damped) × inverse
```

这些指令是独立double乘加，不应擅自改成double FMA。`8970e0..8970f0`装载的sqrtHalf位型为`0x3fe6a09e667f3bcc`，比JavaScript `Math.SQRT1_2`小一个binary64 ULP；模块保留实际常量。

`455fe4`在a0=1分支将每个double系数转换一次float，反馈系数在转换后取负。未把其它a0的归一化分支混入这个实际调用点。

## 实际滤波与延迟

正式滤波使用4个float状态`x1,x2,y1,y2`，初值全零。每个样本的指令次序为：

```text
v = float32(b1 × x1)              # 独立FMUL
v = fma32(input, b0, v)
v = fma32(b2, x2, v)
v = fma32(−a1, y1, v)
y = fma32(−a2, y2, v)
```

对应`8973b0..8973c8`及补零分支`89751c..897534`。状态更新为`x2=x1, x1=input, y2=y1, y1=y`。没有将上述链改成一个double表达式再最后转float。

函数先对单独的零状态滤波器运行单位冲激，探测数量为`roundAway(float32(1 / smoothingFloat))`；`8972f4`实际使用FCVTAS，不能照反编译文本改成截断。绝对值严格大于既有最大值时才更新峰值下标，因此相等峰保留最早位置。

正式滤波重新从零状态开始，运行`input.length + delay`个样本，舍弃前delay个结果，保持输出长度与输入相同。w1最低位为1时用最后一个输入值补尾；为0时补零。这里的延迟补偿与补尾是算法组成部分，不能只实现普通双二阶低通后称已恢复同一函数。

## API及验证范围

- `stretchSmoothingCoefficients(smoothing, {sincos})`返回clamped smoothing、double numerator/denominator、5float系数与probeSamples。
- `stretchSmooth(input, smoothing, extendLastBoolean, {sincos})`返回`values:Float32Array`、delay、impulsePeak及系数信息。
- `sincos(angle)`须返回`{sin,cos}`。依赖可由公开独立C数学oracle提供；这不等同于已在浏览器实现平台sincos。

真实捕获`debug-pass19-stretch-filter/runtime.json`在`89755c`正常结束，errors为空，含一条95样本的实际输入输出。`scripts/pianoteq_replay_stretch_smoothing.mjs`使用独立系统sincos oracle，从该输入与smoothing重新计算全部系数、冲激响应和滤波结果；没有把捕获系数或delay当作计算输入。`smoothing-replay.json`结果为：

| 比较 | 数量 | 逐bit不同 |
|---|---:|---:|
| numerator与denominator | 6 double | 0 |
| 五个递推系数 | 5 float | 0 |
| clamped smoothing | 1 float | 0 |
| 实际滤波输出 | 95 float | 0 |
| 冲激峰delay | 1 int | 0 |

本次smoothing为`0.07894736528396606`，probeSamples=13，delay=5，extend标记最低位为1。覆盖这条真实平滑路径；补零尾部、clamp端点、其它平滑值及更长的冲激探测尚无本轮运行样本，不能从该样本外推全域等价。RHS的原始生成、减首值与滤波后加回首值由调用方负责，不属于本模块。

负例只把捕获output[45]改动一个float ULP，重放器即报告对应位型`bc46f92e / bc46f92f`不同、passed=false并exit1；没有用误差容限放过末位差。

```sh
clang -O0 scripts/pianoteq_system_math_oracle.c -o /tmp/piano-math-oracle
node scripts/pianoteq_replay_stretch_smoothing.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass19-stretch-filter/runtime.json" \
  /tmp/piano-math-oracle /tmp/smoothing-replay.json
```

## 证据

`89701c`完整反编译包含在私有`pass18-stretch-product-filter.json`，REA batch记录`ev_3097e3cb5fc6bbe8a625852052ef34c4d799e0abae64bea944fae8236068f6ba`。精确运算、ABI、FCVTAS与5float布局来自已保存`pass3-arm64-disassembly.txt`的`89701c..89759c`及`455fe4..45603c`。

原arm64 slice SHA256：`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`。本子任务没有启动REA、LLDB或修改原应用。

主分析会话随后取得`455fe4`完整反编译，保存为`pass19-0x100455fe4.txt`，REA记录`ev_fc8203e732abd99f8d29c4d3eb04ce301a0758cd1804531d3c627355ffd85c84`，与上述ARM转换分支相符。
