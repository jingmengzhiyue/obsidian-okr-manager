# OKR Manager

直接在 Obsidian Vault 中管理 OKR，用更整洁的文件结构、更顺滑的 Dashboard 和内置 Check-in 流程来追踪目标进展。

![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.4.0-blueviolet)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-0.1.0-blue)

[English README](./README.md)

---

> 截图 TODO：建议添加一张 Dashboard 截图或一个简短 GIF 演示。

## 简介

OKR Manager 是一个 Obsidian 社区插件，用来在你的 Vault 中创建、管理和回顾 Objective 与 Key Result。

它的核心设计是：

- 一个 Objective 对应一个 Markdown 文件
- 该 Objective 下的所有 KR 都保存在同一个文件中
- Check-in 仍然独立保存，便于追踪历史
- 数据完全本地，不依赖数据库或在线服务

这样可以明显减少文件数量，让目录更整洁，并降低 Dashboard 的读取开销。

## 功能特性

- 每个 Objective 只保留一个文件，KR 内嵌存储
- Dashboard 统一查看各周期目标、关键结果和进度
- 支持周、月、季度、年四种周期
- 自动计算 KR 与 Objective 进度
- 内置 Check-in 记录流程
- 支持 `score`、`percentage`、`number`、`boolean` 四种 KR 单位
- 自动适配 Obsidian 深色和浅色主题
- 纯 Markdown 本地存储，方便同步与版本管理

## 安装方法

### 通过社区插件市场安装

当插件进入官方社区插件目录后：

1. 打开 Obsidian
2. 进入 **设置 → 第三方插件**
3. 若安全模式开启，先关闭
4. 点击 **浏览**
5. 搜索 `OKR Manager`
6. 安装并启用插件

### 手动安装

1. 打开最新 Release 页面：[Releases](https://github.com/jingmengzhiyue/obsidian-okr-manager/releases/latest)
2. 下载：
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. 打开你的 Vault 目录
4. 进入 `.obsidian/plugins/`
5. 创建 `okr-manager` 文件夹
6. 把上述文件复制进去
7. 重启 Obsidian 或重新加载社区插件
8. 在 **设置 → 第三方插件** 中启用 `OKR Manager`

```text
你的 Vault/
└── .obsidian/
    └── plugins/
        └── okr-manager/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

## 快速开始

### 1. 检查默认设置

进入 **设置 → OKR Manager**，确认这些默认值：

| 设置项 | 默认值 | 说明 |
|------|------|------|
| `OKR 根目录` | `OKR` | Objective 文件根目录 |
| `Check-in 目录` | `OKR/Check-ins` | Check-in 文件目录 |
| `默认周期类型` | `quarter` | 新建 Objective 的默认周期类型 |
| `自动计算进度` | `true` | 依据当前值和目标值自动计算进度 |
| `启动时打开 Dashboard` | `false` | 启动时自动打开 Dashboard |

### 2. 创建第一个 Objective

1. 用 `Ctrl+P` 或 `Cmd+P` 打开命令面板
2. 执行 `新建 Objective`
3. 选择周期类型：
   - 周
   - 月
   - 季度
   - 年
4. 输入周期值，例如：
   - 周：`2026-W20`
   - 月：`2026-05`
   - 季度：`2026-Q2`
   - 年：`2026`
5. 输入标题、负责人和截止日期
6. 点击 **创建**

插件会创建类似 `OKR/2026-Q2/O1.md` 的文件。

### 3. 添加 Key Result

1. 执行 `新建 Key Result`
2. 选择周期和所属 Objective
3. 输入 KR 标题、负责人、单位、当前值、目标值和信心等级
4. 点击 **创建**

此时不会生成单独的 KR 文件，而是直接写入 Objective 文件。

### 4. 记录 Check-in

1. 执行 `记录 Check-in 进度`
2. 选择 KR
3. 输入当前值或直接调整进度
4. 可选填写进展说明和阻碍
5. 保存

### 5. 打开 Dashboard

1. 执行 `打开 OKR Dashboard`
2. 在右侧边栏查看当前周期目标、KR 和进度

## 使用说明

### 默认目录结构

```text
OKR/
├── 2026-Q2/
│   ├── O1.md
│   └── O2.md
└── Check-ins/
    ├── 2026-05-09-O1-KR1.md
    └── 2026-05-16-O1-KR1.md
```

与传统“每个 KR 一个文件”的模式相比：

- 所有 KR 都保存在 Objective 文件中
- 文件数量显著减少
- Dashboard 加载更快

### 命令列表

| 命令 | 用途 |
|------|------|
| `新建 Objective` | 创建新目标 |
| `新建 Key Result` | 给目标添加 KR |
| `记录 Check-in 进度` | 记录 KR 进度更新 |
| `打开 OKR Dashboard` | 打开或聚焦 Dashboard |

### 周期格式

| 类型 | 格式 | 示例 |
|------|------|------|
| 周 | `YYYY-Www` | `2026-W20` |
| 月 | `YYYY-MM` | `2026-05` |
| 季度 | `YYYY-Qn` | `2026-Q2` |
| 年 | `YYYY` | `2026` |

### Objective 文件模型

每个 Objective 文件包含：

- Objective 元数据
- `key-results` 数组
- 供插件渲染 KR 表格的保留区域

示例：

```yaml
---
okr-type: objective
okr-id: O1
okr-period: 2026-Q2
okr-period-type: quarter
title: 提升工程质量
owner: 团队负责人
progress: 68
key-results:
  - okr-id: O1-KR1
    title: 代码评审覆盖率达到 100%
    current: 80
    target: 100
    progress: 80
---
```

### 进度规则

KR 进度：

- `boolean`：完成则 `100%`，否则 `0%`
- 其他数值单位：`current / target * 100`
- `target <= 0` 时返回 `0%`
- 最终进度限制在 `0–100`

Objective 进度：

- 取所有未取消 KR 的平均值
- 没有有效 KR 时为 `0%`

### 旧数据模型说明

当前版本不兼容旧的“每个 KR 一个文件”的数据结构。

如果你以前用过本地原型版本：

- 旧 KR 文件不会自动迁移
- 新版本不会主动读取它们
- 需要手动整理到新的 Objective 文件中

## 常见问题

### 为什么现在不会给每个 KR 单独建文件？

因为插件已经切换到“单 Objective 文件聚合 KR”的模型，这样可以减少文件杂乱并提升性能。

### 为什么点击 KR 打开的是 Objective 文件？

因为 KR 现在内嵌在 Objective 文件中，不再拥有独立文件。

### 会上传数据到云端吗？

不会。所有数据都保存在本地 Vault 中。

### 可以不用季度，改用周或月吗？

可以。插件支持周、月、季度、年四种周期。

### `target = 0` 会导致报错吗？

不会，插件会把进度安全处理为 `0%`。

### 支持手机端吗？

支持，插件不是桌面独占。

## 开发

```bash
git clone https://github.com/jingmengzhiyue/obsidian-okr-manager.git
cd obsidian-okr-manager
npm install
npm run dev
```

发布前请确认：

1. 更新 `manifest.json`
2. 更新 `versions.json`
3. 运行 `npm run build`
4. 在 GitHub Release 中上传 `main.js`、`manifest.json`、`styles.css`

## 许可证

本项目使用 [MIT License](./LICENSE)。
