import {
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
	normalizePath,
} from "obsidian";
import { type I18n } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { CheckInModal } from "../modals/CheckInModal";
import { ConfirmModal } from "../modals/ConfirmModal";
import { EditKRModal } from "../modals/EditKRModal";
import { EditObjectiveModal } from "../modals/EditObjectiveModal";
import { NewKRModal } from "../modals/NewKRModal";
import { PostponeObjectiveModal } from "../modals/PostponeObjectiveModal";
import { KeyResult, Objective } from "../types";
import { DASHBOARD_VIEW_TYPE } from "./DashboardView";
import { getObjectiveDeadlineState } from "../utils/objectiveStatus";
import {
	FRONTMATTER_OKR_ID,
	FRONTMATTER_OKR_PERIOD,
	FRONTMATTER_OKR_TYPE,
	OKR_KR_LIST_END,
	OKR_KR_LIST_START,
	OKR_TYPE_OBJECTIVE,
} from "../constants";
import { shouldRefreshActivePreview } from "../utils/previewRefresh";
import { revealLeafCompat } from "../utils/workspace";

export class OKRDetailRenderer {
	static postProcessor(
		manager: OKRManager,
	): (el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<void> {
		return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			const doc = el.doc;
			const filePath = normalizePath(ctx.sourcePath);
			const rootDir = normalizePath(manager.getSettings().rootDir);
			if (!filePath.startsWith(`${rootDir}/`)) {
				return;
			}

			const fm = manager
				.getApp()
				.metadataCache.getCache(filePath)?.frontmatter;
			if (!fm?.[FRONTMATTER_OKR_TYPE]) {
				return;
			}

			const type = String(fm[FRONTMATTER_OKR_TYPE]);
			if (type === OKR_TYPE_OBJECTIVE) {
				const objId = String(fm[FRONTMATTER_OKR_ID] ?? "");
				const period = String(fm[FRONTMATTER_OKR_PERIOD] ?? "");
				const objective = (await manager.getObjectives(period)).find(
					(item) => item.id === objId,
				);
				const section = this.renderObjectiveSection(
					manager.getI18n(),
					objective ?? {
						id: objId,
						title: objId,
						period,
						periodType: manager.getParser().inferPeriodType(period),
						description: "",
						owner: "",
						status: "active",
						progress: 0,
						created: "",
						due: "",
						filePath,
						keyResults: [],
					},
					doc,
				);
				this.replaceCommentBlock(
					el,
					OKR_KR_LIST_START,
					OKR_KR_LIST_END,
					section,
				);
			}

			const rerenderCurrentPreview = (): void => {
				void this.refreshPreview(manager, ctx.sourcePath);
			};

			el.querySelectorAll<HTMLButtonElement>(
				".okr-inline-move-up-btn",
			).forEach((button) => {
				button.addEventListener("click", () => {
					const krId = button.dataset.krId ?? "";
					const period = button.dataset.period ?? "";
					if (!krId || !period) {
						return;
					}

					void manager
						.moveKeyResult(krId, period, "up")
						.then(async () => {
							new Notice(
								manager.getI18n().t("detail.keyResultMovedUp"),
							);
							await this.refreshPreview(manager, ctx.sourcePath);
						})
						.catch((error: unknown) => {
							const message =
								error instanceof Error
									? error.message
									: manager.getI18n().t("errors.unknown");
							new Notice(
								manager
									.getI18n()
									.t("detail.keyResultMovedUpFailed", {
										message,
									}),
							);
						});
				});
			});

			el.querySelectorAll<HTMLButtonElement>(
				".okr-inline-move-down-btn",
			).forEach((button) => {
				button.addEventListener("click", () => {
					const krId = button.dataset.krId ?? "";
					const period = button.dataset.period ?? "";
					if (!krId || !period) {
						return;
					}

					void manager
						.moveKeyResult(krId, period, "down")
						.then(async () => {
							new Notice(
								manager
									.getI18n()
									.t("detail.keyResultMovedDown"),
							);
							await this.refreshPreview(manager, ctx.sourcePath);
						})
						.catch((error: unknown) => {
							const message =
								error instanceof Error
									? error.message
									: manager.getI18n().t("errors.unknown");
							new Notice(
								manager
									.getI18n()
									.t("detail.keyResultMovedDownFailed", {
										message,
									}),
							);
						});
				});
			});

			el.querySelectorAll<HTMLButtonElement>(
				".okr-inline-checkin-btn",
			).forEach((button) => {
				button.addEventListener("click", () => {
					const krId = button.dataset.krId ?? "";
					if (!krId) {
						return;
					}

					new CheckInModal(manager.getApp(), manager, {
						prefillKrId: krId,
						prefillPeriod: button.dataset.period ?? "",
						onComplete: rerenderCurrentPreview,
					}).open();
				});
			});

			el.querySelectorAll<HTMLButtonElement>(
				".okr-inline-edit-kr-btn",
			).forEach((button) => {
				button.addEventListener("click", () => {
					const krId = button.dataset.krId ?? "";
					if (!krId) {
						return;
					}

					const period = String(fm[FRONTMATTER_OKR_PERIOD] ?? "");
					void manager.getAllKeyResults(period).then((krs) => {
						const keyResult = krs.find((item) => item.id === krId);
						if (!keyResult) {
							new Notice(
								manager
									.getI18n()
									.t("detail.editKeyResultMissing"),
							);
							return;
						}

						new EditKRModal(
							manager.getApp(),
							manager,
							keyResult,
							{ onComplete: rerenderCurrentPreview },
						).open();
					});
				});
			});

			el.querySelectorAll<HTMLButtonElement>(
				".okr-inline-delete-kr-btn",
			).forEach((button) => {
				button.addEventListener("click", () => {
					const krId = button.dataset.krId ?? "";
					const krTitle = button.dataset.krTitle ?? krId;
					const period = String(fm[FRONTMATTER_OKR_PERIOD] ?? "");
					if (!krId) {
						return;
					}

					new ConfirmModal(manager.getApp(), {
						title: `${manager.getI18n().t("actions.delete")} ${krId}`,
						message: manager
							.getI18n()
							.t("detail.deleteKeyResultConfirm", {
								title: krTitle,
							}),
						confirmText: manager.getI18n().t("actions.delete"),
						errorNotice: manager
							.getI18n()
							.t("detail.deleteKeyResultFailed", {
								title: krTitle,
							}),
						onConfirm: async () => {
							await manager.deleteKeyResult(krId, period);
							await this.refreshPreview(manager, ctx.sourcePath);
							new Notice(
								manager
									.getI18n()
									.t("detail.deleteKeyResultSuccess", {
										title: krTitle,
									}),
							);
						},
					}).open();
				});
			});

			el.querySelectorAll<HTMLButtonElement>(
				".okr-inline-edit-objective-btn",
			).forEach((button) => {
				button.addEventListener("click", () => {
					const objectiveId = button.dataset.objectiveId ?? "";
					const period = button.dataset.period ?? "";
					if (!objectiveId || !period) {
						return;
					}

					void manager.getObjectives(period).then((objectives) => {
						const objective = objectives.find(
							(item) => item.id === objectiveId,
						);
						if (!objective) {
							new Notice(
								manager
									.getI18n()
									.t("detail.editObjectiveMissing"),
							);
							return;
						}

						new EditObjectiveModal(
							manager.getApp(),
							manager,
							objective,
							{ onComplete: rerenderCurrentPreview },
						).open();
					});
				});
			});

			el.querySelectorAll<HTMLButtonElement>(
				".okr-inline-delete-objective-btn",
			).forEach((button) => {
				button.addEventListener("click", () => {
					const objectiveId = button.dataset.objectiveId ?? "";
					const period = button.dataset.period ?? "";
					const objectiveTitle =
						button.dataset.objectiveTitle ?? objectiveId;
					if (!objectiveId || !period) {
						return;
					}

					new ConfirmModal(manager.getApp(), {
						title: `${manager.getI18n().t("actions.delete")} ${objectiveId}`,
						message: manager
							.getI18n()
							.t("detail.deleteObjectiveConfirm", {
								title: objectiveTitle,
							}),
						confirmText: manager.getI18n().t("actions.delete"),
						errorNotice: manager
							.getI18n()
							.t("detail.deleteObjectiveFailed", {
								title: objectiveTitle,
							}),
						onConfirm: async () => {
							await manager.deleteObjective(
								objectiveId,
								period,
								true,
							);
							await this.refreshPreview(manager, ctx.sourcePath);
							new Notice(
								manager
									.getI18n()
									.t("detail.deleteObjectiveSuccess", {
										title: objectiveTitle,
									}),
							);
						},
					}).open();
				});
			});

			el.querySelectorAll<HTMLButtonElement>(
				".okr-inline-add-kr-btn",
			).forEach((button) => {
				button.addEventListener("click", () => {
					const objectiveId = button.dataset.objectiveId ?? "";
					const period = button.dataset.period ?? "";
					new NewKRModal(manager.getApp(), manager, {
						initialPeriod: period,
						initialObjectiveId: objectiveId,
						onComplete: rerenderCurrentPreview,
					}).open();
				});
			});

			el.querySelectorAll<HTMLButtonElement>(
				".okr-inline-postpone-objective-btn",
			).forEach((button) => {
				button.addEventListener("click", () => {
					const objectiveId = button.dataset.objectiveId ?? "";
					const period = button.dataset.period ?? "";
					if (!objectiveId || !period) {
						return;
					}

					void manager.getObjectives(period).then((objectives) => {
						const objective = objectives.find(
							(item) => item.id === objectiveId,
						);
						if (!objective) {
							new Notice(
								manager
									.getI18n()
									.t("detail.postponeObjectiveMissing"),
							);
							return;
						}

						new PostponeObjectiveModal(
							manager.getApp(),
							manager,
							objective,
							{ onComplete: rerenderCurrentPreview },
						).open();
					});
				});
			});

			el.querySelectorAll<HTMLButtonElement>(
				".okr-inline-open-dashboard-btn",
			).forEach((button) => {
				button.addEventListener("click", () => {
					void this.openDashboard(manager);
				});
			});
		};
	}

