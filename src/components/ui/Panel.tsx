import { Inbox, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/** Colour families for icon tiles; each maps to a token pair in components.css. */
export type IconTone = "accent" | "sky" | "ok" | "warn" | "bad" | "violet" | "neutral";

/** A rounded, tinted square holding one glyph: the app's standard icon badge. */
export function IconTile({
  icon: Icon,
  tone = "accent",
  size = "md",
}: {
  icon: LucideIcon;
  tone?: IconTone;
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "lg" ? 22 : size === "sm" ? 15 : 18;
  return (
    <span className={`itile ${tone} ${size}`} aria-hidden="true">
      <Icon size={px} strokeWidth={2} />
    </span>
  );
}

export function Panel({
  title,
  icon: Icon,
  aside,
  children,
  className = "",
  style,
}: {
  title?: ReactNode;
  /** Small glyph before the title. */
  icon?: LucideIcon;
  /** Right-hand content on the title row. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`panel ${className}`.trim()} style={style}>
      {title !== undefined && (
        <div className="panel-head">
          <h3>
            {Icon && <Icon size={17} strokeWidth={2.1} aria-hidden="true" />}
            {title}
          </h3>
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}

export function Empty({
  icon: Icon = Inbox,
  children,
}: {
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={26} strokeWidth={1.6} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
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
  icon,
  iconTone = "accent",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "bad";
  /** 0–100; omit to leave the rail out. */
  progress?: number;
  trend?: Trend;
  altBar?: boolean;
  icon?: LucideIcon;
  iconTone?: IconTone;
}) {
  const pct = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));
  const TrendIcon = trend?.dir === "up" ? TrendingUp : TrendingDown;

  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="label">{label}</div>
        {icon && <IconTile icon={icon} tone={iconTone} size="sm" />}
      </div>
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
              <TrendIcon size={12} strokeWidth={2.5} aria-hidden="true" />
              {trend.label}
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
  icon,
  children,
  actions,
}: {
  title: ReactNode;
  /** Shown as a large tile beside the title. */
  icon?: LucideIcon;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pagehead">
      <div className="pagehead-title">
        {icon && <IconTile icon={icon} size="lg" />}
        <div>
          <h1>{title}</h1>
          {children !== undefined && <p>{children}</p>}
        </div>
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
  icon,
  iconTone = "neutral",
  className = "",
}: {
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  icon?: LucideIcon;
  iconTone?: IconTone;
  className?: string;
}) {
  return (
    <div className={`li ${className}`.trim()}>
      <div className="li-main">
        {icon && <IconTile icon={icon} tone={iconTone} size="sm" />}
        <div>
          <div className="t">{title}</div>
          {sub !== undefined && <div className="sub">{sub}</div>}
        </div>
      </div>
      {aside}
    </div>
  );
}
