<div align="center">

# Vault OKR Manager

一个本地优先的 Obsidian OKR 插件，用于在 Markdown 中规划加权 OKR、监控执行健康度、记录进度，并运行结构化周期回顾。

![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.7.2-blueviolet)
![Version](https://img.shields.io/badge/version-1.4.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

[English README](./README.md) · [1.4.0 发布说明](./docs/releases/1.4.0.md) · [功能特性](#功能特性) · [快速开始](#快速开始) · [健康度模型](#进度与健康度模型) · [回顾流程](#结构化回顾流程) · [存储模型](#markdown-存储模型)

</div>

---

![Vault OKR Manager 仪表盘](assets/OKR.gif)

## 产品简介

Vault OKR Manager 将完整的 OKR 运行闭环保存在 Obsidian Vault 中：制定目标、设置 KR 权重、记录进度、识别执行风险、开展周期回顾、关闭周期，并选择性地结转未完成工作。

所有持久数据都以可读的 Markdown 和 YAML 保存。插件不依赖外部数据库、云服务或账号，不包含遥测；Vault 可继续使用 Obsidian Sync、文件备份或 Git 管理。

1.4.0 不再局限于等权平均：它引入 KR 相对权重，将“完成进度”和“执行健康度”明确分离，并新增周回顾、中期评审与周期复盘三类结构化流程。

## 功能特性

| 领域 | 能力 |
| --- | --- |
| 规划 | 支持周、月、季度、年周期；每个 Objective 一个 Markdown 文件 |
| 衡量 | 支持数值、百分比、分数、布尔型 KR；支持正数相对权重 |
| 进度 | 自动计算 KR 进度，并按权重汇总 Objective 进度 |
| 健康度 | 根据计划进度、信心度、阻碍、暂停和超期状态判断健康、风险与偏离 |
| Check-in | 支持多次带日期的进度记录、说明、变化量和当前阻碍 |
| 回顾 | 可重复的周回顾、每周期一次的中期评审和周期复盘 |
| 证据 | 创建回顾时保存不可变的进度与健康度快照 |
| 生命周期 | 关闭、重新开启、归档、只读保护与选择性结转 |
| 复用 | 以 Markdown 保存周期模板，并保留 KR 权重 |
| 界面 | Dashboard、Objective 详情表、KR 拖拽排序、超期提醒与截止日期延期 |
| 语言 | 英文与简体中文界面 |
| 隐私 | 纯本地 Markdown 存储，无网络依赖、无遥测 |

## 系统要求

| 项目 | 要求 |
| --- | --- |
| Obsidian | `1.7.2` 及以上 |
| 平台 | Windows、macOS、Linux、iOS、Android |
| 插件 ID | `vault-okr-manager` |
| 仅限桌面端 | 否 |

## 安装方法

### 社区插件市场

如果插件已进入 Obsidian 社区插件目录：

1. 打开 **设置 → 第三方插件**。
2. 选择 **浏览**，搜索 `Vault OKR Manager`。
3. 安装并启用插件。

### 手动安装

1. 从[最新 Release](https://github.com/jingmengzhiyue/obsidian-okr-manager/releases/latest)下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在 Vault 中创建 `.obsidian/plugins/vault-okr-manager/`。
3. 将三个文件复制到该目录。
4. 重新加载 Obsidian，并在第三方插件设置中启用 **Vault OKR Manager**。

```text
你的 Vault/
└── .obsidian/
    └── plugins/
        └── vault-okr-manager/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

## 快速开始

### 1. 配置插件

打开 **设置 → Vault OKR Manager**。

| 设置项 | 默认值 | 用途 |
| --- | --- | --- |
| Objective directory | `OKR` | 周期、目标、模板和回顾的根目录 |
| Default period type | `quarter` | 新建 Objective 表单的默认周期类型 |
| Auto-calculate progress | 开启 | 根据当前值和目标值自动计算 KR 进度 |
| Open dashboard on startup | 关闭 | 工作区就绪后自动打开 Dashboard |

### 2. 创建 Objective 和加权 KR

1. 在命令面板执行 **Vault OKR Manager: 新建目标**。
2. 选择周期，填写标题、负责人、起止日期和可选描述。
3. 执行 **新建关键结果**，或从 Objective 卡片直接添加 KR。
4. 设置大于 0 的相对权重；默认值为 `1`。

权重是相对值，不要求合计为 100。例如 `2、1、1` 会被标准化为 50%、25%、25%。

### 3. 记录进度

执行 **记录进度**，或使用 KR 操作按钮。每次 Check-in 会保存日期、进度、适用时的当前值、说明、阻碍、变化量与记录时间。最近一次 Check-in 填写的阻碍会成为 KR 当前阻碍信号；后续记录留空即可清除。

### 4. 查看进度与健康度

点击侧边栏图标，或执行 **打开仪表盘**。Objective 卡片和 KR 行会同时展示完成进度、原始权重、标准化占比、信心度和健康度。将鼠标悬停在健康度徽标上，可以查看当前风险原因。

### 5. 开展回顾并关闭周期

执行 **周期回顾**，或从周期菜单选择同名入口。在执行过程中持续记录周回顾，在周期中点正式评审优先级和调整项，并在关闭周期前完成复盘。系统允许例外跳过复盘，但必须经过明确的二次确认。

## 进度与健康度模型

进度与健康度回答的是两个不同问题：

- **进度**：可衡量结果已经完成多少？
- **健康度**：结合时间、信心、阻碍和状态，执行是否仍然在轨？

### Objective 加权进度

已取消的 KR 不参与计算，其余 KR 使用以下公式：

```text
Objective 进度 = Σ(KR 进度 × KR 权重) / Σ(KR 权重)
```

结果会四舍五入并限制在 0–100。旧文件如果没有 `weight`，会按权重 `1` 处理，因此在用户主动调整权重前，行为与旧版等权平均一致。

### KR 健康度

预期进度按照 `created` 到 `due` 的时间线性增长，并限制在 0–100。进行中的 KR 从 100 分开始，根据以下信号扣分或封顶：

| 信号 | 影响 |
| --- | ---: |
| 落后计划 | 当预期进度高于实际进度时，扣除两者差值 |
| 中等信心 | −5 |
| 低信心 | −15 |
| 最近一次 Check-in 存在阻碍 | −20 |
| 暂停中 | −25，且最高 79 分 |
| 已超期且未完成 | 最高 59 分 |

已完成 KR 为 100 分；已取消 KR 标记为“不适用”。健康状态区间为：

| 分数 | 状态 |
| ---: | --- |
| 80–100 | 健康 |
| 60–79 | 有风险 |
| 0–59 | 已偏离 |

Objective 健康度使用同一组 KR 权重汇总符合条件的 KR 健康分，之后再应用 Objective 自身的暂停与超期封顶。健康度是透明的运营信号，不是预测模型，也不能替代团队评审。

## 结构化回顾流程

### 周回顾

同一周期内可按日期重复创建，包含摘要、本周进展、阻碍因素和下一步；摘要与下一步必填。

### 中期评审

每个周期最多一个，包含摘要、阶段成果、风险、调整方案和评审决策；摘要与评审决策必填。

### 周期复盘

每个周期最多一个，包含摘要、最终结果、有效做法、未奏效之处、经验教训和后续行动；摘要、经验教训与后续行动必填。

创建回顾时，插件会保存一个不可变快照，记录每个 Objective 与 KR 的状态、进度、权重、标准化占比、健康分、预期进度和风险原因。后续编辑只修改结构化文字，不会改写 Objective、KR、Check-in 或原始快照。

关闭或归档的周期为只读状态：可以打开已有回顾，但不能新建、编辑或删除。重新开启已关闭周期后，写入能力恢复。

## 周期生命周期

```text
进行中 → 已关闭 → 已归档
   ↑        ↓          ↓
   └── 重新开启    取消归档 → 已关闭
```

- **进行中**周期允许修改 Objective、KR、Check-in、回顾、模板和结转相关内容。
- **已关闭**周期只读，可以重新开启或归档。
- **已归档**周期在开启“显示已归档”后仍可查看，并可取消归档回到已关闭状态。
- 关闭周期时，可以选择性地将未完成 Objective 和 KR 结转到下一个兼容周期。
- 结转会保留 KR 权重与当前进度，清空 Check-in 历史和当前阻碍，并记录来源 Objective。

## Markdown 存储模型

使用默认根目录时，Vault 结构如下：

```text
OKR/
├── 2026-Q3/
│   ├── _period.md
│   ├── O1.md
│   └── Reviews/
│       ├── weekly-2026-08-07.md
│       ├── weekly-2026-08-14.md
│       ├── mid-cycle.md
│       └── retrospective.md
└── Templates/
    └── Product-quarter.md
```

每个 Objective 文件在 YAML frontmatter 中保存 Objective 元数据和 KR 数组。KR 条目包含 `weight` 与 `has-blocker`；可读的 Check-in 历史仍保存在同一个文件的受管理 Markdown 区域。

回顾文件包含：

- frontmatter 中的回顾类型、周期和时间戳；
- frontmatter 中序列化的不可变快照；
- 受管理 Markdown 区域中的可读快照表；
- 位于稳定标记之间的结构化文字；
- 位于受管理区域外的自定义 Markdown，插件更新回顾时会予以保留。

除非准备手动修复文件，否则不要删除受管理标记。标记之外的普通文字始终由用户控制。

## 命令

| 命令 | 用途 |
| --- | --- |
| 新建目标 | 在指定周期创建 Objective |
| 新建关键结果 | 为 Objective 添加带权重的 KR |
| 记录进度 | 追加 Check-in，并更新当前进度与阻碍状态 |
| 打开仪表盘 | 打开或定位到 OKR Dashboard |
| 周期回顾 | 浏览、新建、编辑、打开或删除周期回顾 |
| 迁移旧版进度记录 | 将进行中周期的旧 frontmatter Check-in 迁移到可读 Markdown 区域 |

生命周期、模板、回顾、编辑、删除、排序和延期等其他操作，可从 Dashboard 和 Objective 详情页使用。

## 兼容性与升级

- 1.4.0 可直接读取 1.3.x Objective 文件，无需迁移。缺少权重时默认按 `1` 处理；缺少当前阻碍字段时，会从最近一次 Check-in 推导。
- 结构版本为 1 的旧周期模板仍可读取，其中 KR 的默认权重为 `1`。
- 旧版 Check-in 迁移命令继续保留，并会跳过已关闭和已归档周期。
- 降级到 1.4.0 之前的版本前，请先备份或提交 Vault。旧插件会忽略回顾文件，并可能在改写 Objective 时丢弃 `weight` 或 `has-blocker`。

## 常见问题

### KR 权重必须合计为 100 吗？

不需要。权重只需为正数，插件会自动标准化为占比后参与展示与计算。

### 为什么进度很高，健康度仍可能较低？

进度只描述完成比例；健康度还会考虑按时间应达到的预期进度、信心度、最近阻碍、暂停和超期状态。

### 可以直接编辑回顾 Markdown 吗？

可以。请保留受管理标记。结构化标记内的内容可以重新读入编辑器，受管理区域之外的自定义文字也会保留。

### 回顾会修改我的 OKR 吗？

不会。创建回顾只保存证据快照，编辑回顾也只会更新文字内容。

### 可以不写复盘就关闭周期吗？

可以，但必须经过专门警告和明确确认。这样既保留例外处理能力，也避免在没有提示的情况下跳过复盘。

## 开发

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

生产发布包由 `main.js`、`manifest.json` 和 `styles.css` 组成。开发环境要求 Node.js 20 或更高版本。

## 隐私与许可证

Vault OKR Manager 不会向外部服务发送 Vault 内容，也不包含遥测。Obsidian Sync、备份工具或 Git 可能复制文件，请单独检查这些工具的配置。

项目基于 [MIT License](./LICENSE) 发布。
