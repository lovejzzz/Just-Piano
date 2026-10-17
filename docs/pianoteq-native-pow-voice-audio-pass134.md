# 原生 pow 接入连续声部及实际 WAV（pass134）

2026-10-17。无新 Pianoteq 动态捕获；本轮在已有干净 pass110 C 同次数据上，移除连续声部激励中的 Math.pow 候选，验证实际组件音轨。

## 注册权重追踪的边界

复核不可变原 ARM64 指令：stretch 的 gramScale 通过 `327208..32721c` 的间接注册表调用读取，键 `0x513347f47f4579a6`；middleWeight 通过 `32736c..327384` 调用 double getter `5b0684`，键 `0xc5d1b716fddf8944`。后者进入 `774e04` 的类型/位值读取流程，不是调用点内联的普通 2/1 常量。

注册表条目生产和运行时状态仍未闭合，不能把当前观察的 2、1 写为通用固定默认值。本轮没有这样替换。私有 `pass134-registry-static/manifest.json` 保存指令文件与四段片段摘要，明确 `fixedDefaultsNotEstablished=true`；不是新增在线 REA 查询。

## 连续声部计算的变化

`pianoteq_replay_release_continuous_chain.mjs` 新增显式 `--native-double-pow`，以 pass128 恢复的通用算法生成后处理速度立方。保留显式旧 `--pow-candidate`。新报告标记 `nativeDoublePowImplemented=true`、`doublePowCandidateUsed=false`、`powCandidateExplicit=false`。

正式 B 在禁止全局 Math.pow 的包装进程中运行，使用原始 pass110 C、原 owned-resumes 审计、存档 repeat 模型和 `--computed-terminal-slopes`。没有新的原生进程或目标写入；未编辑冻结采集器。

首个 A 因漏传必要的 resume audit 参数被原验证器拒绝，exit1、无报告及音轨，不计通过；B 补传原有真实审计后运行，未放宽校验。A 的日志与失败记录保留。

## 同次组件与实际音频

`pass134-native-pow-voice-b/report.json`：**14212052 项比较零差异**，五声部、3314 个声部块、1093 个主终端包络活动块。自算终端斜率模型、全部 tail 预测及五次 pow 结果与 pass122 B 不变。五次实际 pow 参数再由独立普通 C 系统 pow 核对，全部逐位同。

导出 30 条实际 IEEE float32 mono WAV（五声部×三组+三辅助通道）。独立 Python 重新解析 WAV，并逐采样字节比较同次原生 audioTail：

| 输出 | 样本数 | 差异 |
| --- | ---: | ---: |
| 组音轨 | 636288 | 0 |
| 辅助音轨 | 636288 | 0 |
| 合计 | 1272576 | 0 |

全部声部从年龄零覆盖，未归一化，30 个 WAV payload 摘要与 pass122 B 相同。这些是声部终端内部音轨，**不是最终立体声**。

公开验证器 `pianoteq_verify_voice_native_pow.mjs` 校验已完成报告、五次独立系统幂结果、实际 WAV，并执行两项拒绝检查：旧候选模式在禁止 Math.pow 后失败且无完整报告；另复制音轨，仅翻转一个 data 位，原生采样验收明确失败且无通过报告。正式 `pass134-native-pow-voice-verification/results.json` 通过，原始捕获、报告和 manifest 摘要未改变。

## 未完成项

这条链仍有预加权源、模型控制、辅助入口及初始时间状态等观察输入；本轮没有将 pass129..133 的跨历史配置桥接伪装成 pass110 C 同次独立声源。次包络和时间包络活动分支没有新增覆盖，非单位终端斜率的原生分支未补齐。

原 C 完整原生 WAV 与正常参考仍有 62348 个交错采样不同、最大 24-bit 整数差 5，历史失败保持原判。新组件 WAV 不能消除该差异或证明网页声音完全相同。

`npm test` 通过。原 pass121 E 的 LLDB/目标/debugserver 本轮确认仍存活、目标启动挂起；没有重复启动、Pedalboard 或目标代码/寄存器写入。注册权重、完整物理耦合、全键盘/预设及网页声音等价继续未完成，不合并、不发布。
