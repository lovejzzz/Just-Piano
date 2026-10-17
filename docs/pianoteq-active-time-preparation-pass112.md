# pass112：正常参数干预与长测试的中断恢复

完整复刻尚未完成。本轮先核对中断状态：原C反向测试进程及会话已不存在，旧目录没有results.json，最后留有terminal-gain-group-target等报告；没有把这些报告当作完整测试通过。此前C完整链14212052项与30条音轨验收结果不变，完整WAV仍失败。

## 正常Attack Envelope干预

通过原应用的普通Devices面板启用系统默认输出，API确认running、48000 Hz、512 samples。原应用97704使用--no-prefs、rattle-midi.fxp和本地8161端口；全部参数写入均通过正常setParameters/savePreset。

最初仅attack_envelope从归一化0改为.5，215参数列表确认只有该参数变化。以相同会话保存.5/.25/.5三份full FXP，再用全新headless原应用分别读回：三次全部参数无读回差异，验证器及WAV渲染均exit0。归一化.5显示1.0000，.25显示0.1080；不能将归一化值直接当底层秒数。

使用原有pianoteq-width-aba.py的私有副本执行，唯一改动是给验证及渲染argv加入已观察的--multicore 0；原脚本未修改，原/副本摘要与变更说明保存在harness-provenance.json。原预设文件和基础资源未改写。

三份真实WAV已生成。严格A/A对照失败：9792个交错样本不同，最大24-bit整数差1，首差frame26148，RMS差2.4098382594068048e-8。A/B有229827个交错样本不同、最大差1566787、首差frame4804、RMS差0.022780309863934558。脚本如实以causalControlPassed=false、exit1结束，不把参数保存和大幅音频变化冒充严格因果控制通过。

准备阶段尚未直接观察这些预设的H+3064及时间包络入口/返回。后续[pass113](pianoteq-active-time-envelope-pass113.md)以.25预设实际观察到H+3064=0，时长来自G+1208，验证了5185采样点及活动组/辅助输出；并非此前候选的声部覆盖路径。该组件结果不改变本轮严格A/A失败。中断后97704进程已不存在，GUI自身退出码不可得；未重启它。

私有证据：rpc-pass112-time-envelope/initial-parameters.json、prepared-parameters.json、harness-provenance.json、aba/report.json及三份FXP/WAV。商业预设和音频不提交。

## 反向测试逐例记录

pianoteq_test_commit_continuous_chain.mjs新增原子progress.json：基线和每例必须在真实子进程终止、退出码及数值/拒绝条件核对后才落盘。记录输入捕获、archive源、Continue审计、Node版本及实际递归导入代码摘要；恢复时逐例重验报告摘要、预测摘要和原退出状态。未确认完成的残留报告会以unfinished名称保留后重跑，不被当作成功。记录了真实失败的journal会拒绝自动继续。

--resume不接受没有journal的旧不完整目录，实际拒绝已核对。新测试在pass110-tail-chain-negatives-durable-d从C原始捕获重新运行，基线14212052项零差异，73项用例全部符合预期并逐例保存，进程exit0。随后--resume对已完成结果重新核验并exit0（cases=73、allExpected=true）。未降低原测试的退出码或数值成功条件；中途未落盘用例隔离分支尚无实际执行证明。
