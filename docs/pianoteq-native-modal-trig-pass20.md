# 原生模态三角近似：pass20

`dsp/native-modal-trig.mjs`恢复`1001d0364`的四lane float正弦/余弦近似，不调用`Math.sin`、`Math.cos`或系统oracle。它复现原程序的范围缩减、多项式与符号选择；目标是原程序的实际近似值，不是额外提高数学精度。

## ABI与静态来源

函数入口x0指向4个float radians，x1指向4个sin输出，x2指向4个cos输出。函数没有callee，不建立栈，也不修改这些地址寄存器。`1d048c`为RET前位置，此时可通过原x0/x1/x2读取输入和完整结果；`1d0488`时cos尚未写入。

`863008`在`863590/8635a0/8636d0`调用它，返回LR分别为`863594/8635a4/8636d4`。本模块只实现该helper，角度与初始P/Q等外层系数的生成另行验证。

精确常量与运算来自私有`pass3-arm64-disassembly.txt`的`1d0364..1d048c`；调用方结构亦见`pass2-coefficient-refresh.txt`。原arm64 slice SHA256为`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`。

## 范围缩减与多项式

对每lane先记录`input<0`比较结果，再取abs。以float常量`0x3fa2f983`相乘并舍入float，经FCVTZU向零截断/饱和为uint32 `i`。范围缩减索引为uint32环绕计算`j=(i+1)&~1`，再以UCVTF转float。

范围缩减依次执行三次float FMA：

```text
r = fma32(float(j), floatBits(bf490000), abs(input))
r = fma32(float(j), floatBits(b97da000), r)
r = fma32(float(j), floatBits(b3222169), r)
z = float32(r × r)
```

多项式常量全部保留原float位型：

| 阶段 | cosine | sine |
|---|---|---|
| 高阶系数 | 37ccf5ce | b94ca1f9 |
| 中阶初值 | bab6061a | 3c08839e |
| 低阶初值 | 3d2aaaa5 | be2aaaa3 |

两列各自以两次FMA形成嵌套多项式。随后`1d0448..1d0464`的独立FMUL与FADD、FMA必须保持区别：cosine链先独立计算`z×low`、`z×−.5`，再FMA并最后加1；sine链先独立计算`z×low`，再执行`fma32(r,power,r)`。

`j&2`决定两条多项式交换；sin符号取`((j&4)==0) XOR (input<0)`，cos取负标记为`((i−1)&4)==0`。这是NEON比较与位选择的转写，不能换成宿主三角函数。尤其输入负零不满足`input<0`，原函数因此输出正零sin；实现保留该行为。

## API与验证

`nativeModalTrig(angles)`要求恰好4个float角度，返回`{sin:Float32Array,cos:Float32Array}`。`nativeModalTrigLane(angle)`提供相同独立lane计算，额外返回integer、quadrant、reduced用于核查。仅接受有限float输入；非有限输入与NaN payload不在当前API范围内。

`scripts/pianoteq_replay_modal_trig.mjs`读取原程序initial捕获中的theta/phase以及对应sin/cos，逐float位型比较。它另列`Math.sin/cos`结果的不同数量作诊断，成功判据只取原近似实现与实际捕获是否一致。

真实输入输出来自私有`debug-pass20-modal-initial/runtime.json`：单硬件点`8634d8`，46条record、184lane，input_mode0，同一V；正常退出且errors为空，原版PCM对照一致。每条记录读取实际theta/phase及其四个三角输出数组。`trig-replay.json`结果：

| 项目 | 数量 |
|---|---:|
| 四lane输入向量 | 92 |
| 不同float角度 | 363 |
| 实际sin/cos float输出 | 736 |
| 恢复算法逐bit不同 | **0** |
| 换成`float32(Math.sin/cos)`的逐bit不同 | **70** |

本次theta范围为`0 .. 1.870343565940857`，phase范围为`−2.413344621658325 .. 2.593996524810791`，包括正负角度和零。原helper的三角计算阶段已在这些实际输入上完全摆脱系统oracle；捕获角度的生产仍属于调用方，不能据此宣称所有系数输入或完整音频引擎均已替代。

负例仅修改一个捕获sin结果的一个float ULP，重放即exit1，准确报告唯一位差`3e309fce / 3e309fcf`。未以误差容限放过差异。极大角度、uint饱和、subnormal与负零等指令边界虽已按静态语义实现，尚不算本次运行捕获的验证覆盖。

```sh
node scripts/pianoteq_replay_modal_trig.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass20-modal-initial/runtime.json" \
  /tmp/modal-trig-report.json
```

完整REA伪码已提取到私有`pass20-0x1001d0364.txt`，batch为`pass20-modal-trig.json`，证据记录`ev_8f5dea5ce56e78d849daf824d32f675cd6273f7fbcf38a81f4195aebdba65bbb`。其中类型推断可能将FCVTZU显示为普通int，精确unsigned截断/饱和仍以ARM指令为准。
