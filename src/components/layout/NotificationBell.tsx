"use client";

import { Bell, CheckCheck, MessageSquare, Recycle, Truck, Wallet, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { useT } from "@/lib/i18n";
import { notificationsFor, type NotificationKind } from "@/lib/notifications";
import { nowIn } from "@/lib/selectors";
import type { Role } from "@/lib/types";
import { useAppState } from "@/store/StoreProvider";

const ICONS: Record<NotificationKind, LucideIcon> = {
  ticket: MessageSquare,
  pickup: Truck,
  dumping: Recycle,
  payment: Wallet,
  fleet: Wrench,
};

/** Only the newest ids are worth remembering; the feed itself is capped. */
const SEEN_CAP = 300;

function loadSeen(key: string): Set<string> {
  try {
    return new Set<string>(JSON.parse(window.localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveSeen(key: string, seen: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...seen].slice(-SEEN_CAP)));
  } catch {
    // Private mode or blocked storage: read state just won't survive a reload.
  }
}

/** "2026-09-25 10:15" parsed as local time, matching how stamps are written. */
const parseStamp = (at: string) => {
  const [d, time = "00:00"] = at.split(" ");
  const [y, m, day] = d.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, day, h, min);
};

/**
 * The bell in the top bar. Its feed is derived from the store, which syncs with
 * the server every few seconds, so the count moves as events land.
 */
export function NotificationBell({ role }: { role: Role }) {
  const s = useAppState();
  const { session } = useSession();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  // Null until read from storage, so server and first client render agree.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const storageKey = `zoa.notifications.seen.${session?.sub ?? "anon"}.${role}`;
  const items = notificationsFor(s, role);
  const unread = seen ? items.filter((n) => !seen.has(n.id)).length : 0;

  useEffect(() => setSeen(loadSeen(storageKey)), [storageKey]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = useCallback(
    (ids: string[]) => {
      setSeen((prev) => {
        const next = new Set(prev ?? []);
        ids.forEach((id) => next.add(id));
        saveSeen(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  if (!session) return null;

  const now = nowIn(s).getTime();
  const ago = (at: string) => {
    const mins = Math.max(0, Math.round((now - parseStamp(at).getTime()) / 60_000));
    if (mins < 1) return t("just now");
    if (mins < 60) return t("{n} min ago", { n: mins });
    if (mins < 60 * 24) return t("{n} h ago", { n: Math.round(mins / 60) });
    return t("{n} d ago", { n: Math.round(mins / 1440) });
  };

  const label = unread > 0 ? `${t("Notifications")} (${unread})` : t("Notifications");

  return (
    <div ref={rootRef} className="notif" data-open={open || undefined}>
      <button
        type="button"
        className="notif-trigger"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        title={t("Notifications")}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={19} strokeWidth={2.1} aria-hidden="true" />
        {unread > 0 && (
          // Re-keyed on change so the badge pops each time a new event lands.
          <span key={unread} className="notif-count" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {label}
      </span>

      <div id={panelId} className="notif-card" hidden={!open}>
        <div className="notif-head">
          <b>{t("Notifications")}</b>
          {unread > 0 && (
            <button type="button" className="notif-markall" onClick={() => markRead(items.map((n) => n.id))}>
              <CheckCheck size={15} strokeWidth={2.2} aria-hidden="true" />
              {t("Mark all read")}
            </button>
          )}
        </div>

        {open &&
          (items.length === 0 ? (
            <div className="notif-empty">
              <span className="notif-empty-ico" aria-hidden="true">
                <Bell size={22} strokeWidth={1.8} />
              </span>
              {t("You're all caught up.")}
            </div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => {
                const Icon = ICONS[n.kind];
                const isUnread = !seen?.has(n.id);
                return (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      prefetch={false}
                      className="notif-item"
                      data-unread={isUnread || undefined}
                      data-kind={n.kind}
                      onClick={() => {
                        markRead([n.id]);
                        setOpen(false);
                      }}
                    >
                      <span className="notif-ico" aria-hidden="true">
                        <Icon size={16} strokeWidth={2.1} />
                      </span>
                      <span className="notif-text">
                        <b>{t(n.title, n.vars)}</b>
                        <span>{n.body}</span>
                        <small>{ago(n.at)}</small>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </div>
  );
}
