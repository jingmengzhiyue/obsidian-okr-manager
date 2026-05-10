import { App, normalizePath, PluginSettingTab, Setting } from "obsidian";
import OKRPlugin from "../main";

export class SettingsTab extends PluginSettingTab {
	plugin: OKRPlugin;

	constructor(app: App, plugin: OKRPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName("OKR 根目录")
			.setDesc("所有 OKR 文件存储的 Vault 根路径")
			.addText((text) =>
				text
					.setPlaceholder("OKR")
					.setValue(this.plugin.settings.rootDir)
					.onChange(async (value) => {
						this.plugin.settings.rootDir = normalizePath(
							value.trim() || "OKR",
						);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Check-in 目录").addText((text) =>
			text
				.setPlaceholder("OKR/Check-ins")
				.setValue(this.plugin.settings.checkInsDir)
				.onChange(async (value) => {
					this.plugin.settings.checkInsDir = normalizePath(
						value.trim() || "OKR/Check-ins",
					);
					await this.plugin.saveSettings();
				}),
		);

		new Setting(containerEl)
			.setName("默认周期类型")
			.setDesc("新建 Objective 时默认使用的周期类型")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("week", "周")
					.addOption("month", "月")
					.addOption("quarter", "季度")
					.addOption("year", "年")
					.setValue(this.plugin.settings.defaultPeriodType)
					.onChange(async (value) => {
						this.plugin.settings.defaultPeriodType =
							value as typeof this.plugin.settings.defaultPeriodType;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("自动计算进度")
			.setDesc(
				"当 current/target 更新时自动重算 progress，关闭则允许手动设置 progress",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoComputeProgress)
					.onChange(async (value) => {
						this.plugin.settings.autoComputeProgress = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("启动时打开 Dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showDashboardOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.showDashboardOnStartup = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
