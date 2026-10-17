# 存档频谱曲线与逐键权重控制（pass162）

2026-10-17。新增 `archiveWeightSpectrumInputs` / `constructArchiveSourceWeights`，统一上下文新增 `archiveNoteSourceWeights`。在已支持分支中，输入基础模型、预设、运行曲线模式、逐谐波编辑及注册offset，即可从自身调律/刚度生成最终谐波权重；逐谐波编辑和注册常量仍非自产。

## 来源与运算

ARM `5c39e4..5c3ab4` 从A+d30复制曲线至接口I+80，复制属性后逐坐标检查：float坐标>0才调用系统logf并写回，否则保留原值。不能改成double log再转float，也不能对所有坐标取log。本实现使用已恢复的nativeScalarLogf。

权重调用 `4cb670` 的基础曲线为B+18d0，已经是该变换使用的坐标域，无额外log。激活字节来自预设A+d80非零测试。

ARM `1c54d0..1c5598` 从B1c88[noteIndex−1]和B1ca0[noteIndex−1]直接加载G+d8和G+f0。逐键索引越界拒绝，未将A4值写成固定常量。

四个s控制复用pass161；基础权重及坐标来自B1c28/B1c40；源变换复用已有log/exp与float/FMA次序。统一上下文路径自产频率和刚度，未把这些比较目标重新送回计算。

对type=3且B15c非零的额外权重变换明确拒绝。当前仅允许已支持的普通线性标量频谱曲线属性，转换后坐标不递增也拒绝；未把这些限制泛化成全部预设支持。

## 验证与边界

本机 `historical-spectrum.json` 先验证独立生产模块（频率/刚度仍显式）；随后 `historical-context-spectrum.json` 使用统一快照自产频率/刚度、调律表和stretch，不再读取G比较目标为输入。原始捕获仍提供逐谐波编辑、注册offset与显式运行/调律注册条件。

两报告均验证：四控制、35基础权重、35坐标、编辑曲线10个X/10个Y、基础曲线5个X/5个Y、G权重两个标量；上下文版本另核对自产频率/刚度。最终35权重与原始两个模式各35项逐位同，只有35个唯一权重。报告包含输入SHA，拒绝不完整数据，独占写入新文件。跨历史组合没有据此声明同次完整声部。

合成测试验证正坐标logf/非正坐标保留、频谱激活、预设编辑改变最终权重、逐谐波编辑实际消费、禁止JS log/exp、未支持分支拒绝。上下文测试验证存档曲线改变后旧快照不变，新上下文产生改变后的权重。

`completeWeightInputsComputed=false`、`completeVoiceVerified=false`保留。没有新实际音轨、最终立体声或网页音色验收。

## 下游接线与本轮REA

纯独立端点入口现在接受 `weightSource`（曲线模式、逐谐波编辑、注册offset），与显式最终weights互斥。它实际调用上下文权重生产器，再将自产结果送入极点/幅度/相位/归一化，保留 `harmonicWeightsComputed=false`。合成端点表与显式基准表逐值同，频率和归一化幅度均比较。默认NY联合端点仍不会改成独立端点。

全套npm test先通过；新增下游接线后，受影响上下文测试通过。首次互斥输入测试遗漏其它必需参数，命中更早的参数guard而失败，保留initial-integration-test-rejection.json；补齐参数后该分支正确拒绝。人为将第一谐波编辑加1dB，两个模式各产生一项权重差异，回放严格exit1，保留changed-harmonic-rejection.json。

REA请求内部地址5c3908，返回包含该地址的接口生产函数，状态ok，进程Terminal 0。证据ID `ev_07cccd1cf3b662f738b8b402ca6ec177ffdbb9e7b8df35cb49a0ceead4832ce8`；原始响应SHA-256 `7d7a30f2a616abe746f13d94856e6877e79606969d60fa1522ea71f7c2fc7cea`。G逐键加载来源另由原始ARM和已缓存1c5320分析交叉确认。原始响应/商业内容与报告留本机。
