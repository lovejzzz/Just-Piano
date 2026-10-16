# Pianoteq 9 音板路径：可核对的系数与递推

分析对象：Pianoteq 9.2.5 ARM64，SHA-256 `8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`。本报告仅解释现有二进制证据，未把反编译实现加入浏览器音源。符号刻意使用中性名称，避免将未验证的内部量命名为张力、阻抗或质量。

## 1. 入参的准确来源

`0x100056f98` 的 `x19` 指向一个“输出容器 + 配置”对象，以下称为 D。缓存计算函数 `0x10037907c` 将原始配置 C 复制到 `auStack_288`，却将前方 24 字节处的 `&local_2a0` 传给 dispatcher。因此 **D + 0x18 = C 的副本**，不能将两者偏移混用。复制函数 `0x100278cb0` 对这里的标量字原样复制。

| 中性符号 | ARM64 浮点寄存器 | D 内字节偏移 | 原配置 C 内字节偏移 |
|---|---|---|---|
| T | s0 | 0xc4 | 0xac |
| p | s1 | 0x9c | 0x84 |
| q | s2 | 0xbc | 0xa4 |
| r | s3 | 0xc0 | 0xa8 |
| z | s4 | 0xa0 | 0x88 |
| g | s5 | 常量 | `float32(0x3f9a362c)` = 1.2047781944274902 |

这是 `0x100057058`–`0x10005708c` 汇编明确给出的入参。伪代码中 callee 的六个浮点入参从 caller 调用表达式消失，是本例已经证实的反编译缺陷。

SIMD 函数 `0x1005a8874` 的首个整数/指针参数为状态对象 S；它与 D、C 均不同：

| S 偏移 | 代码读取含义，尚不赋物理单位 |
|---|---|
| +0x00 | 标量 h |
| +0x04 | 标量 τ |
| +0x10 | 以浮点存储、随后转为整数的状态长度 M |
| +0x68 | 以浮点存储、随后转为整数的激励索引 k |
| +0x70 / +0x78 | 激励序列开始/结束指针 |
| +0xa0 | 第一组索引/系数数据结构 |
| +0xc0 | 第二组索引/系数数据结构 |

S 的构造过程、h/τ 的物理单位、索引结构的几何意义仍待验证。

## 2. 已直接读出的标量计算

`0x1005a8874` 的前处理明确计算：

\[
N=\operatorname{uint32}(T/\tau+1),\qquad d=q\tau/2,\qquad D_0=1+d,
\]
\[
\alpha=-\frac{(p\tau/h^2)^2}{12D_0},\qquad
\beta=\frac{r\tau}{D_0},\qquad
\rho=\frac{d-1}{D_0},\qquad
\eta=\frac{2}{D_0},\qquad
\epsilon=\frac{\tau^2}{D_0}.
\]

第一组系数数据交给 `0x1002ccb98`，标量入参为 α；第二组使用 β。第二组状态更新仅在 β != 0 时执行。ρ 乘上一轮状态缓冲，η 交给向量累加 helper，ε 乘激励序列后加到状态索引 k。N 控制整个仿真步数上界；循环按 64 步一块运行，末块可能多算到块边界。不能把 N 简单视为最终音频文件样本数。

初始观察记录的准备 helper `0x10037e040` 还接收 `1/(zτ)`。这说明 z 在输出前处理也起作用，不能只根据最终幅度系数把它归类为增益旋钮。

## 3. 状态循环与矩阵记法

在每个四元素输出块 i 中，第一组数据按 row-pointer 给出的条目区间遍历；每个条目提供一个输入起始索引 j 和四个系数。对 lane ℓ=0..3，累加的是 `coefficient[entry,ℓ] * current[j+ℓ]`，写到输出 `4i+ℓ`。第二组同样以四元素条目累加，但读取差分工作缓冲。这里用 A、B 表示这些 gather-and-weight 线性算子；尚未证明它们是某一特定网格的 Laplacian 或 biharmonic 算子。

追加反编译已经核验 helper：`0x10008bbdc` 经 `0x1007671ac(...,2)` 将源拷贝至首参数；`0x100454bf8` 将标量×第二向量累加到首向量；`0x1008f9974` 交换缓冲描述符；`0x1002ccb98` 原地缩放系数。因此循环对应：

\[
\Delta u_n=u_n-u_{n-1},
\]
\[
u_{n+1}=\rho u_{n-1}+\alpha A u_n+\beta B\Delta u_n+\eta u_n+\epsilon e_k f_n.
\]

其中 f_n 是 S+0x70 指向的已准备激励，e_k 为只在 k 位置取 1 的向量。以上整式由主函数及四个 helper 的数据读写共同支持；数学式省略 SIMD 分组、padding 和浮点舍入次序。它不是完整钢琴的琴槌—琴弦—制音器耦合式。

