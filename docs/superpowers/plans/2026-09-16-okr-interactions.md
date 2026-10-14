# OKR A+B 实施计划

**Goal:** 修复交互与异步一致性，并允许创建目标时一次保存 0/1/多个 KR。

**Architecture:** 保留 Markdown、周期锁和编辑基线。草稿仅存在弹窗内；manager 在周期锁内校验并一次创建完整文件。异步列表以请求序号与生命周期淘汰旧响应；持久化成功与导航/回调分开处理。

**Tech Stack:** TypeScript、Obsidian API、现有 esbuild/Node 测试适配器。

- [x] 基线：113 tests、build、lint 通过；核实源码与任务复现起点。
- [x] 延期/EditObjective：日期默认、快捷操作、立即保存说明、父子生命周期；添加固定日期、取消和冲突回归。
- [x] NewKR/EditKR：继承、精确上下文、乱序加载、原始数字校验、可选 owner；deferred Promise 回归。
- [x] CheckIn/Reviews：精确 prefill、联动校验、周期行绑定、关闭失效和保存后失败；补回归。
- [x] NewObjective/manager：看板上下文、手动日期保留、稳定 KR 内存卡片、一次文件创建；往返读取和失败原子性回归。
- [x] 公共适配器、字段可访问性、中英文文案和使用说明；npm test 显式纳入新测试。
- [x] 运行 npm test、npm run build、npm run lint；记录真实宿主未验证项。不部署、不提交 Git。按用户后续指示升级本地版本至 1.5.0，不发布远端。
