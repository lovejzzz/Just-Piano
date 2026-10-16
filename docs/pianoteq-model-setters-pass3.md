# 第三轮：参数引用与模型写入路径排查

目标为本机 Pianoteq 9.2.5 ARM64；分析副本 SHA-256 为 `8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`。本记录只记数据流结论，不能以名称相似或数值相似代替赋值证据。

## 模型 B 的直接访问调用方

`FUN_1004f7d10` 返回模型对象 `M` 的 `+0x3d68/+0x3d70` 向量中第 `index` 个 `0x340` 字节记录。既有数据流证实 `B+0x12c/+0x148/+0x14c/+0x1d0` 供音板配置生产者读取，但尚未命名这些字段。

本轮对其全部八个已解析直接调用方逐个检查：

| 函数 | 已观察的数据流 |
|---|---|
| `0x10000f298` | 从 B+0x5c 和 B+0x80 容器读取，构造另外的目标对象 |
| `0x1001ba68c` | 已确认的音板配置消费者 |
| `0x1001d9524` | 麦克风布置相关消费者；读取 B+0x100/+0x134/+0x98/+0x60，未写 B |
| `0x1001f2f8c` | 读取 B+0x98 的条件分支及后续几何相关数据 |
| `0x1001fcaa0` | `pcab_polynet.cc` 路径，读取 B 内的向量构造独立的 0x80 字节记录 |
| `0x1003bd8a8` | `harp_and_pedals.hh` 路径，读取 B+0x98，参与另一对象构建 |
| `0x100622e60` | `pcab_polynet.cc` 路径，从 B+0x64 读取索引并计算目标向量 |
| `0x1007f04ec` | 音板构建路径读取 B+0x100、B+0x328/+0x330、B+0x160/+0x168 |

这些直接调用没有给出命名参数到 B 所需四个字段的写入。它们支持“该访问器用于消费模型记录”的判断，不能推出原程序不存在 setter。可能的独立可变访问器、内联向量寻址、整个对象替换和间接调用均未被这一组 direct-call 查询覆盖。

## 标量属性查找的调用方

`FUN_1001c0c70` 是已确认的内部元数据 ID 到标量属性描述记录的查找。它的三个新增直接调用方为：

- `0x1001ae45c`：检查参数类型为 1/2/3，返回该查找的结果；不是模型写入。
- `0x1003734f0`：对全局管理对象做同样查找；不是模型写入。反编译原型的 `void` 不能视为真实返回类型。
- `0x1004159ec`：解析文本，处理单位转换、枚举、on/off 等，将结果写到调用者给的 double 输出；没有写入模型 B。

`FUN_1006da114` 已在前轮确认仅检测属性存在。`FUN_1003734f0` 有 43 个已解析直接调用函数，本轮进一步从其短调用方区分“转换显示值”和“修改模型”的职责。

## 证据与限制

原始 REA 响应存放于 `~/.local/share/just-piano-analysis/`；文件 `pass3-model-read-0x<地址>.json` 与上表函数一一对应。访问关系证据：

- `pass3-model-b-access-callers.json`：`ev_68ef3a7a3fd57e4396ca0faee760125d34cce013e84650216049b84d54a73c8d`。
- `pass3-property-lookup-callers.json`：`ev_d7b80dd498a24bb937b99f74e5949e41050f8d9cfc2586647991d67f18935707`。

本次已闭合命名内部参数到可写编辑状态字段（见文末），尚未闭合到完整 DSP 系数；本分支没有进行音频渲染。应与音频实验的独立结果一起评估，不能把读取更多函数当作已验证音色公式。

## 找到文本编辑的提交候选入口

六个短消费者中，`FUN_10005da34` 是枚举数量查询，`FUN_10018ca74` 是类型判断，`FUN_100089230` / `FUN_100312598` 包装标度对象调用，`FUN_1002483dc` 构造 UI 对象。它们均没有模型字段写入。

`FUN_1003517d4` 则不同：先由 `FUN_1004159ec` 从文本解析数值，调用 `FUN_100804aa0` 处理该数值和属性记录的映射对象，再调用 `FUN_1001e322c(parameter_reference, &context)`，随后调用 `FUN_1001cb430` 与 `FUN_100174224`。上下文的首指针来自编辑对象 `+0x198`，不是此前的全局元数据管理对象。这里是可继续追踪的实际提交候选，仍需下级写入和浮点参数汇编证据。

此入口证据：`pass3-scalar-consumer-0x1003517d4.json`，`ev_3db316217d473f4c1160831503387088af531911ccb83e8a5e2dc64c2ea04564`。

### 提交中的数值传递已由汇编确认

`0x1003518d4` 将解析后的 double 装入 `d0`，调用 `FUN_100804aa0`，保持其结果在 `d0`；`0x1003518f4` 以 `x0=parameter_reference`、`x1=context` 调用 `FUN_1001e322c`。这修正了伪代码漏掉浮点参数带来的误读风险。