	private static renderObjectiveSection(
		i18n: I18n,
		objective: Objective,
		doc: Document,
	): DocumentFragment {
		const fragment = doc.createDocumentFragment();
		const deadlineState = getObjectiveDeadlineState(
			objective,
			undefined,
			i18n,
		);
		fragment.appendChild(
			this.renderObjectiveActionBar(objective, deadlineState, i18n, doc),
		);
		if (deadlineState.tone !== "normal") {
			fragment.appendChild(
				this.renderObjectiveDeadlineBanner(
					objective,
					deadlineState,
					i18n,
					doc,
				),
			);
		}

		const table = doc.createElement("table");
		table.className = "okr-inline-kr-table";
		const thead = table.createEl("thead");
		const headRow = thead.createEl("tr");
		for (const header of [
			i18n.t("detail.index"),
			i18n.t("detail.title"),
			i18n.t("detail.owner"),
			i18n.t("detail.progress"),
			i18n.t("detail.progressPercent"),
			i18n.t("detail.confidence"),
			i18n.t("detail.dueDate"),
			i18n.t("detail.actions"),
		]) {
			headRow.createEl("th", { text: header });
		}

		const tbody = table.createEl("tbody");
		if (objective.keyResults.length === 0) {
			const row = tbody.createEl("tr");
			const cell = row.createEl("td", {
				text: i18n.t("detail.emptyKeyResults"),
			});
			cell.setAttribute("colspan", "8");
		} else {
			objective.keyResults.forEach((kr, index) => {
				tbody.appendChild(
					this.renderKRTableRow(
						kr,
						index + 1,
						objective.keyResults.length,
						i18n,
						doc,
					),
				);
			});
		}

		fragment.appendChild(table);
		return fragment;
	}

