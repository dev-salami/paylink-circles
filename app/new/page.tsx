"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HostBanner } from "@/components/host-banner";
import { Amount, BackLink, ErrorNote } from "@/components/ui";
import { api, type PublicGroup } from "@/lib/client/api";
import { connectEvm, connectNimiq, walletErrorMessage } from "@/lib/client/host";
import { useHost } from "@/lib/client/use-host";
import { rememberAddress, saveEntry } from "@/lib/client/local";
import { useConfig } from "@/lib/client/use-config";
import { isValidEvmAddress, isValidNimiqAddress, normalizeNimiqAddress, shortAddress } from "@/lib/domain/address";
import { addDays, isoDate, roundDate } from "@/lib/domain/dates";
import { splitEvenly, toUnits } from "@/lib/domain/money";
import type { Asset, Frequency, GroupKind } from "@/lib/domain/types";

export default function NewGroup() {
  const router = useRouter();
  const { config, error: configError } = useConfig();
  const host = useHost();
  const [kind, setKind] = useState<GroupKind>("bill");
  const [asset, setAsset] = useState<Asset>("NIM");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [myName, setMyName] = useState("");
  const [others, setOthers] = useState<string[]>(["", ""]);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [date, setDate] = useState(() => isoDate(addDays(new Date(), 7)));
  const [shuffle, setShuffle] = useState(false);
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("kind");
    if (preset === "ajo" || preset === "bill") setKind(preset);
  }, []);

  const count = 1 + others.length;
  const preview = useMemo(() => {
    try {
      const units = toUnits(amount || "0", asset);
      if (units <= 0n) return null;
      if (kind === "bill") return { each: splitEvenly(units, count)[0]?.toString() ?? "0", pot: units.toString() };
      return { each: units.toString(), pot: (units * BigInt(count - 1)).toString() };
    } catch {
      return null;
    }
  }, [amount, asset, kind, count]);

  const addressOk = asset === "NIM" ? isValidNimiqAddress(address) : isValidEvmAddress(address);

  async function connect() {
    setError(null);
    try {
      const value = asset === "NIM" ? await connectNimiq() : await connectEvm();
      setAddress(asset === "NIM" ? normalizeNimiqAddress(value) : value);
    } catch (problem) {
      setError(walletErrorMessage(problem).message);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const organizerAddress = asset === "NIM" ? { nimAddress: normalizeNimiqAddress(address) } : { evmAddress: address.trim() };
      const result = await api<{ group: PublicGroup; adminToken: string; memberToken: string; memberId: string }>("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          kind,
          title,
          asset,
          amount,
          memberNames: [myName, ...others],
          organizer: { name: myName, email: email || undefined, ...organizerAddress },
          frequency: kind === "ajo" ? frequency : undefined,
          date,
          shuffle: kind === "ajo" ? shuffle : undefined,
        }),
      });
      saveEntry({ id: result.group.id, adminToken: result.adminToken, memberToken: result.memberToken, memberId: result.memberId, title: result.group.title });
      rememberAddress(asset === "NIM" ? normalizeNimiqAddress(address) : address.trim());
      router.push(`/g/${result.group.id}?created=1`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="flex items-center justify-between py-2">
        <BackLink />
        <span className="micro">New group</span>
        <span className="w-11" />
      </header>

      <div className="tabs block mt-4" role="tablist">
        <button role="tab" aria-selected={kind === "bill"} onClick={() => setKind("bill")}>Bill split</button>
        <button role="tab" aria-selected={kind === "ajo"} onClick={() => setKind("ajo")}>Ajo circle</button>
      </div>
      <p className="mt-3 px-1 text-sm muted">
        {kind === "bill"
          ? "You paid the bill. Everyone sends you their share."
          : "Everyone contributes each round. One member collects the whole pot, in turn, until everyone has had a payout."}
      </p>

      <section className="paper mt-4 grid gap-4 p-4">
        <div>
          <label className="label" htmlFor="title">{kind === "bill" ? "What's it for?" : "Circle name"}</label>
          <input id="title" className="field" placeholder={kind === "bill" ? "Dinner at Yellow Chilli" : "Lekki Ladies Ajo"} value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} />
        </div>

        <div>
          <span className="label">Pay in</span>
          <div className="tabs block">
            <button aria-pressed={asset === "NIM"} onClick={() => { setAsset("NIM"); setAddress(""); }}>NIM</button>
            <button aria-pressed={asset === "USDT"} disabled={!config?.usdt} onClick={() => { setAsset("USDT"); setAddress(""); }}>
              {config?.usdt ? `USDT · ${config.usdt.name}` : config ? "USDT · off" : "USDT"}
            </button>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="amount">{kind === "bill" ? `Total bill (${asset})` : `Each person puts in per round (${asset})`}</label>
          <input id="amount" className="field num !text-2xl" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {kind === "ajo" ? (
            <div>
              <label className="label" htmlFor="freq">Every</label>
              <select id="freq" className="field" value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}>
                <option value="weekly">Week</option>
                <option value="biweekly">2 weeks</option>
                <option value="monthly">Month</option>
              </select>
            </div>
          ) : null}
          <div className={kind === "bill" ? "col-span-2" : ""}>
            <label className="label" htmlFor="date">{kind === "bill" ? "Pay by" : "First payout"}</label>
            <input id="date" type="date" className="field" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>
      </section>

      <section className="paper mt-3 p-4">
        <div className="flex items-center justify-between">
          <p className="h2">People <span className="muted">· {count}</span></p>
          <button className="btn btn-ghost btn-small" disabled={count >= 20} onClick={() => setOthers((list) => [...list, ""])}>Add</button>
        </div>
        <div className="mt-3 grid gap-2">
          <div className="flex items-center gap-2">
            <span className="pill dark w-16 justify-center">{kind === "ajo" && !shuffle ? "#1" : "You"}</span>
            <input className="field" placeholder="Your name" required value={myName} maxLength={40} onChange={(event) => setMyName(event.target.value)} />
          </div>
          {others.map((name, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="pill w-16 justify-center">{kind === "ajo" && !shuffle ? `#${index + 2}` : index + 2}</span>
              <input className="field" placeholder={`Member ${index + 2} (optional)`} value={name} maxLength={40} onChange={(event) => setOthers((list) => list.map((item, at) => (at === index ? event.target.value : item)))} />
              <button className="icon-btn flex-none" aria-label="Remove" disabled={others.length <= 1} onClick={() => setOthers((list) => list.filter((_, at) => at !== index))}>×</button>
            </div>
          ))}
        </div>
        {kind === "ajo" ? (
          <label className="mt-3 flex min-h-[44px] items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[#181C25]" checked={shuffle} onChange={(event) => setShuffle(event.target.checked)} />
            Shuffle the payout order
          </label>
        ) : null}
        <p className="mt-2 text-xs muted">Each person claims their spot from the invite link and connects their own wallet.</p>
      </section>

      {preview ? (
        <section className="card-dark mt-3 p-5">
          <p className="micro">{kind === "bill" ? "Each person pays you" : "Pot each round"}</p>
          <div className="mt-3">
            <Amount units={kind === "bill" ? preview.each : preview.pot} asset={asset} size="big" />
          </div>
          {kind === "ajo" ? (
            <p className="mt-3 text-sm muted">
              {count} rounds, {frequency}, from {date}. Last payout {roundDate(date, frequency, count - 1)}.
            </p>
          ) : (
            <p className="mt-3 text-sm muted">Split {count} ways. Your own share is already settled.</p>
          )}
        </section>
      ) : null}

      <section className="paper mt-3 p-4">
        <p className="h2">{kind === "bill" ? "Where shares arrive" : "Where your payout arrives"}</p>
        <p className="mt-1 text-sm muted">Your {asset === "NIM" ? "NIM" : `USDT (${config?.usdt?.name ?? "EVM"})`} address in Nimiq Pay. Payments go straight to it.</p>
        {addressOk ? (
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-[var(--bg)] px-3 py-3">
            <span className="mono">{shortAddress(address)}</span>
            <button className="btn btn-ghost btn-small" onClick={() => setAddress("")}>Change</button>
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            <button className="btn btn-primary btn-block" onClick={() => void connect()}>Connect Nimiq Pay</button>
            {!host.inside ? (
              <input className="field mono" placeholder={asset === "NIM" ? "or paste NQ.. address" : "or paste 0x.. address"} value={address} onChange={(event) => setAddress(event.target.value)} />
            ) : null}
          </div>
        )}
        <label className="label mt-4" htmlFor="email">Email for updates (optional)</label>
        <input id="email" className="field" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
      </section>

      <HostBanner compact asset={asset} />
      <ErrorNote text={configError ? "Couldn't load payment settings. Refresh and try again." : null} />
      <ErrorNote text={error} />
      {title.trim() && preview && addressOk && !myName.trim() ? <p className="mt-3 text-center text-xs muted">Add your name to create the group.</p> : null}
      <button className="btn btn-mint btn-block mt-4" disabled={busy || !config || Boolean(configError) || !title.trim() || !myName.trim() || !preview || !addressOk || !date} onClick={() => void submit()}>
        {busy ? <span className="spinner" /> : null}
        Create {kind === "bill" ? "bill split" : "ajo circle"}
      </button>
      <p className="mt-3 text-center text-xs muted">We store names, wallet addresses and optional emails only to run this group. See <a className="underline" href="/privacy">Privacy</a>.</p>
    </main>
  );
}
