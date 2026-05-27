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
		const t = this.plugin.i18n.t;
		containerEl.empty();
		new Setting(containerEl)
			.setName(t("settings.rootDir.name"))
			.setDesc(t("settings.rootDir.desc"))
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

		new Setting(containerEl)
			.setName(t("settings.defaultPeriodType.name"))
			.setDesc(t("settings.defaultPeriodType.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("week", t("modals.select.week"))
					.addOption("month", t("modals.select.month"))
					.addOption("quarter", t("modals.select.quarter"))
					.addOption("year", t("modals.select.year"))
					.setValue(this.plugin.settings.defaultPeriodType)
					.onChange(async (value) => {
						this.plugin.settings.defaultPeriodType =
							value as typeof this.plugin.settings.defaultPeriodType;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("settings.autoComputeProgress.name"))
			.setDesc(t("settings.autoComputeProgress.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoComputeProgress)
					.onChange(async (value) => {
						this.plugin.settings.autoComputeProgress = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("settings.showDashboardOnStartup.name"))
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
