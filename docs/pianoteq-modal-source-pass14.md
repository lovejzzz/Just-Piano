# G 基础四数组：实际模型输入绑定与相位计算重放

本轮新增 `dsp/modal-source.mjs`，开始执行 `7a4014→1026dc→194870/182960` 的源表准备算术。主线程捕获两组 A4 的真实基础矩阵：mode0 为 26×3，mode1 为 10×3。独立重放已使 **94 个 archive→cache 输入值，以及 108 个相位、108 个衰减和 108 个幅度输出逐位一致**。频率表的生成和更早输入生产仍未闭合，不能将此次局部通过描述为整个 G 模型已经生成一致。

## 实际捕获和模型来源

单一硬件点 `1007a4784` 位于 `1026dc` 返回之后、`7a4014` 的全局幅度归一化之前。此时 x19 是 cache、x20 是 G。矩阵描述符分别为 cache+`10/38/60/88`，每个含 `[begin,end,capacity,rows,cols]` 五个 64-bit 字段，数据为 float32 行优先排列。四张表依次是频率、衰减、幅度、相位。

两条记录的 noteIndex 均为 69。`7a4014` 以 `noteIndex−1` 选择 B+1c40 行，完整 35 个坐标正好匹配 NY bank 第 68 行；HB 同位置有 39 个坐标，未通过完整长度匹配。两个 mode 均唯一匹配 NY。

B+2548 内 v14 reader 解出的四个向量，与四张最终频率／衰减／幅度／相位表不同：

| 归档内成员 | cache 位置 | 1026dc 中的作用 |
|---|---|---|
| B+29d0 的向量 | +1f8 | 各分量频率比例，用于基础频率的除数 |
| B+29e8 的向量 | +220 | 分开构建分支中，各分量最终幅度缩放 |
| B+2a00 的向量 | +248 | 分开构建分支的额外 `10*log10f(value)` 增益 |
| B+2a18 的向量 | 本函数未复制到上述三个 cache | 不能擅自称为相位表 |
| B+2a30 scalar | +270 | 联合／分开构建的选择及中间混合参数 |

本次三个向量均为 `[1,1,1]`，scalar 为 1，选择联合构建端点。B+1bec→cache+1a0 为 `1.2999999523162842`；B+1c58 对应 note 行→cache+1e0 为 1。两条记录各有 47 个完整匹配的 archive 输入值，共 94 个。所用 NY/HB 解码数据为私有 `base-model-modal-inputs-pass13.json`，未把商业模型表发布到仓库。

## 可执行源表算术

模块的 `prepareModalInputs` 实现 offset 缩放、分量 spread 向量和联合／分开端点的参数准备；`modePoleInputs` 实现中心频率及 lambda 的 double FMA 次序；`specialHalfRatioWeights` 实现频率比例恰为 `[.5,.5]` 时的奇数模态权重选择。上述准备阶段尚未与对应临时运行数组直接对照。

联合分支的中心参数来自 float32 的 `(f0+mean(offset))/ratio[0]`，再除 double `sqrt(1+B)`；lambda 中的两级修正按 `194ce0/194ce4` 的 double FMA 执行。不能把外层 float32 加法／除法自动改成全部 double。

本次真实 f0 为 `440.0000305175781`，其 `powf(f32(f0/440),1.3)` 不是可自动视为 1 的恒等输入。因此模块要求调用方显式提供 native `offsetScale`；没有悄悄用 `Math.pow` 替代。相同地，幅度构造中的系统 scalar `expf`、double `pow`、配置值未恢复时由调用方显式提供；不以四 lane exp 或八 lane exp 代替它们。

`sourceAmplitudeRow` 恢复相对幅度、共同衰减增量和双重和归一化。原 ARM64 明确显示：每对幅度乘积与衰减和先舍入到 float32，再转换 double 做除法，Z 在 double 累加（`18304c..183078`）。这比伪代码“所有变量都是 float”的表面阅读更精确。权重／sqrt(Z) 乘相对幅度后先舍入 float32，再乘配置整数比例、再次舍入。随后主线程补采单一硬件点 `100182b40`：eta 已计算、原始 decay 尚未被修改。x23 是原始 decay 矩阵，x28 是频率矩阵，sp+50 指向权重向量；v12 为 double eta，v11／v9 分别是 addedDecay／shape。实际两组均为 `eta=0.00027289724675938487`、addedDecay=10、shape=`0.8149999976158142`。这提供了真正的计算输入，无需从最终 decay 反推。

自编译 C 程序使用 `-O0` 与 volatile double 参数，直接调用本机 `/usr/lib/system/libsystem_m.dylib` 的 `pow`，为实际 36 行×2 非首分量生成 **72 个 ratio／exponent 的独立 double oracle**。oracle 的源文件、编译物、结果及来源 SHA 保存在 `debug-pass14-source-amplitude/pow-oracle/`。重放器核对每个 oracle numeric 值与保存的 double bits，再按所需输入对精确索引；缺少输入时失败，不能随意调用近似替代。

