<div align="center">

# Vault OKR Manager

Plan, track, and review Objectives and Key Results directly inside your Obsidian vault with a dedicated dashboard, embedded progress history, and local-first Markdown storage.

![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.4.4-blueviolet)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-0.1.5-blue)

[中文文档](./README.zh-CN.md) · [Features](#features) · [Installation](#installation) · [Quick Start](#quick-start) · [Usage](#usage) · [FAQ](#faq)

</div>

---

> Screenshot TODO: add one dashboard screenshot and one short GIF showing drag-and-drop reordering.

## Overview

Vault OKR Manager is an Obsidian community plugin for managing OKRs entirely inside your vault.

The plugin keeps each objective in a single Markdown file and stores:

- objective metadata in YAML frontmatter
- embedded key results in the same file
- embedded check-in history inside each key result

This storage model keeps your vault cleaner than one-file-per-KR or one-file-per-check-in approaches while still remaining readable, portable, and version-control friendly.

The plugin is local-first by design:

- no external database
- no cloud dependency
- no telemetry
- no data leaves your vault

## Features

- One file per objective with embedded key results and progress history
- Dashboard view for browsing objectives by period
- Weekly, monthly, quarterly, and yearly planning cycles
- Automatic progress calculation for key results and objectives
- Built-in progress recording workflow with multiple updates per day
- Drag-and-drop key result ordering in the dashboard
- Overdue objective indicators, reminders, and due date postponement
- English by default, with Simplified Chinese support
- Works with Obsidian sync and Git-based workflows because data stays in Markdown

## Requirements

| Item | Requirement |
|------|------|
| Obsidian | `1.4.4` or later |
| Platform | Windows, macOS, Linux, iOS, Android |
| Plugin ID | `vault-okr-manager` |
| Desktop only | `false` |

## Installation

### Community plugins directory

If the plugin is available in the official Obsidian community plugins directory:

1. Open Obsidian.
2. Go to **Settings → Community plugins**.
3. Disable safe mode if needed.
4. Select **Browse**.
5. Search for `Vault OKR Manager`.
6. Install the plugin.
7. Enable the plugin.

### Manual installation

1. Open the latest release page: [Releases](https://github.com/jingmengzhiyue/obsidian-okr-manager/releases/latest)
2. Download these release assets:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. Open your vault folder.
4. Go to `.obsidian/plugins/`.
5. Create a folder named `vault-okr-manager`.
6. Copy the three files into that folder.
7. Restart Obsidian or reload community plugins.
8. Enable **Vault OKR Manager** in **Settings → Community plugins**.

```text
YourVault/
└── .obsidian/
    └── plugins/
        └── vault-okr-manager/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

## Quick Start

### 1. Review the settings

Open **Settings → Vault OKR Manager** and review the defaults:

| Setting | Default | Description |
|------|------|------|
| `Objective directory` | `OKR` | Root folder for all objective files |
| `Default period type` | `quarter` | Default period type for new objectives |
| `Auto-calculate progress` | `true` | Recalculate progress automatically from current and target values |
| `Open dashboard on startup` | `false` | Automatically open the dashboard when Obsidian starts |

### 2. Create your first objective

1. Open the command palette with `Ctrl+P` or `Cmd+P`.
2. Run **New objective**.
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
5. Enter a title, owner, description, and due date.
6. Select **Create**.

The plugin creates a file such as `OKR/2026-Q2/O1.md`.

### 3. Add key results

1. Run **New key result**.
2. Select the period and the objective.
3. Enter the key result title, owner, unit, current value, target value, confidence, and due date if needed.
4. Select **Create**.

No separate key result file is created. The new key result is stored inside the objective file.

### 4. Record progress

1. Run **Record progress**.
2. Select a key result.
3. Enter the latest current value or adjust the progress directly.
4. Optionally add notes and blockers.
5. Save the update.

Progress history is stored inside the related key result, so multiple updates on the same day are supported without creating extra files.

### 5. Open the dashboard

1. Run **Open dashboard**.
2. Review objectives, key results, progress, overdue status, and due dates in the sidebar.
3. Drag key results to reorder them when needed.

## Usage

### Storage model

The default structure looks like this:

```text
OKR/
└── 2026-Q2/
    ├── O1.md
    └── O2.md
```

The plugin no longer creates:

- one file per key result
- one file per check-in
- a dedicated `Check-ins` settings path

Instead, each objective file contains all related key results and their progress history.

### Commands

Command labels follow the active plugin language. In English, the commands are:

| Command | Description |
|------|------|
| `New objective` | Create a new objective |
| `New key result` | Add a key result to an objective |
| `Record progress` | Record a progress update for a key result |
| `Open dashboard` | Open or focus the OKR dashboard |

If Obsidian is using Simplified Chinese, the plugin UI and command names switch to Chinese automatically.

### Period formats

| Type | Format | Example |
|------|------|------|
| Week | `YYYY-Www` | `2026-W20` |
| Month | `YYYY-MM` | `2026-05` |
| Quarter | `YYYY-Qn` | `2026-Q2` |
| Year | `YYYY` | `2026` |

### Objective file model

Each objective file stores:

- objective metadata
- a `key-results` array
- embedded `checkIns` arrays inside each key result
- a reserved block for plugin-rendered key result content

Example:

```yaml
---
okr-type: objective
okr-id: O1
okr-period: 2026-Q2
okr-period-type: quarter
title: Improve engineering quality
owner: Team Lead
status: active
progress: 68
due: 2026-06-30
key-results:
  - okr-id: O1-KR1
    title: Reach 100% review coverage
    current: 80
    target: 100
    progress: 80
    order: 0
    checkIns:
      - id: O1-KR1-1740000000000
        date: 2026-05-18
        progress: 80
        delta: 10
        note: Improved review coverage for backend modules
---
```

### Progress rules

Key result progress:

- `boolean` becomes `100%` when completed, otherwise `0%`
- other numeric units use `current / target * 100`
- if `target <= 0`, progress is `0%`
- progress is clamped to `0–100`

Objective progress:

- average of all non-cancelled key results
- `0%` when no valid key results exist

### Reordering key results

- The dashboard supports drag-and-drop reordering.
- The updated order is written back to the objective file.
- The detail renderer still provides move actions as a fallback interaction.

### Overdue objectives

If an objective is past its due date and is not completed or cancelled, the plugin:

- marks it as overdue
- shows a reminder in the dashboard
- highlights it visually
- lets you postpone the due date from the dashboard or detail view

### Language behavior

- Default language: English
- Supported language: Simplified Chinese (`zh-CN`)
- Unknown or unsupported locales fall back to English
- Existing notes are not rewritten automatically when you change the UI language

### Legacy data model

This version does not support the old prototype where:

- each key result had its own Markdown file
- progress updates were stored as standalone check-in files
- a separate check-in directory was configurable in settings

If you previously used that prototype, reorganize your data into the current objective-based structure manually.

## FAQ

### Does the plugin create a separate file for every key result?

No. Key results are embedded inside the objective file.

### Does the plugin still create a `Check-ins` folder?

No. Progress history is now stored inside the objective file under each key result.

### Can I record progress multiple times on the same day?

Yes. Multiple updates on the same day are supported.

### What happens when an objective becomes overdue?

The dashboard shows an overdue indicator and reminder, and you can postpone the due date directly from the UI.

### Does this plugin send data to any online service?

No. The plugin stores everything in your local vault.

### Can I use week and month periods instead of quarter periods?

Yes. The plugin supports week, month, quarter, and year period types.

### Can I use it on mobile?

Yes. The plugin is not desktop-only.

## Development

```bash
git clone https://github.com/jingmengzhiyue/obsidian-okr-manager.git
cd obsidian-okr-manager
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm run lint
npm test
```

Before publishing a release:

1. Update `manifest.json`
2. Update `package.json`
3. Update `versions.json`
4. Run `npm run build`
5. Confirm `main.js`, `manifest.json`, and `styles.css` are attached to the GitHub release as individual assets

## Privacy

Vault OKR Manager runs locally inside your vault:

- no remote execution
- no hidden telemetry
- no external API requirement

## License

This project is licensed under the [MIT License](./LICENSE).
