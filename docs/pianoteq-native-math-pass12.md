# 系统四 lane exp 与 scalar logf 的精确重建：第十二轮

新增浏览器模块恢复了本机 Pianoteq 实际调用的两个系统数学依赖。真实采集的 **419 个 exp 输出、40 个 logf 输出全部逐位一致**；额外独立系统库对照中 **12092 个 exp lane、12771 个 logf 值全部通过**。这填补了 `Math.exp`／`Math.log` 舍入带来的差异，不代表完整琴声或全部 OS 数学库已经复刻。

## 依赖来源与只读取得方式

保存的 Pianoteq ARM64 指令中，`10071033c` 将 x0/x1 拼成一个 128-bit 的 v0，调用 import `_vexpf`，再拆回两个整数返回寄存器。`dyld_info -imports` 指向 Accelerate；SDK `vfp.h` 声明为 `extern vFloat vexpf(vFloat)`。这里不是数组指针接口 `vvexpf`，也不是 Pianoteq 自己的 `1009a3048` 八 lane exp。

本机 macOS **26.5.1 / 25F80 / arm64** 上，自编译普通程序通过 `dlsym`／`dladdr` 得到：

| 项目 | 实际来源 |
|---|---|
| 导出的 vexpf | Accelerate/vecLib `libvMisc.dylib`，image offset `0x583e0` |
| 解析分支和 authenticated GOT 后的实现 | `/usr/lib/system/libsystem_m.dylib` 的 `_simd_exp_f4`，offset `0x27bec` |
| logf | 同一 `libsystem_m.dylib` 的 `logf`，offset `0x59d8` |

程序只读取自身已加载 image 的函数与常数内存，解析指针时仅剥除本进程指针认证信息以供地址读取。没有启动 Pianoteq 或任何 LLDB，没有写系统 image、修改签名、修改许可或变更安全设置。系统 shared cache 原文件路径不可直接读取并未形成阻碍；运行时映射可由普通自编进程只读观察。

实现是根据实际 ARM64 指令独立编写的 JS，没有引入外部开源库或宣称某份开源源码就是这台机器的实现。原始函数代码只留在本机证据目录，不公开系统二进制或完整反汇编。

## 四 lane exp

`dsp/native-vector-exp.mjs` 导出 `nativeVectorExpLane` 和 `nativeVectorExp4`。原指令按四 lane 分别执行：

1. 将输入夹到 float32 位模式 `0xc2cff1b5..0x42b17218`；NaN 继续传播。
2. 按 float32 乘法计算 `floor(x*log2(e))`，用两次 float32 FMA 扣除分裂的 ln2。
3. 用指令中的五个 float32 多项式常数和六次 FMA 计算余项的 exp。
4. 按指数位构造缩放因子。指数过小时先采用较大的正常缩放，再乘 `0x00400000`，保留原来的次正规舍入步骤。

所有常数使用原始位模式，不以十进制近似替换。共享 `fma32` 负责一次 float32 舍入；该模块与自定义八 lane exp 明确分开。

## Scalar logf

`dsp/native-scalar-log.mjs` 导出 `nativeScalarLogf`。该实现不是 `Math.fround(Math.log(x))`。

原指令用 float32 位操作生成最近的 1/128 网格索引，查 129 组倒数／对数 double 数据；mantissa 被重新组装成 binary64，再按实际执行次序计算残差、指数项和三次校正。校正使用 double FMA，最后一次转换到 float32。四个 double 系数和网格数学常数以十六进制位模式保存，避免 JS 初始化常数的额外舍入差异。

次正规正输入通过“与 1.0 的位模式合并，再减 1.0”规范化并修正指数；零、负输入、无穷大及 NaN 的分类按观察到的分支实现。NaN payload 不纳入等价性要求。

## 真实采集与负对照

| 采集 | 数量 | 新实现不同位数 | 旧 JS 数学函数不同位数 |
|---|---:|---:|---:|
| pass10 spectrum-v2 exp | 263 | **0** | 39 |
| pass10 forte exp | 36 | **0** | 4 |
| pass11 coefficient-v3 四 lane 尾部 R | 120 | **0** | 23 |
| pass11 normalization 的实际 ratio→logf | 40 | **0** | 3 |

尾部 R 的输入由真实 `effective_decay` 和实际 timestep 按 float32 乘法重建；没有把内部八 lane exp 的结果冒充四 lane 依赖。logf 对照取自 `normalization-logf-comparison.json` 的真实 ratio 和独立 C `logf` 结果；此处只证明 logf 值本身，新模块接入整个 normalization 后仍应由主链重放器验证。

## 独立系统 oracle

`scripts/pianoteq_native_math_oracle.c` 编译后直接调用系统 `vexpf`／`logf`，输入和输出通过 float32 十六进制位传递。`scripts/pianoteq_replay_native_math.mjs` 对照上述两个浏览器模块，保留完整失败列表，失败返回非零。没有把预先录制输出写成运行时查表答案。

扩展用例包含固定种子随机 float32 位模式、exp 夹限及缩放边界两侧、logf 每个查表索引的舍入边界及多个指数范围、次正规／最小正规、零、无穷大和 NaN。**12092 个 exp lane 与 12771 个 logf 值，失败列表为空。** 有限值及有符号零比较 float32 位模式，NaN 比较分类。该集合并未穷举所有 2³² 输入；也未证明不同 OS 版本或不同 CPU dispatch 的库具有同一实现。

```sh
clang -O0 scripts/pianoteq_native_math_oracle.c -framework Accelerate -o /tmp/piano-math-oracle
node scripts/pianoteq_replay_native_math.mjs /tmp/piano-math-oracle \
  "$HOME/.local/share/just-piano-analysis" /tmp/piano-native-math-report.json
```

第二个参数为私有证据根目录；省略时仍执行独立 host oracle 对照，不执行需要 Pianoteq 采集的部分。编译的 oracle 需要 macOS Accelerate，浏览器模块本身不依赖 macOS。

本机证据目录为 `~/.local/share/just-piano-analysis/pass12-vexpf/`，包含 probe、原始映射读取、`provenance.json`、oracle 与 `replay-report.json`。实际 `_simd_exp_f4` 的 228 字节 SHA256 为 `07feaa61647955979115796f8d55b0133eb6f71a3649b9c383931dbbf038f884`；logf 228 字节（含 literal）为 `7d57397c058c7179d16f2d54e91d4ee00e783712ebecae4827b74e15f35f3feb`；2096 字节数学表为 `2414dee8a39535e035b8102c8e516cdd2f3688a28b3748bdc4fedff33cfa8099`。

本轮没有生成新的实际音频。它证明这两个依赖在列出的真实输入与边界用例上已重放一致，仍需与模型数据、激励、模态耦合、制音路径、声音输出和预设读取一起完成全链验证。
