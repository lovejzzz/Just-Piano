# pass44：CABN 卷积的实际频域乘加

进入CABN卷积的数值内核，新增 [packed-convolution-product.mjs](../dsp/packed-convolution-product.mjs)。默认和width25各512次实际频域乘加，两个正式捕获合计262144项逐位同，原生完整PCM分别同各自官方参考。

本批独立计算乘加和累加历史；输入频谱、卷积核频谱以及处理任务顺序仍观察，正逆FFT、核初始化、完整卷积和网页音源仍未完成。512次乘加不是512个音符，也不是512个音频块。

## 实际执行路径与数据布局

[CABN捕获器](../scripts/pianoteq_capture_cabinet_convolver.py) 取得160个64样本块：输入九行、输出三行，输入电平稳定为1，前14个静音块没有执行首段卷积处理。节点尾段字段为512，但尚未把它认定为完整脉冲响应长度。

只读虚表探测将 `7ff67c` 的实际乘加目标绑定到 `96b050 → 432bc4`。随后 [数值捕获器](../scripts/pianoteq_capture_cabinet_product.py) 在清空判定前、乘加调用前后设三个固定硬件点，读取实际谱数据。正式捕获还核对FFT计划 `vectorCount=16`、`complexTransform=0`；128个float以四个实部、四个虚部为一组，并不是普通交错复数布局。

## 逐条恢复的舍入顺序

每组每lane先计算：

```
imaginary = fma32(aImag, bReal, f32(aReal * bImag))
real      = fma32(-aImag, bImag, f32(aReal * bReal))
sumReal   = fma32(real, scale, sumReal)
sumImag   = fma32(imaginary, scale, sumImag)
```

索引0和4属于真实FFT的DC/Nyquist特殊项。内核在普通复数运算后，使用调用前保存的累加值重算这两项：

```
sum[0] = fma32(scale, f32(a[0] * b[0]), oldSum[0])
sum[4] = fma32(scale, f32(a[4] * b[4]), oldSum[4])
```

不能把它替换成普通复数乘法、先把结果相加再统一舍入，或在端点计算中使用已经更新的累加值。

## 自行携带累加历史

[重放器](../scripts/pianoteq_replay_cabinet_product.mjs) 按三个输出对象维护自己的频域累加数组。原生空标志要求清空时，自己清零；否则延续上一项算出的历史。清空前的数组可能已变成其它表示，不被当作有效频域输入。每次调用前的实际数组和调用后的结果都只作比较，不用原生结果回填自己的历史。

默认512项乘加有32次清空，width25有31次。每场景检查512×128个调用前值和同样数量的调用后值，共131072项。源频谱和核频谱仍逐项观察，因此这验证了实际累加计算，尚未证明整个卷积状态完全独立。

省略特殊端点处理的单步对照在65536个输出比较中产生1022处差异；以分步舍入替换FMA产生4321处差异。该对照为隔离计算顺序而使用观察到的调用前值，单独标记 `oneStepDiagnosticUsesObservedBefore=true`，没有替代正式的连续历史重放。

五个负对照均exit1：乘加前比较目标、乘加后比较目标各改一ULP，分别恰好一项失败；删除阶段、删除FFT计划、改为复数FFT标记也明确失败。

## 真实音频与证据

两个正式捕获均窗口完整、正常原生exit0，默认PCM SHA-256为 `1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`，width25为 `839466790922acd983504f42cbed5451900125f0672a5adb4867112a799e23f0`。这是目标程序完整WAV的基准核对，本批JavaScript没有生成整段WAV。

本轮另有160块CABN入口捕获、一次虚表探测、一次未记录FFT计划的早期乘加捕获。早期乘加报告保留为发现阶段结果；当前严格重放器要求计划信息，正式默认场景为新增的 `debug-pass44-cabinet-product-plan`，没有给旧捕获补造字段。

五次原生运行均退出0、窗口完整，但早期 `debug-pass44-cabinet-product` 的完整PCM不是默认基准，而是此前出现过的 `19481af4235d57e6db522290e2d90dd07fd8cf548c0264f549b1e3863422c84d` 变体：148623个交错样本不同、最大整数差15089，首次差异在frame4611。原因尚未确定，未将其列入正式场景。另四次PCM符合各自参考。全部尝试汇总 `pass44-native-attempts.json` 保持严格失败，正式两场景审计另列。运算顺序对照已改用通过完整PCM核对的新默认捕获，初版对照另存保留。

私有目录 `~/.local/share/just-piano-analysis/` 保存 `debug-pass44-*`、`pass44-product-audit.json`、运算顺序对照、五个负对照、虚表与汇编证据。REA导出292条累计证据及快照后关闭。硬件点和内存读取均只读，原程序哈希继续核对，没有使用Pedalboard。

下一步进入已定位的正逆变换入口与 `0e3258` 数值路径，恢复FFT计划、排列、蝴蝶计算和尾段历史，再连接CABN输入和已验证的全局后段。全部模型/预设、完整物理建模链、其它音符/力度及网页音色等价性仍未完成。
