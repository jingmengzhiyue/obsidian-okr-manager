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
			.setName("目标目录")
			.setDesc("所有目标文件的存储路径")
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

		new Setting(containerEl).setName("进度记录目录").addText((text) =>
			text
				.setPlaceholder("目标/进度记录")
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
			.setDesc("新建目标时默认使用的周期类型")
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
			.setDesc("当当前值或目标值更新时自动重算进度，关闭后可手动设置进度")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoComputeProgress)
					.onChange(async (value) => {
						this.plugin.settings.autoComputeProgress = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("启动时打开仪表盘")
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
