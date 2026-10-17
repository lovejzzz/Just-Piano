# 原生hypotf移植与源表音轨回归（pass142）

2026-10-17。邻列幅相控制默认改用纯JS `nativeScalarHypotf`，取消本路径的外部hypotf依赖；atan2f仍外部。源表、前向随机状态和30条实际分轨保持吻合，没有新增完整声音等价结论。

## 实现依据

使用既有普通自进程probe，以dlsym定位该probe自身加载的 `/usr/lib/system/libsystem_m.dylib` hypotf，并只读同一映像的代码；没有附加Pianoteq。私有dump元数据记录函数地址 `0x19af96e40`，映像基址 `0x19af95000`。

函数offset18..34将两个float转为double，分别平方、相加、double sqrt，再转回float。没有融合平方和或缩放归一化。JS保留独立乘法和加法，使用Math.sqrt，不使用Math.hypot。float输入的平方不会溢出/下溢double，极小float输入也保留到最后的float舍入。

原生特殊分支使任一输入为无穷时返回正无穷，即使另一输入为NaN；其余NaN按语义处理，零返回正零。NaN载荷和浮点异常标志未建模。只读代码及反汇编留私有目录，不提交原始字节。

## 系统对照

扩展普通C系统oracle的hypotf批量协议，新增可复现验证器 `pianoteq_verify_native_hypot.mjs`：边界/符号组合、指数及尾数边界、120000组固定种子随机输入，去重后128340组。

126884组按float32原始位比较，1456组NaN按语义比较，0差异。覆盖极小非正规、最大有限数、结果溢出、正负零、无穷与NaN顺序。它不是遍历全部2^64输入对的穷举证明。系统oracle、输入流与输出流SHA写入验证报告。

新增固定系统位模式夹具及npm test入口。批量对照在本机Node/V8执行；尚无本轮浏览器整引擎声音验收。

## 接入源表与实际音轨

`archiveNeighborControls` 默认使用新hypotf；atan2f继续必须显式提供。源表审计唯一外部数学调用由4次（2hypotf+2atan2f）降为2次atan2f。报告和声部WAV manifest标明 `neighborNativeHypotfImplemented=true`，未写成外部数学零调用。

pass141相同条件下，四表2160项、20个随机整数词全部吻合，预测摘要不变。新报告接入连续声部，在禁止Math.pow的包装进程中正常exit0，导出30条WAV；独立Python读回group636288、auxiliary636288，总计1272576采样字节同，30个负载摘要与pass141相同。

额外用包装oracle拒绝hypotf调用，并令JS Math.hypot直接抛错，源表审计仍通过。九项检查同时核对默认实现、仅2次atan2f外部调用、预测与实际音轨不变、缺atan2f拒绝、manifest来源及完整等价标记仍false。npm test与diff检查通过。

## 边界与证据

私有 `pass142-hypot/` 保存自进程dump、批量verification、source-audit、no-fallback-audit、正常声部report/log、30条stems、独立stems-audit及guards。运行期间未编辑加载的JS依赖，冻结Python采集依赖未改。原LLDB39072/目标39079/debugserver39080仍存活，目标CPU时间0，无新原生采集或REA查询，未使用Pedalboard。

显式管理器seed/事件条件、模型与部分运行控制、atan2f依赖仍在。完整接触反馈、全部预设、最终立体声及网页声音验收未完成，不合并、不发布。
