# DriveReach AI

## 在线 Demo（无需安装）

**[点击直接操作 Drivereach →](https://sienna-cat.github.io/drivereach/)**

[作品集与四个 Demo 总入口](https://sienna-cat.github.io/drivefollow/portfolio/#demos) · [公开源码](https://github.com/Sienna-cat/drivereach)

打开网址即可体验，无需登录、下载代码或启动本地服务。使用合成数据与浏览器规则演示，不调用真实电话、企微或大模型；操作仅在当前浏览器内保存，不会影响其他访客。DriveReach 的 40 个规则场景会在浏览器中实际执行。

更新 `main` 后，GitHub Actions 会运行测试并自动部署。可用 `npm run build:static` 生成 `dist/` 静态站点。


二手车卖车线索的 AI 对话与人工协同作品集 Demo。当前版本先验证业务规则、状态流转、证据保存和可复查评测，使用合成数据、文本模拟电话和确定性规则引擎。

## 快速启动（独立项目版）

需要 [Node.js 24 LTS](https://nodejs.org/) 或更高版本，以及 Chrome、Edge、Firefox 或 Safari。四个项目都没有第三方运行依赖，无需 `npm install`，也不需要安装 Codex。

1. 下载或解压整个 `drivereach` 文件夹。
2. 在此目录打开终端，执行：

```sh
npm start
```

3. 浏览器打开 <http://127.0.0.1:4197>。终端保持运行；结束时按 Ctrl+C。

macOS 可双击 `启动演示.command`（权限提示时在终端执行 `sh start.sh`）；Windows 可双击 `start.bat`；Linux/macOS 可执行 `sh start.sh`。脚本在本机兼容 Codex 自带 Node，其他电脑安装标准 Node.js 即可。

端口占用时，复制 `.env.example` 为 `.env`，修改 `PORT` 后重新执行 `npm start`。`.env` 只留在本地，不提交 GitHub。

```sh
npm test
```

交付验证见 [docs/交付验证.md](docs/交付验证.md)。历史设计和旧验证保留原日期，不能当成本次重新验证。

## 当前实现

- 线索资格检查：拒联、投诉、车辆已售和身份不符会阻断营销触达。
- 多轮文本基线：提取车型、上牌年、里程、城市、出售时间和期望价格，并绑定原文、轮次与确认状态。
- 人工协同：当前通话转接要等坐席接受；无空闲坐席时只能在客户明确同意后创建回拨。
- 预测式外呼机制模拟：固定随机种子，控制坐席预留、线路容量、接通概率和接通后无人承接。
- SQLite 本地保存状态、事件、回拨和任务；重复写入使用幂等键。
- 40 条合成评测场景，固定 24 个开发案例和 16 个首次留出案例。

## 验证

```bash
node --test tests/domain.test.mjs tests/server.test.mjs
node evaluation/run.mjs --holdout
```

实际验证记录见 [`evidence/verification.md`](evidence/verification.md)，逐案例 JSON 和浏览器截图见 [`evidence/`](evidence/)。

模型接口与真实电话线路暂未配置。接入模型时应保留现有工具契约和评测划分，增加新的独立案例；接通率、ASR/TTS、用户采用和销售转化不能从当前 Demo 推导。


## 独立交付内容与后续 GitHub

本目录包含网页、业务逻辑、演示数据、测试、设计文档和现有验证材料。全部运行路径在目录内解析。数据来自合成样例；官方产品知识为带来源和采集日期的静态摘要。

- `start.sh` / `启动演示.command` / `start.bat`：macOS、Linux、Windows 启动入口。
- `package.json`：标准启动和测试命令；无第三方运行依赖，因此不需要锁文件。
- `.gitignore`：排除密钥、缓存、安装目录及运行数据库；`.env.example` 可提交。
- `docs/项目案例.md`：与整份作品集的关系、职责和演示重点。
- `docs/交付验证.md`：本次拆分后的验证结果。

本目录是独立 GitHub 仓库的项目根目录。仓库地址：[Sienna-cat/drivereach](https://github.com/Sienna-cat/drivereach)。上传仓库只提供源码下载；要让面试官点击公网网址直接演示，还需后续托管。默认规则模式不需要 API Key，也不会拨打电话或发送企微消息。

### 数据库与评测

首次启动会创建 `data/demo.sqlite` 并写入合成数据。交付包不包含使用过的数据库；演示后重置可使用页面重置入口。要彻底重新初始化，可停止服务后删除该数据库（会清空本地演示记录）。

`evidence/runs/` 是作品集页面读取的评测证据，必须随源码一并保留。`npm run evaluate` 复跑同一批 40 条规则案例，会刷新 `current-all.json`；它不是新的独立留出实验。

浏览器自动验收为可选工具：执行 `npm install --no-save --package-lock=false playwright` 和 `npx playwright install chromium`，启动临时演示服务，再运行 `node scripts/browser-qa.mjs`。可用 `DRIVEREACH_BASE_URL` 指定测试地址。该脚本会重置目标服务的演示数据库，请只对临时测试实例运行；正常使用项目不需要 Playwright。