	private static renderKRTableRow(
		kr: KeyResult,
		index: number,
		total: number,
		i18n: I18n,
		doc: Document,
	): HTMLTableRowElement {
		const progressClass =
			kr.progress >= 80
				? "okr-prog-high"
				: kr.progress >= 40
					? "okr-prog-medium"
					: "okr-prog-low";
		const row = doc.createElement("tr");
		row.createEl("td", { text: String(index) });
		row.createEl("td", { text: kr.title });
		row.createEl("td", { text: kr.owner || "-" });

		const progressCell = row.createEl("td");
		const progressTrack = progressCell.createDiv(
			"okr-inline-progress-track",
		);
		const progressFill = progressTrack.createDiv(
			`okr-inline-progress-fill ${progressClass}`,
		);
		progressFill.setAttribute("style", `width:${kr.progress}%`);

		row.createEl("td", { text: `${kr.progress}%` });

		const confidenceCell = row.createEl("td");
		confidenceCell.createEl("span", {
			cls: `okr-kr-dot okr-conf-${kr.confidence}`,
			text: "●",
		});
		confidenceCell.append(` ${i18n.t(`confidence.${kr.confidence}`)}`);

		row.createEl("td", { text: kr.due || "-" });

		const actionCell = row.createEl("td");
		const actions = actionCell.createDiv("okr-inline-actions");
		actions.appendChild(
			this.createActionButton(
				i18n.t("actions.recordCheckIn"),
				"okr-inline-action-btn okr-inline-checkin-btn",
				doc,
				{ krId: kr.id, period: kr.period },
			),
		);
		actions.appendChild(
			this.createActionButton(
				i18n.t("actions.edit"),
				"okr-inline-action-btn okr-inline-edit-kr-btn",
				doc,
				{ krId: kr.id },
			),
		);
		const moveUpButton = this.createActionButton(
			i18n.t("actions.moveUp"),
			"okr-inline-action-btn okr-inline-move-up-btn",
			doc,
			{ krId: kr.id, period: kr.period },
		);
		moveUpButton.disabled = index === 1;
		actions.appendChild(moveUpButton);
		const moveDownButton = this.createActionButton(
			i18n.t("actions.moveDown"),
			"okr-inline-action-btn okr-inline-move-down-btn",
			doc,
			{ krId: kr.id, period: kr.period },
		);
		moveDownButton.disabled = index === total;
		actions.appendChild(moveDownButton);
		actions.appendChild(
			this.createActionButton(
				i18n.t("actions.delete"),
				"okr-inline-action-btn okr-inline-action-danger okr-inline-delete-kr-btn",
				doc,
				{ krId: kr.id, krTitle: kr.title },
			),
		);

		return row;
	}

