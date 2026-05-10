<div align="center">

# OKR Manager

Manage OKRs directly inside your Obsidian vault with a streamlined dashboard, built-in check-ins, and one-file-per-objective storage.

![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.4.0-blueviolet)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-0.1.0-blue)

[中文文档](./README.zh-CN.md) · [Features](#features) · [Installation](#installation) · [Quick Start](#quick-start) · [Usage](#usage) · [FAQ](#faq)

</div>

---

> Screenshot TODO: add a dashboard screenshot or short GIF demo.

## Overview

OKR Manager is an Obsidian community plugin for planning, tracking, and reviewing Objectives and Key Results directly inside your vault.

Instead of creating one Markdown file for every key result, this plugin keeps each objective in a single file and stores its key results inside that file. The result is a cleaner folder structure, fewer files to manage, and faster rendering in the dashboard.

All data stays local in plain Markdown and YAML frontmatter. No external service, database, or online dependency is required.

## Features

- One file per objective with embedded key results
- Built-in dashboard for browsing objectives and progress by period
- Weekly, monthly, quarterly, and yearly OKR periods
- Automatic progress calculation for key results and objectives
- Built-in check-in workflow for recording progress updates
- Support for `score`, `percentage`, `number`, and `boolean` key result units
- Native Obsidian styling with dark and light theme support
- Local-first Markdown storage that works well with sync and version control

## Installation

### Community plugins marketplace

Once the plugin is accepted into the official Obsidian community plugins directory:

1. Open Obsidian.
2. Go to **Settings → Community plugins**.
3. Disable safe mode if it is enabled.
4. Select **Browse**.
5. Search for `OKR Manager`.
6. Install and enable the plugin.

### Manual installation

1. Open the latest release page: [Releases](https://github.com/jingmengzhiyue/obsidian-okr-manager/releases/latest)
2. Download these files:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. Open your vault folder.
4. Go to `.obsidian/plugins/`.
5. Create a folder named `okr-manager`.
6. Copy the downloaded files into that folder.
7. Restart Obsidian or reload community plugins.
8. Enable `OKR Manager` in **Settings → Community plugins**.

```text
YourVault/
└── .obsidian/
    └── plugins/
        └── okr-manager/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

## Quick Start

### 1. Review the defaults

Open **Settings → OKR Manager** and review these defaults:

| Setting | Default | Description |
|------|------|------|
| `OKR root directory` | `OKR` | Root folder for objective files |
| `Check-in directory` | `OKR/Check-ins` | Folder for check-in notes |
| `Default period type` | `quarter` | Default period type for new objectives |
| `Auto compute progress` | `true` | Automatically compute progress from current and target |
| `Open dashboard on startup` | `false` | Open the dashboard automatically on startup |

### 2. Create your first objective

1. Open the command palette with `Ctrl+P` or `Cmd+P`.
2. Run `新建 Objective`.
3. Choose a period type:
   - Week
   - Month
   - Quarter
   - Year
4. Enter a period value:
   - Week: `2026-W20`
   - Month: `2026-05`
   - Quarter: `2026-Q2`
   - Year: `2026`
5. Enter a title, owner, and due date.
6. Click **Create**.

The plugin creates a file such as `OKR/2026-Q2/O1.md`.

### 3. Add key results

1. Run `新建 Key Result`.
2. Select the period and target objective.
3. Enter the key result title, owner, unit, current value, target value, and confidence.
4. Click **Create**.

No separate key result file is created. The key result is saved inside the objective file.

### 4. Record a check-in

1. Run `记录 Check-in 进度`.
2. Select a key result.
3. Enter the latest current value or adjust the progress directly.
4. Optionally add notes and blockers.
5. Save the check-in.

### 5. Open the dashboard

1. Run `打开 OKR Dashboard`.
2. Review objectives, key results, and progress in the right sidebar.

## Usage

### Folder structure

The default structure looks like this:

```text
OKR/
├── 2026-Q2/
│   ├── O1.md
│   └── O2.md
└── Check-ins/
    ├── 2026-05-09-O1-KR1.md
    └── 2026-05-16-O1-KR1.md
```

Key differences from a one-file-per-KR design:

- Objective files contain all related key results
- The vault stays cleaner as OKR data grows
- Dashboard loading requires fewer file scans

### Commands

| Command | Description |
|------|------|
| `新建 Objective` | Create a new objective |
| `新建 Key Result` | Add a key result to an objective |
| `记录 Check-in 进度` | Record progress for a key result |
| `打开 OKR Dashboard` | Open or focus the OKR dashboard |

### Period formats

| Type | Format | Example |
|------|------|------|
| Week | `YYYY-Www` | `2026-W20` |
| Month | `YYYY-MM` | `2026-05` |
| Quarter | `YYYY-Qn` | `2026-Q2` |
| Year | `YYYY` | `2026` |

### Objective file model

Each objective file stores:

- Objective metadata
- A `key-results` array
- A reserved block for rendered key result content

Example:

```yaml
---
okr-type: objective
okr-id: O1
okr-period: 2026-Q2
okr-period-type: quarter
title: Improve engineering quality
owner: Team Lead
progress: 68
key-results:
  - okr-id: O1-KR1
    title: Reach 100% review coverage
    current: 80
    target: 100
    progress: 80
---
```

### Progress rules

Key result progress:

- `boolean` becomes `100%` when completed, otherwise `0%`
- Other numeric units use `current / target * 100`
- If `target <= 0`, progress is `0%`
- Progress is clamped to `0–100`

Objective progress:

- Average of all non-cancelled key results
- `0%` when no valid key results exist

### Old data model

This version does not support the old data model where every key result had its own Markdown file.

If you used an earlier local prototype:

- old standalone KR files are not migrated automatically
- the new plugin does not read them
- you should reorganize those key results into the new objective files manually

## FAQ

### Why does the plugin no longer create one file per key result?

Because the storage model was simplified to keep all key results inside the objective file. This reduces file clutter and improves dashboard performance.

### Why does clicking a key result open the objective file?

Because key results are now embedded in the objective file instead of having separate files.

### Does this plugin send data to any online service?

No. The plugin stores everything in your local vault.

### Can I use week and month periods instead of quarter periods?

Yes. The plugin supports week, month, quarter, and year period types.

### Will `target = 0` break progress calculation?

No. The plugin safely returns `0%`.

### Can I use it on mobile?

Yes. The plugin is not desktop-only.

## Development

```bash
git clone https://github.com/jingmengzhiyue/obsidian-okr-manager.git
cd obsidian-okr-manager
npm install
npm run dev
```

Before opening a release:

1. Update `manifest.json`
2. Update `versions.json`
3. Run `npm run build`
4. Upload `main.js`, `manifest.json`, and `styles.css` to the GitHub release

## License

This project is licensed under the [MIT License](./LICENSE).
