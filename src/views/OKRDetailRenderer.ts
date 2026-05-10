import { MarkdownPostProcessorContext, normalizePath } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import { CheckInModal } from "../modals/CheckInModal";
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
			const html = el.innerHTML;

			if (
				type === OKR_TYPE_OBJECTIVE &&
				html.includes(OKR_KR_LIST_START)
			) {
				const objId = String(fm[FRONTMATTER_OKR_ID] ?? "");
				const period = String(fm[FRONTMATTER_OKR_PERIOD] ?? "");
				const krs = await manager.getKeyResults(objId, period);
				const tableRows = krs
					.map((kr, index) => this.renderKRTableRow(kr, index + 1))
					.join("");
				const tableHtml = `${OKR_KR_LIST_START}
<table class="okr-inline-kr-table">
	<thead>
		<tr>
			<th>序号</th>
			<th>标题</th>
			<th>负责人</th>
			<th>进度</th>
			<th>进度%</th>
			<th>信心</th>
			<th>截止日</th>
			<th>操作</th>
		</tr>
	</thead>
	<tbody>${tableRows || '<tr><td colspan="8">当前 Objective 暂无 Key Result</td></tr>'}</tbody>
</table>
${OKR_KR_LIST_END}`;
				el.innerHTML = this.replaceCommentBlock(
					html,
					OKR_KR_LIST_START,
					OKR_KR_LIST_END,
					tableHtml,
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
		};
	}

	private static renderKRTableRow(
		kr: Awaited<ReturnType<OKRManager["getKeyResults"]>>[number],
		index: number,
	): string {
		const progressClass =
			kr.progress >= 80
				? "okr-prog-high"
				: kr.progress >= 40
					? "okr-prog-medium"
					: "okr-prog-low";
		return `<tr>
	<td>${index}</td>
	<td>${kr.title}</td>
	<td>${kr.owner || "-"}</td>
	<td>
		<div class="okr-inline-progress-track">
			<div class="okr-inline-progress-fill ${progressClass}" style="width:${kr.progress}%"></div>
		</div>
	</td>
	<td>${kr.progress}%</td>
	<td><span class="okr-kr-dot okr-conf-${kr.confidence}">●</span> ${kr.confidence}</td>
	<td>${kr.due || "-"}</td>
	<td><button class="okr-btn-primary okr-inline-checkin-btn" data-kr-id="${kr.id}" type="button">记录进度</button></td>
</tr>`;
	}

	private static replaceCommentBlock(
		html: string,
		start: string,
		end: string,
		replacement: string,
	): string {
		const escapedStart = start
			.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		const escapedEnd = end
			.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		const pattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`);
		return html.replace(pattern, replacement);
	}
}
