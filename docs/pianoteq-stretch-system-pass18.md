# 拉伸矩阵到128键频率表：pass18

`dsp/stretch-system.mjs`实现`326fe0`中加权差分、Gram正则矩阵、约束扩充以及解向量到128键频率表的计算。它通过[已恢复的LU](pianoteq-stretch-linear-pass18.md)计算实际203阶系统，不读取捕获矩阵或捕获解作为计算输入。**右端项RHS、两个注册表权重仍由捕获提供；系统sin/exp2/pow仍使用独立macOS数学oracle。** 因此没有宣称整个调律生产者已经由存档独立重建。

## 计算

先计算`sin((r+1)*π/107)`的前106个double，最后一项是原代码字面量`0x3ca1a62633145c07`。两个稀疏差分矩阵的每行分别为：

```text
D2[r,r..r+2] = [-s[r], middleWeight*s[r], -s[r]]    (105×107)
D3[r,r..r+3] = [s[r], -3*s[r], 3*s[r], -s[r]]     (104×107)
Gram = gramScale*(transpose(D2)*D2) + 100*(transpose(D3)*D3)
```

真实注册表返回middleWeight=2、gramScale=1。不能从目标矩阵反推这两个数后称为参数恢复。middleWeight非有限或绝对值大于10000时按原分支置零。Gram的分离乘加与尾部FMA顺序见LU报告。

对interval=12，扩充为`N=215−interval=203`的对称矩阵。107个未知量代表note8..114的log2频率；第107行/列将未知量61（note69）绑定参考音；其余95个约束连接相距interval的未知量，以−1和+1写入双方对称位置。RHS的107项主块为0，其后为参考音及刚度导出的音程约束。后者的生产者与平滑仍未移植，当前明确接收实际RHS。

求解后对note8..114执行double exp2再转float。低端8键使用`f32(table9/table8)`为比率，从table8进行double pow外推；高端13键使用`f32(table114/table113)`，从table114外推。pow与乘法完成后才转float，没有用重复float乘法代替。

## 实际验证

`before-v2`、`weights`、`lu`、`table`四个独立运行分别使用单个固定硬件观察点，正常exit0、errors为空。table阶段在`3283d8`，表已写完而临时数组尚未释放。初次before误标RHS/solution的证据仍保留，不用于成功验证。

`system-replay.json`以捕获RHS和权重为输入，实际逐位比较结果：

| 对象 | 数量 | 不同 |
|---|---:|---:|
| 独立sin生成的权重 | 107 double | 0 |
| 重建矩阵与求解前原矩阵 | 41209 double | 0 |
| 重建矩阵与写表后原矩阵 | 41209 double | 0 |
| 独立LU解与原解 | 203 double | 0 |
| 独立Ax与原乘积 | 203 double | 0 |
| 计算频率表与原表 | 128 float | 0 |

`pianoteq_replay_tuning.mjs --stretch-report`可将本阶段计算表送入上一轮调律，而非继续使用上一轮捕获表。105音高、各三次遍历的2520个字段仍逐位相同；报告明确保留`stretchTableProducerReconstructed:false`及`stretchRhsStillCaptured:true`。

负例将middleWeight改为2.00001后，矩阵317项、解203项、表18项不同，重放exit1。原生数学oracle仅含公开系统库调用，无目标代码。四次有效采集均输出48kHz、24-bit、双声道113152帧，PCM SHA256为`1907f854d5c427908038ee9629a5c8997facbb71242e30b94874fc0553a4c9d6`，与原版基准逐字节相同；这证明采集未改变该音频，不证明JS完整音频等价。

```sh
clang -O0 -Wall -Wextra scripts/pianoteq_system_math_oracle.c -o /tmp/piano-pass18-math-oracle
node scripts/pianoteq_replay_stretch_system.mjs \
  "$HOME/.local/share/just-piano-analysis/debug-pass18-stretch-before-v2/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass18-stretch-weights/runtime.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass18-stretch-table/runtime.json" \
  /tmp/piano-pass18-math-oracle /tmp/stretch-report.json
```

## 证据与剩余范围

调用方静态证据`ev_8e68e2673db246dc6686204e9b6cc9b9ba63480c5af2f9c6f8973052778dd476`，矩阵helper证据`ev_70ee931e641a3a9aeb87a28b0a043e5d9005cc7d3b77ee341e992ade1cee8ba6`，Gram实际尾调用证据`ev_3097e3cb5fc6bbe8a625852052ef34c4d799e0abae64bea944fae8236068f6ba`。REA本轮导出pass18 evidence bundle和snapshot（206条保留记录），并正常关闭。原安装程序SHA未变；捕获、失败负例及报告保存在本机SHA清单中。

当前只验证一个默认音律/interval12配置。其它interval、非默认音律、RHS生成、注册表权重来源、系统数学的浏览器实现，以及全模型/预设和完整声部PCM仍缺。网页继续使用旧独立引擎；本模块尚未接入网页音频输出。
