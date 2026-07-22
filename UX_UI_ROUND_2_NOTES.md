# UX/UI Round 2 Notes

Implemented from `Trinket_BM_UX_UI_Guideline.docx`:

- Swapped unclear vendor navigation icon to `gem`; finance icon to `banknote`.
- Added semantic icons to KPI cards and pipeline/status badges.
- Added KPI trend indicators versus previous month where a monthly period is selected.
- Made KPI cards clickable for quick drill-down to relevant modules.
- Vietnamese chart titles across dashboard.
- Added compact money formatting in charts (`tr`, `k`) while preserving full values in tooltips/titles.
- Improved line chart with horizontal grid, Y-axis labels and monthly target line.
- Added practical dashboard charts:
  - Pipeline funnel by status and deal value.
  - AR aging buckets.
  - Margin by product type.
- Added chart percentages and counts where useful.
- Added sortable deal table headers for key fields.
- Added quick filters for overdue and receivable orders.
- Replaced plain loading text with skeleton placeholders.
- Improved empty states with icons and optional action buttons.
- Mobile modal now behaves closer to full-screen with sticky header.

Still production/backlog rather than demo-close:

- Real chart library with rich hover tooltips.
- Global search dropdown with grouped results.
- Column pinning and mobile table-to-card transformation.
- VIP threshold configuration UI.
- Full WCAG audit across all color states.
