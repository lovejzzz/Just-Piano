# 第十三轮：存档曲线生成运行时琴槌硬度表

新增可执行模块 `dsp/model-curves.mjs`，输入是本机解析器从基础模型B和预设状态A读取的字段；没有嵌入商业曲线值或运行时捕获结果。计算顺序为：A的Piano/Mezzo/Forte标量乘各自音高曲线，再乘B的两组五条基础曲线，得到两个五节点硬度表。B+0xde8另经多输出曲线插值生成五个力度节点。

对先前正常退出且PCM与官方原版相同的pass6捕获，纽约Steinway、note69、All硬度为0分支，JavaScript从实际存档生成的 **10/10硬度表值及5/5力度节点float32逐位相同**。这是存档→计算→真实内部系数的验证；网页当前音源尚未接入完整模型，不能称完整声音复刻。

## 用真实值和完整寄存器定义核对融合乘加

`FUN_100065fe4` 的基础B+de8节点调用 `FUN_10009edcc`；A的a28/a78/ac8/b18和B的c58..d98/e38..f78标量曲线调用 `FUN_100019a34`，后者跳至 `FUN_10044f8a4`。

两个函数在正常线性分支都计算float32的`t=(note-x0)/(x1-x0)`和`a=1-t`，并以相同顺序融合乘加：

| 调用 | 实际运算顺序 |
|---|---|
| 44f8a4标量，44fac8/44facc | `fma32(a,old,fl(t*new))` |
| 09edcc多输出的标量尾部，09f130/09f134 | `fma32(a,old,fl(t*new))` |

首次JS实现误读09edcc寄存器身份，使用反序 `fma32(t,new,fl(a*old))`，真实10个硬度值中有1个差一个ULP；保留失败报告 `model-curves-js-vector-negative-control-pass13.json`。继续向前追踪09f020..09f050及09f0e4..09f124，确认s17=t、s0=a、x11指向old、x8指向new。09f258/09f25c的四lane分支同样先舍入t*new、再融合a*old。纠正后10/10通过。没有用容差、硬编码目标值或修改捕获掩盖该差异。

## 范围限制与复现

当前只核对note69、All=0及线性clamp模式。存档的压缩布局flags并不证明运行时C+4c的log-X或C+4d的特殊模式，因此调用必须明确声明已经独立确认的运行时模式；其它音高和非零All分支由硬度模块拒绝。曲线通用辅助函数本身支持多坐标插值，但不能据此称其它音符已验证。内部向量化大维数分支、模型全部生成过程及全声部PCM仍有缺口。

本机 `dry-full-fxp-pass13.json` 由 `pianoteq-inspect-fxp.py` 对实际 `audio-pass5-dry/dry.fxp` 的 `inspect(path, True)` 输出生成。随后：

```sh
node scripts/pianoteq_replay_model_curves.mjs \
  "$HOME/.local/share/just-piano-analysis/base-model-prefix-values-pass12.json" \
  "$HOME/.local/share/just-piano-analysis/dry-full-fxp-pass13.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass6/runtime-hardness-v3.json" \
  "$HOME/.local/share/just-piano-analysis/model-curves-js-replay-pass13.json"
```

结果：hardness_bit_mismatches=0、knot_bit_mismatches=0。完整商业数值只在本机证据目录保留。`npm test`同时通过，但网页原有音源的测试不能替代完整Pianoteq声音等价性检验。
