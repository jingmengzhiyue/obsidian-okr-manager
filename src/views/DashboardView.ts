import {
	ItemView,
	Menu,
	Notice,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import { CheckInModal } from "../modals/CheckInModal";
import { ConfirmModal } from "../modals/ConfirmModal";
import { EditKRModal } from "../modals/EditKRModal";
import { EditObjectiveModal } from "../modals/EditObjectiveModal";
import { NewKRModal } from "../modals/NewKRModal";
import { NewObjectiveModal } from "../modals/NewObjectiveModal";
import { KeyResult, Objective } from "../types";

export const DASHBOARD_VIEW_TYPE = "okr-dashboard";

export class DashboardView extends ItemView {
	private currentPeriod: string;
	private objectives: Objective[] = [];
	private krsMap: Map<string, KeyResult[]> = new Map();
	private renderDebounceTimer: number | null = null;
	private collapsedObjs = new Set<string>();

	constructor(
		leaf: WorkspaceLeaf,
		private manager: OKRManager,
	) {
		super(leaf);
		this.currentPeriod = "";
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}
	getDisplayText(): string {
		return "仪表盘";
	}
	getIcon(): string {
		return "target";
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async onClose(): Promise<void> {
		if (this.renderDebounceTimer !== null) {
			window.clearTimeout(this.renderDebounceTimer);
			this.renderDebounceTimer = null;
		}
	}

	scheduleRender(): void {
		if (this.renderDebounceTimer !== null) {
			window.clearTimeout(this.renderDebounceTimer);
		}
		this.renderDebounceTimer = window.setTimeout(() => {
			this.renderDebounceTimer = null;
			void this.render();
		}, 150);
	}

	async render(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) {
			return;
		}

		container.empty();
		container.addClass("okr-dashboard");

		try {
			const periods = await this.manager.getAllPeriods();
			if (
				periods.length > 0 &&
				(!this.currentPeriod || !periods.includes(this.currentPeriod))
			) {
				this.currentPeriod = periods[periods.length - 1] ?? "";
			}

			await this.refreshData();
			this.renderToolbar(container, periods);
			this.renderSummaryBar(container);
			this.renderList(container);
			this.renderFooter(container);
		} catch (error) {
			new Notice(
				error instanceof Error
					? `加载仪表盘失败：${error.message}`
					: "加载仪表盘失败",
			);
			this.renderErrorState(container);
		}
	}

	private async refreshData(): Promise<void> {
		if (!this.currentPeriod) {
			this.objectives = [];
			this.krsMap.clear();
			return;
		}

		this.objectives = await this.manager.getObjectives(this.currentPeriod);
		this.krsMap.clear();
		for (const objective of this.objectives) {
			this.krsMap.set(objective.id, objective.keyResults);
		}
	}

	private renderToolbar(container: HTMLElement, periods: string[]): void {
		const toolbar = container.createDiv("okr-toolbar");
		const left = toolbar.createDiv("okr-toolbar-left");
		left.createEl("span", { cls: "okr-logo", text: "◎" });
		left.createEl("span", { cls: "okr-title", text: "OKR" });

		const right = toolbar.createDiv("okr-toolbar-right");
		const select = right.createEl("select", { cls: "okr-period-select" });
		if (periods.length === 0) {
			select.createEl("option", { value: "", text: "暂无周期" });
			select.disabled = true;
		} else {
			for (const period of periods) {
				const option = select.createEl("option", {
					value: period,
					text: this.manager.getParser().formatPeriodLabel(period),
				});
				option.selected = period === this.currentPeriod;
			}
			select.addEventListener("change", (event) => {
				this.currentPeriod = (event.target as HTMLSelectElement).value;
				this.scheduleRender();
			});
		}

		const addButton = right.createEl("button", {
			cls: "okr-btn-icon",
			text: "＋",
		});
		addButton.setAttribute("title", "新建目标");
		addButton.setAttribute("aria-label", "新建目标");
		addButton.addEventListener("click", () => this.openNewObjectiveModal());
	}

	private renderSummaryBar(container: HTMLElement): void {
		const summaryBar = container.createDiv("okr-summary-bar");
		const totalObjectives = this.objectives.length;
		const totalKeyResults = [...this.krsMap.values()].reduce(
			(sum, keyResults) => sum + keyResults.length,
			0,
		);
		const averageProgress =
			totalObjectives === 0
				? 0
				: Math.round(
						this.objectives.reduce(
							(sum, objective) => sum + objective.progress,
							0,
						) / totalObjectives,
					);

		this.renderSummaryItem(summaryBar, String(totalObjectives), "目标");
		summaryBar.createDiv("okr-summary-divider");
		this.renderSummaryItem(summaryBar, String(totalKeyResults), "关键结果");
		summaryBar.createDiv("okr-summary-divider");
		this.renderSummaryItem(
			summaryBar,
			`${averageProgress}%`,
			"平均进度",
			true,
		);
	}

	private renderSummaryItem(
		container: HTMLElement,
		value: string,
		label: string,
		accent = false,
	): void {
		const item = container.createDiv("okr-summary-item");
		item.createEl("span", {
			cls: accent ? "okr-summary-num okr-num-accent" : "okr-summary-num",
			text: value,
		});
		item.createEl("span", { cls: "okr-summary-label", text: label });
	}

	private renderList(container: HTMLElement): void {
		const list = container.createDiv("okr-list");
		if (this.objectives.length === 0) {
			this.renderEmptyState(list);
			return;
		}

		for (const objective of this.objectives) {
			this.renderObjectiveCard(list, objective);
		}
	}

	private renderObjectiveCard(container: HTMLElement, obj: Objective): void {
		const card = container.createDiv("okr-obj-card");
		card.setAttribute("data-obj-id", obj.id);

		const header = card.createDiv("okr-obj-header");
		const headerLeft = header.createDiv("okr-obj-header-left");

		const isCollapsed = this.collapsedObjs.has(obj.id);
		const collapseBtn = headerLeft.createEl("button", {
			cls: `okr-collapse-btn${isCollapsed ? " okr-collapsed" : ""}`,
		});
		collapseBtn.setAttribute("aria-label", isCollapsed ? "展开" : "折叠");
		setIcon(collapseBtn, "chevron-right");
		collapseBtn.addEventListener("click", (event) => {
			event.stopPropagation();
			if (this.collapsedObjs.has(obj.id)) {
				this.collapsedObjs.delete(obj.id);
			} else {
				this.collapsedObjs.add(obj.id);
			}
			this.scheduleRender();
		});

		headerLeft.createEl("span", { cls: "okr-obj-id", text: obj.id });
		const title = headerLeft.createEl("span", {
			cls: "okr-obj-title",
			text: obj.title,
		});
		title.addEventListener("click", () => {
			void this.openFile(
				obj.filePath,
				"Objective 文件不存在，可能已被手动删除",
			);
		});

		const headerRight = header.createDiv("okr-obj-header-right");
		const statusMap: Record<string, string> = {
			active: "进行中",
			completed: "已完成",
			cancelled: "已取消",
			"on-hold": "暂停中",
		};
		headerRight.createEl("span", {
			cls: `okr-badge okr-status-${obj.status}`,
			text: statusMap[obj.status] ?? obj.status,
		});
		headerRight.createEl("span", {
			cls: "okr-progress-num",
			text: `${obj.progress}%`,
		});
		const moreBtn = headerRight.createEl("button", {
			cls: "okr-btn-icon okr-more-btn",
			text: "⋯",
		});
		moreBtn.setAttribute("aria-label", "更多操作");
		moreBtn.addEventListener("click", (event) => {
			event.stopPropagation();
			this.openObjectiveMenu(event, obj);
		});

		this.renderProgressBar(
			card,
			obj.progress,
			"okr-obj-progress-wrap",
			"okr-obj-progress-track",
			"okr-obj-progress-fill",
		);

		const krList = card.createDiv("okr-kr-list");
		if (isCollapsed) {
			krList.addClass("is-collapsed");
		}

		const keyResults = this.krsMap.get(obj.id) ?? [];
		keyResults.forEach((keyResult, index) => {
			this.renderKRRow(krList, keyResult, index, keyResults.length);
		});

		const addKrRow = krList.createDiv("okr-add-kr-row");
		const addKrBtn = addKrRow.createEl("button", {
			cls: "okr-add-kr-btn",
			text: "＋ 添加关键结果",
		});
		addKrBtn.addEventListener("click", () => {
			new NewKRModal(this.app, this.manager, {
				initialPeriod: this.currentPeriod,
				initialObjectiveId: obj.id,
				onComplete: () => this.scheduleRender(),
			}).open();
		});
	}

	private renderKRRow(
		container: HTMLElement,
		kr: KeyResult,
		index: number,
		total: number,
	): void {
		const row = container.createDiv("okr-kr-row");
		row.setAttribute("data-kr-id", kr.id);
		row.addEventListener("click", () => {
			void this.openFile(
				kr.filePath,
				"所属 Objective 文件不存在，可能已被手动删除",
			);
		});

		const left = row.createDiv("okr-kr-row-left");
		left.createEl("span", {
			cls: `okr-kr-dot okr-conf-${kr.confidence}`,
			text: "●",
		});
		const title = left.createEl("span", {
			cls: "okr-kr-title",
			text: kr.title,
		});
		title.addEventListener("click", (event) => {
			event.stopPropagation();
			void this.openFile(
				kr.filePath,
				"所属 Objective 文件不存在，可能已被手动删除",
			);
		});

		const right = row.createDiv("okr-kr-row-right");
		right.createEl("span", {
			cls: "okr-kr-value",
			text: `${kr.current} / ${kr.target}`,
		});
		this.renderProgressBar(
			right,
			kr.progress,
			undefined,
			"okr-kr-bar-wrap",
			"okr-kr-bar-fill",
		);
		right.createEl("span", { cls: "okr-kr-pct", text: `${kr.progress}%` });

		const checkInButton = right.createEl("button", {
			cls: "okr-checkin-btn",
			text: "↑",
		});
		checkInButton.setAttribute("aria-label", "记录进度");
		checkInButton.setAttribute("title", "记录进度");
		checkInButton.addEventListener("click", (event) => {
			event.stopPropagation();
			new CheckInModal(this.app, this.manager, {
				prefillKrId: kr.id,
				onComplete: () => this.scheduleRender(),
			}).open();
		});

		const editButton = right.createEl("button", {
			cls: "okr-row-action-btn",
			text: "编辑",
		});
		editButton.setAttribute("aria-label", "编辑关键结果");
		editButton.addEventListener("click", (event) => {
			event.stopPropagation();
			new EditKRModal(this.app, this.manager, kr, {
				onComplete: () => this.scheduleRender(),
			}).open();
		});

		const moveUpButton = right.createEl("button", {
			cls: "okr-row-action-btn",
			text: "上移",
		});
		moveUpButton.setAttribute("aria-label", "上移关键结果");
		moveUpButton.disabled = index === 0;
		moveUpButton.addEventListener("click", (event) => {
			event.stopPropagation();
			void this.manager
				.moveKeyResult(kr.id, kr.period, "up")
				.then(() => {
					new Notice("已上移关键结果");
					this.scheduleRender();
				})
				.catch((error: unknown) => {
					const message =
						error instanceof Error ? error.message : "未知错误";
					new Notice(`上移关键结果失败：${message}`);
				});
		});

		const moveDownButton = right.createEl("button", {
			cls: "okr-row-action-btn",
			text: "下移",
		});
		moveDownButton.setAttribute("aria-label", "下移关键结果");
		moveDownButton.disabled = index === total - 1;
		moveDownButton.addEventListener("click", (event) => {
			event.stopPropagation();
			void this.manager
				.moveKeyResult(kr.id, kr.period, "down")
				.then(() => {
					new Notice("已下移关键结果");
					this.scheduleRender();
				})
				.catch((error: unknown) => {
					const message =
						error instanceof Error ? error.message : "未知错误";
					new Notice(`下移关键结果失败：${message}`);
				});
		});

		const deleteButton = right.createEl("button", {
			cls: "okr-row-action-btn okr-row-action-danger",
			text: "删除",
		});
		deleteButton.setAttribute("aria-label", "删除关键结果");
		deleteButton.addEventListener("click", (event) => {
			event.stopPropagation();
			new ConfirmModal(this.app, {
				title: `删除 ${kr.id}`,
				message: `确认删除关键结果「${kr.title}」及其全部进度记录吗？`,
				confirmText: "删除",
				errorNotice: `删除关键结果失败：${kr.title}`,
				onConfirm: async () => {
					await this.manager.deleteKeyResult(kr.id, kr.period);
					new Notice(`已删除关键结果：${kr.title}`);
					this.scheduleRender();
				},
			}).open();
		});
	}

	private renderProgressBar(
		container: HTMLElement,
		progress: number,
		wrapClass: string | undefined,
		trackClass: string,
		fillClass: string,
	): void {
		const wrap = wrapClass ? container.createDiv(wrapClass) : container;
		const track = wrap.createDiv(trackClass);
		const fill = track.createDiv(fillClass);
		fill.style.width = `${progress}%`;
		fill.addClass(
			progress >= 80
				? "okr-prog-high"
				: progress >= 40
					? "okr-prog-medium"
					: "okr-prog-low",
		);
	}

	private renderEmptyState(container: HTMLElement): void {
		const empty = container.createDiv("okr-empty-state");
		empty.createEl("div", { cls: "okr-empty-icon", text: "◎" });
		empty.createEl("div", {
			cls: "okr-empty-text",
			text: "当前周期暂无目标\n点击下方按钮创建第一个目标",
		});
		const button = empty.createEl("button", {
			cls: "okr-empty-btn",
			text: "＋ 新建目标",
		});
		button.addEventListener("click", () => this.openNewObjectiveModal());
	}

	private renderFooter(container: HTMLElement): void {
		const footer = container.createDiv("okr-footer");
		const button = footer.createEl("button", {
			cls: "okr-btn-primary okr-add-obj-btn",
			text: "＋ 新建目标",
		});
		button.addEventListener("click", () => this.openNewObjectiveModal());
	}

	private renderErrorState(container: HTMLElement): void {
		const empty = container.createDiv("okr-empty-state");
		empty.createEl("div", { cls: "okr-empty-icon", text: "!" });
		empty.createEl("div", {
			cls: "okr-empty-text",
			text: "仪表盘加载失败\n请稍后重试或检查控制台日志",
		});
	}

	private openNewObjectiveModal(): void {
		new NewObjectiveModal(this.app, this.manager, () =>
			this.scheduleRender(),
		).open();
	}

	private openObjectiveMenu(event: MouseEvent, objective: Objective): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle("打开详情").onClick(() => {
				void this.openFile(
					objective.filePath,
					"Objective 文件不存在，可能已被手动删除",
				);
			}),
		);
		menu.addItem((item) =>
			item.setTitle("编辑目标").onClick(() => {
				new EditObjectiveModal(this.app, this.manager, objective, {
					onComplete: () => this.scheduleRender(),
				}).open();
			}),
		);
		menu.addItem((item) =>
			item.setTitle("删除目标").onClick(() => {
				new ConfirmModal(this.app, {
					title: `删除 ${objective.id}`,
					message: `确认删除目标「${objective.title}」、其全部关键结果以及关联进度记录吗？`,
					confirmText: "删除",
					errorNotice: `删除目标失败：${objective.title}`,
					onConfirm: async () => {
						await this.manager.deleteObjective(
							objective.id,
							objective.period,
							true,
						);
						new Notice(`已删除目标：${objective.title}`);
						this.scheduleRender();
					},
				}).open();
			}),
		);
		menu.showAtMouseEvent(event);
	}

	private async openFile(
		filePath: string,
		missingMessage: string,
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			new Notice(missingMessage);
			this.scheduleRender();
			return;
		}

		await this.app.workspace.getLeaf().openFile(file);
	}

	refresh(): void {
		this.scheduleRender();
	}
}
