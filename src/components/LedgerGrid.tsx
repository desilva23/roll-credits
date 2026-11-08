"use client";

import { AllCommunityModule, ModuleRegistry, colorSchemeDark, themeQuartz } from "ag-grid-community";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import { type Plan, money } from "@/lib/client/api";

ModuleRegistry.registerModules([AllCommunityModule]);

/** The grid wears the same four colours as the rest of the page, not its own. */
const theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "#15110d",
  foregroundColor: "#ece5da",
  headerBackgroundColor: "#1d1710",
  headerTextColor: "#8d8275",
  borderColor: "#342a20",
  rowHoverColor: "#1d1710",
  accentColor: "#f0c070",
  fontFamily: "var(--font-mono), ui-monospace, monospace",
  headerFontSize: 12,
  fontSize: 13,
  rowHeight: 44,
  headerHeight: 40,
  wrapperBorderRadius: 2,
});

interface Row {
  pkg: string;
  role: string;
  shipped: number;
  tests: number;
  people: number;
  topShare: number | null;
  funded: boolean;
  cents: number;
}

function rowsFrom(plan: Plan): Row[] {
  const paid = new Map<string, number>();
  for (const a of plan.allocations) {
    for (const pkg of a.packages) paid.set(pkg, (paid.get(pkg) ?? 0) + a.cents / a.packages.length);
  }

  return plan.packages.map((p) => ({
    pkg: p.pkg,
    role: p.role ?? "—",
    shipped: p.evidence.filter((e) => !e.inTest).length,
    tests: p.evidence.filter((e) => e.inTest).length,
    people: p.maintainers.length,
    topShare: p.maintainers[0]?.share ?? null,
    funded: p.alreadyFunded,
    cents: Math.round(paid.get(p.pkg) ?? 0),
  }));
}

const percent = (p: ValueFormatterParams<Row, number | null>): string =>
  p.value === null || p.value === undefined ? "—" : `${Math.round(p.value * 100)}%`;

/**
 * The same plan as a ledger. The credits list argues; this is for the person
 * who has to defend the spend afterwards and wants to sort by what they paid,
 * who is alone, and who already has funding.
 */
export function LedgerGrid({ plan }: { plan: Plan }): React.JSX.Element {
  const rows = useMemo(() => rowsFrom(plan), [plan]);

  const columns = useMemo<ColDef<Row>[]>(
    () => [
      { field: "pkg", headerName: "Package", flex: 2, minWidth: 150, pinned: "left" },
      {
        field: "role",
        headerName: "What it does here",
        flex: 3,
        minWidth: 200,
        // The agent's sentence is often wider than the column.
        tooltip: (p: { value?: unknown }) => (typeof p.value === "string" ? p.value : ""),
      },
      { field: "shipped", headerName: "In shipped code", width: 150, type: "numericColumn" },
      { field: "tests", headerName: "In tests", width: 110, type: "numericColumn" },
      { field: "people", headerName: "Maintainers", width: 130, type: "numericColumn" },
      {
        field: "topShare",
        headerName: "Top contributor",
        width: 150,
        type: "numericColumn",
        valueFormatter: percent,
        cellStyle: (p) => ((p.value ?? 0) >= 0.8 ? { color: "#f0c070" } : null),
      },
      {
        field: "funded",
        headerName: "Already funded",
        width: 150,
        valueFormatter: (p: ValueFormatterParams<Row, boolean>) => (p.value === true ? "yes" : "no"),
      },
      {
        field: "cents",
        headerName: "Paid",
        width: 110,
        type: "numericColumn",
        sort: "desc",
        valueFormatter: (p: ValueFormatterParams<Row, number>) => (p.value === 0 ? "—" : money(p.value ?? 0)),
        cellStyle: { color: "#f0c070" },
      },
    ],
    [],
  );

  return (
    <div className="ledger">
      <AgGridReact<Row>
        theme={theme}
        rowData={rows}
        columnDefs={columns}
        defaultColDef={{ sortable: true, resizable: true }}
        domLayout="autoHeight"
        suppressCellFocus
      />
    </div>
  );
}
