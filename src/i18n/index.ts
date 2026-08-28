export type SupportedLocale = "en" | "zh-CN";

export type TranslationValue =
	| string
	| number
	| boolean
	| null
	| undefined;

export interface I18n {
	locale: SupportedLocale;
	t: (key: string, values?: Record<string, TranslationValue>) => string;
}

const messages: Record<SupportedLocale, Record<string, string>> = {
	en: {
		"actions.addKeyResult": "Add key result",
		"actions.cancel": "Cancel",
		"actions.confirm": "Confirm",
		"actions.create": "Create",
		"actions.delete": "Delete",
		"actions.deleteKeyResult": "Delete key result",
		"actions.deleteObjective": "Delete objective",
		"actions.edit": "Edit",
		"actions.editObjective": "Edit objective",
		"actions.editKeyResult": "Edit key result",
		"actions.expand": "Expand",
		"actions.moreActions": "More actions",
		"actions.moveDown": "Move down",
		"actions.moveUp": "Move up",
		"actions.migrateLegacyProgressRecords":
			"Migrate legacy progress records",
		"actions.newKeyResult": "New key result",
		"actions.newObjective": "New objective",
		"actions.openDashboard": "Open dashboard",
		"actions.openDetails": "Open details",
		"actions.collapse": "Collapse",
		"actions.postpone": "Postpone",
		"actions.postponeDueDate": "Postpone due date",
		"actions.recordCheckIn": "Record progress",
		"actions.save": "Save",
		"actions.savePostpone": "Save new due date",
		"actions.closePeriod": "Close period",
		"actions.reopenPeriod": "Reopen period",
		"actions.archivePeriod": "Archive period",
		"actions.unarchivePeriod": "Unarchive period",
		"actions.periodActions": "Period actions",
		"actions.showArchived": "Show archived",
		"actions.saveTemplate": "Save as template",
		"actions.applyTemplate": "Apply template",
		"actions.manageTemplates": "Period templates",
		"common.loading": "Loading…",
		"common.none": "-",
		"common.okr": "OKR",
		"confidence.high": "High",
		"confidence.low": "Low",
		"confidence.medium": "Medium",
		"dashboard.averageProgress": "Avg. progress",
		"dashboard.currentPeriodHasNoObjectives":
			"No objectives for the current period.\nCreate your first objective below.",
		"dashboard.errorState":
			"Failed to load the dashboard.\nPlease try again later or check the console logs.",
		"dashboard.keyResults": "Key results",
		"dashboard.loadFailed": "Failed to load dashboard",
		"dashboard.loadFailedWithReason": "Failed to load dashboard: {message}",
		"dashboard.noPeriods": "No periods yet",
		"dashboard.objectiveFileMissing":
			"The objective file is missing and may have been deleted manually.",
		"dashboard.objectives": "Objectives",
		"dashboard.overdueReminder":
			"{count} visible objectives are overdue{titles}{suffix}. Click Postpone to update the due date.",
		"dashboard.overdueReminderTitles": ": {titles}",
		"dashboard.overdueReminderSuffix": " and more",
		"dashboard.period": "Period",
		"dashboard.progressUpdated": "Key result order updated",
		"dashboard.progressUpdateFailed":
			"Failed to update key result order: {message}",
		"dashboard.title": "Dashboard",
		"detail.actions": "Actions",
		"detail.confidence": "Confidence",
		"detail.deleteKeyResultConfirm":
			"Delete key result \"{title}\" and all of its progress records?",
		"detail.deleteKeyResultFailed": "Failed to delete key result: {title}",
		"detail.deleteKeyResultSuccess": "Deleted key result: {title}",
		"detail.deleteObjectiveConfirm":
			"Delete objective \"{title}\", all of its key results, and related progress records?",
		"detail.deleteObjectiveFailed": "Failed to delete objective: {title}",
		"detail.deleteObjectiveSuccess": "Deleted objective: {title}",
		"detail.dueDate": "Due date",
		"detail.editKeyResultMissing": "Could not find the key result to edit",
		"detail.editObjectiveMissing": "Could not find the objective to edit",
		"detail.emptyKeyResults": "This objective does not have key results yet",
		"detail.index": "#",
		"detail.keyResultMovedDown": "Moved key result down",
		"detail.keyResultMovedDownFailed":
			"Failed to move key result down: {message}",
		"detail.keyResultMovedUp": "Moved key result up",
		"detail.keyResultMovedUpFailed":
			"Failed to move key result up: {message}",
		"detail.owner": "Owner",
		"detail.postponeObjectiveMissing": "Could not find the objective to postpone",
		"detail.progress": "Progress",
		"detail.progressPercent": "Progress %",
		"detail.title": "Title",
		"errors.confirmActionFailed":
			"{action} failed. Please try again later.",
		"errors.unknown": "Unknown error",
		"errors.keyResultNotFound": "Key result not found: {id}",
		"errors.keyResultToDeleteNotFound":
			"Could not find the key result to delete: {id}",
		"errors.invalidObjectiveFiles": "Invalid Objective files: {files}",
		"errors.duplicateObjectiveId": "Duplicate Objective ID {id}: {files}",
		"errors.objectivePeriodMismatch":
			"Objective period {actual} does not match folder period {expected}",
		"errors.invalidKeyResultValues": "Invalid key result values",
		"errors.invalidCheckInValues": "Invalid check-in values",
		"errors.invalidPeriod": "Invalid OKR period: {period}",
		"errors.objectiveExists": "Objective file already exists: {fileName}",
		"errors.objectiveNotFound": "Objective not found: {id}",
		"errors.objectiveToDeleteNotFound":
			"Could not find the objective to delete: {id}",
		"errors.pathOccupiedByFile": "Path is already occupied by a file: {path}",
		"errors.periodNotOpen": "Period is not open: {period}",
		"errors.periodNotWritable": "Period {period} is {status} and is read-only",
		"errors.invalidPeriodTransition":
			"Period {period} cannot transition from {status}",
		"errors.unfinishedRolloverConfirmationRequired":
			"Explicit confirmation is required to close a period without rolling over unfinished objectives",
		"errors.invalidRolloverSelection": "Invalid rollover selection: {id}",
		"errors.invalidRolloverTarget": "Invalid rollover target period: {period}",
		"errors.rolloverRollbackIncomplete":
			"{message}. Rollback could not remove: {files}",
		"errors.templateSelectionRequired": "Select at least one objective",
		"errors.templateNotFound": "Period template not found: {id}",
		"errors.templatePeriodTypeMismatch":
			"The template and target period types do not match",
		"errors.templateTargetNotEmpty":
			"Templates can only be applied to a period without objectives",
		"errors.templateRollbackIncomplete":
			"Template rollback could not remove: {files}",
		"periodStatus.open": "Open",
		"periodStatus.closed": "Closed",
		"periodStatus.archived": "Archived",
		"modals.closePeriod.title": "Close {period}",
		"modals.closePeriod.targetPeriod": "Rollover target period",
		"modals.closePeriod.rolloverHeading": "Unfinished objectives to roll over",
		"modals.closePeriod.noCandidates": "There are no unfinished objectives to roll over.",
		"modals.closePeriod.noRolloverTitle": "Close without rollover?",
		"modals.closePeriod.noRolloverConfirm":
			"Unfinished objectives remain. Close this period without rolling any of them over?",
		"modals.saveTemplate.title": "Save period template",
		"modals.saveTemplate.name": "Template name",
		"modals.saveTemplate.selection": "Objectives and key results",
		"modals.templates.title": "Period templates",
		"modals.templates.empty": "No period templates yet.",
		"modals.templates.summary": "{type} · {count} objectives",
		"modals.templates.targetPeriod": "Target period",
		"modals.templates.deleteTitle": "Delete period template",
		"modals.templates.deleteConfirm": "Move template “{name}” to the trash?",
		"modals.archivePeriod.confirm": "Archive period {period}?",
		"notices.periodClosed": "Closed period {period}",
		"notices.periodReopened": "Reopened period {period}",
		"notices.periodArchived": "Archived period {period}",
		"notices.periodUnarchived": "Unarchived period {period}",
		"notices.templateSaved": "Saved period template",
		"notices.templateDeleted": "Deleted period template",
		"notices.templateApplied": "Applied template to {period}",
		"modals.checkIn.blocker": "Blockers",
		"modals.checkIn.blockerPlaceholder": "What is blocking progress?",
		"modals.checkIn.currentError":
			"Current value must be a number greater than or equal to 0",
		"modals.checkIn.date": "Date",
		"modals.checkIn.noKeyResults": "No key result available for progress updates",
		"modals.checkIn.note": "Progress update",
		"modals.checkIn.notePlaceholder": "What happened this week?",
		"modals.checkIn.progress": "Progress (%)",
		"modals.checkIn.progressError":
			"Progress must be an integer between 0 and 100",
		"modals.checkIn.saveFailed": "Failed to record progress",
		"modals.checkIn.saveFailedWithReason":
			"Failed to record progress: {message}",
		"modals.checkIn.saved": "Recorded progress: {krId} {progress}%",
		"modals.checkIn.selectKeyResult": "Key result",
		"modals.checkIn.title": "Record progress",
		"modals.checkIn.value": "Current value",
		"modals.confirm.cancel": "Cancel",
		"modals.editKeyResult.subtitle": "Objective: {objectiveId}",
		"modals.editKeyResult.title": "Edit key result {id}",
		"modals.editObjective.period": "Period: {period}",
		"modals.editObjective.title": "Edit objective {id}",
		"modals.fields.confidence": "Confidence",
		"modals.fields.currentValue": "Current value",
		"modals.fields.description": "Description",
		"modals.fields.dueDate": "Due date",
		"modals.fields.newDueDate": "New due date",
		"modals.fields.objective": "Objective",
		"modals.fields.owner": "Owner",
		"modals.fields.period": "Period",
		"modals.fields.periodType": "Period type",
		"modals.fields.status": "Status",
		"modals.fields.targetValue": "Target value",
		"modals.fields.title": "Title",
		"modals.fields.unit": "Progress unit",
		"modals.input.currentError":
			"Current value must be a number greater than or equal to 0",
		"modals.input.targetError":
			"Target value must be a number greater than or equal to 0",
		"migration.legacyProgressRecordsCompleted":
			"Progress record migration complete: scanned {scanned}, migrated {migrated}, skipped {skipped} read-only periods.",
		"migration.legacyProgressRecordsFailed":
			"Failed to migrate legacy progress records",
		"migration.legacyProgressRecordsFailedWithReason":
			"Failed to migrate legacy progress records: {message}",
		"modals.newKeyResult.createFailed": "Failed to create key result",
		"modals.newKeyResult.createFailedWithReason":
			"Failed to create key result: {message}",
		"modals.newKeyResult.created": "Created key result: {title}",
		"modals.newKeyResult.noObjectives":
			"The current period does not have an objective yet",
		"modals.newKeyResult.ownedByObjective": "Objective",
		"modals.newKeyResult.placeholder": "For example: Increase NPS to 60",
		"modals.newKeyResult.title": "New key result",
		"modals.newObjective.createFailed": "Failed to create objective",
		"modals.newObjective.createFailedWithReason":
			"Failed to create objective: {message}",
		"modals.newObjective.created": "Created objective: {title}",
		"modals.newObjective.periodFormatError": "Invalid period format",
		"modals.newObjective.placeholder": "For example: Improve product UX",
		"modals.newObjective.title": "New objective",
		"modals.objective.descriptionPlaceholder": "Background details...",
		"modals.periodHint.month": "Format: YYYY-MM, for example 2026-05",
		"modals.periodHint.quarter": "Format: YYYY-Qn, for example 2026-Q2",
		"modals.periodHint.week": "Format: YYYY-Www, for example 2026-W20",
		"modals.periodHint.year": "Format: YYYY, for example 2026",
		"modals.postpone.currentDueDate": "Current due date: {due}",
		"modals.postpone.currentDueDateUnset": "Current due date: Not set",
		"modals.postpone.hint":
			"Only the due date changes. Other objective fields stay the same.",
		"modals.postpone.saved": "Updated due date: {due}",
		"modals.postpone.saveFailed": "Failed to update due date",
		"modals.postpone.saveFailedWithReason":
			"Failed to update due date: {message}",
		"modals.postpone.title": "Postpone objective {id}",
		"modals.select.boolean": "Boolean",
		"modals.select.high": "High",
		"modals.select.low": "Low",
		"modals.select.medium": "Medium",
		"modals.select.month": "Month",
		"modals.select.number": "Number",
		"modals.select.percentage": "Percentage",
		"modals.select.quarter": "Quarter",
		"modals.select.score": "Score",
		"modals.select.week": "Week",
		"modals.select.year": "Year",
		"modals.updateKeyResult.saved": "Updated key result: {title}",
		"modals.updateKeyResult.saveFailed": "Failed to update key result",
		"modals.updateKeyResult.saveFailedWithReason":
			"Failed to update key result: {message}",
		"modals.updateObjective.saved": "Updated objective: {title}",
		"modals.updateObjective.saveFailed": "Failed to update objective",
		"modals.updateObjective.saveFailedWithReason":
			"Failed to update objective: {message}",
		"objectiveStatus.dueDate": "Due {due}",
		"objectiveStatus.dueDateHelp": "Due date {due}",
		"objectiveStatus.dueInOneDay": "Due in 1 day",
		"objectiveStatus.dueInDays": "Due in {days} days",
		"objectiveStatus.dueToday": "Due today",
		"objectiveStatus.noDueDate": "No due date",
		"objectiveStatus.originalDueDate": "Original due date {due}",
		"objectiveStatus.overdueOneDay": "Overdue by 1 day",
		"objectiveStatus.overdueDays": "Overdue by {days} days",
		"period.label.quarter": "{year} Q{quarter}",
		"period.label.week": "{year} W{week}",
		"period.label.year": "{year}",
		"settings.autoComputeProgress.desc":
			"Automatically recalculate progress when the current or target value changes. Disable it if you want to edit progress manually.",
		"settings.autoComputeProgress.name": "Auto-calculate progress",
		"settings.defaultPeriodType.desc":
			"Default period type used when creating an objective.",
		"settings.defaultPeriodType.name": "Default period type",
		"settings.rootDir.desc": "Storage path for all objective files.",
		"settings.rootDir.name": "Objective directory",
		"settings.showDashboardOnStartup.name": "Open dashboard on startup",
		"status.active": "Active",
		"status.cancelled": "Cancelled",
		"status.completed": "Completed",
		"status.on-hold": "On hold",
		"template.autoRenderKrList":
			"(The plugin renders the KR list automatically. Do not edit this section manually.)",
		"template.backgroundHeading": "Background",
		"template.backgroundPlaceholder":
			"Add the background context for this objective.",
		"template.keyResultsHeading": "Key Results",
	},
	"zh-CN": {
		"actions.addKeyResult": "新增关键结果",
		"actions.cancel": "取消",
		"actions.confirm": "确认",
		"actions.create": "创建",
		"actions.delete": "删除",
		"actions.deleteKeyResult": "删除关键结果",
		"actions.deleteObjective": "删除目标",
		"actions.edit": "编辑",
		"actions.editObjective": "编辑目标",
		"actions.editKeyResult": "编辑关键结果",
		"actions.expand": "展开",
		"actions.moreActions": "更多操作",
		"actions.moveDown": "下移",
		"actions.moveUp": "上移",
		"actions.migrateLegacyProgressRecords": "迁移旧版进度记录",
		"actions.newKeyResult": "新建关键结果",
		"actions.newObjective": "新建目标",
		"actions.openDashboard": "打开仪表盘",
		"actions.openDetails": "打开详情",
		"actions.collapse": "折叠",
		"actions.postpone": "延期",
		"actions.postponeDueDate": "延期截止日期",
		"actions.recordCheckIn": "记录进度",
		"actions.save": "保存",
		"actions.savePostpone": "保存延期",
		"actions.closePeriod": "关闭周期",
		"actions.reopenPeriod": "重新开启周期",
		"actions.archivePeriod": "归档周期",
		"actions.unarchivePeriod": "取消归档",
		"actions.periodActions": "周期操作",
		"actions.showArchived": "显示已归档",
		"actions.saveTemplate": "保存为模板",
		"actions.applyTemplate": "应用模板",
		"actions.manageTemplates": "周期模板",
		"common.loading": "加载中…",
		"common.none": "-",
		"common.okr": "OKR",
		"confidence.high": "高",
		"confidence.low": "低",
		"confidence.medium": "中",
		"dashboard.averageProgress": "平均进度",
		"dashboard.currentPeriodHasNoObjectives":
			"当前周期暂无目标\n点击下方按钮创建第一个目标",
		"dashboard.errorState":
			"仪表盘加载失败\n请稍后重试或检查控制台日志",
		"dashboard.keyResults": "关键结果",
		"dashboard.loadFailed": "加载仪表盘失败",
		"dashboard.loadFailedWithReason": "加载仪表盘失败：{message}",
		"dashboard.noPeriods": "暂无周期",
		"dashboard.objectiveFileMissing":
			"Objective 文件不存在，可能已被手动删除",
		"dashboard.objectives": "目标",
		"dashboard.overdueReminder":
			"当前可见目标中有 {count} 个已超期{titles}{suffix}，可直接点击“延期”更新截止日期。",
		"dashboard.overdueReminderTitles": "：{titles}",
		"dashboard.overdueReminderSuffix": " 等",
		"dashboard.period": "周期",
		"dashboard.progressUpdated": "已更新关键结果顺序",
		"dashboard.progressUpdateFailed": "更新关键结果顺序失败：{message}",
		"dashboard.title": "仪表盘",
		"detail.actions": "操作",
		"detail.confidence": "信心",
		"detail.deleteKeyResultConfirm":
			"确认删除关键结果「{title}」及其全部进度记录吗？",
		"detail.deleteKeyResultFailed": "删除关键结果失败：{title}",
		"detail.deleteKeyResultSuccess": "已删除关键结果：{title}",
		"detail.deleteObjectiveConfirm":
			"确认删除目标「{title}」、其全部关键结果以及关联进度记录吗？",
		"detail.deleteObjectiveFailed": "删除目标失败：{title}",
		"detail.deleteObjectiveSuccess": "已删除目标：{title}",
		"detail.dueDate": "截止日",
		"detail.editKeyResultMissing": "找不到要编辑的关键结果",
		"detail.editObjectiveMissing": "找不到要编辑的目标",
		"detail.emptyKeyResults": "当前目标暂无关键结果",
		"detail.index": "序号",
		"detail.keyResultMovedDown": "已下移关键结果",
		"detail.keyResultMovedDownFailed": "下移关键结果失败：{message}",
		"detail.keyResultMovedUp": "已上移关键结果",
		"detail.keyResultMovedUpFailed": "上移关键结果失败：{message}",
		"detail.owner": "负责人",
		"detail.postponeObjectiveMissing": "找不到要延期的目标",
		"detail.progress": "进度",
		"detail.progressPercent": "进度%",
		"detail.title": "标题",
		"errors.confirmActionFailed": "{action}操作失败，请稍后重试",
		"errors.unknown": "未知错误",
		"errors.keyResultNotFound": "找不到关键结果：{id}",
		"errors.keyResultToDeleteNotFound": "找不到要删除的关键结果：{id}",
		"errors.invalidObjectiveFiles": "目标文件无效：{files}",
		"errors.duplicateObjectiveId": "Objective ID {id} 重复：{files}",
		"errors.objectivePeriodMismatch":
			"Objective 周期 {actual} 与所在文件夹周期 {expected} 不一致",
		"errors.invalidKeyResultValues": "关键结果数值无效",
		"errors.invalidCheckInValues": "进度记录数值无效",
		"errors.invalidPeriod": "OKR 周期无效：{period}",
		"errors.objectiveExists": "Objective 文件已存在：{fileName}",
		"errors.objectiveNotFound": "找不到 Objective：{id}",
		"errors.objectiveToDeleteNotFound": "找不到要删除的目标：{id}",
		"errors.pathOccupiedByFile": "路径已被文件占用：{path}",
		"errors.periodNotOpen": "周期不是开启状态：{period}",
		"errors.periodNotWritable": "周期 {period} 当前为{status}状态，只能查看",
		"errors.invalidPeriodTransition": "周期 {period} 无法从 {status} 状态执行此操作",
		"errors.unfinishedRolloverConfirmationRequired":
			"关闭仍有未完成目标的周期时，必须明确确认不结转",
		"errors.invalidRolloverSelection": "结转选择无效：{id}",
		"errors.invalidRolloverTarget": "结转目标周期无效：{period}",
		"errors.rolloverRollbackIncomplete": "{message}。回滚后仍残留：{files}",
		"errors.templateSelectionRequired": "请至少选择一个目标",
		"errors.templateNotFound": "找不到周期模板：{id}",
		"errors.templatePeriodTypeMismatch": "模板与目标周期的类型不一致",
		"errors.templateTargetNotEmpty": "模板只能应用到没有目标的周期",
		"errors.templateRollbackIncomplete": "模板回滚后仍残留：{files}",
		"periodStatus.open": "进行中",
		"periodStatus.closed": "已关闭",
		"periodStatus.archived": "已归档",
		"modals.closePeriod.title": "关闭周期 {period}",
		"modals.closePeriod.targetPeriod": "结转目标周期",
		"modals.closePeriod.rolloverHeading": "要结转的未完成目标",
		"modals.closePeriod.noCandidates": "没有需要结转的未完成目标。",
		"modals.closePeriod.noRolloverTitle": "不结转直接关闭？",
		"modals.closePeriod.noRolloverConfirm":
			"当前仍有未完成目标，确定不结转任何目标并关闭周期吗？",
		"modals.saveTemplate.title": "保存周期模板",
		"modals.saveTemplate.name": "模板名称",
		"modals.saveTemplate.selection": "选择目标与关键结果",
		"modals.templates.title": "周期模板",
		"modals.templates.empty": "暂无周期模板。",
		"modals.templates.summary": "{type} · {count} 个目标",
		"modals.templates.targetPeriod": "目标周期",
		"modals.templates.deleteTitle": "删除周期模板",
		"modals.templates.deleteConfirm": "将模板“{name}”移入回收站？",
		"modals.archivePeriod.confirm": "确定归档周期 {period} 吗？",
		"notices.periodClosed": "已关闭周期 {period}",
		"notices.periodReopened": "已重新开启周期 {period}",
		"notices.periodArchived": "已归档周期 {period}",
		"notices.periodUnarchived": "已取消归档周期 {period}",
		"notices.templateSaved": "已保存周期模板",
		"notices.templateDeleted": "已删除周期模板",
		"notices.templateApplied": "已将模板应用到 {period}",
		"modals.checkIn.blocker": "阻碍因素",
		"modals.checkIn.blockerPlaceholder": "遇到了什么问题...",
		"modals.checkIn.currentError": "当前值必须是大于等于 0 的数字",
		"modals.checkIn.date": "日期",
		"modals.checkIn.noKeyResults": "暂无可记录的关键结果",
		"modals.checkIn.note": "本次进展",
		"modals.checkIn.notePlaceholder": "这周做了什么...",
		"modals.checkIn.progress": "进度 (%)",
		"modals.checkIn.progressError":
			"进度必须是 0 到 100 之间的整数",
		"modals.checkIn.saveFailed": "记录进度失败",
		"modals.checkIn.saveFailedWithReason": "记录进度失败：{message}",
		"modals.checkIn.saved": "已记录进度：{krId} {progress}%",
		"modals.checkIn.selectKeyResult": "关键结果",
		"modals.checkIn.title": "记录进度",
		"modals.checkIn.value": "当前值",
		"modals.confirm.cancel": "取消",
		"modals.editKeyResult.subtitle": "所属 Objective：{objectiveId}",
		"modals.editKeyResult.title": "编辑 Key Result {id}",
		"modals.editObjective.period": "周期：{period}",
		"modals.editObjective.title": "编辑 Objective {id}",
		"modals.fields.confidence": "信心度",
		"modals.fields.currentValue": "当前值",
		"modals.fields.description": "描述",
		"modals.fields.dueDate": "截止日期",
		"modals.fields.newDueDate": "新的截止日期",
		"modals.fields.objective": "目标",
		"modals.fields.owner": "负责人",
		"modals.fields.period": "周期",
		"modals.fields.periodType": "周期类型",
		"modals.fields.status": "状态",
		"modals.fields.targetValue": "目标值",
		"modals.fields.title": "标题",
		"modals.fields.unit": "进度单位",
		"modals.input.currentError": "当前值必须是大于等于 0 的数字",
		"modals.input.targetError": "目标值必须是大于等于 0 的数字",
		"migration.legacyProgressRecordsCompleted":
			"旧版进度记录迁移完成：扫描 {scanned} 个，迁移 {migrated} 个，跳过 {skipped} 个只读周期。",
		"migration.legacyProgressRecordsFailed": "迁移旧版进度记录失败",
		"migration.legacyProgressRecordsFailedWithReason":
			"迁移旧版进度记录失败：{message}",
		"modals.newKeyResult.createFailed": "创建 Key Result 失败",
		"modals.newKeyResult.createFailedWithReason":
			"创建 Key Result 失败：{message}",
		"modals.newKeyResult.created": "已创建 Key Result：{title}",
		"modals.newKeyResult.noObjectives": "当前周期暂无目标",
		"modals.newKeyResult.ownedByObjective": "所属 Objective",
		"modals.newKeyResult.placeholder": "例如：NPS 提升至 60",
		"modals.newKeyResult.title": "新建关键结果",
		"modals.newObjective.createFailed": "创建 Objective 失败",
		"modals.newObjective.createFailedWithReason":
			"创建 Objective 失败：{message}",
		"modals.newObjective.created": "已创建 Objective：{title}",
		"modals.newObjective.periodFormatError": "周期格式不正确",
		"modals.newObjective.placeholder": "例如：提升产品用户体验",
		"modals.newObjective.title": "新建目标",
		"modals.objective.descriptionPlaceholder": "背景描述...",
		"modals.periodHint.month": "格式：YYYY-MM，例如 2026-05",
		"modals.periodHint.quarter": "格式：YYYY-Qn，例如 2026-Q2",
		"modals.periodHint.week": "格式：YYYY-Www，例如 2026-W20",
		"modals.periodHint.year": "格式：YYYY，例如 2026",
		"modals.postpone.currentDueDate": "当前截止日期：{due}",
		"modals.postpone.currentDueDateUnset": "当前截止日期：未设置",
		"modals.postpone.hint": "仅更新截止日期，其他目标字段保持不变。",
		"modals.postpone.saved": "已更新截止日期：{due}",
		"modals.postpone.saveFailed": "更新截止日期失败",
		"modals.postpone.saveFailedWithReason":
			"更新截止日期失败：{message}",
		"modals.postpone.title": "延期 Objective {id}",
		"modals.select.boolean": "布尔",
		"modals.select.high": "高",
		"modals.select.low": "低",
		"modals.select.medium": "中",
		"modals.select.month": "月",
		"modals.select.number": "数值",
		"modals.select.percentage": "百分比",
		"modals.select.quarter": "季度",
		"modals.select.score": "分数",
		"modals.select.week": "周",
		"modals.select.year": "年",
		"modals.updateKeyResult.saved": "已更新 Key Result：{title}",
		"modals.updateKeyResult.saveFailed": "更新 Key Result 失败",
		"modals.updateKeyResult.saveFailedWithReason":
			"更新 Key Result 失败：{message}",
		"modals.updateObjective.saved": "已更新 Objective：{title}",
		"modals.updateObjective.saveFailed": "更新 Objective 失败",
		"modals.updateObjective.saveFailedWithReason":
			"更新 Objective 失败：{message}",
		"objectiveStatus.dueDate": "截止 {due}",
		"objectiveStatus.dueDateHelp": "截止日期 {due}",
		"objectiveStatus.dueInOneDay": "1 天后截止",
		"objectiveStatus.dueInDays": "{days} 天后截止",
		"objectiveStatus.dueToday": "今天截止",
		"objectiveStatus.noDueDate": "未设置截止日期",
		"objectiveStatus.originalDueDate": "原截止日期 {due}",
		"objectiveStatus.overdueOneDay": "已超期 1 天",
		"objectiveStatus.overdueDays": "已超期 {days} 天",
		"period.label.quarter": "{year} Q{quarter}",
		"period.label.week": "{year} 第 {week} 周",
		"period.label.year": "{year} 年",
		"settings.autoComputeProgress.desc":
			"当当前值或目标值更新时自动重算进度，关闭后可手动设置进度",
		"settings.autoComputeProgress.name": "自动计算进度",
		"settings.defaultPeriodType.desc":
			"新建目标时默认使用的周期类型",
		"settings.defaultPeriodType.name": "默认周期类型",
		"settings.rootDir.desc": "所有目标文件的存储路径",
		"settings.rootDir.name": "目标目录",
		"settings.showDashboardOnStartup.name": "启动时打开仪表盘",
		"status.active": "进行中",
		"status.cancelled": "已取消",
		"status.completed": "已完成",
		"status.on-hold": "暂停中",
		"template.autoRenderKrList":
			"（插件自动渲染 KR 列表，勿手动编辑此区域）",
		"template.backgroundHeading": "背景",
		"template.backgroundPlaceholder": "请补充该目标的背景说明。",
		"template.keyResultsHeading": "关键结果",
	},
};

export function resolveLocale(input?: string | null): SupportedLocale {
	const normalized = String(input ?? "")
		.trim()
		.toLowerCase();
	if (
		normalized === "zh-cn" ||
		normalized === "zh-hans" ||
		normalized.startsWith("zh-") ||
		normalized === "zh"
	) {
		return "zh-CN";
	}
	if (normalized === "en" || normalized.startsWith("en-")) {
		return "en";
	}
	return "en";
}

export function detectLocale(app?: unknown): SupportedLocale {
	const appRecord = (app ?? {}) as {
		locale?: string;
		appLocale?: string;
		vault?: {
			getConfig?: (key: string) => unknown;
		};
	};
	const candidates = [
		appRecord.locale,
		appRecord.appLocale,
		appRecord.vault?.getConfig?.("locale"),
	];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return resolveLocale(candidate);
		}
	}
	return "en";
}

export function createI18n(locale?: string | null): I18n {
	const resolved = resolveLocale(locale);
	return {
		locale: resolved,
		t(key, values = {}) {
			const template = messages[resolved][key] ?? messages.en[key] ?? key;
			return template.replace(/\{(\w+)\}/g, (_match, token: string) => {
				const value = values[token];
				return value == null ? "" : String(value);
			});
		},
	};
}