两份捕获的完整频率矩阵 **108 个值逐位相同**，用于唯一匹配同一计算对象；这些频率只用于对齐，不计为频率生成验证。由真正原始 decay、实际 eta、weight、shape 与实测 C=1 计算，**108 个输出 decay、108 个输出 amplitude 全部 float32 逐位一致**。72 个 pow 请求全部被实际使用。`Math.pow` 在这 72 个输入的 double 返回也恰好全部相同，报告保留这一比较；它没有证明 JS 在任意未来输入都与系统 pow 相同。浏览器模块仍显式接收 pow 依赖，不将该局部数值通过冒充系统 pow 全域移植。

采集版渲染正常结束，并与本轮官方原版 PCM 逐字节一致；证据为 `debug-pass14-source-amplitude/audio-equivalence.json`。这项对照属于独立的原始输入捕获运行，不是把一次失败采集借用另一次成功结果。

## 108 个实际相位输出

`sourcePhaseTable` 实现原 `182960` 固定种子 xorshift128，初态为：

```text
x=0x2983, y=0x6b09c700, z=0x77cbeb39, w=0x8a94b57e
```

每项更新后先将 uint32 缩放为 float32 U，再将 `U−0.5` 舍入到 float32。相位为 `float32((2*Cphase*randomAmount)*centered)`，其中乘比例采用 double，最后转换 float32。本次 randomAmount 为 `0.4000000059604645`。

最初以 π 候选重放全部 108 个相位通过。随后主线程另用单一硬件点 `100182edc`，在注册表键 `c8f78330d732bd62` 返回后直接读取 d0，8 条实际记录的 double 位模式均为 **`400921fb54442d18`（π）**；同点 x26 的无符号整数幅度比例 C 均为 **1**。采集正常退出且与同轮官方原版 PCM 逐字节相同。

重放器现在必须读取这份真实 constants capture，核对 numeric double 与原始位模式，并用实际返回值重建 26×3 和 10×3 共 **108 个相位，全部 float32 逐位一致**。这里的 π 已不是仅由输出拟合的候选。两份采集属于相同输入的不同渲染；没有把它们伪称为同一次调用的联合快照。模块要求调用方提供 `phaseConstant`，没有将这一个模型配置的值隐藏为通用默认值。

本次 G+400/418/430/448/460/478 的后续相位控制均为 0，重放器显式检查此前提；非零相位控制尚未覆盖。

## 全局归一化及参考模态

`normalizeSourceAmplitudes` 实现 `7a47c0..7a48c8` 的最大绝对值、float32 倒数与逐项 float32 乘法。本次归一化前最大值为 mode0 `1.0077000856399536`、mode1 `0.5351594686508179`，预测比例分别为 `0.9923587441444397` 和 `1.86860191822052`。父线程随后在独立渲染用单点 `7a48d4` 取得归一化后数组，新增 `pianoteq_replay_source_normalization.mjs` 验证 **108个幅度逐位一致**，另三张表全部对齐。该采集同样正常退出且PCM与本轮官方原版相同；本机证据为 `debug-pass14-source-normalized/runtime.json`、`audio-equivalence.json` 和 `js-replay.json`。初始source重放报告仍将其独立观察标为false，因为初始输入文件确实位于归一化之前；此新增独立对照补足该项。

参考模态选择函数按首分量频率距目标的 float32 差最小选择、同距保留较早项。本次两组 index 均为 0；当前场景不足以验证非首项和相同距离的分支。

## 证据与复现

```sh
node scripts/pianoteq_replay_modal_source.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-modal-source/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/base-model-modal-inputs-pass13.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-constants/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-amplitude/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass14-source-amplitude/pow-oracle/results.json" \
  /tmp/modal-source-replay.json
```

重放器保留失败列表，失败返回非零；报告明确标注 `phaseRegistryValueDirectlyObserved=true` 和 `entireFourArrayConstructionVerified=false`。实际结果保存在 `debug-pass14-modal-source/js-source-replay.json`。

主线程另以本轮相同 FXP/MIDI 运行官方原版。两次渲染均正常结束，48 kHz、24-bit、双声道、113152 帧 PCM 逐字节相同，证据为本机 `debug-pass14-modal-source/audio-equivalence.json`。这说明本次含实际矩阵捕获的渲染未扰动声音，不能据此声称新增 JS 模块已经产生同样的音频。

offset缩放、center/lambda与极点输出的后续实际验证另见本轮source-poles报告；p/q生产和部分0<blend<1的混合helper仍未移植。这个局部模块并未替代完整琴槌接触、琴弦反馈、制音毡和音板求解。
