"use client";

import {
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";

/** A floating glass card on the hero: one thing the product does. */
export interface Highlight {
  icon: LucideIcon;
  title: string;
  text: string;
}

/**
 * Split sign-in layout: the form on the left, a hero on the right with
 * floating glass cards. The hero is hidden on narrow screens, so anything the
 * page needs (such as demo accounts) belongs in `children`, under the form.
 */
export function SignInPage({
  brand,
  title,
  description,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  busy = false,
  error,
  dividerLabel,
  formFooter,
  children,
  heroImageSrc,
  heroTitle,
  heroText,
  highlights = [],
}: {
  brand?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  error?: string;
  /** Text on the rule between the form and `children`. */
  dividerLabel?: string;
  /** Links under the sign-in button, e.g. "Forgot password?". */
  formFooter?: ReactNode;
  children?: ReactNode;
  /** A photo for the hero; without one, the gradient, halftone pattern and route are shown. */
  heroImageSrc?: string;
  heroTitle?: ReactNode;
  heroText?: ReactNode;
  highlights?: Highlight[];
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="signin">
      <section className="signin-main">
        <div className="signin-inner">
          {brand && <div className="signin-in d1">{brand}</div>}
          <h1 className="signin-title signin-in d1">{title}</h1>
          {description && <p className="signin-desc signin-in d2">{description}</p>}

          <form className="signin-form" onSubmit={onSubmit}>
            <label className="signin-label signin-in d3">
              Email address
              <span className="glass-field">
                <Mail size={17} strokeWidth={2} aria-hidden="true" />
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="Enter your email address"
                  required
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                />
              </span>
            </label>

            <label className="signin-label signin-in d4">
              Password
              <span className="glass-field">
                <LockKeyhole size={17} strokeWidth={2} aria-hidden="true" />
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                />
                <button
                  type="button"
                  className="glass-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff size={18} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Eye size={18} strokeWidth={2} aria-hidden="true" />
                  )}
                </button>
              </span>
            </label>

            {error && (
              <div className="err" role="alert">
                <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
                {error}
              </div>
            )}

            <button className="signin-submit signin-in d5" disabled={busy}>
              {busy && (
                <LoaderCircle size={17} strokeWidth={2.2} className="spin" aria-hidden="true" />
              )}
              {busy ? "Signing in…" : "Sign in"}
              {!busy && <ArrowRight size={17} strokeWidth={2.2} aria-hidden="true" />}
            </button>
          </form>
          {formFooter && <div className="signin-links signin-in d5">{formFooter}</div>}

          {children && (
            <>
              {dividerLabel && (
                <div className="signin-divider signin-in d6">
                  <span>{dividerLabel}</span>
                </div>
              )}
              <div className="signin-in d7">{children}</div>
            </>
          )}
        </div>
      </section>

      <section className="signin-hero" aria-hidden="true">
        <div
          className={`signin-hero-art${heroImageSrc ? " photo" : ""}`}
          style={
            heroImageSrc
              ? ({ backgroundImage: `url(${heroImageSrc})` } as CSSProperties)
              : undefined
          }
        >
          {!heroImageSrc && <HeroTrack />}
          {(heroTitle || heroText) && (
            <div className="signin-hero-copy">
              {heroTitle && <h2>{heroTitle}</h2>}
              {heroText && <p>{heroText}</p>}
            </div>
          )}
        </div>

        {highlights.length > 0 && (
          <div className="signin-cards">
            {highlights.slice(0, 3).map((h, i) => (
              <div className={`glass-card c${i + 1}`} key={h.title}>
                <span className="glass-card-ico">
                  <h.icon size={18} strokeWidth={2} />
                </span>
                <div>
                  <b>{h.title}</b>
                  <p>{h.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** A collection route across the hero, with two trucks driving it. */
function HeroTrack() {
  const route = "M-20 520 C 120 470, 180 380, 300 360 S 470 300, 520 210 S 640 90, 760 60";
  return (
    <svg className="signin-track" viewBox="0 0 720 720" preserveAspectRatio="xMidYMid slice">
      <path className="route" d={route} />
      <path className="route-live" d={route} />
      <g className="truck">
        <circle r="9" />
        <animateMotion dur="14s" repeatCount="indefinite" path={route} />
      </g>
      <g className="truck alt">
        <circle r="7" />
        <animateMotion dur="14s" begin="-7s" repeatCount="indefinite" path={route} />
      </g>
    </svg>
  );
}
