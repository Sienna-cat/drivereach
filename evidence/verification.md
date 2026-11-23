# DriveReach AI 验证记录

日期：2026-11-19（Asia/Shanghai）  
运行模式：本地确定性规则演示、SQLite 持久化、合成数据。模型接口未配置，电话线路和坐席容量为模拟。

## 自动化测试

命令：

```bash
/Users/boboruiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/domain.test.mjs tests/server.test.mjs
```

结果：32 tests，32 pass，0 fail。

覆盖：字段证据、中文数字、近似值、未知价格、改口历史、拒联、投诉、身份不符、车辆已售、当前通话转接、坐席满载、回拨同意、未来时间、幂等写入、SQLite 重启持久化、API 错误输入和静态文件边界。

## 规则评测

命令：

```bash
/Users/boboruiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node evaluation/run.mjs --baseline --development
/Users/boboruiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node evaluation/run.mjs --development
/Users/boboruiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node evaluation/run.mjs --holdout
```

实际结果：

| 版本 | 数据划分 | 通过 | 未通过 | 说明 |
| --- | --- | ---: | ---: | --- |
| rules-0.1-snapshot | development / 24 | 11 | 13 | 第一轮快照；暴露拒联、近似数字、回拨和调度边界 |
| rules-0.3 | development / 24 | 24 | 0 | 修复后的回归集 |
| rules-0.3 | holdout / 16 | 14 | 2 | 首次查看后成为已见回归素材 |
| rules-0.3 | all / 40 | 38 | 2 | 两个失败案例保留并呈现 |

未通过案例：词表外车型「比亚迪秦 PLUS」；里程缩写「6.3w 公里」。当前行为是保留字段缺失并继续询问。它们会作为接入真实模型后的新回归案例，不能被改写成已通过。

## 浏览器验收

脚本：`scripts/browser-qa.mjs`。使用 bundled Playwright Chromium，Browser 插件不可用，因此按项目允许的 Playwright fallback 执行。

视口：1440×1080、390×844。

结果：10 项全部通过，0 个 pageerror，0 个 console error。

验证路径：

1. 打开工作台并检查页面身份和非空首屏。
2. 选择线索，开始对话，输入车辆信息。
3. 查看里程字段，确认原文证据与轮次可见。
4. 模拟坐席全忙，确认当前转接失败可见。
5. 输入同意文本，确认回拨时间，刷新后检查任务仍存在。
6. 对另一条线索输入拒联，确认对话结束且重新开始按钮禁用。
7. 运行调度模拟，检查新增拨号、接通、承接和无人承接结果。
8. 运行 40 条规则评测，检查逐案例结果和 JSON 下载。
9. 打开作品集页，检查留出结果和边界说明。
10. 在手机宽度选择线索、进入对话、提交输入，检查无横向溢出。

截图和 trace 位于同目录下的 `screenshots/` 和 `browser-trace.zip`。这些材料支持当前本地 Demo 的可复查性，不替代真实电话试点。