	private static renderObjectiveActionBar(
		objective: Objective,
		deadlineState: ReturnType<typeof getObjectiveDeadlineState>,
		i18n: I18n,
		doc: Document,
	): HTMLDivElement {
		const bar = doc.createElement("div");
		bar.className = "okr-inline-action-bar";
		const summary = doc.createElement("div");
		summary.className = "okr-inline-objective-meta";
		summary.createEl("span", {
			text: deadlineState.helpText ?? deadlineState.label,
		});
		if (deadlineState.tone !== "normal") {
			summary.createEl("span", {
				cls: `okr-badge okr-deadline-badge okr-deadline-${deadlineState.tone}`,
				text: deadlineState.label,
			});
		}
		bar.appendChild(summary);
		bar.appendChild(
			this.createActionButton(
				i18n.t("actions.openDashboard"),
				"okr-inline-action-btn okr-inline-open-dashboard-btn",
				doc,
			),
		);
		bar.appendChild(
			this.createActionButton(
				i18n.t("actions.addKeyResult"),
				"okr-inline-action-btn okr-inline-add-kr-btn",
				doc,
				{
					objectiveId: objective.id,
					period: objective.period,
				},
			),
		);
		if (deadlineState.showPostponeAction) {
			bar.appendChild(
				this.createActionButton(
					i18n.t("actions.postpone"),
					"okr-inline-action-btn okr-inline-postpone-objective-btn",
					doc,
					{
						objectiveId: objective.id,
						period: objective.period,
					},
				),
			);
		}
		bar.appendChild(
			this.createActionButton(
				i18n.t("actions.editObjective"),
				"okr-inline-action-btn okr-inline-edit-objective-btn",
				doc,
				{
					objectiveId: objective.id,
					period: objective.period,
				},
			),
		);
		bar.appendChild(
			this.createActionButton(
				i18n.t("actions.delete"),
				"okr-inline-action-btn okr-inline-action-danger okr-inline-delete-objective-btn",
				doc,
				{
					objectiveId: objective.id,
					objectiveTitle: objective.title,
					period: objective.period,
				},
			),
		);
		return bar;
	}

