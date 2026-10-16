# 第十二轮：内置资源、完整工厂预设与基础B模型

本轮只读本机 Pianoteq 9.2.5 资源与既有 ARM64 副本；没有修改应用、许可或完整性检查，没有在Git仓库发布资源payload或完整商业系数表。新增 `scripts/pianoteq-resource-inventory.py`，复用 `pianoteq-inspect-fxp.py` 的曲线与详细状态解码器。

## 资源容器及完整性

本机 `/Applications/Pianoteq 9/Pianoteq 9.app/Contents/Resources/presources.dat` 长 **38,871,798字节**，SHA-256：

`d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d`

每字节XOR `0x55` 后，首16字节为 `Modartt RSRC0100`。之后是uint32目录数量；每条按顺序保存 uint32 offset、uint32 size、16字节MD5、uint32字符串长度、UTF-8名字。本机 **1,105条**目录全部边界有效，payload按目录顺序连续，**1,105/1,105个成员MD5独立重算吻合**。目录末端67,314；首payload起点67,318，中间4字节；末payload后还有4字节。两处额外字的意义未恢复，不擅自称校验或版本。

目录含 **26个 `builtin_presets_*.dat`**，另有reverb、界面、文档等资源。现代资源打开函数 `FUN_10043fc68` 明确打开并映射 `presources.dat`；这里的字节变换由文件头、全目录边界及全部成员MD5共同验证，不是用可读字符串猜整个payload正确。

## D4 bank明确区分基础模型与预设状态

`builtin_presets_d4.dat` 的容器内offset=**3,375,017**，size=**2,080,320**，成员MD5：`fc0f126cc039901f125fb57ccfbcf189`，重算通过。下面所有offset均相对该bank起点。

前三个uint32为 `[0x01020305,67,1]`。后续块：

| tag | 块起点 | payload字节数 | 末端 |
|---|---:|---:|---:|
| 0xf38cc100 | 0xc | 68 | 0x58 |
| 0xf38cb100 | 0x58 | 422,919 | 0x67467 |
| 0xa46e8f22 | 0x67467 | 8 | 0x67477 |
| 0x19475024 | 0x67477 | 1,635,227 | 0x1f681a |
| 0x56710d03 | 0x1f681a | 4 | 0x1f6826 |
| 0x56710d02 | 0x1f6826 | 21,846 | 0x1fbd84 |

随后uint32长度184及184个opaque字节，恰好达到bank末端，没有未归属尾字节；这些字节未被修改或解释成授权字段。

现代读取器 `FUN_10047f714` 明确先进入 `0xf38cb100`，读count，逐个进入 `0x89238742`、读两个字符串、构造模型并调用 **`FUN_10059f2cc`**；随后进入 `0x19475024`，读另一个count，逐个进入 **`0x83f873a7`**、读取preset元数据和 **`FUN_10094f4d8`** 的模型状态。这是代码和真实块边界共同证实的两套记录，不能把50个预设当成50个基础乐器模型。

两份B记录均为version89：

| 基础模型身份 | B block起点 | 两个标识串之后的B reader起点 | block末端 |
|---|---:|---:|---:|
| `steinwayny;;factorySTEINWAYNY.txt` | 0x64 | 0xb0 | 0x34f16 |
| `d4;;factoryD4.txt` | 0x34f16 | 0x34f4a | 0x67467 |

第二标识分别是 `percuSTEINWAYNY.dat6dc28790` 和 `percuD4.dat6dc28790`。B内version7 metadata另实际保存乐器id `steinwayny` / `d4`。这是后面preset A中同一model identity可以对应的基础记录；完整运行时查找分派尚未逐指令闭合。

## 50份完整工厂预设实际解析

preset body的现代schema由 `FUN_10047f714` 确认：name字符串、type整数、author字符串、comment字符串、length-prefixed byte vector，然后 `FUN_10094f4d8(type)`。**不是**NKS的lean选择记录，也不是FXP的完整外包装。

本机D4 bank共有 **50份**完整preset。26份A的model identity为 `steinwayny`，24份为 `d4`；全部type0、A version79。复用第九轮详细状态schema，**50/50逐字段读到各自record末端，未解析详细状态suffix=0**。不同preset含50–154条曲线。涵盖Cinematic、Felt、Prepared、Hybrid、Bowed等实际条目；不代表其它25个bank已经解析。

`NY Steinway D Mix` 的preset record起点731,275，body起点731,283，payload36,427字节，末端767,710。所有50项边界、model identity、曲线计数均由脚本输出，完整参数值仅保存在本机 `factory-d4-preset-values-pass12.json`。

第九轮的42份独立FXP详细状态和本轮50份factory状态合用同一解析器。这个覆盖证明当前观察分支的序列化schema可实际使用；不证明每个字段都已绑定GUI物理单位，也不等于音频复刻。

