# 两路频率微扰与源表上下文吻合（pass139）

2026-10-17。恢复主次两路频率变化后，pass135 开始的跨运行源表比较在指定条件下达到2160项零差异。这是捕获上下文中的四表吻合，不是独立初始化、完整声音或网页等价通过。

## 两路随机源不同

缓存复制后、进入 `692ffc` 前，主路 `71644c..71653c` 使用 H+2fd0 指向的四字 xorshift128 状态；其微扰量为 G+c28。次路 `716638..71673c` 使用 G+c20、G+c24，并从 G+8 音符索引 s 初始化局部四字状态：

```
state[0] = s
state[j] = (state[j-1] * 1103515245 + 12345) mod 2^32
```

所以主路随运行状态变化，次路同一音符的微扰可以保持不变。这解释了 pass135 观察到的两路差别，不需要假设基础缓存本身每击改变。

`1c5320` 的生产路径在显式 instrumentMode=1 时，从 B2548.curves[4]（B26a0）生成主路 spread，从 B2a38.curve158（B2b90）及 curve1a8（B2be0）生成次路 spread/offset。B2a38.integer14c 对应两源模式2。新模块拒绝其它未实现的模式，普通线性曲线属性仍显式指定，未新观察运行模式。

## 具体浮点运算及填充

每个随机字 u 先无符号转为 float32，再执行融合运算：

```
r = FMA(float32(u), 2^-32, -0.5)
g = f(spread * float32_word(0x3b83126f))
frequencyNew = FMA(r, f(offset+offset), f(frequency * FMA(r,g,1)))
```

主路 offset=0。系数位模式约为 .004，不能省略乘法舍入。原生按四 lane 处理填充区，所以78项主路消耗80个随机字，30项次路消耗32个。新实现保留填充抽取和最终完整整数状态。

随后主路 `7169d8..716a24`、次路 `716d3c..716d88` 只对相邻模态行的第一列约束 `next >= f(previous + float32(.1))`；不排序，也不约束同一行所有列。本次实际十个表均未触发该钳制，活动钳制只有静态恢复，不能算新动态覆盖。

## 主路种子仍是观察依赖

权重快照中的四字状态位于主路微扰之后。新实现对 xorshift 的可逆位运算回退80步，取回主路输入种子，再前推核对完整整数状态。没有从目标频率推种子、拟合 spread 或搜寻候选。

这仍依赖捕获的后续 RNG 状态，不能称为独立生产种子。报告明确 `primaryRandomStateStillObserved=true`、`primaryInitialRandomStateIndependentlyProduced=false`。次路种子由候选源自带的原生音符索引生成。CLI 必须显式提供 `--frequency-source 1 captured-post-jitter-state` 才启用，缺状态拒绝。

## 完整四表的有限结论

沿用 pass133 自算极点/权重/源构造，接 pass136 分量混合、pass137 邻列幅相与 pass138 衰减缩放。五击×主次两路：

| 数组 | 比较数 | 差异 |
| --- | ---: | ---: |
| 频率 | 540 | 0 |
| 衰减 | 540 | 0 |
| 幅度 | 540 | 0 |
| 相位 | 540 | 0 |
| 合计 | 2160 | 0 |

新增540项频率吻合；前轮匹配值不重计。`passed=true/compatible=true` 仅指这些指定条件下的表比较，`compatibleWithCapturedContextOnly=true`。主路种子、运行控制及此前未闭合的模型/注册常数等依赖保留。hypotf/atan2f仍有四次唯一系统调用，普通音符/host0与instrumentMode1仍显式指定；没有新同次生产证明。

审计报告现在保存每次自身计算的四数组及摘要，便于后续接入声部，而非只保存通过标记。尚未将这些表替换到连续声部：`substitutedIntoVoice=false`、`sameRunModelGenerationVerified=false`、`finalStereoVerified=false`。

## 验证与证据

私有 `pass139-frequency/audit-b.json` 对完整原始捕获通过；`guards.json` 十一项检查通过：全部2160项相同；目标翻一位恰一差异且预测不变；改捕获 RNG 会改变主路预测；改基础曲线会改变次路预测；关闭新阶段恢复540差异；80/32次填充抽取保留；1000组自有 RNG 前后回退测试通过；缺种子拒绝；依赖标记保留；完整预测表已输出。自有回退测试不是新增原生场景证据。

依据缓存分析和不可变 ARM64 指令，没有新 REA 查询、原生运行或实际音频。原始捕获 SHA 仍为 `845ecef901e2215062d7cae298bc6f232be44357a39cef07fb523bfc067a869f`。失败负例及此前拒绝报告保留，商业数据不提交。

语法与diff检查通过；npm test已取得完整exit0结果，既有浏览器/数学回归通过，不作Pianoteq声音等价证据。

原 LLDB39072、目标39079、debugserver39080仍存活，目标CPU时间0，未重复启动、修改冻结依赖或使用 Pedalboard。下一步是把计算源表作为声部回放输入验证实际音轨，再消除随机初始化等观察依赖；完整接触反馈、全预设、最终立体声和网页验收仍未通过，不合并、不发布。
