"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HostBanner } from "@/components/host-banner";
import { Amount, AssetChip, BackLink, ErrorNote, InfoNote, Skeleton, Toast, useToast } from "@/components/ui";
import { api } from "@/lib/client/api";
import { payNim, payUsdt, walletErrorMessage } from "@/lib/client/host";
import { useHost } from "@/lib/client/use-host";
import { shortAddress } from "@/lib/domain/address";
import { formatDayLong } from "@/lib/domain/dates";
import { fromUnits } from "@/lib/domain/money";
import type { PayIntent } from "@/lib/service";

type Phase = "review" | "approve" | "confirming" | "paid";
type Claim = { status: "paid"; payment: { id: string } } | { status: "pending"; reason: string } | { status: "rejected"; reason: string };

const STEPS: Array<{ phase: Phase; label: string }> = [
  { phase: "review", label: "Check the amount" },
  { phase: "approve", label: "Approve in Nimiq Pay" },
  { phase: "confirming", label: "Confirming on chain" },
  { phase: "paid", label: "Paid, receipt ready" },
];

export default function PayPage() {
  const { groupId, shareId } = useParams<{ groupId: string; shareId: string }>();
  const router = useRouter();
  const host = useHost();
  const [intent, setIntent] = useState<PayIntent | null>(null);
  const [phase, setPhase] = useState<Phase>("review");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [broadcast, setBroadcast] = useState<string | null>(null);
  const [toast, setToast] = useToast();
  const polling = useRef(false);
  const alive = useRef(true);
  const intentRef = useRef<PayIntent | null>(null);
  intentRef.current = intent;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    api<PayIntent>(`/api/groups/${groupId}/shares/${shareId}/intent`)
      .then((data) => {
        setIntent(data);
        if (data.status !== "unpaid" && data.paymentId) setPhase("paid");
      })
      .catch((problem: Error) => setError(problem.message));
  }, [groupId, shareId]);

  const confirm = useCallback(
    async (hash: string, fromWallet = false) => {
      if (polling.current) return;
      polling.current = true;
      setPhase("confirming");
      setTxHash(hash);
      setError(null);
      const started = Date.now();
      try {
        while (Date.now() - started < 4 * 60 * 1000) {
          if (!alive.current) return;
          const claim = await api<Claim>(`/api/groups/${groupId}/shares/${shareId}/claim`, { method: "POST", body: JSON.stringify({ txHash: hash }) }).catch(
            (problem: Error) => ({ status: "pending", reason: problem.message }) as Claim,
          );
          if (!alive.current) return;
          if (claim.status === "paid") {
            setPhase("paid");
            setIntent((current) => (current ? { ...current, status: "paid", paymentId: claim.payment.id } : current));
            return;
          }
          if (claim.status === "rejected") {
            setPhase("review");
            if (fromWallet) {
              setBroadcast(hash);
              setError(`${claim.reason} This transaction was already broadcast. Check it before you pay again.`);
            } else {
              setError(claim.reason);
            }
            return;
          }
          const chainName = intentRef.current?.evm?.chainName;
          const extra = Date.now() - started > 20_000 && intentRef.current?.asset === "USDT" && chainName
            ? `If it was sent on a chain other than ${chainName}, it will not show up here.`
            : "";
          setNote(extra ? `${claim.reason} ${extra}` : claim.reason);
          await new Promise((resolve) => setTimeout(resolve, 4000));
        }
        if (!alive.current) return;
        setPhase("review");
        if (fromWallet) setBroadcast(hash);
        setNote("Payment not confirmed yet. Check this transaction again before sending another payment.");
      } finally {
        polling.current = false;
      }
    },
    [groupId, shareId],
  );

  async function pay() {
    if (!intent) return;
    setError(null);
    setNote(null);
    setPhase("approve");
    try {
      const hash =
        intent.asset === "NIM"
          ? await payNim({ recipient: intent.recipient, luna: intent.amount, memo: intent.memo, network: intent.chain === "nimiq-mainnet" ? "mainnet" : "testnet" })
          : await payUsdt({
              chainIdHex: intent.evm?.chainIdHex ?? "",
              token: intent.evm?.token ?? "",
              to: intent.recipient,
              amount: intent.amount,
              from: intent.evm?.payer,
              chainName: intent.evm?.chainName,
              gasToken: intent.evm?.gasToken,
            });
      setBroadcast(hash);
      await confirm(hash, true);
    } catch (problem) {
      const { message, cancelled } = walletErrorMessage(problem);
      setPhase("review");
      if (cancelled) setNote(message);
      else setError(message);
    }
  }

  async function lookForIt() {
    setNote("Checking the chain for your payment…");
    try {
      await api(`/api/groups/${groupId}/sync`, { method: "POST" });
      const fresh = await api<PayIntent>(`/api/groups/${groupId}/shares/${shareId}/intent`);
      setIntent(fresh);
      if (fresh.status === "paid") setPhase("paid");
      else setNote("Not found yet. Make sure the memo is included; it can take a minute.");
    } catch (problem) {
      setNote(problem instanceof Error ? problem.message : String(problem));
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${label} copied`);
    } catch {
      setToast(text);
    }
  }

  if (!intent) {
    return (
      <main className="app">
        <header className="py-2"><BackLink href={`/g/${groupId}`} /></header>
        {error ? <ErrorNote text={error} /> : <Skeleton className="mt-6 h-72" />}
      </main>
    );
  }

  const active = STEPS.findIndex((step) => step.phase === phase);
  const nimNetwork = intent.chain === "nimiq-mainnet" ? "mainnet" : intent.chain === "nimiq-testnet" ? "testnet" : undefined;
  const nimMismatch = intent.asset === "NIM" && host.inside && Boolean(host.network && nimNetwork && host.network !== nimNetwork);

  return (
    <main className="app">
      <header className="flex items-center justify-between py-2">
        <BackLink href={`/g/${groupId}`} />
        <AssetChip asset={intent.asset} chain={intent.chain} />
        <span className="w-11" />
      </header>

      <section className="mt-4 px-1 text-center">
        <p className="micro">{intent.payerName} pays {intent.recipientName}</p>
        <div className="mt-5"><Amount units={intent.amount} asset={intent.asset} /></div>
        <p className="mt-3 text-sm muted">Due {formatDayLong(intent.dueDate)}</p>
      </section>

      <section className="paper mt-6 p-4">
        <div className="steps">
          {STEPS.map((step, index) => (
            <div key={step.phase} className={`step ${index < active || phase === "paid" ? "done" : index === active ? "active" : ""}`}>
              <b>{index < active || phase === "paid" ? "✓" : index + 1}</b>
              {step.label}
              {index === active && phase === "confirming" ? <span className="spinner ml-auto" /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="paper mt-3 px-4 py-1 text-sm">
        <div className="row"><span className="flex-1 muted">To</span><button className="mono min-w-0 max-w-[70%] text-right" onClick={() => void copy(intent.recipient, "Address")}>{host.inside ? shortAddress(intent.recipient) : intent.recipient}</button></div>
        {intent.asset === "NIM" ? (
          <div className="row"><span className="flex-1 muted">Memo</span><button className="mono min-w-0 max-w-[70%] text-right" onClick={() => void copy(intent.memo, "Memo")}>{intent.memo}</button></div>
        ) : (
          <div className="row"><span className="flex-1 muted">Match</span><span className="max-w-[70%] text-right">The {intent.evm?.chainName ?? "USDT"} transfer. No memo.</span></div>
        )}
        {intent.asset === "USDT" ? <div className="row"><span className="flex-1 muted">Network</span><span>{intent.evm?.chainName} · gas in {intent.evm?.gasToken}</span></div> : null}
        {intent.asset === "USDT" ? <div className="row"><span className="flex-1 muted">Token</span><span className="mono max-w-[70%] text-right">{intent.evm?.token}</span></div> : null}
        {txHash ? <div className="row"><span className="flex-1 muted">Transaction</span><span className="mono">{shortAddress(txHash)}</span></div> : null}
      </section>

      <HostBanner compact asset={intent.asset} nimNetwork={intent.chain === "nimiq-mainnet" ? "mainnet" : intent.chain === "nimiq-testnet" ? "testnet" : undefined} />
      <ErrorNote text={error} />
      {note ? <InfoNote>{note}</InfoNote> : null}

      {phase === "paid" ? (
        <div className="mt-4 grid gap-2">
          {intent.paymentId ? <Link href={`/r/${groupId}/${intent.paymentId}`} className="btn btn-mint btn-block">View receipt</Link> : null}
          <button className="btn btn-ghost btn-block" onClick={() => router.push(`/g/${groupId}`)}>Back to group</button>
        </div>
      ) : host.inside ? (
        broadcast && phase === "review" ? (
          <div className="mt-4 grid gap-2">
            <button className="btn btn-primary btn-block" onClick={() => void confirm(broadcast)}>Check this transaction</button>
            <button className="btn btn-ghost btn-block" onClick={() => { setBroadcast(null); setError(null); setNote(null); }}>Pay again</button>
          </div>
        ) : (
          <button className="btn btn-primary btn-block mt-4" disabled={phase !== "review" || nimMismatch} onClick={() => void pay()}>
            {phase === "approve" ? <span className="spinner" /> : null}
            {nimMismatch
              ? `Switch Nimiq Pay to ${nimNetwork}`
              : phase === "approve"
                ? "Waiting for Nimiq Pay…"
                : phase === "confirming"
                  ? "Confirming…"
                  : `Pay ${fromUnits(intent.amount, intent.asset)} ${intent.asset}`}
          </button>
        )
      ) : (
        <div className="mt-4 grid gap-2">
          <div className="card-dark p-4 text-sm">
            <p className="font-medium">{intent.asset === "USDT" ? "USDT pays inside Nimiq Pay" : "Or pay NIM from any wallet"}</p>
            {intent.asset === "USDT" ? (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#c9ccd3]">
                <li>Use Open in Nimiq Pay above, or paste the page link into Mini Apps → Custom URL.</li>
                <li>Approve the transfer on {intent.evm?.chainName ?? "Polygon"}. Gas is a little {intent.evm?.gasToken ?? "POL"}.</li>
                <li>There is no memo. The payment is the USDT transfer to the address above.</li>
              </ol>
            ) : (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#c9ccd3]">
                <li>Use Open in Nimiq Pay above, or paste the page link into Mini Apps → Custom URL.</li>
                <li>Or send {fromUnits(intent.amount, intent.asset)} NIM on {nimNetwork} to the address above from another wallet.</li>
                <li>Include the memo exactly, then check the chain or paste the hash.</li>
              </ol>
            )}
          </div>
          {intent.asset === "NIM" ? <button className="btn btn-ghost btn-block" onClick={() => void lookForIt()}>I&apos;ve paid, check the chain</button> : null}
        </div>
      )}
      {phase !== "paid" ? (
        <div className="paper mt-3 p-3">
          <label className="label" htmlFor="hash">Already paid? Paste the transaction hash</label>
          <div className="flex gap-2">
            <input id="hash" className="field mono min-w-0 flex-1" value={pasted} placeholder={intent.asset === "NIM" ? "64-character hash" : "0x…"} onChange={(event) => setPasted(event.target.value.trim())} />
            <button className="btn btn-primary flex-none" disabled={!pasted || phase === "confirming"} onClick={() => void confirm(pasted)}>Verify</button>
          </div>
        </div>
      ) : null}
      <Toast text={toast} />
    </main>
  );
}