`FUN_1001e322c(double value, ref, context)` 根据引用类型真正分派修改：类型 3 调用 `FUN_1001890cc(ref, context, value>=.5)`；类型 2 调用 `FUN_100230ec0(ref, context, int(value))`；类型 1 将值转单精度后调用 `FUN_1004d4bf8(float(value), ref, context)`。因此浮点参数赋值应继续追踪 `0x1004d4bf8`。这里已经不是只根据函数外观挑选的候选。

`FUN_1001cb430` 构造带类型码的通知数据，并调用 `FUN_1007445ec`；仍没有证据把它等同为音频线程提交屏障或文件写入操作。

证据：`pass3-ref-change.json`（`ev_734f0d8c98fdab9e718235b31dce10cccbfad487461d9ecf0ea48123bc9e2af6`）；`pass3-editor-set-asm.json`（`ev_376d9c6f9e7b54b43f2f93a327d1be7145143739ffccd8d666171a44b1af6c80`）；`pass3-commit.json`（`ev_1ffc52ec8beb4a62704f78eb4e042ceb3bf7fbe44b63472a771bb687a464d745`）。

### 已找到最终标量写入及多级引用解析

`FUN_1004d4bf8` 先取得一个模型根上下文，随后循环 `FUN_1003957c4(ref, &cursor, &node)`，按六个 16 位引用成分向下解析，直到引用结束或解析失败。若最终指针非空且类型码为 1，就向该指针写 4 字节值；部分父节点类型另调用 `FUN_100905b40`。若解析失败则返回 0。

因此真正缺失的一步已收敛为 `FUN_1003957c4` 的字段解析分派，而非继续寻找 GUI 或标度元数据。伪代码把输入标为 `undefined8`、将赋值显示为 `(int)param_1`；必须以 ARM64 寄存器/存储指令核对，不能据此声称参数被取整。

证据：`pass3-float-write.json`，`ev_9a2706ede43fc0fb49d35fc5bb3e30f2f2bbebc9981bba27f9876e7e12e3f4cd`。

## 命名内部 ID 到可写状态字段：已闭合

继续读取 `FUN_1003957c4` 后，得到实际模型状态分派，而不再仅有元数据/标度分派。设解析器进入根节点（类型码 0）时 `node.ptr` 指向一个根描述结构，`S = *(uint64_t*)node.ptr` 为下表字段基址。该 S 尚未与音板报告里的 M 或 G 证明同一对象，禁止混用偏移。

| 参数 | 内部 ID | 可写单精度值地址 | 对应 Fine 曲线对象 |
|---|---:|---:|---:|
| Hammer Hardness Piano | 43 / 0x2b | S+0xb0c | S+0xb88（ID44） |
| Hammer Hardness Mezzo | 45 / 0x2d | S+0xb10 | S+0xbd8（ID46） |
| Hammer Hardness Forte | 47 / 0x2f | S+0xb14 | S+0xc28（ID48） |
| Hammer Hardness | 49 / 0x31 | S+0xb18 | S+0xc78（ID50） |
| Strike Point | 55 / 0x37 | S+0xce0 | S+0xce8（ID56） |
| Impedance | 80 / 0x50 | S+0x6e8 | S+0x6f8（ID81） |
| Impedance Cutoff | 82 / 0x52 | S+0x6ec | S+0x748（ID83） |
| Q Factor | 84 / 0x54 | S+0x6f0 | S+0x798（ID85） |
| String Length | 86 / 0x56 | S+0x10a0 | S+0x10a8（ID87） |
| Sympathetic Resonance | 88 / 0x58 | S+0x7f0 | S+0x7f8（ID89） |
| Duplex Scale Resonance | 90 / 0x5a | S+0x117c | S+0x848（ID91） |
| Damper Position | 109 / 0x6d | S+0x1270 | S+0x1278（ID110） |
| Last Damper | 111 / 0x6f | S+0x12c8 | — |

全部上表标量分支返回类型码 1。Fine 分支返回类型码 4，随后以引用的后续成分解析曲线节点：索引值必须不小于 0x1000，经 `FUN_1007716c0` 查找后，后续 `0x11d` 或 `0x11e` 选择不同子属性；后者还要求曲线对象 `+0x48` 为 1。它们不是另一个单独 float knob。

最终写入汇编 `0x1004d4d90: str s8, [x0]` 明确是单精度浮点存储，前述伪代码的 `(int)param_1` 不表示取整。该写入与解析器 type1 检查构成从命名引用到状态字段的直接静态证据。**这闭合了“命名参数→编辑状态字段”，仍未闭合“该状态字段→每根弦/每个模态的计算系数”。**

