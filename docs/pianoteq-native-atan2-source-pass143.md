# 原生atan2f与邻列控制外部数学清零（pass143）

2026-10-17。默认邻列控制改用纯JS nativeScalarAtan2f，与上一轮hypotf共同取消该段外部数学依赖。源表、随机状态及30条实际分轨保持吻合；模型/运行条件及完整声音缺口仍保留。

## 原生次序与特殊常量

普通自进程probe只读自身加载系统库，定位atan2f于 `0x19af9a720`。保存的指令通过y与x、y与-x的比较选择象限，使用double比例、平方及两lane因式分解多项式，保持double FMA与后续独立乘法顺序，最后舍入float32。不是调用Math.atan2再舍入，也没有用实数等价展开替换因式求值。

负X轴且比例绝对值小于2^-22的路径，使用特殊double常量 `0x400921fb40080000`，不是普通double pi。正负零落在同一特殊路径；例如系统atan2f(+0,-1)返回float位模式 `0x40490fda`。其它象限边界使用正常pi/4、pi/2、3pi/4常量。新实现保留差别，并覆盖无穷组合及正负零。NaN仅按语义，载荷和异常标志未建模。

代码/常量依据普通系统库的自身映像观察；未附加Pianoteq，没有新REA查询。原始字节和反汇编私有保存。

## 独立系统对照

系统C oracle新增atan2f批量模式。验证器覆盖全部符号的特殊值组合、指数/尾数边界、y=x及y=-x邻近、负X微小比例截断边界，以及120000组固定种子随机输入。去重后130106组：128634组按float32位比较、1472组NaN按语义比较，0差异。报告保存oracle、输入、输出SHA；不声称穷举全部输入对。

新增固定系统位模式测试，包括特殊小角常量、四象限、无穷与正负零，禁止Math.atan2时仍通过，接入npm test。

## 默认控制及音轨

`archiveNeighborControls` 的hypotf/atan2f现在都默认使用已恢复实现，显式回调仅用于诊断。源表审计增加 `--native-neighbor-math`，与外部oracle选项互斥；报告 `neighborNativeHypotfImplemented=true`、`neighborNativeAtan2fImplemented=true`、`neighborSystemMathRequired=false`，外部数学列表为空。

四表2160项和20个随机整数词全同，预测摘要与pass142相同。在禁止子进程spawnSync及JS Math.atan/atan2/hypot的包装进程中，源表审计仍通过，未发生隐藏回退。绑定器也拒绝“native atan2”与外部依赖同时为真的矛盾报告。

新源表接入连续声部，禁止Math.pow的包装回放正常exit0，导出30条WAV。独立Python读取group636288、auxiliary636288，总计1272576个float32采样字节同；全部WAV负载摘要与pass142相同。manifest保留native数学标记及wholeEngineEquivalent=false，没有把组件分轨称为最终立体声。

十项检查与npm test通过；绑定器新增一致性检查后也对正常报告及矛盾负例完成验证。没有修改活动回放加载的JS依赖或冻结Python采集依赖，未使用Pedalboard。

## 证据与未完成项

私有 `pass143-atan2/` 保存自身映像dump、批量verification、正常及禁止回退的source-audit、声部report/log、30条stems、独立stems-audit与guards。商业模型和音频不提交仓库。

原LLDB39072、目标39079及debugserver39080仍存活，目标CPU时间0；Developer mode仍关闭，未重复启动。没有新原生采集或网页音源验收。显式管理器seed/事件条件、曲线模式、模型和部分时间/辅助/调度输入仍在；完整接触反馈、全预设与最终立体声仍未完成，不合并、不发布。
