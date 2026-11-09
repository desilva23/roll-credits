"use client";

import type {
  ColDef,
  ColGroupDef,
  GetQuickFilterTextParams,
  IRowNode,
  ValueFormatterParams,
} from "ag-grid-community";
import type { CustomCellRendererProps } from "ag-grid-react";
import { type Evidence, money } from "@/lib/client/api";
import { type LedgerRow, signedMoney } from "@/lib/client/ledger";
import { lineUrl } from "@/lib/domain/repo-ref";

type Column = ColDef<LedgerRow> | ColGroupDef<LedgerRow>;

const onTotalRow = (node: IRowNode<LedgerRow> | null | undefined): boolean => node?.rowPinned === "bottom";

const percent = (p: ValueFormatterParams<LedgerRow, number | null>): string => {
  if (p.value === null || p.value === undefined) return onTotalRow(p.node) ? "" : "—";
  return `${Math.round(p.value * 100)}%`;
};

const yesNo = (p: ValueFormatterParams<LedgerRow, boolean | null>): string => {
  if (p.value === true) return "yes";
  return p.value === false ? "no" : "";
};

const where = (evidence: Evidence | null | undefined): string =>
  evidence === null || evidence === undefined ? "" : `${evidence.path}:${evidence.line}`;

/** The first line that uses the package, linked to that exact line on GitHub. */
function FirstUseCell(
  p: CustomCellRendererProps<LedgerRow, Evidence | null> & { slug: string },
): React.JSX.Element | null {
  if (onTotalRow(p.node)) return null;
  const evidence = p.value;
  if (evidence === null || evidence === undefined) return <span className="ledger__none">—</span>;
  return (
    <a className="ledger__line" href={lineUrl(p.slug, evidence.path, evidence.line)} target="_blank" rel="noreferrer">
      {where(evidence)}
      <span className="visually-hidden"> (GitHub, new tab)</span>
    </a>
  );
}

/**
 * What reading the code moved, as a bar either side of zero: amber where a
 * package gains against splitting the dependency list, dim where it loses.
 * The figure beside it carries the meaning; the bar is only the shape of it.
 */
function ChangeCell(p: CustomCellRendererProps<LedgerRow, number> & { widest: number }): React.JSX.Element {
  const cents = p.value ?? 0;
  const total = onTotalRow(p.node);
  const reach = total || p.widest === 0 ? 0 : (Math.abs(cents) / p.widest) * 50;
  return (
    <span className="shift">
      {total ? null : (
        <span className="shift__track" aria-hidden="true">
          <span className={`shift__fill shift__fill--${cents < 0 ? "down" : "up"}`} style={{ width: `${reach}%` }} />
        </span>
      )}
      <span className="shift__value">{signedMoney(cents)}</span>
    </span>
  );
}

/**
 * The ledger's columns, grouped the way the argument runs: how the code uses
 * a package, who keeps it alive, and what each way of splitting pays them.
 */
export function ledgerColumns(slug: string, widest: number): Column[] {
  return [
    { field: "pkg", headerName: "Package", minWidth: 160, flex: 1, pinned: "left" },
    {
      headerName: "Used in this code",
      children: [
        {
          field: "role",
          headerName: "What it does here",
          minWidth: 200,
          flex: 2,
          // The agent's sentence is often wider than the column.
          tooltip: (p: { value?: unknown }) => (typeof p.value === "string" ? p.value : ""),
        },
        { field: "shipped", headerName: "Shipped", width: 100, type: "numericColumn" },
        { field: "tests", headerName: "Tests", width: 90, type: "numericColumn" },
        {
          field: "firstUse",
          headerName: "First use",
          minWidth: 170,
          flex: 1,
          sortable: false,
          valueFormatter: (p: ValueFormatterParams<LedgerRow, Evidence | null>) => where(p.value),
          getQuickFilterText: (p: GetQuickFilterTextParams<LedgerRow, Evidence | null>) => where(p.value),
          tooltip: (p: { value?: Evidence | null }) => p.value?.text ?? "",
          cellRenderer: FirstUseCell,
          cellRendererParams: { slug },
        },
      ],
    },
    {
      headerName: "Kept alive by",
      children: [
        {
          field: "topShare",
          headerName: "Top share",
          headerTooltip: "How much of the package its top contributor wrote",
          width: 120,
          type: "numericColumn",
          valueFormatter: percent,
          cellStyle: (p) => ((p.value ?? 0) >= 0.8 ? { color: "#f0c070" } : null),
        },
        // Words, not the checkbox the grid draws for a boolean: nothing here can be ticked.
        { field: "funded", headerName: "Funded", width: 100, cellDataType: false, valueFormatter: yesNo },
      ],
    },
    {
      headerName: "Paid",
      children: [
        {
          field: "byList",
          headerName: "By the list",
          width: 120,
          type: "numericColumn",
          valueFormatter: (p: ValueFormatterParams<LedgerRow, number>) => money(p.value ?? 0),
        },
        {
          field: "byCode",
          headerName: "Roll Credits",
          width: 145,
          type: "numericColumn",
          sort: "desc",
          valueFormatter: (p: ValueFormatterParams<LedgerRow, number>) =>
            p.value === 0 && !onTotalRow(p.node) ? "—" : money(p.value ?? 0),
          cellStyle: { color: "#f0c070" },
        },
        {
          field: "change",
          headerName: "Change",
          width: 150,
          type: "numericColumn",
          cellRenderer: ChangeCell,
          cellRendererParams: { widest },
        },
      ],
    },
  ];
}
