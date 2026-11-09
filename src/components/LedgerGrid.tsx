"use client";

import { AllCommunityModule, ModuleRegistry, colorSchemeDark, themeQuartz } from "ag-grid-community";
import type { ProcessCellForExportParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useRef, useState } from "react";
import { ledgerColumns } from "@/components/LedgerColumns";
import { type Plan, money } from "@/lib/client/api";
import { type LedgerRow, csvValue, ledgerRows, ledgerTotal, widestChange } from "@/lib/client/ledger";
import { count } from "@/lib/domain/text";

ModuleRegistry.registerModules([AllCommunityModule]);

/** The grid wears the same colours as the rest of the page, not its own. */
const theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "#15110d",
  foregroundColor: "#ece5da",
  headerBackgroundColor: "#1d1710",
  headerTextColor: "#8d8275",
  borderColor: "#342a20",
  rowHoverColor: "#1d1710",
  accentColor: "#f0c070",
  pinnedRowBackgroundColor: "#1d1710",
  pinnedRowBorder: "1px solid #5f574d",
  pinnedRowFontWeight: 600,
  fontFamily: "var(--font-mono), ui-monospace, monospace",
  headerFontSize: 12,
  fontSize: 13,
  rowHeight: 44,
  headerHeight: 40,
  wrapperBorderRadius: 2,
});

/** Said only when it is true, which it is whenever anyone can be paid. */
function balance(total: LedgerRow): string | null {
  if (total.byList !== total.byCode) return null;
  return `Both splits come to ${money(total.byCode)}. Reading the code moves money between packages; it adds none.`;
}

/**
 * The same plan as a ledger. The credits list argues; this is for the person
 * who has to defend the spend afterwards: sort by what was paid, by who is
 * alone, or by who already has funding, filter to one package, follow any
 * figure to the line of code behind it, and take the whole thing away as CSV.
 */
export function LedgerGrid({ plan }: { plan: Plan }): React.JSX.Element {
  const grid = useRef<AgGridReact<LedgerRow>>(null);
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => ledgerRows(plan), [plan]);
  const [shown, setShown] = useState(rows.length);
  const total = useMemo(() => ledgerTotal(rows), [rows]);
  const columns = useMemo(() => ledgerColumns(plan.repo, widestChange(rows)), [plan.repo, rows]);
  const note = balance(total);

  const download = (): void => {
    grid.current?.api.exportDataAsCsv({
      fileName: `roll-credits-${plan.repo.replace("/", "-")}.csv`,
      skipColumnGroupHeaders: true,
      processCellCallback: (p: ProcessCellForExportParams<LedgerRow>) => csvValue(p.column.getColId(), p.value),
    });
  };

  return (
    <div className="ledger">
      <div className="ledger__tools">
        <label className="ledger__filter">
          <span className="visually-hidden">Filter packages</span>
          <input
            type="search"
            placeholder="Filter packages"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
        </label>
        <p className="ledger__count" aria-live="polite">
          {shown === rows.length
            ? count(rows.length, "dependency", "dependencies")
            : `${shown} of ${count(rows.length, "dependency", "dependencies")}`}
        </p>
        <button type="button" className="button button--quiet ledger__export" onClick={download}>
          Download CSV
        </button>
      </div>
      {note === null ? null : <p className="ledger__note">{note}</p>}

      <AgGridReact<LedgerRow>
        ref={grid}
        theme={theme}
        rowData={rows}
        pinnedBottomRowData={[total]}
        columnDefs={columns}
        defaultColDef={{ sortable: true, resizable: true }}
        quickFilterText={filter}
        localeText={{ noRowsToShow: "No dependency matches that filter" }}
        onModelUpdated={(event) => {
          setShown(event.api.getDisplayedRowCount());
        }}
        domLayout="autoHeight"
        suppressCellFocus
      />
    </div>
  );
}
