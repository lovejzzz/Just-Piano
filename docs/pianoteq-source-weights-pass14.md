# 存档谐波幅度到真实激励权重（pass14）

`B+1c28[noteIndex−1]` 并不直接等于 `G+6f0`。本轮定位 `1c5320→4cb45c(G+6d8,model,G)→529090`，实现 `dsp/source-weights.mjs`。从实际B行和运行时控制曲线正向计算的 **35个权重与G+6f0逐位相同**；两个mode均使用同一组35个权重，不能把70次比较说成70个独立权重。

## 真实输入与音频对照

单硬件点 `1004cb68c` 在调用529090之前读取A4的原始权重、模态坐标、两条已构造曲线、harmonic编辑数组及G控制值。35个原始权重和35个坐标分别与完整NY B的1c28/1c40第68行逐位吻合。runtime曲线的dimension=1、log-X=0、特殊模式=0；这里根据真实运行flags采用线性插值，没有从压缩存档flags猜运行模式。

另用独立单点 `100529384` 直接读到注册表键 `fceec629efc4f87b` 的uint32返回值为0，8条记录一致。`pianoteq_capture_source_constants.py` 设置 `PIANOTEQ_SOURCE_CONSTANT_KIND=weights` 选择此点；默认仍是相位常数采集。

上述捕获均正常退出。每个观察副本渲染与本轮独立运行官方原版的113152帧、48kHz、24-bit立体声PCM相同，SHA256：`1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`。这证明对应采集运行未改变本案例音频，不能代替网页输出匹配。

## 可执行计算

对每个模态坐标m、基础频率f0和刚度B，先以double计算 `f=(m*f0)*sqrt(fma64(m*m,B,1))`，将double log(f)舍入float32后查询编辑曲线及基础曲线。编辑曲线按实际启用标志加入；基础曲线乘float32的`1−s0`。总dB乘精确double常数 `0x3fbd791c5f888823`，取double exp后乘原始幅度并舍入float32。

然后以横坐标1..N构造每谐波编辑曲线，在模态坐标处插值得到第二个dB修正，重复double exp及float32幅度写入。末级按照真实频率、Gaussian中心/宽度、G+d8及G+f0生成对数域混合并取exp。G+d8的logf使用已验证的 `nativeScalarLogf`。本次s0=s1=1，基础曲线项为零，Gaussian的混合倍率为1；非恒等混合尚未获得实际输出证明。

ARM `529460` 的FMSUB是累加项减乘积，因此基线为 `logf(G+d8)−(f/f0)*(G+f0)`；不是相反的符号。本机自编C的 `a*b−c` / `c−a*b` 汇编分别为FNMSUB/FMSUB，保留在本机证据目录。其后两个double融合乘加均使用准确的 `fma64`，不是普通乘加。

double log/exp仍是**显式注入依赖**。本轮使用JavaScript `Math.log/Math.exp` 后35个最终float32权重全部一致，但不能据此声称这两个double函数在全定义域与本机libm逐位相同。没有以4-lane exp替换double exp。其它音高、非零注册表偏移、log-X/特殊曲线及非恒等混合分支仍需独立验证。

## 复现

```sh
node scripts/pianoteq_replay_source_weights.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-weights/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-modal-source/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/base-model-full-values-pass13.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-weight-constant/runtime.json" \
  /tmp/source-weights-replay.json
```

REA证据：`pass14-preweight-readers.json` 及两个完整函数文本。捕获、音频对照、实际商业曲线值与重放结果仅保存在本机证据目录，仓库只发布计算、读取工具和结论。完整琴弦频率生成、琴槌接触反馈、制音毡和音板仍须继续补齐。
