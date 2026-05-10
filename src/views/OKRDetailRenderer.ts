import { MarkdownPostProcessorContext, Notice, normalizePath } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import { CheckInModal } from "../modals/CheckInModal";
import { ConfirmModal } from "../modals/ConfirmModal";
import { EditKRModal } from "../modals/EditKRModal";
import { EditObjectiveModal } from "../modals/EditObjectiveModal";
import { NewKRModal } from "../modals/NewKRModal";
import { KeyResult } from "../types";
import { DASHBOARD_VIEW_TYPE } from "./DashboardView";
import {
	FRONTMATTER_OKR_ID,
	FRONTMATTER_OKR_PERIOD,
	FRONTMATTER_OKR_TYPE,
	OKR_KR_LIST_END,
	OKR_KR_LIST_START,
	OKR_TYPE_OBJECTIVE,
} from "../constants";

export class OKRDetailRenderer {
	static postProcessor(
		manager: OKRManager,
	): (el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<void> {
		return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
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
				const krs = objective?.keyResults ?? [];
				const section = this.renderObjectiveSection(
					objective?.id ?? objId,
					objective?.title ?? objId,
					period,
					krs,
				);
				this.replaceCommentBlock(
					el,
					OKR_KR_LIST_START,
					OKR_KR_LIST_END,
					section,
				);
			}

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
							new Notice("找不到要编辑的关键结果");
							return;
						}

						new EditKRModal(
							manager.getApp(),
							manager,
							keyResult,
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
						title: `删除 ${krId}`,
						message: `确认删除关键结果「${krTitle}」及其全部进度记录吗？`,
						confirmText: "删除",
						errorNotice: `删除关键结果失败：${krTitle}`,
						onConfirm: async () => {
							await manager.deleteKeyResult(krId, period);
							new Notice(`已删除关键结果：${krTitle}`);
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
							new Notice("找不到要编辑的目标");
							return;
						}

						new EditObjectiveModal(
							manager.getApp(),
							manager,
							objective,
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
						title: `删除 ${objectiveId}`,
						message: `确认删除目标「${objectiveTitle}」、其全部关键结果以及关联进度记录吗？`,
						confirmText: "删除",
						errorNotice: `删除目标失败：${objectiveTitle}`,
						onConfirm: async () => {
							await manager.deleteObjective(
								objectiveId,
								period,
								true,
							);
							new Notice(`已删除目标：${objectiveTitle}`);
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
					}).open();
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
		objectiveId: string,
		objectiveTitle: string,
		period: string,
		krs: KeyResult[],
	): DocumentFragment {
		const fragment = document.createDocumentFragment();
		fragment.appendChild(
			this.renderObjectiveActionBar(objectiveId, objectiveTitle, period),
		);

		const table = document.createElement("table");
		table.className = "okr-inline-kr-table";
		const thead = table.createEl("thead");
		const headRow = thead.createEl("tr");
		for (const header of [
			"序号",
			"标题",
			"负责人",
			"进度",
			"进度%",
			"信心",
			"截止日",
			"操作",
		]) {
			headRow.createEl("th", { text: header });
		}

		const tbody = table.createEl("tbody");
		if (krs.length === 0) {
			const row = tbody.createEl("tr");
			const cell = row.createEl("td", {
				text: "当前目标暂无关键结果",
			});
			cell.setAttribute("colspan", "8");
		} else {
			krs.forEach((kr, index) => {
				tbody.appendChild(this.renderKRTableRow(kr, index + 1));
			});
		}

		fragment.appendChild(table);
		return fragment;
	}

	private static renderKRTableRow(
		kr: KeyResult,
		index: number,
	): HTMLTableRowElement {
		const progressClass =
			kr.progress >= 80
				? "okr-prog-high"
				: kr.progress >= 40
					? "okr-prog-medium"
					: "okr-prog-low";
		const row = document.createElement("tr");
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
		confidenceCell.append(` ${kr.confidence}`);

		row.createEl("td", { text: kr.due || "-" });

		const actionCell = row.createEl("td");
		const actions = actionCell.createDiv("okr-inline-actions");
		actions.appendChild(
			this.createActionButton(
				"记录进度",
				"okr-inline-action-btn okr-inline-checkin-btn",
				{ krId: kr.id },
			),
		);
		actions.appendChild(
			this.createActionButton(
				"编辑",
				"okr-inline-action-btn okr-inline-edit-kr-btn",
				{ krId: kr.id },
			),
		);
		actions.appendChild(
			this.createActionButton(
				"删除",
				"okr-inline-action-btn okr-inline-action-danger okr-inline-delete-kr-btn",
				{ krId: kr.id, krTitle: kr.title },
			),
		);

		return row;
	}

	private static renderObjectiveActionBar(
		objectiveId: string,
		objectiveTitle: string,
		period: string,
	): HTMLDivElement {
		const bar = document.createElement("div");
		bar.className = "okr-inline-action-bar";
		bar.appendChild(
			this.createActionButton(
				"打开仪表盘",
				"okr-inline-action-btn okr-inline-open-dashboard-btn",
			),
		);
		bar.appendChild(
			this.createActionButton(
				"新增关键结果",
				"okr-inline-action-btn okr-inline-add-kr-btn",
				{
					objectiveId,
					period,
				},
			),
		);
		bar.appendChild(
			this.createActionButton(
				"编辑目标",
				"okr-inline-action-btn okr-inline-edit-objective-btn",
				{
					objectiveId,
					period,
				},
			),
		);
		bar.appendChild(
			this.createActionButton(
				"删除目标",
				"okr-inline-action-btn okr-inline-action-danger okr-inline-delete-objective-btn",
				{
					objectiveId,
					objectiveTitle,
					period,
				},
			),
		);
		return bar;
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
		dataset: Record<string, string> = {},
	): HTMLButtonElement {
		const button = document.createElement("button");
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
		const walker = document.createTreeWalker(
			container,
			NodeFilter.SHOW_COMMENT,
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

		await app.workspace.revealLeaf(leaf);
	}
}
