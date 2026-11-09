"use client";

import { OpenInNimiqPay } from "@/components/open-nimiq";
import { useConfig } from "@/lib/client/use-config";
import { useHost } from "@/lib/client/use-host";

type NimNetwork = "mainnet" | "testnet";

/**
 * Where the wallet is, and whether its NIM network matches this screen.
 * USDT on Polygon is called out on its own: Nimiq's testnet switch does not apply to it.
 */
export function HostBanner({
  compact = false,
  nimNetwork,
  asset,
}: {
  compact?: boolean;
  /** NIM network this screen settles on. Defaults to the server's current network. */
  nimNetwork?: NimNetwork;
  asset?: "NIM" | "USDT";
}) {
  const host = useHost();
  const { config, error } = useConfig();
  if (!host.ready) return null;
  if (error) {
    return (
      <p className="mt-3 rounded-2xl bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--warn)]" role="alert">
        Couldn&apos;t load which network this app uses. Refresh before you pay.
      </p>
    );
  }
  if (!config) return null;

  const expected = nimNetwork ?? config.nimiqNetwork;
  const mismatch = Boolean(host.inside && host.network && host.network !== expected);
  const unknown = Boolean(host.inside && !host.network);
  const polygon = config.usdt?.chain === "polygon";

  if (asset === "USDT") {
    return (
      <div className="mt-3 rounded-2xl bg-[var(--paper)] px-4 py-3 text-sm" role="status">
        <p>
          USDT settles on {config.usdt?.name ?? "an EVM network"}
          {polygon ? ". That is real money, and the transfer needs a little POL for gas." : "."}
          {mismatch ? ` Nimiq Pay's NIM network is ${host.network}; that does not change this USDT payment.` : ""}
        </p>
        {host.inside ? null : <OpenInNimiqPay />}
      </div>
    );
  }

  if (mismatch) {
    return (
      <p className="mt-3 rounded-2xl bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--warn)]" role="alert">
        Nimiq Pay is on <b className="font-medium">{host.network}</b>, but {nimNetwork ? "this group settles NIM" : "this app settles NIM"} on{" "}
        <b className="font-medium">{expected}</b>. Switch Nimiq Pay to {expected} before paying. The app will not send NIM on the wrong network.
        {polygon ? " USDT on Polygon is separate, and it is real money." : ""}
      </p>
    );
  }

  if (unknown) {
    return (
      <p className="mt-3 rounded-2xl bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--warn)]" role="status">
        Couldn&apos;t read which Nimiq network Nimiq Pay is using. Set it to {expected} before you pay NIM.
      </p>
    );
  }

  if (host.inside) {
    if (compact) return null;
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs muted">
        <span className="pill mint live"><i />Nimiq Pay</span>
        <span>
          {expected === "testnet" ? "NIM is on testnet." : "NIM is on mainnet."}
          {polygon ? " USDT on Polygon is real money." : ""}
        </span>
      </p>
    );
  }

  return <Outside />;
}

function Outside() {
  return (
    <div className="mt-3 rounded-2xl bg-[var(--paper)] px-4 py-3 text-sm">
      <p>You&apos;re in a browser, so this page can&apos;t reach your wallet. Phone payments happen after the page is open inside Nimiq Pay.</p>
      <OpenInNimiqPay />
    </div>
  );
}
