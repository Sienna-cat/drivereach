# DriveReach AI 过程证据目录

这些文件记录从需求拆解到当前可运行版本的过程。内容来自本地规则运行、Node 测试和 Chromium 浏览器验收；业务线索、客户、电话线路和坐席均为合成数据。

## 文件说明

- `../docs/implementation-plan.md`：分阶段实现计划和验收矩阵。
- `baseline/domain-v0.1.mjs`：第一轮规则实现快照，用于复跑旧版开发集。
- `baseline/domain-red.log`：第一轮领域测试红测日志。
- `runs/baseline-development.json`：旧版规则在 24 个开发场景上的逐案例结果。
- `runs/current-development.json`：当前规则在 24 个开发回归场景上的结果。
- `runs/current-holdout.json`：规则冻结后首次执行的 16 个留出场景结果；报告已查看，后续可作为回归集。
- `runs/current-all.json`：40 条案例的汇总结果。
- `review-red.log`：独立代码审查发现后的回归红测日志。
- `browser-qa.json`：最终浏览器验收的逐项结果。
- `browser-trace.zip`：最终 Chromium trace，可用于复查交互过程。
- `screenshots/`：桌面和手机宽度的页面截图。

## 结果口径

当前规则版本为 `rules-0.3`。首次留出评测通过 14/16；未通过的两个场景是词表外车型「比亚迪秦 PLUS」和里程缩写「6.3w 公里」。系统对这两类表达保持缺失并继续询问，没有把缺失值伪装成正确抽取。

这个数字说明合成场景上的规则覆盖，不能代表真实模型准确率、ASR/TTS 质量、线上接通率、人工效率或销售转化。模型接口和真实电话线路仍是后续阶段。
