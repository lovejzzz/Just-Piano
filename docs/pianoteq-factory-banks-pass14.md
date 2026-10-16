# 第十四轮：26个工厂bank、A78/A79及FX特殊状态

只读原始 `presources.dat` 后，本轮严格解析了全部26个工厂bank中的 **800份顶层详细A状态、59份实际内嵌A状态和69份独立FX状态**，各自逐字段读至真实record末端。此次也补解了此前只按长度跳过的 `prom/ryal/olos`：800份主A及59份内嵌A的这三个子块均通过其实际读取器schema消费到边界。没有使用800份NKS lean记录替代详细预设。

这不等于全部声音已恢复。800份A状态仍引用独立B基础模型；共享解析器现已严格解出全部58份B的序列化字段。本文的状态解析没有建立全部字段的物理单位，也没有证明网页声音与所有预设一致。

## 版本差异由真实reader决定

资源SHA256保持 `d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d`；全部1105个成员MD5重算通过。

`10083aad0` 外层读取器在 `10083ac0c` 检查bank版本上限67，实际66/67均走 `10047f714`。该函数的相关版本门限在66/67之间没有不同的块布局：依次是 `f38cc100`、`f38cb100`、`a46e8f22`、`19475024`、`56710d03`、`56710d02`。**真正影响详细状态schema的是bank66所含A版本78，而非直接把bank66当成bank67。**

实际分布：

| bank版本 | bank数量 | 顶层A版本 | A数量 |
|---|---:|---:|---:|
| 66 | 22 | 78 | 709 |
| 67，D4/K2/Kawai | 3 | 79 | 91 |
| 67，FX | 1 | 独立FX分支 | 69份FX，无顶层A |

完整 `10055ec14` 的版本分支比较显示78/79在当前路径唯一新增序列化字段为 **A+0xf28**。原生 `100560cb8` 比较 `version,#0x4e`；版本≤78走 `100560cc0`，直接将对象该字段设为0、不消费字节；79才进入浮点读取分支。独立新解析器明确在78省略该字段并记录“loader assigned default”，没有为通过解析插入伪造的4字节，也没有修改已有解析器的79 guard。

新脚本只支持审计过的bank66/67、A78/79及列明的FX类型/版本。未知版本、lean flag、替代详细分支继续报错。

## 不再把prom/ryal/olos当作不透明容器

使用已保存的REA及同副本原生指令继续追踪：

- `prom`：`10032e5f0→100243d78→10072774c` 读取版本化身份列表；实际工厂分支都是version1、1条记录，每条version1、3个字符串和1个float。随后 `1001e96e8→1003a17f8` 的配置记录列表为version6、0条记录，再读取名称、2个float、整型向量、2个布尔字节、选择值及16字节标识。实际数据全部消费至prom末端；没有给不含记录的版本分支编造内部配置。
- `ryal`：`10028d37c→1000052dc→1007d92e8→1003b01b8→1002ceb34`。读取version2、层数量；实际层都是version3，含gain、version1的基类、2个字符串及version1的共享A模型。共享模型存在时，读取真实 `rpue` 子块，并递归调用相同A78/79详细状态schema；随后读取channel、transpose及布尔字节。范围按原生检查：channel为−1至15，transpose为−127至127。外层最后还有名称和选择值。
- `olos`：`10017734c→1002ceb34`。本轮实际数据均为version1、共享模型version1、false字节，随后mode<3、channel<10。全部17字节读取完成；非空olos模型分支继续明确拒绝，没有因本轮未出现便宣称已支持。

800份顶层A中有35份实际包含层，另1份ryal仅名称使长度不同于常见16字节。合计94层：35层只含引用、59层含真实内嵌A。内嵌A为58份version78、1份version79，其中2份flags=32；原生允许flags≤63且仅bit0触发lean提前返回，本轮对真实出现的0/32详细分支分别保留原值并消费相同schema。flags=1的lean记录继续拒绝。59份内嵌A也全部读取到各自 `rpue` 末端。

因此这里的800计数来自真实工厂详细状态，59个内嵌A另列，绝不将其再算成59个工厂preset。全部状态被读取不代表每个字符串或曲线已经绑定声学含义。

## FX的三个真实分支

`builtin_presets_fx.dat` 不含B模型，69条记录不能用type0/A79读取：

