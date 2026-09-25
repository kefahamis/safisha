"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZES = [10, 25, 50];

/** Page numbers to show: first, last, and a window round the current one. */
function pageList(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  const out: (number | "gap")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (keep.has(p)) out.push(p);
    else if (out[out.length - 1] !== "gap") out.push("gap");
  }
  return out;
}

/** Footer pager for a list: range summary, page buttons and a page-size picker. */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  noun = "rows",
}: {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav className="pager" aria-label="Pagination">
      <span className="pager-summary">
        {from}–{to} of {total} {noun}
      </span>

      <div className="pager-pages">
        <button
          type="button"
          className="pager-btn"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className="pager-btn"
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
              onClick={() => onPage(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className="pager-btn"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      <label className="pager-size">
        Rows
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}
