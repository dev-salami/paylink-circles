"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HostBanner } from "@/components/host-banner";
import { AssetChip, BackLink, ErrorNote, Skeleton } from "@/components/ui";
import { api, type PublicGroup } from "@/lib/client/api";
import { connectEvm, connectNimiq, walletErrorMessage } from "@/lib/client/host";
import { rememberAddress, saveEntry } from "@/lib/client/local";
import { useHost } from "@/lib/client/use-host";
import { isValidEvmAddress, isValidNimiqAddress, normalizeNimiqAddress, shortAddress } from "@/lib/domain/address";
import type { Asset, ChainId, GroupKind } from "@/lib/domain/types";

interface Invite {
  groupId: string;
  title: string;
  kind: GroupKind;
  asset: Asset;
  chain: ChainId;
  organizer: string;
  openSpots: Array<{ id: string; name: string; slot: number }>;
}

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const host = useHost();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [spot, setSpot] = useState<string>("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Invite>(`/api/invite/${code}`)
      .then((data) => {
        setInvite(data);
        const first = data.openSpots[0];
        if (first) {
          setSpot(first.id);
          setName(/^Member \d+$/.test(first.name) ? "" : first.name);
        }
      })
      .catch((problem: Error) => setError(problem.message));
  }, [code]);

  const asset = invite?.asset ?? "NIM";
  const addressOk = !address || (asset === "NIM" ? isValidNimiqAddress(address) : isValidEvmAddress(address));
  const needsAddress = invite?.kind === "ajo";

  async function connect() {
    setError(null);
    try {
      const value = asset === "NIM" ? await connectNimiq() : await connectEvm();
      setAddress(asset === "NIM" ? normalizeNimiqAddress(value) : value);
    } catch (problem) {
      setError(walletErrorMessage(problem).message);
    }
  }

  async function join() {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      const wallet = address ? (asset === "NIM" ? { nimAddress: normalizeNimiqAddress(address) } : { evmAddress: address.trim() }) : {};
      const result = await api<{ memberId: string; memberToken: string; group: PublicGroup }>(`/api/groups/${invite.groupId}/join`, {
        method: "POST",
        body: JSON.stringify({ inviteCode: code.toUpperCase(), memberId: spot || undefined, name, email: email || undefined, ...wallet }),
      });
      saveEntry({ id: invite.groupId, memberId: result.memberId, memberToken: result.memberToken, title: invite.title });
      if (address) rememberAddress(asset === "NIM" ? normalizeNimiqAddress(address) : address.trim());
      router.push(`/g/${invite.groupId}`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="flex items-center justify-between py-2">
        <BackLink />
        <span className="micro">Join group</span>
        <span className="w-11" />
      </header>

      {!invite ? (
        error ? <ErrorNote text={error} /> : <Skeleton className="mt-6 h-64" />
      ) : (
        <>
          <section className="card-dark mt-4 overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <span className="micro">{invite.organizer} invited you</span>
              <AssetChip asset={invite.asset} chain={invite.chain} />
            </div>
            <h1 className="h1 mt-4">{invite.title}</h1>
            <p className="mt-2 text-sm muted">
              {invite.kind === "ajo"
                ? "An ajo circle: everyone contributes each round, and each member collects the pot once."
                : "A bill split: pay your share straight to the organizer."}
            </p>
          </section>

          {invite.openSpots.length === 0 ? (
            <div className="paper mt-3 p-5 text-center">
              <p className="h2">Every spot is taken</p>
              <p className="mt-2 text-sm muted">Ask {invite.organizer} if a spot opens up. This invite can&apos;t add another member.</p>
            </div>
          ) : (
            <>
              <section className="paper mt-3 p-4">
                <span className="label">Pick your spot</span>
                <div className="flex flex-wrap gap-2">
                  {invite.openSpots.map((item) => (
                    <button
                      key={item.id}
                      className={`btn btn-small ${spot === item.id ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => {
                        setSpot(item.id);
                        setName(/^Member \d+$/.test(item.name) ? "" : item.name);
                      }}
                    >
                      {invite.kind === "ajo" ? `#${item.slot + 1} · ` : ""}
                      {item.name}
                    </button>
                  ))}
                </div>
                <label className="label mt-4" htmlFor="name">Your name</label>
                <input id="name" className="field" value={name} maxLength={40} required placeholder="Name the group knows you by" onChange={(event) => setName(event.target.value)} />
              </section>

              <section className="paper mt-3 p-4">
                <p className="h2">Your wallet</p>
                <p className="mt-1 text-sm muted">
                  {needsAddress ? "Required: your payout will be sent here when it's your turn." : "Optional: lets the organizer match your payment to you."}
                </p>
                {address && addressOk ? (
                  <div className="mt-3 flex items-center justify-between rounded-2xl bg-[var(--bg)] px-3 py-3">
                    <span className="mono">{shortAddress(address)}</span>
                    <button className="btn btn-ghost btn-small" onClick={() => setAddress("")}>Change</button>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2">
                    <button className="btn btn-primary btn-block" onClick={() => void connect()}>Connect Nimiq Pay</button>
                    {!host.inside ? <input className="field mono" placeholder={asset === "NIM" ? "or paste NQ.. address" : "or paste 0x.. address"} value={address} onChange={(event) => setAddress(event.target.value)} /> : null}
                  </div>
                )}
                <label className="label mt-4" htmlFor="email">Email for reminders (optional)</label>
                <input id="email" className="field" type="email" value={email} placeholder="you@example.com" onChange={(event) => setEmail(event.target.value)} />
                <label className="mt-4 flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 flex-none accent-[#181C25]" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  <span className="muted">
                    I agree that my name, wallet address and optional email are shared with this group and stored to run it. Payments are public on chain. <a className="underline" href="/privacy">Privacy</a>
                  </span>
                </label>
              </section>

              <HostBanner compact asset={invite.asset} nimNetwork={invite.chain === "nimiq-mainnet" ? "mainnet" : invite.chain === "nimiq-testnet" ? "testnet" : undefined} />
              <ErrorNote text={error} />
              <button className="btn btn-mint btn-block mt-4" disabled={busy || !consent || !name.trim() || !addressOk || (needsAddress && !address)} onClick={() => void join()}>
                {busy ? <span className="spinner" /> : null}
                Join {invite.kind === "ajo" ? "circle" : "split"}
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}