## 从基础B恢复五节点，并与真实运行值逐位核对

本轮按 `FUN_10059f2cc` 的 **version89分支**，从B起点顺序读取metadata、标量、曲线和嵌套集合，已读到 **B+0xfc8** 字段之后。没有搜索float或猜曲线边界。NY当前位置0x115d，保留 **212,409字节未解析suffix**；HB当前位置0x35feb，保留 **201,852字节未解析suffix**。公开脚本明确报告此缺口。

NY的 **B+0xde8** 曲线在bank `[0xe69,0xf07)`，含6个输入坐标、30个输出值，即每个音高5个节点。输入坐标为 `[21,48,72,84,96,108]`。B+0xfc8在 `[0x10bf,0x115d)`，同样6×5布局。这些是先前 `FUN_100065fe4` → `FUN_10009edcc` → 运行五节点插值的确切基础表来源。

对实际先前采集音符69，在48..72之间取 `t=0.875`，从B+0xde8线性插值得到：

```text
[0.078125, 0.3515625, 0.5625, 0.7734375, 0.9619140625]
```

与pass6真实LLDB采集的五节点 **5/5 float32位模式完全相同**。这是存档数值→具体计算→真实内部值的交叉验证；不是把参数名称或函数结构当作验真。完整硬度输出还要乘模型基础曲线和A的编辑参数；本轮没有把单个节点核对夸大成全部激励谱或实际PCM一致。

## G基础四数组仍需闭合的部分

已知 `FUN_10004f984` 从G+0x708（mode0）或G+0x980（mode1）复制四数组；其生产者是 `FUN_1001c5320` 内调用 `FUN_1007a4014`，后者进入 `FUN_1001026dc` 构建多分量模型。B基础曲线确实另由上述独立B archive加载，A preset并不能被当作该B archive本身。当前42份FXP/50份factory A的suffix=0不能代替完整B的212KB后缀解码。

bank的 `0x56710d02` 还有与上述第二标识完全相同的额外资源键：

| key | 内容起点 | 末端 | 字节数 |
|---|---:|---:|---:|
| `percuD4.dat6dc28790` | 0x1f684d | 0x1f68cd | 128 |
| `percuSTEINWAYNY.dat6dc28790` | 0x1f68f0 | 0x1fbd84 | 21,652 |

内容均以 `KVR2`、version1开始。读取器 `FUN_1005bf4e0` 检查该magic并分派 `FUN_10002affc`；现代bank loader读取每项绝对末端offset，并在处理后seek至该位置。这些额外内容的具体声学角色尚未验证；仅凭 `percu` 不能称为采样、琴槌力或音板IR。

下一步的精确边界是：继续B version89 reader从NY bank+0x115d（B+0x1018的曲线集合）往后顺序解码；将B的生成参数绑定到 `1001026dc` 输入和G四数组。另保留上述两份KVR2资源作为可能的额外依赖，先恢复其schema与消费者再命名。音板几何/算子/边界及完整琴槌接触反馈仍未因此解决。

## 重现与证据

```sh
python3 scripts/pianoteq-resource-inventory.py \
  '/Applications/Pianoteq 9/Pianoteq 9.app/Contents/Resources/presources.dat' \
  --bank builtin_presets_d4.dat
```

本地结构证据 `presources-inventory-pass12.json`；完整商业数值仅本机 `factory-d4-preset-values-pass12.json`、`base-model-prefix-values-pass12.json`；五节点验算 `base-knot-verification-pass12.json`。REA响应 `pass12-resource-readers.json`、`pass12-base-model-metadata.json`、`pass12-base-model-subreaders.json`、`pass12-percu-record-loader.json`、`pass12-percu-data-reader.json`。

本轮独立REA会话已导出 `pass12-resources-evidence-bundle.json`（175条保留记录）及 `pass12-resources-snapshot.json` 并正常关闭；记录数量不是算法覆盖率。原始商业资源没有复制到仓库。


## 父线程独立复核及全bank覆盖调查

父线程重新从原始presources读取目录、重算全部1105成员MD5，再独立解析NY B+de8并计算note69，5/5节点与原始pass6捕获逐位同。另对全部26个builtin bank执行当前严格解析器：D4的50、K2的23、Kawai的18份详细preset通过，合计91份，不能称全部800份均已解码。

另外22个bank实际header version=66，而当前bank schema只对version67开放；fx为version67但factory model状态分支不受支持。全部失败保留于本机 `all-banks-schema-survey-pass12.json`，实际header记录为 `all-banks-headers-pass12.json`。没有通过放宽版本判断或跳过未解析字节制造通过。版本66的真实loader差异和fx模型分支仍是后续要求。
