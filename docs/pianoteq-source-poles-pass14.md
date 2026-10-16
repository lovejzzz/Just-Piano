# 源参数到多分量频率／衰减的实际数值闭合

后续 pass15 已补充 [p/q 生产者及确定性扰动](pianoteq-modal-impedance-pass15.md) 的实际数值验证，并允许本脚本通过 `--impedance-report` 使用计算出的 p/q。以下记录保留 pass14 当时的捕获输入范围；新路径仍依赖明确列出的运行输入和系统数学 oracle。

本轮将 `1026dc/194870` 的参数准备、复多项式生成、独立求根和真实源矩阵连接起来。用实际 G/cache 输入重建 **108 个 lambda、36 个中心频率，全部 double 逐位一致**；随后得到的 **108 个分量频率和108个原始衰减，全部 float32 逐位一致**。两组模态截止计数也准确得到26行和10行。

输入中的复耦合 p/q 仍来自原程序实际捕获，native scalar powf 暂由独立系统 oracle 提供；这不是整个源参数生产或完整声音引擎已经完成复刻的声明。

## 单点实际输入

主线程在 `100194d68`（调用 `6d2c10` 前）使用一个固定硬件断点，取得 A4 的全部36条模态调用：mode0有26条、mode1有10条，均为3分量。每条保存实际 lambda double 数组、p/q、中心频率、模态坐标和衰减下界比例。

此点 x25 已被 `194d10` 的 PRNG 更新覆盖，不能将其当作 G。G 从 `[sp+0x20]` 读取（`194b94` 保存）；x10 仍是 cache。原始抓取脚本已按这一实际寄存器生存期读取。

本次真实 lambda 与 p/q 均直接读取，未从频率或衰减逆推。后续对照使用：

- `debug-pass14-modal-source/runtime.json` 的 G/cache 输入及最终频率矩阵。
- `debug-pass14-source-amplitude/runtime.json` 的真正原始 decay；该点在共同衰减增量写入之前。
- `debug-pass14-source-poles/runtime.json` 的实际中间输入，用于验证重建的 lambda／center。

完整频率矩阵逐位相同，作为源输出和原始衰减捕获之间的唯一匹配条件。模态行由明确捕获的 `modal_coordinates` 与输入的模态坐标对齐，不按输出频率倒推行号。

## 重建输入而非直接照用捕获 lambda

新脚本 `scripts/pianoteq_replay_source_poles.mjs` 复用既有 `dsp/modal-source.mjs`，本轮没有修改被冻结的源表模块。

首先按实际 float32 次序计算：

```text
offsetScale = native_powf(float32(f0/440), offsetExponent)
offset[j]   = float32(rawOffset[j] * offsetScale)
slope       = float32(componentStiffness[0] * spread)
b[j]        = float32(float32(j*slope)/100)
```

本次 f0=`440.0000305175781`，powf底数=`1.0000001192092896`，指数=`1.2999999523162842`。自编译 C 程序以 `-O0` 和 volatile float 参数独立调用系统 powf，结果为 float32 位模式 **`3f800001`**，也就是`1.0000001192092896`。两条源配置输入均核对 numeric 值和原始位模式。该 oracle 与最终频率／衰减无关，不通过输出拟合。

本次 blend=1，使用联合端点：offset的累加、平均、f0加平均与比例除法保留float32舍入，再除以double `sqrt(1+B)`，得到：

```text
reference = 439.819481160542
base      = 439.9070611750539
```

随后按原 `194bf0`、`194ce0/194ce4` 的 double FMA 次序计算：

```text
center = (base*m) * sqrt(fma(B+b[0], m*m, 1))
lambda[j] = fma(reference,
                fma((m*m)*b[permutation[j]], 0.5, 1),
                offset[j])
```

permutation来自offset排序；不将原来不对称的数据索引随意整理成另一种形式。**全部108个lambda和36个center均double逐位相同。** 新脚本后续实际使用这些重建值求根；捕获 lambda 仅作为对照，不直接喂入输出计算。

捕获参数中名为 `ref` 的 d2 是传给 `6d2c10` 的 `base*coordinateScale`，本次为`439.9070611750539`，不要混同上式 `reference=439.819481160542`。

中心频率达到 `0.99*min(cache.f8,float32(sampleRate*0.5))` 时停止。由完整模型坐标数组重算，本次两个端点分别保留26、10行，与实际矩阵完全相同；不是事先读取输出行数作为循环上界。

## 复系数、根、频率与衰减

脚本将重建 lambda、真实 p/q、重建 center 和模态坐标交给既有 `dsp/modal-poles.mjs`。系数使用已经按 ARM FMA 次序验证的生成算法，保留末因子`beta[N−2]`的不对称索引。kappa=π、gamma=0来自同一二进制版本第七轮实际全局配置捕获。

求根使用独立 Durand–Kerner，**没有声称它就是原版 QR 迭代**。根按`fma(F,1e−16,v)`递减排序；排序首项的虚部决定共同衰减下界，最后转换float32。

| 验证 | 通过／总数 |
|---|---:|
| 重建lambda，double位模式 | **108/108** |
| 重建center，double位模式 | **36/36** |
| 模态截止行数 | **2/2** |
| 完整源矩阵的频率，float32位模式 | **108/108** |
| 原始decay矩阵，float32位模式 | **108/108** |
| 已覆盖的模态调用 | **36/36** |

没有失败或缺失模态行。完整报告保留每条系数、独立根、残差、迭代次数及预测／实际输出，失败返回非零。

## 真实音频及范围

这次包含真实中间输入捕获的渲染正常exit0。使用同一FXP/MIDI的官方原版渲染与观察版均为48kHz、24-bit、双声道、113152帧，PCM逐字节相同；证据为本机`debug-pass14-source-poles/audio-equivalence.json`。这验证本次抓取未扰动音频，并不等于新增JS模块已生成相同的PCM。

结合前一源表报告，原始衰减→共同衰减／幅度、固定随机相位也已有实际逐位验证。当前明确剩余依赖为：

- 复耦合p/q的生产者`1002ff628`及其曲线选择输入，尚未从模型参数完整重建。
- native scalar powf尚未全域移植；本轮两个实际输入由独立系统oracle提供。
- scalar expf产生eta、double pow等幅度依赖仍需保持前轮明示的输入范围。
- 原QR迭代、N<2快路、零系数剔除、中间blend混合、其他音高与其他模型未因本次通过自动获得验证。

原始输入、源矩阵、原始衰减来自相同配置的不同独立渲染，不伪称是同一次函数调用里所有阶段的联合快照。

## 重放

```sh
node scripts/pianoteq_replay_source_poles.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-poles/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-modal-source/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-amplitude/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-poles/powf-inputs.json" \
  /tmp/source-poles-replay.json
```

实际报告为本机`debug-pass14-source-poles/js-source-poles-replay.json`。同目录保留独立oracle的`powf-oracle.c`、编译物、结果、系统image来源和源文件SHA；它没有读取Pianoteq代码或输出，也没有写系统文件。商业模型数据和这些私有运行快照不随公开仓库发布。
