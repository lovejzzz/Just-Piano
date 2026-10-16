# 拉伸调律的矩阵计算与LU求解：pass18

`dsp/stretch-linear.mjs` 恢复 `326fe0` 调律路径使用的double矩阵运算：Gram、缩放、FMA累加、部分主元LU分解、三角求解，以及求解后的矩阵向量乘。它没有调用宿主线性代数库，也没有按输出拟合系数。存储统一为 `values[column × rows + row]`，对应原对象`+18=columns`、`+20=rows`。

这里需要纠正函数职责：**`76e9c4` 才是求解包装器；`1db468` 是求解后验证用的矩阵向量乘。** `76e9c4`复制原矩阵，调用`2311e4`分解与`185ec0`求解。`326fe0`随后调用`1db468`计算Ax，与原RHS比较残差。不能把这条路径只描述为若干矩阵helper调用。

## 真实计算验证

私有`debug-pass18-stretch-before-v2/runtime.json`在`3281c0`捕获原A与RHS；`debug-pass18-stretch-lu/runtime.json`在`76eb0c`捕获LU副本、pivot、原RHS与解。两份schema2捕获均errors为空、正常退出，各一条实际记录。interval=12，方阵维度 `215−12=203`。

`scripts/pianoteq_replay_stretch_linear.mjs`以原A/RHS为输入，再以正常退出的`debug-pass18-stretch-table/runtime.json`交叉验证求解后状态。`linear-replay-with-product.json`中的实际结果为：

| 比较对象 | 数量 | 逐bit不同 |
|---|---:|---:|
| 两次捕获的原RHS | 203 double | 0 |
| 独立分解得到的完整LU副本 | 41209 double | 0 |
| 1-based pivot向量 | 203 int32 | 0 |
| 独立分解及求解得到的解 | 203 double | 0 |
| 从捕获LU出发再执行三角求解 | 203 double | 0 |
| 求解前后原A保持不变 | 41209 double | 0 |
| 求解前后原RHS保持不变 | 203 double | 0 |
| 后期捕获的解 | 203 double | 0 |
| 原A与独立计算解得到的实际Ax | 203 double | 0 |

这同时验证LU因子、解与Ax的每个binary64值，不以较小残差掩盖不同算法或舍入次序。诊断残差L2约`1.0228194528584437e−11`；脚本中该诊断值不替代原生Ax逐bit比较。矩阵向量乘的真实检查通过，报告`afterMatvecVerified:true`。

初次before捕获曾把RHS与solution标签颠倒；原始错误schema证据保留，重放器只接受纠正后的schema2。人为修改一个LU double后，负例明确exit1、passed=false、nativeLuFactorizationVerified=false，未降低成功标准。

## 实际算法与舍入

### Gram与正则项

`326fe0`构造的两个差分矩阵分别是105×107（`0x15f18` bytes）与104×107（`0x15bc0` bytes）。`68c748`的非alias路径尾调用`69125c`计算转置左矩阵与右矩阵的乘积，得到107×107 Gram矩阵。

这段dot并不是全FMA：`6913e0..6913fc`先独立计算8个double乘积，`691400..69141c`再按原下标次序向同一个acc连续加8次；仅`691438..691440`的余项用double FMADD。因此105项dot是前104项分离mul/add、最后1项FMA；104项dot则全部分离mul/add。模块按此分界执行，未利用矩阵对称性跳过另一半元素的运算。

`47b808`的赋值路径执行double缩放，SIMD `47bab4..47bac0`及标量`47baec`都是FMUL。`2917dc`累加路径则使用FMA：SIMD `2918d8..2918e4`、标量`29191c`。其调用方将第二个Gram乘以100后加到第一个缩放结果。Gram的真实生产输入与整A矩阵对照由上游阶段验证；本重放器单独使用捕获A，不假称已经替代矩阵生产输入。

### LU分解：2311e4

恢复的是带行交换的普通部分主元LU，不是Cholesky、QR或无主元Gaussian elimination：

1. 对每列k扫描row≥k，取绝对值最大的候选；`231524..231534`只在严格大于时更新，所以相等候选保留第一个。
2. `231550..23155c`保存1-based pivot；跨全部列交换选中行与k行（含此前已保存的L部分）。
3. 每个下方元素直接除以当前对角（`2316d8` FDIV），不先计算倒数。
4. 临时保存负multiplier与上方行值，按剩余column、再row顺序更新 `Aij=fma64(Ukj,−Lik,Aij)`；SIMD与标量均FMA，见`2318ac..2318f0`。

原函数主循环只到倒数第二列。中途主元全零会返回1-based info；最后对角没有零检测，1×1也直接返回info0。实现保留这个边界，没有增加epsilon修正或正则化。模块限定非空、有限输入的方阵，本轮真实样本为203阶；其它维度与奇异输入不算本次真实验证覆盖。

### 三角求解：185ec0

先复制RHS并按pivot次序交换元素（`185f40..185f84`）；随后按column从低到高，用单位对角L执行前向更新，再从高到低以U对角作double除法并更新更小row。`186080..18608c`、`18620c..186218`为向量FMLS；标量`1860bc/186248`为FMSUB，都是 `fma64(−xk,coefficient,old)`。没有把它改成逐行dot求解。

### 残差回算：1db468

非alias路径先清零输出，随后按column0..N−1累加各行。`1db5fc..1db608`与`1db638`均为FMA，因此每个输出元素按相同column次序递推：

```text
out[row] = 0
for column ascending:
    out[row] = fma64(x[column], A[column × rows + row], out[row])
```

模块新分配输出，覆盖调用方实际的非alias分支；没有将此函数误作为第二次求解。

## API与重放

导出`stretchGram(matrix)`、`stretchScale(matrix,factor)`、`stretchAddScaled(destination,source,factor)`、`stretchLuFactor(matrix)`、`stretchLuSolve(factorization,rhs)`、`stretchMatvec(matrix,vector)`。矩阵为`{rows,columns,values,layout:'column-major'}`，结果values是Float64Array。分解返回`{lu,pivots,info}`，pivots是Int32Array；原矩阵不被修改。精确FMA复用已验证的`modal-poles.mjs:fma64`。

```sh
node scripts/pianoteq_replay_stretch_linear.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass18-stretch-before-v2/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass18-stretch-lu/runtime.json" \
  /tmp/stretch-linear-report.json \
  --after "$HOME/.local/share/just-piano-analysis/debug-pass18-stretch-table/runtime.json"
```

`--after after-schema2.json`可额外对照求解后的原A、RHS、解及实际Ax，也接受字段相同的schema2 `stage:table`捕获；没有after捕获时，报告明确`afterMatvecVerified:false`。上游差分矩阵生产、RHS生成、最终128频率表和音频等价属于独立验证阶段。本阶段通过不代表所有调律设置、所有预设或完整声音已经复刻。

## 静态证据

原arm64 slice SHA256：`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`。调用方为私有`pass18-reused-0x100326fe0.txt`，精确运算次序从`pass3-arm64-disassembly.txt`上述地址核对。

`68c748/47b808/2917dc/76e9c4/1db468/2311e4/185ec0`的完整伪码保存为`pass18-0x100<address>.txt`，batch记录为`ev_70ee931e641a3a9aeb87a28b0a043e5d9005cc7d3b77ee341e992ade1cee8ba6`。`69125c`与过滤函数的额外batch记录`ev_3097e3cb5fc6bbe8a625852052ef34c4d799e0abae64bea944fae8236068f6ba`保存在`pass18-stretch-product-filter.json`。反编译作为结构证据，FMA与非FMA、舍入和遍历顺序以ARM指令为准。
