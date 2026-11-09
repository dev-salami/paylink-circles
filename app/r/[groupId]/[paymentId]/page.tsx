"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Amount, BackLink, ErrorNote, Logo, Skeleton, Toast, useToast } from "@/components/ui";
import { api } from "@/lib/client/api";
import { shortAddress } from "@/lib/domain/address";
import { formatDayLong } from "@/lib/domain/dates";
import type { Payment } from "@/lib/domain/types";

interface Receipt {
  payment: Payment;
  group: { id: string; title: string; kind: "bill" | "ajo"; asset: "NIM" | "USDT" };
  payerName: string;
  recipientName: string;
  round: number | null;
  expected: string;
  dueDate?: string;
}

const CHAIN_LABEL: Record<string, string> = { "nimiq-testnet": "Nimiq testnet", "nimiq-mainnet": "Nimiq", polygon: "Polygon", sepolia: "Sepolia testnet" };

export default function ReceiptPage() {
  const { groupId, paymentId } = useParams<{ groupId: string; paymentId: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useToast();

  useEffect(() => {
    api<Receipt>(`/api/groups/${groupId}/receipts/${paymentId}`).then(setReceipt, (problem: Error) => setError(problem.message));
  }, [groupId, paymentId]);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "PayLink receipt", url });
        return;
      } catch {
        // fall through
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast("Receipt link copied");
    } catch {
      setToast(url);
    }
  }

  return (
    <main className="app">
      <header className="flex items-center justify-between py-2">
        <BackLink href={`/g/${groupId}`} />
        <span className="micro">Receipt</span>
        <span className="w-11" />
      </header>
      {!receipt ? (
        error ? <ErrorNote text={error} /> : <Skeleton className="mt-6 h-96" />
      ) : (
        <>
          <section className="paper mt-4 overflow-hidden">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <Logo />
                <span className="pill paid"><i />Confirmed</span>
              </div>
              <p className="micro mt-8">{receipt.payerName} paid {receipt.recipientName}</p>
              <div className="mt-4"><Amount units={receipt.payment.amount} asset={receipt.payment.asset} /></div>
              <p className="mt-3 text-sm muted">
                {receipt.group.title}
                {receipt.round !== null ? ` · round ${receipt.round + 1}` : ""}
              </p>
            </div>
            <div className="border-t border-dashed border-[var(--line)] px-5 py-1 text-sm">
              <div className="row"><span className="flex-1 muted">Confirmed</span><span>{new Date(receipt.payment.confirmedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span></div>
              {receipt.dueDate ? <div className="row"><span className="flex-1 muted">Was due</span><span>{formatDayLong(receipt.dueDate)}</span></div> : null}
              <div className="row"><span className="flex-1 muted">Network</span><span>{CHAIN_LABEL[receipt.payment.chain] ?? receipt.payment.chain}</span></div>
              {receipt.payment.blockNumber ? <div className="row"><span className="flex-1 muted">Block</span><span className="num">{receipt.payment.blockNumber.toLocaleString()}</span></div> : null}
              <div className="row"><span className="flex-1 muted">From</span><span className="mono">{shortAddress(receipt.payment.from)}</span></div>
              <div className="row"><span className="flex-1 muted">To</span><span className="mono">{shortAddress(receipt.payment.to)}</span></div>
              {receipt.payment.memo ? <div className="row"><span className="flex-1 muted">Memo</span><span className="mono max-w-[65%] text-right">{receipt.payment.memo}</span></div> : null}
              <div className="row items-start"><span className="flex-1 muted">Transaction</span><span className="mono max-w-[60%] text-right">{receipt.payment.txHash}</span></div>
            </div>
          </section>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a className="btn btn-primary btn-block" href={receipt.payment.explorerUrl} target="_blank" rel="noreferrer">Explorer</a>
            <button className="btn btn-ghost btn-block" onClick={() => void share()}>Share</button>
          </div>
          <Link href={`/g/${groupId}`} className="btn btn-ghost btn-block mt-2">Back to {receipt.group.title}</Link>
        </>
      )}
      <Toast text={toast} />
    </main>
  );
}
