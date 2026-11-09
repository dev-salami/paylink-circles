"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicGroup } from "@/lib/client/api";
import { myOpenShares } from "@/lib/client/derive";
import { dismissAlert, dismissedAlerts } from "@/lib/client/local";
import { formatDay } from "@/lib/domain/dates";
import { Amount } from "./ui";

/** Bell with in-app payment reminders: Pay now or Later (Keel Accept/Decline style). */
export function AlertsButton({ groups }: { groups: PublicGroup[] }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setDismissed(dismissedAlerts()), []);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const openCount = useMemo(() => groups.reduce((count, group) => count + myOpenShares(group).length, 0), [groups]);
  const alerts = useMemo(
    () =>
      groups
        .flatMap((group) => myOpenShares(group).filter((share) => share.dueInDays <= 3).map((share) => ({ group, share })))
        .filter((alert) => !dismissed.includes(alert.share.id))
        .slice(0, 6),
    [groups, dismissed],
  );

  return (
    <div className="relative" ref={ref}>
      <button className="icon-btn" aria-label={`Reminders (${alerts.length})`} onClick={() => setOpen((value) => !value)}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" /></svg>
        {alerts.length > 0 ? <span className="dot" /> : null}
      </button>
      {open ? (
        <div className="popover">
          <p className="micro px-1 pb-2">Reminders</p>
          {alerts.length === 0 ? (
            <p className="px-1 pb-1 text-sm muted">{openCount > 0 ? "Nothing due in the next few days." : "You're all paid up."}</p>
          ) : (
            <div className="grid gap-2">
              {alerts.map(({ group, share }) => (
                <div key={share.id} className="rounded-2xl bg-[var(--elev)] p-3">
                  <p className="text-sm">
                    <b className="font-medium">{group.title}</b>
                    <span className="muted"> · to {share.recipientName}</span>
                  </p>
                  <p className="mt-1 flex items-baseline justify-between">
                    <Amount units={share.amount} asset={group.asset} size="md" />
                    <span className={`text-xs ${share.overdue ? "text-[var(--danger)]" : "muted"}`}>{share.overdue ? "Overdue" : `Due ${formatDay(share.dueDate)}`}</span>
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link href={`/pay/${group.id}/${share.id}`} className="btn btn-primary btn-small">Pay now</Link>
                    <button
                      className="btn btn-ghost btn-small"
                      onClick={() => {
                        dismissAlert(share.id);
                        setDismissed((list) => [...list, share.id]);
                      }}
                    >
                      Later
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