	private static renderObjectiveDeadlineBanner(
		objective: Objective,
		deadlineState: ReturnType<typeof getObjectiveDeadlineState>,
		i18n: I18n,
		doc: Document,
	): HTMLDivElement {
		const banner = doc.createElement("div");
		banner.className = `okr-inline-objective-alert okr-inline-objective-alert-${deadlineState.tone}`;
		banner.createEl("strong", {
			text: `${objective.id} ${deadlineState.label}`,
		});
		banner.createEl("span", {
			text:
				deadlineState.helpText ??
				i18n.t("modals.postpone.hint", { title: objective.title }),
		});
		return banner;
	}

	private static replaceCommentBlock(
		container: HTMLElement,
		start: string,
		end: string,
		replacement: DocumentFragment,
	): void {
		const startComment = this.findCommentNode(container, start);
		const endComment = this.findCommentNode(container, end);
		if (
			!startComment ||
			!endComment ||
			startComment.parentNode !== endComment.parentNode ||
			!startComment.parentNode
		) {
			return;
		}

		const parent = startComment.parentNode;
		const nextSibling = endComment.nextSibling;
		let current: ChildNode | null = startComment;
		while (current) {
			const target = current;
			current = current.nextSibling;
			parent.removeChild(target);
			if (target === endComment) {
				break;
			}
		}

		parent.insertBefore(replacement, nextSibling);
	}

	private static createActionButton(
		text: string,
		className: string,
		doc: Document,
		dataset: Record<string, string> = {},
	): HTMLButtonElement {
		const button = doc.createElement("button");
		button.className = className;
		button.type = "button";
		button.textContent = text;
		Object.entries(dataset).forEach(([key, value]) => {
			button.dataset[key] = value;
		});
		return button;
	}

	private static findCommentNode(
		container: HTMLElement,
		marker: string,
	): Comment | null {
		const token = marker
			.replace(/^<!--\s*/, "")
			.replace(/\s*-->$/, "")
			.trim();
		const nodeFilter =
			container.doc.defaultView?.NodeFilter ?? NodeFilter;
		const walker = container.doc.createTreeWalker(
			container,
			nodeFilter.SHOW_COMMENT,
		);
		let current = walker.nextNode();
		while (current) {
			const comment = current as Comment;
			if (comment.data.trim() === token) {
				return comment;
			}
			current = walker.nextNode();
		}
		return null;
	}

	private static async openDashboard(manager: OKRManager): Promise<void> {
		const app = manager.getApp();
		let leaf = app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = app.workspace.getRightLeaf(false) ?? undefined;
			if (!leaf) {
				return;
			}

			await leaf.setViewState({
				type: DASHBOARD_VIEW_TYPE,
				active: true,
			});
		}

		await revealLeafCompat(app.workspace, leaf);
	}

	private static async refreshPreview(
		manager: OKRManager,
		sourcePath: string,
	): Promise<void> {
		const view = manager
			.getApp()
			.workspace.getActiveViewOfType(MarkdownView);
		if (
			shouldRefreshActivePreview(view?.file?.path ?? null, sourcePath)
		) {
			view?.previewMode.rerender(true);
		}
	}
}
