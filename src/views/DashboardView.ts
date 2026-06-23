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
import { PostponeObjectiveModal } from "../modals/PostponeObjectiveModal";
import { KeyResult, Objective } from "../types";
import {
	getObjectiveDeadlineState,
	getObjectiveStatusLabel,
} from "../utils/objectiveStatus";
import { reorderKeyResultOrders } from "../utils/sort";

export const DASHBOARD_VIEW_TYPE = "okr-dashboard";

export class DashboardView extends ItemView {
	private currentPeriod: string;
	private objectives: Objective[] = [];
	private krsMap: Map<string, KeyResult[]> = new Map();
	private renderDebounceTimer: number | null = null;
	private collapsedObjs = new Set<string>();
	private draggingKR: {
		objectiveId: string;
		krId: string;
	} | null = null;

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
		return this.manager.getI18n().t("dashboard.title");
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
			this.renderOverdueReminder(container);
			this.renderList(container);
			this.renderFooter(container);
		} catch (error) {
			new Notice(
				error instanceof Error
					? this.t("dashboard.loadFailedWithReason", {
							message: error.message,
						})
					: this.t("dashboard.loadFailed"),
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
		left.createEl("span", {
			cls: "okr-title",
			text: this.t("common.okr"),
		});

		const right = toolbar.createDiv("okr-toolbar-right");
		const select = right.createEl("select", { cls: "okr-period-select" });
		if (periods.length === 0) {
			select.createEl("option", {
				value: "",
				text: this.t("dashboard.noPeriods"),
			});
			select.disabled = true;
		} else {
			for (const period of periods) {
				const option = select.createEl("option", {
					value: period,
					text: this.manager
						.getParser()
						.formatPeriodLabel(period, undefined, this.manager.getI18n()),
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
		addButton.setAttribute("title", this.t("actions.newObjective"));
		addButton.setAttribute("aria-label", this.t("actions.newObjective"));
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

		this.renderSummaryItem(
			summaryBar,
			String(totalObjectives),
			this.t("dashboard.objectives"),
		);
		summaryBar.createDiv("okr-summary-divider");
		this.renderSummaryItem(
			summaryBar,
			String(totalKeyResults),
			this.t("dashboard.keyResults"),
		);
		summaryBar.createDiv("okr-summary-divider");
		this.renderSummaryItem(
			summaryBar,
			`${averageProgress}%`,
			this.t("dashboard.averageProgress"),
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
		const deadlineState = getObjectiveDeadlineState(
			obj,
			undefined,
			this.manager.getI18n(),
		);
		if (deadlineState.tone === "overdue") {
			card.addClass("is-overdue");
		}
		card.setAttribute("data-obj-id", obj.id);

		const header = card.createDiv("okr-obj-header");
		const headerLeft = header.createDiv("okr-obj-header-left");

		const isCollapsed = this.collapsedObjs.has(obj.id);
		const collapseBtn = headerLeft.createEl("button", {
			cls: `okr-collapse-btn${isCollapsed ? " okr-collapsed" : ""}`,
		});
		collapseBtn.setAttribute(
			"aria-label",
			isCollapsed ? this.t("actions.expand") : this.t("actions.collapse"),
		);
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
				this.t("dashboard.objectiveFileMissing"),
			);
		});

		const headerRight = header.createDiv("okr-obj-header-right");
		headerRight.createEl("span", {
			cls: `okr-badge okr-status-${obj.status}`,
			text: getObjectiveStatusLabel(obj.status, this.manager.getI18n()),
		});
		headerRight.createEl("span", {
			cls: "okr-progress-num",
			text: `${obj.progress}%`,
		});
		const moreBtn = headerRight.createEl("button", {
			cls: "okr-btn-icon okr-more-btn",
			text: "⋯",
		});
		moreBtn.setAttribute("aria-label", this.t("actions.moreActions"));
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
		this.renderObjectiveDeadlineMeta(card, obj, deadlineState);

		const krList = card.createDiv("okr-kr-list");
		if (isCollapsed) {
			krList.addClass("is-collapsed");
		}

		const keyResults = this.krsMap.get(obj.id) ?? [];
		keyResults.forEach((keyResult, index) => {
			this.renderKRRow(krList, obj, keyResult, index);
		});

		const addKrRow = krList.createDiv("okr-add-kr-row");
		const addKrBtn = addKrRow.createEl("button", {
			cls: "okr-add-kr-btn",
			text: `＋ ${this.t("actions.addKeyResult")}`,
		});
		addKrBtn.addEventListener("click", () => {
			new NewKRModal(this.app, this.manager, {
				initialPeriod: this.currentPeriod,
				initialObjectiveId: obj.id,
			}).open();
		});
	}

	private renderKRRow(
		container: HTMLElement,
		objective: Objective,
		kr: KeyResult,
		index: number,
	): void {
		const row = container.createDiv("okr-kr-row");
		row.setAttribute("data-kr-id", kr.id);
		row.draggable = true;
		row.addEventListener("click", () => {
			void this.openFile(
				kr.filePath,
				this.t("dashboard.objectiveFileMissing"),
			);
		});

		const left = row.createDiv("okr-kr-row-left");
		const dragHandle = left.createDiv("okr-kr-drag-handle");
		dragHandle.setAttribute("aria-hidden", "true");
		setIcon(dragHandle, "grip-vertical");
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
				this.t("dashboard.objectiveFileMissing"),
			);
		});

		const right = row.createDiv("okr-kr-row-right");
		right.createEl("span", {
			cls: "okr-kr-value",
			text: `${kr.current} / ${kr.target}`,
		});
		this.renderProgressRing(right, kr.progress);
		right.createEl("span", { cls: "okr-kr-pct", text: `${kr.progress}%` });

		const checkInButton = right.createEl("button", {
			cls: "okr-checkin-btn",
			text: "↑",
		});
		checkInButton.setAttribute(
			"aria-label",
			this.t("actions.recordCheckIn"),
		);
		checkInButton.setAttribute("title", this.t("actions.recordCheckIn"));
		checkInButton.addEventListener("click", (event) => {
			event.stopPropagation();
			new CheckInModal(this.app, this.manager, {
				prefillKrId: kr.id,
			}).open();
		});

		const editButton = right.createEl("button", {
			cls: "okr-row-action-btn",
			text: this.t("actions.edit"),
		});
		editButton.setAttribute("aria-label", this.t("actions.editKeyResult"));
		editButton.addEventListener("click", (event) => {
			event.stopPropagation();
			new EditKRModal(this.app, this.manager, kr).open();
		});

		const deleteButton = right.createEl("button", {
			cls: "okr-row-action-btn okr-row-action-danger",
			text: this.t("actions.delete"),
		});
		deleteButton.setAttribute("aria-label", this.t("actions.delete"));
		deleteButton.addEventListener("click", (event) => {
			event.stopPropagation();
			new ConfirmModal(this.app, {
				title: `${this.t("actions.delete")} ${kr.id}`,
				message: this.t("detail.deleteKeyResultConfirm", {
					title: kr.title,
				}),
				confirmText: this.t("actions.delete"),
				errorNotice: this.t("detail.deleteKeyResultFailed", {
					title: kr.title,
				}),
				onConfirm: async () => {
					await this.manager.deleteKeyResult(kr.id, kr.period);
					new Notice(
						this.t("detail.deleteKeyResultSuccess", {
							title: kr.title,
						}),
					);
					this.scheduleRender();
				},
			}).open();
		});

		this.bindKRDragEvents(row, container, objective, kr, index);
	}

	private bindKRDragEvents(
		row: HTMLElement,
		container: HTMLElement,
		objective: Objective,
		kr: KeyResult,
		index: number,
	): void {
		row.addEventListener("dragstart", (event) => {
			this.draggingKR = {
				objectiveId: objective.id,
				krId: kr.id,
			};
			row.addClass("is-dragging");
			event.dataTransfer?.setData("text/plain", kr.id);
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = "move";
			}
		});

		row.addEventListener("dragover", (event) => {
			if (
				!this.draggingKR ||
				this.draggingKR.objectiveId !== objective.id ||
				this.draggingKR.krId === kr.id
			) {
				return;
			}

			event.preventDefault();
			this.clearDragIndicators();
			row.addClass(
				this.shouldInsertAfter(row, event)
					? "is-drop-after"
					: "is-drop-before",
			);
		});

		row.addEventListener("drop", (event) => {
			if (
				!this.draggingKR ||
				this.draggingKR.objectiveId !== objective.id ||
				this.draggingKR.krId === kr.id
			) {
				return;
			}

			event.preventDefault();
			const currentKeyResults = this.krsMap.get(objective.id) ?? [];
			const sourceIndex = currentKeyResults.findIndex(
				(item) => item.id === this.draggingKR?.krId,
			);
			if (sourceIndex === -1) {
				this.cleanupDragState();
				return;
			}

			const rawTargetIndex =
				index + (this.shouldInsertAfter(row, event) ? 1 : 0);
			const targetIndex =
				sourceIndex < rawTargetIndex
					? rawTargetIndex - 1
					: rawTargetIndex;
			if (targetIndex === sourceIndex) {
				this.cleanupDragState();
				return;
			}

			const previous = [...currentKeyResults];
			const reordered = reorderKeyResultOrders(
				currentKeyResults,
				sourceIndex,
				targetIndex,
			);
			const draggedKrId = this.draggingKR.krId;
			this.krsMap.set(objective.id, reordered);
			this.moveKRRowInDom(
				container,
				draggedKrId,
				kr.id,
				this.shouldInsertAfter(row, event),
			);
			this.cleanupDragState();
			void this.manager
				.reorderKeyResult(draggedKrId, objective.period, targetIndex)
				.then(() => {
					new Notice(this.t("dashboard.progressUpdated"));
					this.scheduleRender();
				})
				.catch((error: unknown) => {
					this.krsMap.set(objective.id, previous);
					const message =
						error instanceof Error
							? error.message
							: this.t("errors.unknown");
					new Notice(
						this.t("dashboard.progressUpdateFailed", { message }),
					);
					this.scheduleRender();
				});
		});

		row.addEventListener("dragend", () => {
			this.cleanupDragState();
		});
	}

	private shouldInsertAfter(row: HTMLElement, event: DragEvent): boolean {
		const rect = row.getBoundingClientRect();
		return event.clientY >= rect.top + rect.height / 2;
	}

	private clearDragIndicators(): void {
		this.containerEl
			.querySelectorAll<HTMLElement>(
				".okr-kr-row.is-dragging, .okr-kr-row.is-drop-before, .okr-kr-row.is-drop-after",
			)
			.forEach((element) => {
				element.removeClass(
					"is-dragging",
					"is-drop-before",
					"is-drop-after",
				);
			});
	}

	private cleanupDragState(): void {
		this.draggingKR = null;
		this.clearDragIndicators();
	}

	private moveKRRowInDom(
		container: HTMLElement,
		draggedKrId: string,
		targetKrId: string,
		insertAfter: boolean,
	): void {
		const draggedRow = container.querySelector<HTMLElement>(
			`[data-kr-id="${draggedKrId}"]`,
		);
		const targetRow = container.querySelector<HTMLElement>(
			`[data-kr-id="${targetKrId}"]`,
		);
		if (!draggedRow || !targetRow || draggedRow === targetRow) {
			return;
		}

		if (insertAfter) {
			container.insertBefore(draggedRow, targetRow.nextSibling);
			return;
		}

		container.insertBefore(draggedRow, targetRow);
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

	private renderProgressRing(
		container: HTMLElement,
		progress: number,
		size = 20,
		stroke = 3,
	): void {
		const radius = (size - stroke) / 2;
		const circumference = 2 * Math.PI * radius;
		const offset = circumference * (1 - progress / 100);
		const colorClass =
			progress >= 80
				? "okr-prog-high"
				: progress >= 40
					? "okr-prog-medium"
					: "okr-prog-low";

		const wrap = container.createDiv("okr-kr-ring-wrap");
		wrap.setAttribute("aria-hidden", "true");
		const svg = wrap.createSvg("svg", {
			cls: "okr-kr-ring-svg",
			attr: {
				width: size,
				height: size,
				viewBox: `0 0 ${size} ${size}`,
			},
		});
		svg.createSvg("circle", {
			cls: "okr-kr-ring-track",
			attr: {
				cx: size / 2,
				cy: size / 2,
				r: radius,
				fill: "none",
				"stroke-width": stroke,
			},
		});
		svg.createSvg("circle", {
			cls: ["okr-kr-ring-fill", colorClass],
			attr: {
				cx: size / 2,
				cy: size / 2,
				r: radius,
				fill: "none",
				"stroke-width": stroke,
				"stroke-dasharray": circumference.toFixed(2),
				"stroke-dashoffset": offset.toFixed(2),
				"stroke-linecap": "round",
				transform: `rotate(-90 ${size / 2} ${size / 2})`,
			},
		});
	}

	private renderEmptyState(container: HTMLElement): void {
		const empty = container.createDiv("okr-empty-state");
		empty.createEl("div", { cls: "okr-empty-icon", text: "◎" });
		empty.createEl("div", {
			cls: "okr-empty-text",
			text: this.t("dashboard.currentPeriodHasNoObjectives"),
		});
		const button = empty.createEl("button", {
			cls: "okr-empty-btn",
			text: `＋ ${this.t("actions.newObjective")}`,
		});
		button.addEventListener("click", () => this.openNewObjectiveModal());
	}

	private renderFooter(container: HTMLElement): void {
		const footer = container.createDiv("okr-footer");
		const button = footer.createEl("button", {
			cls: "okr-btn-primary okr-add-obj-btn",
			text: `＋ ${this.t("actions.newObjective")}`,
		});
		button.addEventListener("click", () => this.openNewObjectiveModal());
	}

	private renderErrorState(container: HTMLElement): void {
		const empty = container.createDiv("okr-empty-state");
		empty.createEl("div", { cls: "okr-empty-icon", text: "!" });
		empty.createEl("div", {
			cls: "okr-empty-text",
			text: this.t("dashboard.errorState"),
		});
	}

	private openNewObjectiveModal(): void {
		new NewObjectiveModal(this.app, this.manager).open();
	}

	private renderOverdueReminder(container: HTMLElement): void {
		const overdueObjectives = this.objectives.filter(
			(objective) =>
				getObjectiveDeadlineState(
					objective,
					undefined,
					this.manager.getI18n(),
				).tone === "overdue",
		);
		if (overdueObjectives.length === 0) {
			return;
		}

		const reminder = container.createDiv(
			"okr-deadline-reminder okr-deadline-reminder-overdue",
		);
		const titles = overdueObjectives
			.slice(0, 3)
			.map((objective) => objective.id)
			.join("、");
		const localizedTitles = titles
			? this.t("dashboard.overdueReminderTitles", { titles })
			: "";
		const localizedSuffix =
			overdueObjectives.length > 3
				? this.t("dashboard.overdueReminderSuffix")
				: "";
		reminder.createEl("span", {
			text: this.t("dashboard.overdueReminder", {
				count: overdueObjectives.length,
				titles: localizedTitles,
				suffix: localizedSuffix,
			}),
		});
	}

	private renderObjectiveDeadlineMeta(
		container: HTMLElement,
		objective: Objective,
		deadlineState: ReturnType<typeof getObjectiveDeadlineState>,
	): void {
		const meta = container.createDiv("okr-obj-meta");
		meta.createEl("span", {
			cls: "okr-obj-deadline-text",
			text: deadlineState.helpText ?? deadlineState.label,
		});
		if (deadlineState.tone !== "normal") {
			meta.createEl("span", {
				cls: `okr-badge okr-deadline-badge okr-deadline-${deadlineState.tone}`,
				text: deadlineState.label,
			});
		}
		if (deadlineState.showPostponeAction) {
			const postponeButton = meta.createEl("button", {
				cls: "okr-row-action-btn okr-row-action-quiet",
				text: this.t("actions.postpone"),
			});
			postponeButton.addEventListener("click", (event) => {
				event.stopPropagation();
				this.openPostponeObjectiveModal(objective);
			});
		}
	}

	private openObjectiveMenu(event: MouseEvent, objective: Objective): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle(this.t("actions.openDetails")).onClick(() => {
				void this.openFile(
					objective.filePath,
					this.t("dashboard.objectiveFileMissing"),
				);
			}),
		);
		if (
			getObjectiveDeadlineState(
				objective,
				undefined,
				this.manager.getI18n(),
			).showPostponeAction
		) {
			menu.addItem((item) =>
				item.setTitle(this.t("actions.postponeDueDate")).onClick(() => {
					this.openPostponeObjectiveModal(objective);
				}),
			);
		}
		menu.addItem((item) =>
			item.setTitle(this.t("actions.editObjective")).onClick(() => {
				new EditObjectiveModal(this.app, this.manager, objective).open();
			}),
		);
		menu.addItem((item) =>
			item.setTitle(this.t("actions.delete")).onClick(() => {
				new ConfirmModal(this.app, {
					title: `${this.t("actions.delete")} ${objective.id}`,
					message: this.t("detail.deleteObjectiveConfirm", {
						title: objective.title,
					}),
					confirmText: this.t("actions.delete"),
					errorNotice: this.t("detail.deleteObjectiveFailed", {
						title: objective.title,
					}),
					onConfirm: async () => {
						await this.manager.deleteObjective(
							objective.id,
							objective.period,
							true,
						);
						new Notice(
							this.t("detail.deleteObjectiveSuccess", {
								title: objective.title,
							}),
						);
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

	private openPostponeObjectiveModal(objective: Objective): void {
		new PostponeObjectiveModal(this.app, this.manager, objective).open();
	}

	private t(key: string, values?: Record<string, string | number>): string {
		return this.manager.getI18n().t(key, values);
	}
}
