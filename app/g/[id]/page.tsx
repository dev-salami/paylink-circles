"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HostBanner } from "@/components/host-banner";
import { InviteCard } from "@/components/invite-card";
import { Amount, AssetChip, Avatar, BackLink, Bars, ErrorNote, Meter, Sheet, Skeleton, StatusPill, Toast, useToast } from "@/components/ui";
import { api, type PublicGroup } from "@/lib/client/api";
import { liveShares, myOpenShares, ratio, type GroupShare } from "@/lib/client/derive";
import { entryFor } from "@/lib/client/local";
import { shortAddress } from "@/lib/domain/address";
import { formatDay, formatDayLong } from "@/lib/domain/dates";

type Tab = "members" | "rotation" | "activity";

interface ReminderOut {
  shareId: string;
  memberName: string;
  amountLabel: string;
  dueDate: string;
  payUrl: string;
  message: string;
  emailed: boolean;
}

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<PublicGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("members");
  const [syncing, setSyncing] = useState(false);
  const [created, setCreated] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [hasEntry, setHasEntry] = useState(false);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    try {
      setGroup(await api<PublicGroup>(`/api/groups/${id}`, { groupId: id }));
      setError(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  }, [id]);

  const sync = useCallback(
    async (manual = false) => {
      setSyncing(true);
      try {
        const result = await api<{ matched: number; group: PublicGroup }>(`/api/groups/${id}/sync`, { method: "POST", groupId: id });
        setGroup(result.group);
        setError(null);
        if (manual) {
          if (result.group.asset === "USDT") setToast(result.matched > 0 ? `Found ${result.matched} new payment${result.matched === 1 ? "" : "s"}` : "USDT payments confirm from the transaction, not a chain scan. Open the share if one is still unpaid.");
          else setToast(result.matched > 0 ? `Found ${result.matched} new payment${result.matched === 1 ? "" : "s"} on chain` : "Up to date with the chain");
        }
      } catch (problem) {
        if (manual) setToast(problem instanceof Error ? problem.message : "Couldn't reach the chain");
      } finally {
        setSyncing(false);
      }
    },
    [id, setToast],
  );

  useEffect(() => {
    setCreated(new URLSearchParams(window.location.search).has("created"));
    setHasEntry(Boolean(entryFor(id)));
    void load().then(() => sync());
  }, [load, sync, id]);

  // Keep statuses fresh while someone is waiting on payments.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 20000);
    return () => clearInterval(timer);
  }, [sync]);

  const live = useMemo(() => (group ? liveShares(group) : []), [group]);
  const mine = group ? myOpenShares(group)[0] : undefined;
  const isMember = Boolean(group?.meId);
  const round = group?.kind === "ajo" ? group.rounds.find((item) => item.index === group.currentRound) : undefined;

  if (error) {
    return (
      <main className="app">
        <header className="py-2"><BackLink /></header>
        <ErrorNote text={error} />
      </main>
    );
  }

  if (!group) {
    return (
      <main className="app grid gap-3 pt-16">
        <Skeleton className="h-52" />
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="flex items-center justify-between gap-3 py-2">
        <BackLink />
        <AssetChip asset={group.asset} chain={group.chain} />
        <button className="icon-btn" aria-label="Check the chain for payments" onClick={() => void sync(true)} disabled={syncing}>
          {syncing ? <span className="spinner" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4" /></svg>}
        </button>
      </header>

      <section className="mt-2 px-1">
        <p className="micro">{group.kind === "ajo" ? `Ajo circle · ${group.frequency}` : "Bill split"}</p>
        <h1 className="h1 mt-1">{group.title}</h1>
      </section>

      <section className="card-dark mt-4 p-5">
        <div className="flex items-center justify-between">
          <span className="micro">{round ? `Round ${round.index + 1} of ${group.rounds.length} · to ${round.recipientName}` : "Collected"}</span>
          <span className="pill dark">{group.totals.paid}/{group.totals.count} paid</span>
        </div>
        <div className="mt-5">
          <Amount units={group.totals.collected} asset={group.asset} />
        </div>
        <p className="mt-2 text-sm muted">
          of <Amount units={group.totals.expected} asset={group.asset} size="sm" />
          {" · "}
          {round ? `payout ${formatDay(round.dueDate)}` : `due ${formatDay(group.dueDate)}`}
        </p>
        <div className="mt-5">
          <Bars height={64} values={live.map((share) => ({ on: share.status !== "unpaid", weight: Number(BigInt(share.amount) / 1000n) || 1 }))} />
        </div>
        <div className="mt-3"><Meter ratio={ratio(group.totals.collected, group.totals.expected)} /></div>
        {mine ? (
          mine.recipientAddress ? (
            <Link href={`/pay/${group.id}/${mine.id}`} className="btn btn-mint btn-block mt-5">
              Pay my share · <Amount units={mine.amount} asset={group.asset} size="sm" />
            </Link>
          ) : (
            <p className="mt-5 rounded-2xl bg-[#2c3240] px-3 py-3 text-sm text-[#c9ccd3]">Waiting for {mine.recipientName} to connect a wallet before this share can be paid.</p>
          )
        ) : group.isAdmin && live.some((share) => share.status === "unpaid") ? (
          <button className="btn btn-light btn-block mt-5" onClick={() => setRemindOpen(true)}>
            Remind unpaid members
          </button>
        ) : null}
      </section>

      <HostBanner
        compact
        asset={group.asset}
        nimNetwork={group.chain === "nimiq-mainnet" ? "mainnet" : group.chain === "nimiq-testnet" ? "testnet" : undefined}
      />

      {(created || group.isAdmin) && group.inviteCode && group.members.some((member) => !member.joined) ? (
        <section className="mt-3">
          <InviteCard code={group.inviteCode} title={group.title} onToast={setToast} />
        </section>
      ) : null}

      {!isMember && !hasEntry ? (
        <p className="mt-3 rounded-2xl bg-[var(--paper)] px-4 py-3 text-sm muted">You&apos;re viewing this group. Ask the organizer for the invite link to claim your spot.</p>
      ) : null}

      <div className="tabs block mt-6" role="tablist">
        <button role="tab" aria-selected={tab === "members"} onClick={() => setTab("members")}>Members</button>
        {group.kind === "ajo" ? <button role="tab" aria-selected={tab === "rotation"} onClick={() => setTab("rotation")}>Rotation</button> : null}
        <button role="tab" aria-selected={tab === "activity"} onClick={() => setTab("activity")}>Activity</button>
      </div>

      {tab === "members" ? <Members group={group} live={live} onRemind={() => setRemindOpen(true)} /> : null}
      {tab === "rotation" && group.kind === "ajo" ? <Rotation group={group} /> : null}
      {tab === "activity" ? <ActivityList group={group} /> : null}

      <RemindSheet group={group} open={remindOpen} onClose={() => setRemindOpen(false)} onDone={() => void load()} onToast={setToast} />
      <Toast text={toast} />
    </main>
  );
}

function Members({ group, live, onRemind }: { group: PublicGroup; live: GroupShare[]; onRemind: () => void }) {
  return (
    <section className="paper mt-3 px-4 py-1">
      {group.members.map((member) => {
        const share = live.find((item) => item.memberId === member.id);
        const recipient = group.kind === "ajo" && group.rounds.find((item) => item.index === group.currentRound)?.recipientMemberId === member.id;
        const payment = share?.paymentId ? group.payments.find((item) => item.id === share.paymentId) : undefined;
        const address = group.asset === "NIM" ? member.nimAddress : member.evmAddress;
        return (
          <div key={member.id} className="row">
            <Avatar name={member.name} on={share?.status === "paid"} dark={member.isOrganizer} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.95rem]">
                {member.name}
                {member.id === group.meId ? <span className="muted"> · you</span> : null}
              </p>
              <p className="truncate text-xs muted">
                {!member.joined ? "Spot open · invite pending" : address ? shortAddress(address) : "Joined"}
                {member.isOrganizer ? " · organizer" : ""}
                {recipient ? " · collecting this round" : ""}
              </p>
            </div>
            <div className="row-actions">
              {share ? <Amount units={share.amount} asset={group.asset} size="sm" /> : null}
              {share ? (
                payment ? (
                  <Link href={`/r/${group.id}/${payment.id}`}><StatusPill status="paid" /></Link>
                ) : (
                  <StatusPill status={share.status} overdue={share.overdue} />
                )
              ) : null}
              {share && share.status === "unpaid" && share.memberId === group.meId ? (
                share.recipientAddress ? (
                  <Link href={`/pay/${group.id}/${share.id}`} className="btn btn-primary btn-small">Pay</Link>
                ) : (
                  <span className="text-xs muted">Needs wallet</span>
                )
              ) : null}
              {share && share.status === "unpaid" && share.memberId !== group.meId && group.isAdmin ? (
                <button className="btn btn-ghost btn-small" onClick={onRemind} disabled={!share.canRemind}>{share.canRemind ? "Nudge" : "Sent"}</button>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Rotation({ group }: { group: PublicGroup }) {
  return (
    <section className="mt-3 grid gap-2">
      {group.rounds.map((round) => {
        const current = round.index === group.currentRound;
        const done = round.paid === round.count;
        const past = (group.currentRound ?? 0) > round.index;
        return (
          <div key={round.index} className={`${current ? "card-dark" : "paper"} p-4`}>
            <div className="flex items-center gap-3">
              <span className={`avatar ${done ? "on" : current ? "" : ""}`} style={current && !done ? { background: "#2c3240", color: "#fff" } : undefined}>{round.index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate">{round.recipientName}{round.recipientMemberId === group.meId ? <span className="muted"> · you</span> : null}</p>
                <p className="text-xs muted">{formatDayLong(round.dueDate)}</p>
              </div>
              {done ? <span className="pill paid"><i />Paid out</span> : current ? <span className="pill mint live"><i />Collecting</span> : past ? <span className="pill overdue"><i />Short</span> : <span className="pill self">Upcoming</span>}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1"><Meter ratio={ratio(round.collected, round.expected)} /></div>
              <span className="text-xs muted">
                <Amount units={round.collected} asset={group.asset} size="sm" showAsset={false} /> / <Amount units={round.expected} asset={group.asset} size="sm" />
              </span>
            </div>
          </div>
        );
      })}
      <p className="px-1 text-xs muted">Each round, every member pays the collector directly. The collector&apos;s own contribution stays with them.</p>
    </section>
  );
}

function ActivityList({ group }: { group: PublicGroup }) {
  if (group.activity.length === 0) return <p className="paper mt-3 px-4 py-6 text-center text-sm muted">No payments or reminders yet. Shares show up here once someone pays or you send a nudge.</p>;
  return (
    <section className="paper mt-3 px-4 py-1">
      {group.activity.map((item) => (
        <div key={item.id} className="row">
          <span className={`avatar ${item.kind === "payment_confirmed" || item.kind === "payout_ready" ? "on" : ""}`} style={{ width: 32, height: 32, fontSize: 12 }}>
            {item.kind === "payment_confirmed" ? "✓" : item.kind === "reminder_sent" ? "!" : item.kind === "payout_ready" ? "★" : item.kind === "member_joined" ? "+" : "•"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm">{item.text}</p>
            <p className="text-xs muted">{new Date(item.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
          {item.paymentId ? <Link href={`/r/${group.id}/${item.paymentId}`} className="btn btn-ghost btn-small">Receipt</Link> : null}
        </div>
      ))}
    </section>
  );
}

function RemindSheet({ group, open, onClose, onDone, onToast }: { group: PublicGroup; open: boolean; onClose: () => void; onDone: () => void; onToast: (text: string) => void }) {
  const unpaid = useMemo(() => liveShares(group).filter((share) => share.status === "unpaid"), [group]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<ReminderOut[] | null>(null);

  useEffect(() => {
    if (open) {
      setPicked(unpaid.filter((share) => share.canRemind).map((share) => share.id));
      setOut(null);
      setError(null);
    }
  }, [open, unpaid]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ reminders: ReminderOut[] }>(`/api/groups/${group.id}/remind`, { method: "POST", groupId: group.id, body: JSON.stringify({ shareIds: picked }) });
      setOut(result.reminders);
      onDone();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  async function shareMessage(item: ReminderOut) {
    if (navigator.share) {
      try {
        await navigator.share({ text: item.message });
        return;
      } catch {
        // fall back to copy
      }
    }
    await navigator.clipboard.writeText(item.message).then(() => onToast("Reminder copied"), () => onToast(item.message));
  }

  return (
    <Sheet open={open} onClose={onClose} title={out ? "Reminders ready" : "Remind unpaid members"}>
      {out ? (
        <div className="grid gap-2">
          {out.map((item) => (
            <div key={item.shareId} className="paper p-3">
              <p className="text-sm"><b className="font-medium">{item.memberName}</b> <span className="muted">· {item.amountLabel}</span></p>
              <p className="mt-1 text-xs muted">{item.emailed ? "Emailed. " : ""}Send this to them on WhatsApp or anywhere:</p>
              <p className="mt-2 rounded-xl bg-[var(--bg)] p-2 text-xs">{item.message}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="btn btn-primary btn-small" onClick={() => void shareMessage(item)}>Share</button>
                <a className="btn btn-ghost btn-small" href={`https://wa.me/?text=${encodeURIComponent(item.message)}`} target="_blank" rel="noreferrer">WhatsApp</a>
              </div>
            </div>
          ))}
          {out.length === 0 ? <p className="text-sm muted">Everyone picked was reminded in the last 12 hours.</p> : null}
          <button className="btn btn-ghost btn-block mt-2" onClick={onClose}>Done</button>
        </div>
      ) : (
        <>
          <div className="paper px-4 py-1">
            {unpaid.length === 0 ? <p className="py-3 text-sm muted">Everyone has paid.</p> : null}
            {unpaid.map((share) => (
              <label key={share.id} className="row cursor-pointer">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[#181C25]"
                  checked={picked.includes(share.id)}
                  disabled={!share.canRemind}
                  onChange={(event) => setPicked((list) => (event.target.checked ? [...list, share.id] : list.filter((item) => item !== share.id)))}
                />
                <span className="flex-1">
                  {share.memberName}
                  <span className="block text-xs muted">{share.canRemind ? (share.overdue ? "Overdue" : `Due ${formatDay(share.dueDate)}`) : "Reminded recently"}</span>
                </span>
                <Amount units={share.amount} asset={group.asset} size="sm" />
              </label>
            ))}
          </div>
          <ErrorNote text={error} />
          <button className="btn btn-primary btn-block mt-3" disabled={busy || picked.length === 0} onClick={() => void send()}>
            {busy ? <span className="spinner" /> : null}
            Create {picked.length} reminder{picked.length === 1 ? "" : "s"}
          </button>
          <p className="mt-2 text-center text-xs muted">Members who left an email get it by email too.</p>
        </>
      )}
    </Sheet>
  );
}
