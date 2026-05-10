import { Plugin, TAbstractFile } from "obsidian";
import { OKRPluginSettings, DEFAULT_SETTINGS } from "./types";
import { OKRManager } from "./manager/OKRManager";
import { DashboardView, DASHBOARD_VIEW_TYPE } from "./views/DashboardView";
import { OKRDetailRenderer } from "./views/OKRDetailRenderer";
import { NewObjectiveModal } from "./modals/NewObjectiveModal";
import { NewKRModal } from "./modals/NewKRModal";
import { CheckInModal } from "./modals/CheckInModal";
import { SettingsTab } from "./settings/SettingsTab";

export default class OKRPlugin extends Plugin {
	settings!: OKRPluginSettings;
	manager!: OKRManager;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.manager = new OKRManager(this.app, this.settings);

		// 注册缓存失效事件（通过 registerEvent 确保插件禁用时自动清理）
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) =>
				this.manager.invalidateCacheForFile(file),
			),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) =>
				this.manager.invalidateCacheForFile(file),
			),
		);
		this.registerEvent(
			this.app.vault.on(
				"rename",
				(file: TAbstractFile, oldPath: string) => {
					this.manager.invalidateCacheByPath(oldPath);
					this.manager.invalidateCacheForFile(file);
				},
			),
		);

		// 注册 Dashboard 侧边栏视图
		this.registerView(
			DASHBOARD_VIEW_TYPE,
			(leaf) => new DashboardView(leaf, this.manager),
		);

		// 注册 Markdown 后处理器（渲染 KR 列表和 check-in 历史）
		this.registerMarkdownPostProcessor(
			OKRDetailRenderer.postProcessor(this.manager),
		);

		// 注册 Commands
		this.addCommand({
			id: "okr-new-objective",
			name: "新建目标",
			callback: () =>
				new NewObjectiveModal(this.app, this.manager, () =>
					this.refreshDashboard(),
				).open(),
		});
		this.addCommand({
			id: "okr-new-kr",
			name: "新建关键结果",
			callback: () =>
				new NewKRModal(this.app, this.manager, {
					onComplete: () => this.refreshDashboard(),
				}).open(),
		});
		this.addCommand({
			id: "okr-check-in",
			name: "记录进度",
			callback: () =>
				new CheckInModal(this.app, this.manager, {
					onComplete: () => this.refreshDashboard(),
				}).open(),
		});
		this.addCommand({
			id: "okr-open-dashboard",
			name: "打开仪表盘",
			callback: () => this.activateDashboard(),
		});

		// Ribbon 图标
		this.addRibbonIcon("target", "打开仪表盘", () =>
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
			void this.app.workspace.revealLeaf(targetLeaves[0]!);
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
