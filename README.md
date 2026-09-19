# RallyPath

## 唯一開發來源 — 2026-09-19

- **唯一倉庫：`demonyang885/tennis-tactics-interactive-preview`；唯一整合／發布分支：`main`。** 名稱中的 interactive-preview 是歷史命名，現在承載正式 RallyPath。
- 新工作從該倉庫最新 `origin/main` 建立短期分支，PR 只合回同一個 `main`。不要從舊 feature、preview 或 release 分支續作。
- 先讀 [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md)，核對 remote、分支、HEAD、工作區狀態；資料夾名稱、埠號及舊 Mac mini 路徑不能證明版本。

完整開工與交接流程見 [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md)。

RallyPath 是一款面向青少年的网球战术画板。孩子可以画出下一分、回顾关键回合，再从战术知识库找到更合适的打法。

当前公开版本：**V0.1（0.1.0）**

- 以竖向全场战术板为核心，支持球路、跑位、连续回合与动画播放。
- 首页直接播放最后编辑的画板，并区分战术、练习和比赛回顾。
- 内置单项战术、组合打法和临场变化，帮助孩子理解“什么时候用、想换来什么”。
- 画板自动保存在当前浏览器；需要换设备时，可使用“备份画板”导出可编辑文件。

公开地址：[https://demonyang885.github.io/tennis-tactics-interactive-preview/](https://demonyang885.github.io/tennis-tactics-interactive-preview/)

正式页面只由 `main` 分支更新。GitHub Actions 会在完整测试通过后构建并部署；`version.json` 用于核对线上产品名、版本和提交。

本机预览：运行 `npm ci`，然后运行 `npm run dev -- --host 127.0.0.1 --port 5173`。

发布前验证：`npm run test:runtime`、`npm run build`、`npm run prepare:pages`、`npm run test:pages`。

战术内容用于帮助判断，不保证得分，也不能替代教练的现场指导。教学原则参考 ITF、LTA 和 USTA 的公开资料；具体组合与练习为教学化编排。
