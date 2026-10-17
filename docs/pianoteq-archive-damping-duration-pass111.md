# pass111：存档参数到终端释放时长

新增[damping模型计算器](../dsp/archive-damping-duration.mjs)与[字段核对器](../scripts/pianoteq_replay_archive_damping_model.mjs)。完整音频复刻仍未完成；pass110 C正在独立采集，本轮不修改其冻结的Python源。

## 恢复的数值映射

41e5b4读取编辑存档的10a8启用值、1334 Damping Duration标量和1338逐键曲线：启用时以float32相乘，截到[float32(.01),15]；关闭时倍率为1。再乘基础模型B+1c10逐键表，最终截到[float32(.005),50]。表索引由FCVTAU(note)-1生成，正数半整数向远离零方向取整，不能照伪代码截断为int。

1c5320随后取它与float32(2/正参考频率)的较大值写G+fac；另有乐器配置分支及末尾覆盖。715f98将min(G+fac,1)写主终端包络H+c88，将G+fac写次包络H+cdc。主包络slope仍由另一个衰减行最小值路径产生，本轮未改为存档生成。43dcb0的释放模型来源也与该时长相符，但本轮没有直接捕获41e5b4的调用返回来证明所有中间边界。

当前NY Steinway/A4的原始编辑值float32(.7)、曲线值1、基础表对应值.6875，独立得到float32(.48125)。该值符合本场景观察到的释放模型首多项式字段及两种终端scale。商业曲线和完整逐键表只在私有source JSON中输入，仓库没有内置它们。

## 条件变化与原指令纠正

启用condition且mode!=2时，原生还混合宿主seed、编辑存档139c seed和note的float32位模式。实际41e700为FMOV w10,s8，不是把note转换为整数再哈希；32位乘法、异或和移位都按uint32溢出。随机值先按uint32/2^32转float32并平方，condition增量的double计算用FMA后再落地float32。计算器实现此路径，但本场景condition为0，**没有活动原生条件分支验证**；缺少宿主seed时明确拒绝，不悄悄填0。

REA证据：两项helper反编译ev_d145d0bf38e531592203fc3aa4088d60e24d9030e216cfd455d4ed793d61e988；41e5b4逐指令ev_780febd4622448a11c6d4a8fb5b86a1d6c6fda26620039857a90db3ca29de68b；1c5320逐指令ev_db7aa7485d7a36b14ef11ccf731810f7a16b5b52461608a6455af624baf9e785。原ARM64摘要仍为8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094。

## 实际比较及严格边界

同一FXP的解码字段与steinwayny基础模型配对；保存FXP SHA并检查捕获命令确实使用同一文件。对失败但保留原始字段的pass110 A核对2180个释放模型字段、4284个终端scale字段，共6464项逐float32同，五声部、仅一个不同音符。该比较的fullCaptureComplete=false、nativeHelperCallObserved=false、audioSamplesCompared=0、finalStereoAudioVerified=false。重复字段不是6464个不同音符，也不能覆盖A原先的不完整捕获结论。

7项反向测试符合预期：只改一个观察scale恰好1差异且预测摘要不变；改变编辑duration或基础对应键值均6464差异且预测改变；活动condition无宿主seed、错误FXP摘要、未知曲线模式、短基础表均拒绝。另两个合成边界检查确认半整数索引与越界拒绝；它们不是原生音频验证。

当前只实现41e5b4 helper。频率下限、乐器分支、末尾覆盖以及主包络slope的模型来源还需要独立贯通，不能把helper直接用于所有乐器；连续链仍使用其既有观察模型输入，尚未以本计算器替换。接下来要核对这些条件并连接到实际活动包络，再做同次音轨验证。

私有证据：pass111-archive-damping-source.json、pass111-archive-damping-a-report.json、pass111-archive-damping-negatives/results.json、pass111-evidence.json及pass111-snapshot.json。资源、预设完整数值和原生音频不提交。
