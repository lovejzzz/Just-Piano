# 存档到复耦合控制值的实际验证

`dsp/impedance-controls.mjs` 将实际基础 B 与预设 A 的解码结果转换为 `1002ff628` 所读取的控制值。实际 NY / dry FXP、note69、ageing=0 的两个分支中，四个控制值均与36次入口捕获逐 float32 位相同；每个分支的3000个相位横坐标和3000个相位值也全部相同。空的附加频带向量同样匹配。

这闭合的是这组输入的存档绑定，不代表其他音高、非零 ageing、所有预设或完整声音已经验证。网页仍使用原有独立引擎。

## 实际计算

REA 的 `4052c4/1b2a58/721744/11dfd0` 与 ARM 指令共同确定以下次序；每次 `fl` 表示单次 float32 舍入，`fma32` 只舍入一次。

- B `1bf8` 给出25个音高锚点；B `2548.indexmap` 给出各键分量数。
- B `2a38` 的前三条曲线与 A `588` 的对应编辑曲线相乘，再乘各自的 A 标量。每一步单独舍入，随后限制第一项到 `[0.1,20]`，其余两项到 `[0.1,10]`。第二分支额外乘 B 的 `curves248`。
- 锚点混合为 `fma32(fl(1-t), left, fl(t*right))`。
- 强度取 B `1d48`，先分别除以两锚点的分量数、混合，再乘当前键分量数，最后乘编辑比例。后两个乘法的顺序是指令证据的一部分，不能任意重排。
- 低截止取 B `1d18`，倾斜取 B `1d60`；各自混合后乘对应比例。
- B `2a38.scalar148` 写入运行时 `c8`；该结构第四条曲线直接成为相位曲线，两个向量直接成为频带频率与增益。

note69 恰好落在锚点右端：left=15（65），right=16（69），t=1。实际四项为 strength=`898.4617919921875`、minimumReference=`1500`、tilt=`3.3000001907348633`、mixture=`1`（第一分支）。这些字段的数值意义来自消费者，未将内部强度擅自标成某个物理单位。

## 重放与证据

```sh
node scripts/pianoteq_replay_impedance_controls.mjs \
  "$HOME/.local/share/just-piano-analysis/base-model-full-values-pass13.json" \
  "$HOME/.local/share/just-piano-analysis/dry-full-fxp-pass13.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass15-impedance-before/runtime.json" \
  /tmp/impedance-controls-report.json
```

对照值来自硬件点 `100194ca8`，在实际调用之前读取，不从 p/q 或音频倒推。before、radius、after-v3 各运行正常退出；均48kHz、24-bit、双声道113152帧，PCM SHA-256 为 `1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`，与相同配置的原版一致。它仅证明采集没有改变这些渲染，不能替代 JS 音频等价性。

REA 保留证据：`ev_105ecc89d1d8e20d6eb315f638d70a59abc83c1e1f319e0831c18e3ef9ad0642`（builder）、`ev_b7509ba98ae62f3c9691bf8d0252abc5694375e9c12b3a3c4a25803290dbbbc0`（输入曲线和锚点）、`ev_59e56a98d06c65349050abf61abde505db4f5b09c3625b865f94c128b8a6d735`（索引和比例）。原始资源、预设及运行快照留在本机私有证据目录，不随公开代码发布。

非零 ageing 需要额外的随机状态，模块当前明确拒绝该分支。标量音高曲线的运行模式由调用者明确提供；本次验证只覆盖普通线性模式，不能从存档序列化版本直接推定所有运行标志。