| 工厂record type | 外层版本 | 条数 | 实际读取 |
|---|---:|---:|---|
| 100 | 2 | 56 | `10094f4d8→100049d1c`，内部effect slot version4 |
| 4 | 1 | 9 | `10094f4d8→1002d515c`，内部effect version2 |
| 3 | 3 | 4 | 2个float、1个uint32，随后`1000a7c04`输出对象，实际kind=3 |

type4目标对象是十进制4000，即A+0xfa0，不能误认成A+0x1760输出对象。三个分支分别复用现有已恢复子schema；69条均无未解析record尾部。

FX的bank尾部比其它bank多一个4字节不透明值，之后才是长度184及184字节footer。脚本报告这个值及精确边界，未给它杜撰声学/许可含义。额外KVR资源和footer仍按真实长度保留为不透明内容；“状态全部读取”不包含这些其它资源的声学解释。

## 逐bank结果

| bank | 顶层A | FX | B数量 |
|---|---:|---:|---:|
| bechstein | 20 | 0 | 1 |
| bluethner | 15 | 0 | 1 |
| bosen | 16 | 0 | 1 |
| celeste | 24 | 0 | 4 |
| clav | 57 | 0 | 4 |
| d4 | 50 | 0 | 2 |
| ep | 124 | 0 | 4 |
| fx | 0 | 69 | 0 |
| grotrian | 16 | 0 | 1 |
| guitar | 19 | 0 | 1 |
| harp | 28 | 0 | 3 |
| harpsi | 12 | 0 | 3 |
| k2 | 23 | 0 | 1 |
| karsten | 43 | 0 | 6 |
| kawai | 18 | 0 | 1 |
| kremsegg1 | 40 | 0 | 4 |
| kremsegg2 | 42 | 0 | 4 |
| modelb | 24 | 0 | 1 |
| pans | 33 | 0 | 6 |
| petrof | 41 | 0 | 2 |
| steingraeber | 21 | 0 | 1 |
| synth | 56 | 0 | 1 |
| u4 | 26 | 0 | 1 |
| vb | 18 | 0 | 2 |
| xylo | 16 | 0 | 2 |
| yc5 | 18 | 0 | 1 |
| 合计 | **800** | **69** | **58** |

58份B版本全部为89；本脚本调用独立负责的resource解析器，逐份保存实际消费位置和完整状态。父线程用当前公开实现独立重跑：58/58均到各自真实末端。B记录长度界定本身不作为解码成功证据。

## 工具、负对照和保留范围

新增 `scripts/pianoteq_factory_banks.py`；未修改由另一研究分支负责的resource解析模块。用法：

```text
python3 scripts/pianoteq_factory_banks.py "/Applications/Pianoteq 9/Pianoteq 9.app/Contents/Resources/presources.dat" --output /PRIVATE/summary.json
```

完整参数值仅可用 `--include-values` 写到仓库之外的明确本机路径，输出权限设为0600；脚本拒绝把商业参数值写入仓库。本轮没有将模型数据或预设表提交到GitHub，也没有启动REA新会话、LLDB或Pedalboard。

本地证据位于 `~/.local/share/just-piano-analysis/`：`factory-banks-pass14-summary.json`、`factory-banks-pass14-private-values.json`、`factory-banks-pass14-negative-controls.json`、`factory-banks-pass14-manifest.json`。最初实现的Python闭包变量错误输出另存 `factory-banks-pass14-initial-failure.json`；修正后才得到26bank通过，没有降低版本或边界要求。

反例覆盖未知bank版本、未知A版本、错误块标识、缩短A record、截断bank等；全部11项严格失败，包括错误将A78标成79、将A79标成78但不增删字段，以及lean-A误作完整预设等对照。预设内部曲线/效果子对象的现有未知版本检查也继续保留。

当前可交付的是实际序列化状态的解码器及私有研究结果，尚未将这些状态转换为完整独立浏览器模型。全部消费者与控制映射、额外资源算法和完整输出验证仍未完成；这些是“所有预设声音完全复刻”仍未达到的具体差距。

随后合入的全部B分支由父线程再次运行 `factory-banks-pass14-validation.py` 验证：26bank、800顶层A、59内嵌A、69FX、58完整B及11个拒绝负例全部符合预期。汇总使用实际返回值，没有硬编码B成功数。58份B的首identity有52种，变体需保留分号复合键；A摘要现在保留完整三字符串、prom身份及层引用，不能只用首串合并giusti、ruckers、hang等变体。
