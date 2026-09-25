import type { CSSProperties, ReactNode } from "react";

export function Panel({
  title,
  children,
  className = "",
  style,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`panel ${className}`.trim()} style={style}>
      {title !== undefined && <h3>{title}</h3>}
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export interface Trend {
  dir: "up" | "down";
  label: string;
}

/**
 * Figure tile: caption, value, an optional fill rail showing how far along the
 * measure is, and an optional trend pill beside the sub-caption.
 */
export function Kpi({
  label,
  value,
  sub,
  tone,
  progress,
  trend,
  altBar,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "bad";
  /** 0–100; omit to leave the rail out. */
  progress?: number;
  trend?: Trend;
  altBar?: boolean;
}) {
  const pct = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));

  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="v" style={tone === "bad" ? { color: "var(--bad)" } : undefined}>
        {value}
      </div>
      {pct !== undefined && (
        <div className={`bar${altBar ? " alt" : ""}`}>
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
      {(sub !== undefined || trend) && (
        <div className="foot">
          {trend && (
            <span className={`trend ${trend.dir}`}>
              {trend.dir === "up" ? "↑" : "↓"} {trend.label}
            </span>
          )}
          {sub !== undefined && <span className="s">{sub}</span>}
        </div>
      )}
    </div>
  );
}

/** Page title, supporting copy and optional right-hand actions. */
export function PageHead({
  title,
  children,
  actions,
}: {
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pagehead">
      <div>
        <h1>{title}</h1>
        {children !== undefined && <p>{children}</p>}
      </div>
      {actions}
    </div>
  );
}

/** A row in the repeated label / value / chip list pattern. */
export function ListRow({
  title,
  sub,
  aside,
  className = "",
}: {
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`li ${className}`.trim()}>
      <div>
        <div className="t">{title}</div>
        {sub !== undefined && <div className="sub">{sub}</div>}
      </div>
      {aside}
    </div>
  );
}
