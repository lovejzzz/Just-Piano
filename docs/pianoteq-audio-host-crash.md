# AU 离线宿主崩溃记录

两份用户提供的 macOS 报告分别对应本次实验 Python PID 13101（22:02:05）和 13270（22:02:49）。两次都是 ARM64 Python 3.14.7 / Pedalboard 原生宿主在 `AudioUnitRender` 中调用 Pianoteq AU 时触发 `EXC_BAD_ACCESS (SIGBUS)`。

共同调用栈为 `pedalboard_native → AudioUnitRender → Pianoteq → _platform_memmove`。Pianoteq 映像相对偏移一致：`0x28638`、`0x8194f8`、`0x8657e4`、`0x207e40`。第一份访问线程栈保护页，第二份访问只读映像页；这说明内存访问非法，不能仅凭栈确认问题属于宿主还是插件，也不能归因于 Python 脚本逻辑、许可或物理模型不稳定。AU 映像与已分析的 standalone 映像不同，不能直接复用后者函数地址解释崩溃。

已停止该宿主路径及未验证状态转换，全部测试子进程已退出。没有修改插件/应用二进制。崩溃路径不计入成功音频验证；此前 standalone CLI 的有效 WAV 实验仍单独保留。

原始报告保留在用户附件中，不向项目复制其中用户、设备和会话标识。