循环的逻辑缓冲在伪代码中分别为 `local_1e8`、`local_210`、`local_238`，另有大小 M×65 的块缓存。每个状态分量存储块首时刻加随后 64 次更新，共 65 个值。写入块缓存前，状态乘以 `0x10002fe20` 产生的序列 w_n：`X_j[t] = w_(block+t) * u_(block+t,j)`。该 w 序列的生成规则尚未恢复；因此无法由上述递推单独重建最终 IR。

## 4. 输出 kernel 的明确公式

`0x1005ab0e0` 的记录包含目标偏移 d、条目数和状态索引，每个条目另对应三个 float `(a_j,b_j,c_j)`。对块内 t=0..63，它计算：

\[
v_j[t]=b_jX_j[t+1]+c_jX_j[t],
\]
\[
y[B+d+t]\mathrel{+}=a_jv_j[t],\qquad
 y[B+d+t+1]\mathrel{+}=(1-a_j)v_j[t].
\]

B 是以 64 递增的块开始索引，条目 j 的贡献求和。这相当于将相邻状态样本的线性组合分配给相邻两个输出位置，不能仅凭形式断言 a 是物理传播延迟的小数部分。代码先检查 `B+d+64 < output_length`；不满足时跳过整条记录，而不是只截断最后几个样本。缓冲中 65 个时间值正好支持 t+1 的读取。

随后 `0x1005a8874` 有两个确定的输出变换分支：

- 模式位为 0：`out[n] = (-2*g*h²/τ) * (y[n+1]-y[n])`。
- 模式位为 1：`out[n] = (2*z*g*h²) * y[n]`。

两个分支均将末尾样本置零。模式位源于 D+0xfc 的整数是否等于 2；它究竟表示何种物理输出类型尚未证明。

## 5. dispatcher 的后置递归滤波

该步骤由 `0x1000570d0`–`0x1000571c8` 汇编交叉核验，而不只是从参数名称推测。令 R=*(float*)(D+0x3c)，F=*(float*)(D+0x164)：

\[
F_c=\min(F,0.475R),\quad t=\tan(\pi F_c/R),\quad a=\frac{t-1}{t+1},\quad b=\frac{1-a}{2R},
\]
\[
v_n=b x_n-a v_{n-1},\qquad v_{-1}=0.
\]

仅对记录 +0x34 非零且长度非零的响应执行。汇编 `fmadd` 中另有上一输入乘 0 项；对普通有限数可化简掉，NaN/Inf 情况不能用化简式保证逐位等价。后续仍有多个未解码 helper，以及最终 `44100 / *(float*)(D+0x44)` 的缩放，因此本公式也不是完整最终响应转换链。

## 6. 目前不能据此声称什么

- 这条路径有 RTTI 支持其为 SoundboardIRCompute，并有缓存；它未被证实就是实时音频逐样本回调。
- 原配置 C 的这些偏移还没有逐一与公开 GUI 参数连接，不能将 p/q/r/z 自动命名为截止、Q、阻抗等。
- A、B、激励 f、加权 w、观察记录的构建及边界条件缺失；仅有主递推不能重建相同声音。
- 琴槌接触力、琴弦离散方程、制音器接触/释放及相互反作用需要另一路调用链证据。
- 实际音频的单因素变化可以验证声学影响，但如果没有内部量观测，不能唯一证明上述某个系数就是某个旋钮。

## 证据位置

本机原始 REA 证据位于 `~/.local/share/just-piano-analysis/`：`soundboard-propagation.json`、`soundboard-kernel.json`、`soundboard-dispatch.json`、`soundboard-dispatch-assembly.json`、`soundboard-task.json`、`soundboard-config-copy.json`。主路径 evidence IDs 见 [已有证据索引](pianoteq-dsp-findings.md#evidence-index)。本报告没有复制大段反编译代码，数学式是对观察到的算术与数据依赖的归纳。

追加 helper 证据：`pass2-helper-copy.json`、`pass2-copy-impl.json`、`pass2-helper-axpy.json`、`pass2-helper-swap.json`、`pass2-helper-scale.json`。copy 实现 evidence ID 为 `ev_85a017776d198cb27759c0abd2edcbef25d361ef8f7d212589911db590bbb635`；AXPY 为 `ev_9765b94baf925d610fdf3bf875ed06b7d3648a2d7ecd8eacb41edebc5dc12369`；swap 为 `ev_185654c71c8b65a9be2783bd9628de36276cbbfe187175fd3a763eb43a78360b`；scale 为 `ev_b9ccf19e4fa13b4788a28a50e74e2c96ef05092a05e04d368e6b77f51f820015`。
