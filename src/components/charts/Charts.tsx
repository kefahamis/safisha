"use client";

import { Table2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/*
 * Small, quiet charts in HTML/CSS: thin marks (<=24px, 4px rounded ends,
 * square at the baseline), hairline grid, 2px surface gaps, a hover/focus
 * tooltip on every mark, and a table view for each chart so no value is
 * reachable only by hovering. Colours come from chart tokens (validated for
 * both themes); text always wears text tokens, never the series colour.
 */

export interface Datum {
  label: string;
  value: number;
  /** Formatted value for labels and the tooltip. */
  display: string;
  /** Optional extra line in the tooltip. */
  note?: string;
}

/** Clean axis ticks: 0 and up to four round steps covering the max. */
function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <details className="chart-table">
      <summary>
        <Table2 size={13} strokeWidth={2.2} aria-hidden="true" />
        Table view
      </summary>
      <div className="tablewrap">
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} className={i ? "r" : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j ? "r" : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Vertical columns, one series. Value on each cap (few columns only). */
export function ColumnChart({
  data,
  caption,
  axis = (v) => String(v),
  height = 180,
  capLabels = true,
}: {
  data: Datum[];
  caption: string;
  axis?: (v: number) => string;
  height?: number;
  capLabels?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const t = ticks(max);
  const top = t[t.length - 1] || 1;

  return (
    <figure className="chart" aria-label={caption}>
      <div className="chart-plot" style={{ height }}>
        <div className="chart-grid" aria-hidden="true">
          {t.map((v) => (
            <div key={v} className="gridline" style={{ bottom: `${(v / top) * 100}%` }}>
              <span>{axis(v)}</span>
            </div>
          ))}
        </div>
        <div className="chart-cols">
          {data.map((d, i) => (
            <div
              key={d.label}
              className={`col${hover === i ? " on" : ""}`}
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${d.display}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <div className="col-bar" style={{ height: `${(d.value / top) * 100}%` }}>
                {capLabels && <span className="cap">{d.display}</span>}
              </div>
              {hover === i && (
                <div className="tip" role="tooltip">
                  <b>{d.display}</b>
                  <span>{d.label}</span>
                  {d.note && <span>{d.note}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="chart-x" aria-hidden="true">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
      <TableView caption={caption} head={["", "Value"]} rows={data.map((d) => [d.label, d.display])} />
    </figure>
  );
}

/** Horizontal bars, one series; value at the tip. Good for long labels. */
export function BarList({ data, caption }: { data: Datum[]; caption: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="chart" aria-label={caption}>
      <div className="barlist">
        {data.map((d, i) => (
          <div
            key={d.label}
            className={`barrow${hover === i ? " on" : ""}`}
            tabIndex={0}
            role="img"
            aria-label={`${d.label}: ${d.display}`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <span className="barlabel">{d.label}</span>
            <span className="bartrack">
              {/* The track leaves room for the value, so the longest bar never pushes it out. */}
              <span
                className="bar"
                style={{
                  width: `calc((100% - var(--value-room)) * ${Math.max(d.value > 0 ? 0.015 : 0, d.value / max)})`,
                }}
              />
              <span className="barvalue">{d.display}</span>
            </span>
            {hover === i && d.note && (
              <div className="tip" role="tooltip">
                <b>{d.display}</b>
                <span>{d.note}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <TableView caption={caption} head={["", "Value"]} rows={data.map((d) => [d.label, d.display])} />
    </figure>
  );
}

export interface StackDatum {
  label: string;
  parts: number[];
}

/**
 * Two-series stacked columns in the emphasis form: the series that is the
 * story in the accent, the context in grey. Legend always shown; the last
 * column's total is labelled; the tooltip lists both series.
 */
export function StackedColumns({
  data,
  series,
  caption,
  format,
  height = 180,
}: {
  data: StackDatum[];
  series: [string, string];
  caption: string;
  format: (v: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const totals = data.map((d) => d.parts[0] + d.parts[1]);
  const t = ticks(Math.max(1, ...totals));
  const top = t[t.length - 1] || 1;

  return (
    <figure className="chart" aria-labelledby={`${id}-legend`}>
      <div className="chart-legend" id={`${id}-legend`}>
        <span>
          <i className="key s1" /> {series[0]}
        </span>
        <span>
          <i className="key s2" /> {series[1]}
        </span>
      </div>
      <div className="chart-plot" style={{ height }}>
        <div className="chart-grid" aria-hidden="true">
          {t.map((v) => (
            <div key={v} className="gridline" style={{ bottom: `${(v / top) * 100}%` }}>
              <span>{format(v)}</span>
            </div>
          ))}
        </div>
        <div className="chart-cols">
          {data.map((d, i) => (
            <div
              key={d.label}
              className={`col${hover === i ? " on" : ""}`}
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${series[0]} ${format(d.parts[0])}, ${series[1]} ${format(d.parts[1])}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <div className="col-stack" style={{ height: `${(totals[i] / top) * 100}%` }}>
                <div className="seg s2" style={{ flexGrow: d.parts[1] }} />
                <div className="seg s1" style={{ flexGrow: d.parts[0] }} />
                {i === data.length - 1 && <span className="cap">{format(totals[i])}</span>}
              </div>
              {hover === i && (
                <div className="tip" role="tooltip">
                  <span className="tip-title">{d.label}</span>
                  <span className="tip-row">
                    <i className="line s1" />
                    <b>{format(d.parts[0])}</b> {series[0]}
                  </span>
                  <span className="tip-row">
                    <i className="line s2" />
                    <b>{format(d.parts[1])}</b> {series[1]}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="chart-x" aria-hidden="true">
        {/* Dense axes label every other column; the tooltip and table have them all. */}
        {data.map((d, n) => (
          <span key={d.label}>{data.length > 6 && (data.length - 1 - n) % 2 ? "" : d.label}</span>
        ))}
      </div>
      <TableView
        caption={caption}
        head={["", series[0], series[1], "Total"]}
        rows={data.map((d, i) => [d.label, format(d.parts[0]), format(d.parts[1]), format(totals[i])])}
      />
    </figure>
  );
}
