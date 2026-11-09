"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertsButton } from "@/components/alerts";
import { HostBanner } from "@/components/host-banner";
import { Amount, AssetChip, Bars, Logo, Meter, Skeleton } from "@/components/ui";
import { api, type PublicGroup } from "@/lib/client/api";
import { myOpenShares, owedToMe, ratio, sumBy } from "@/lib/client/derive";
import { readEntries } from "@/lib/client/local";
import { formatDay } from "@/lib/domain/dates";
import type { Asset } from "@/lib/domain/types";

type Filter = "all" | "bill" | "ajo";

export default function Home() {
  const [groups, setGroups] = useState<PublicGroup[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hadEntries, setHadEntries] = useState(false);

  const load = useCallback(async () => {
    const entries = readEntries();
    setHadEntries(entries.length > 0);
    if (entries.length === 0) {
      setLoadError(null);
      setGroups([]);
      return;
    }
    try {
      const data = await api<{ groups: PublicGroup[] }>("/api/groups/list", {
        method: "POST",
        body: JSON.stringify({ entries: entries.map(({ id, adminToken, memberToken }) => ({ id, adminToken, memberToken })) }),
      });
      setLoadError(null);
      setGroups(data.groups);
    } catch (problem) {
      setLoadError(problem instanceof Error ? problem.message : "Couldn't load your groups");
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const owe = useMemo(() => sumBy(groups ?? [], myOpenShares), [groups]);
  const owed = useMemo(() => sumBy(groups ?? [], owedToMe), [groups]);
  const visible = (groups ?? []).filter((group) => filter === "all" || group.kind === filter);
  const primary: Asset = owe.USDT > 0n && owe.NIM === 0n ? "USDT" : "NIM";

  return (
    <main className="app">
      <header className="flex items-center justify-between py-2">
        <Logo />
        <AlertsButton groups={groups ?? []} />
      </header>
      <HostBanner />

      <section className="card-dark mt-4 p-5">
        <div className="flex items-center justify-between">
          <span className="micro">You owe</span>
          <Link href="/new" className="btn btn-mint btn-small">New group</Link>
        </div>
        <div className="mt-5">
          {groups === null ? <Skeleton className="h-16 w-48 !bg-[#2c3240]" /> : <Amount units={owe[primary].toString()} asset={primary} />}
        </div>
        {owe.USDT > 0n && primary === "NIM" ? (
          <p className="mt-2 text-lg"><Amount units={owe.USDT.toString()} asset="USDT" size="sm" /></p>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[#2c3240] pt-4">
          <div>
            <p className="micro">Owed to you</p>
            <p className="mt-2 text-2xl">
              <Amount units={(owed.NIM > 0n || owed.USDT === 0n ? owed.NIM : owed.USDT).toString()} asset={owed.NIM > 0n || owed.USDT === 0n ? "NIM" : "USDT"} size="md" />
            </p>
          </div>
          <div>
            <p className="micro">Groups</p>
            <p className="num mt-2 text-2xl">{groups?.length ?? "–"}</p>
          </div>
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between">
        <div className="tabs" role="tablist">
          {(["all", "bill", "ajo"] as const).map((item) => (
            <button key={item} role="tab" aria-selected={filter === item} onClick={() => setFilter(item)}>
              {item === "all" ? "All" : item === "bill" ? "Bills" : "Ajo"}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-small" onClick={() => void load()}>Refresh</button>
      </div>

      <section className="mt-4 grid gap-3">
        {groups === null ? (
          <>
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </>
        ) : loadError && hadEntries && visible.length === 0 && filter === "all" ? (
          <div className="paper p-5 text-center">
            <p className="h2">Couldn&apos;t load your groups</p>
            <p className="mx-auto mt-2 max-w-xs text-sm muted">{loadError}</p>
            <button className="btn btn-primary btn-block mt-4" onClick={() => void load()}>Try again</button>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState hasAny={(groups ?? []).length > 0} />
        ) : (
          visible.map((group) => <GroupCard key={group.id} group={group} />)
        )}
      </section>

      <footer className="mt-10 text-center text-xs muted">
        Payments go straight from wallet to wallet in Nimiq Pay. PayLink never holds funds.
        <br />
        <Link href="/privacy" className="underline">Privacy</Link>
      </footer>
    </main>
  );
}

function GroupCard({ group }: { group: PublicGroup }) {
  const mine = myOpenShares(group)[0];
  const current = group.kind === "ajo" ? group.rounds.find((round) => round.index === group.currentRound) : undefined;
  return (
    <Link href={`/g/${group.id}`} className="paper block p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="micro">{group.kind === "ajo" ? `Ajo · ${group.frequency}` : "Bill split"}</p>
          <p className="h2 mt-1 truncate">{group.title}</p>
        </div>
        <AssetChip asset={group.asset} chain={group.chain} />
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Amount units={group.totals.collected} asset={group.asset} size="md" showAsset={false} />
          <span className="ml-1 text-sm muted">/ <Amount units={group.totals.expected} asset={group.asset} size="sm" /></span>
          <p className="mt-1 text-xs muted">
            {group.totals.paid} of {group.totals.count} paid
            {current ? ` · round ${current.index + 1} to ${current.recipientName}` : ""}
          </p>
        </div>
        <div className="w-24">
          <Bars height={40} values={(group.kind === "ajo" ? group.shares.filter((share) => share.round === group.currentRound) : group.shares).map((share) => ({ on: share.status !== "unpaid" }))} />
        </div>
      </div>
      <div className="mt-3"><Meter ratio={ratio(group.totals.collected, group.totals.expected)} /></div>
      {mine ? (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-[var(--bg)] px-3 py-2 text-sm">
          <span>You owe <b className="font-medium"><Amount units={mine.amount} asset={group.asset} size="sm" /></b></span>
          <span className={mine.overdue ? "text-[var(--danger)]" : "muted"}>{mine.overdue ? "Overdue" : `Due ${formatDay(mine.dueDate)}`}</span>
        </div>
      ) : null}
    </Link>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="paper overflow-hidden p-5 text-center">
      <img src="/art/circle-hands.webp" alt="" className="art mx-auto -mt-2 w-60" />
      <p className="h2">{hasAny ? "Nothing in this tab" : "Split it. Save together."}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm muted">
        Start a bill split for dinner or rent, or an ajo circle where everyone contributes and one person collects each round. Everyone pays in NIM or USDT.
      </p>
      <div className="mt-5 grid gap-2">
        <Link href="/new?kind=bill" className="btn btn-primary btn-block">Split a bill</Link>
        <Link href="/new?kind=ajo" className="btn btn-ghost btn-block">Start an ajo circle</Link>
      </div>
    </div>
  );
}
