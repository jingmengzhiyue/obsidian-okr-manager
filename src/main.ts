import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { OKRPluginSettings, DEFAULT_SETTINGS } from "./types";
import { OKRManager } from "./manager/OKRManager";
import { DashboardView, DASHBOARD_VIEW_TYPE } from "./views/DashboardView";
import { OKRDetailRenderer } from "./views/OKRDetailRenderer";
import { NewObjectiveModal } from "./modals/NewObjectiveModal";
import { NewKRModal } from "./modals/NewKRModal";
import { CheckInModal } from "./modals/CheckInModal";
import { PeriodReviewsModal } from "./modals/PeriodReviewsModal";
import { SettingsTab } from "./settings/SettingsTab";
import { createI18n, detectLocale, type I18n } from "./i18n";
import { revealLeafCompat } from "./utils/workspace";

export default class OKRPlugin extends Plugin {
	settings!: OKRPluginSettings;
	manager!: OKRManager;
	i18n!: I18n;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.i18n = createI18n(detectLocale(this.app));
		this.manager = new OKRManager(this.app, this.settings, this.i18n);

		// 注册缓存失效事件（通过 registerEvent 确保插件禁用时自动清理）
		this.registerEvent(
			this.app.metadataCache.on("changed", (file: TFile) => {
				if (this.manager.invalidateCacheForFile(file)) {
					this.refreshDashboard();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				if (this.manager.invalidateCacheForFile(file)) {
					this.refreshDashboard();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on(
				"rename",
				(file: TAbstractFile, oldPath: string) => {
					let invalidated = false;
					if (this.manager.invalidateCacheByPath(oldPath)) {
						invalidated = true;
					}
					if (this.manager.invalidateCacheForFile(file)) {
						invalidated = true;
					}
					if (invalidated) {
						this.refreshDashboard();
					}
				},
			),
		);

		// 注册 Dashboard 侧边栏视图
		this.registerView(
			DASHBOARD_VIEW_TYPE,
			(leaf) => new DashboardView(leaf, this.manager),
		);

		// 注册 Markdown 后处理器（渲染 KR 列表与行内操作）
		this.registerMarkdownPostProcessor(
			OKRDetailRenderer.postProcessor(this.manager),
		);

		// 注册 Commands
		this.addCommand({
			id: "okr-new-objective",
			name: this.i18n.t("actions.newObjective"),
			callback: () => new NewObjectiveModal(this.app, this.manager).open(),
		});
		this.addCommand({
			id: "okr-new-kr",
			name: this.i18n.t("actions.newKeyResult"),
			callback: () => new NewKRModal(this.app, this.manager).open(),
		});
		this.addCommand({
			id: "okr-check-in",
			name: this.i18n.t("actions.recordCheckIn"),
			callback: () => new CheckInModal(this.app, this.manager).open(),
		});
		this.addCommand({
			id: "okr-open-dashboard",
			name: this.i18n.t("actions.openDashboard"),
			callback: () => this.activateDashboard(),
		});
		this.addCommand({
			id: "okr-period-reviews",
			name: this.i18n.t("actions.periodReviews"),
			callback: () => new PeriodReviewsModal(this.app, this.manager).open(),
		});
		this.addCommand({
			id: "okr-migrate-legacy-progress-records",
			name: this.i18n.t("actions.migrateLegacyProgressRecords"),
			callback: () => {
				void this.migrateLegacyProgressRecords();
			},
		});

		// Ribbon 图标
		this.addRibbonIcon("target", this.i18n.t("actions.openDashboard"), () =>
			this.activateDashboard(),
		);

		// 设置页
		this.addSettingTab(new SettingsTab(this.app, this));

		// 启动时自动打开 Dashboard
		if (this.settings.showDashboardOnStartup) {
			this.app.workspace.onLayoutReady(() => {
				void this.activateDashboard();
			});
		}
	}

	async activateDashboard(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		if (leaves.length === 0) {
			const leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: DASHBOARD_VIEW_TYPE,
					active: true,
				});
			}
		}
		const targetLeaves =
			this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		if (targetLeaves.length > 0) {
			void revealLeafCompat(this.app.workspace, targetLeaves[0]!);
		}
	}

	refreshDashboard(): void {
		const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof DashboardView) {
				view.refresh();
			}
		}
	}

	async migrateLegacyProgressRecords(): Promise<void> {
		try {
			const result = await this.manager.migrateLegacyProgressRecords();
			new Notice(
				this.i18n.t("migration.legacyProgressRecordsCompleted", {
					scanned: result.scanned,
					migrated: result.migrated,
					skipped: result.skippedPeriods ?? 0,
				}),
			);
			this.refreshDashboard();
		} catch (error) {
			new Notice(
				error instanceof Error
					? this.i18n.t("migration.legacyProgressRecordsFailedWithReason", {
							message: error.message,
						})
					: this.i18n.t("migration.legacyProgressRecordsFailed"),
			);
		}
	}

	async loadSettings(): Promise<void> {
		const loaded =
			(await this.loadData()) as Partial<OKRPluginSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...(loaded ?? {}),
		};
		if (!this.settings.defaultPeriodType) {
			this.settings.defaultPeriodType = "quarter";
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.manager.updateSettings(this.settings);
	}
}
