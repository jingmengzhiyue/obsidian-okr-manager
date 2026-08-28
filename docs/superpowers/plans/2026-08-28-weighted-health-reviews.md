# Weighted health and structured reviews implementation plan

## Scope

Prepare Vault OKR Manager 1.4.0 with relative KR weights, schedule-aware health assessments, and Markdown-backed weekly, mid-cycle, and retrospective workflows. Preserve compatibility with existing Objective files and the period lifecycle introduced in 1.3.0.

## Decisions

- KR weights are positive relative numbers. Missing legacy weights behave as `1`.
- Objective progress is the weighted average of non-cancelled KRs.
- Health is separate from progress and combines schedule variance, confidence, the latest blocker signal, on-hold state, and overdue state.
- Reviews live in `<root>/<period>/Reviews/` as normal Markdown files.
- Weekly reviews are repeatable by date; mid-cycle and retrospective reviews are singletons per period.
- Creation captures an immutable OKR snapshot. Later edits only update structured narrative sections.
- Closing a period without a retrospective requires an explicit second confirmation.
- Closed and archived periods keep reviews read-only.

## Verification

- Unit tests cover weighted aggregation, health thresholds and penalties, legacy parsing, rollover/template weight preservation, blocker updates, review round-trips, duplicate rules, snapshots, and period permissions.
- Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check` before handoff.