证据：`pass3-ref-resolver.json`（`ev_9c3f38f3402602cd7530e4e2b095bcc589106e8c2066c5938abf178ef465ddca`）；`pass3-float-write-asm.json`（`ev_7864ab11feafe76c02d86ebd95a877f7782df0d0e7cc0f3422ef0e4040799279`）。

根上下文补查：`FUN_1006629f8` 保留传入上下文的首指针与标记，并调用 `FUN_100264578` 请求相应访问；`FUN_10001671c` 只是打包首指针和类型标记。二者没有把 S 转换成 B 或直接访问 `+0x3d68`，因此尚不能认定 S=M。证据 `pass3-state-root.json`（`ev_924f4278088c4d51c3339794c5a19aa0d7ec2a9c52eb849423ac0a2f13e3ea01`）、`pass3-state-context.json`（`ev_69a35efcd37e24883c5a1333dac5a5a98323221c01bebe23ec4da001841786e3`）。

## RPC setParameters 到修改入口

`FUN_1007412d0` 取请求的 list 后交给 `FUN_100475c30`。后者以 id 或 index 取参数对象，对 normalized_value 夹到 `[0,1]`，随后调用该对象虚表 `+0x18`。文本值先调用 `+0x58` 转换，再进入相同 setter。

具体参数对象构造器 `FUN_10084fa84` 设置虚表 `0x100becfc0`，保存 automation 管理对象于 `+0xa8`、公开索引于 `+0xb0`。该虚表 `+0x18` 为 `FUN_100191104`：它检查缓存的代次和值，必要时调用 `FUN_100313d70`。后者经 `FUN_1007727a4` 获取 12 字节内部参数引用，再调用 `FUN_100042120(..., parameter7=1)`。

`FUN_100042120` 的这一分支先调用 `FUN_1005d395c` 处理归一化值，成功后 `FUN_10044c8f4` 准备更新数据并由 `FUN_1004d66f8` 传递。另一个 parameter7=0 分支直接调用前文 `FUN_1001e322c` 写状态值。后续消息/队列消费尚未查清，故不能从这段静态代码独立证明必须等待音频回调，也不能把 API 正常返回当作所有模型重建或文件持久化已完成的确认。

证据：`pass3-setparameters-values.json`（`ev_35f7465bd734bb97abb524ee971fba613a857143283ff5b9472fb0e3c3552b3a`）、`pass3-automation-constructor.json`（`ev_62cbe35d2fc64ff1feffcd11a6505bfadf1bb68e2a5021a6a7d9e6b36731236a`）、`pass3-automation-setter.json`（`ev_992c48354c25fce5eb11b483f1a435282e99df065b1693724bc82abbacd8cb5a`）、`pass3-automation-submit.json`（`ev_174d582c2e444b36cb8a34503c52b34934c2f6119dc047294fc1cd81dfad911c`）、`pass3-automation-apply.json`（`ev_4e9715f73364b3ec5ccd9a47e4169ef3d931ef50b852e9c2fc74dfda994e3889`）。

### RPC 已连接到同一状态写入路径；异步时机仍有限定

`FUN_1005d395c` 已确认：当内部引用无需别名重写且类型为 float 时，它先调用 `FUN_1001a8124` 读取当前归一化值；若值不同，取属性记录 `+0x10` 的标度对象，调用 `FUN_100546dd4` 转换后进入 `FUN_1004d4bf8`。于是 RPC 到前述 resolver 和最终 `str s8,[x0]` 的控制流闭合：

```text
RPC list → 参数对象 vtable+18 → 100191104 → 100313d70
→ 100042120 → 1005d395c → 标度对象转换 → 1004d4bf8
→ 1003957c4 → S+具体字段 → float store
```

这条调用链中的编辑状态赋值发生在上述同步函数调用内；但其后还有独立更新分派。`FUN_1004d66f8` 检查管理对象 `+0x118 == 2` 才调用 `FUN_10082b21c(*(manager+0xb8)+0x58, update)`，另外存在全局状态检查及提前返回。尚未展开 `FUN_10082b21c` 和其消费者，因此**无法单凭这些函数断言它就是音频线程队列，也无法证明模型重建与 savePreset 的完整时序**。`FUN_100546dd4` 在此伪代码中遗漏浮点返回参数，不额外声称已恢复其完整转换公式。

真实实验的“启用官方音频设备、等待后保存，再在新进程验证”结果应按 [参数持久化实验](pianoteq-parameter-persistence.md) 单独引用。该实验提供有效操作流程；本静态分支证明写入及更新分派分开存在，尚不能唯一解释此前失败的根因。

证据：`pass3-automation-write.json`（`ev_05f250a06b315dfd699b06d51a22f803920bae4f3655e046bf9aec2679f5a0c3`）；`pass3-automation-dispatch.json`（`ev_44b1c4a72090812f5266ee099a2b6d9c5904240b9c2419cf7128bd09eb882372`）。
