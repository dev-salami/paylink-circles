"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { nimiqPayOpenUrl } from "@/lib/open-link";

export function InviteCard({ code, title, onToast }: { code: string; title: string; onToast: (text: string) => void }) {
  const [url, setUrl] = useState("");
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    const link = `${window.location.origin}/join/${code}`;
    const open = nimiqPayOpenUrl(link);
    setUrl(link);
    setOpenUrl(open);
    QRCode.toDataURL(open ?? link, { margin: 1, width: 360, color: { dark: "#181C25", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [code]);

  async function share() {
    const text = openUrl
      ? `Join "${title}" on PayLink Circles. Open in Nimiq Pay: ${openUrl}\nIf that doesn't open the invite, paste this into Mini Apps → Custom URL: ${url}`
      : `Join "${title}" on PayLink Circles. In Nimiq Pay, open Mini Apps → Custom URL and paste: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: openUrl ?? url });
        return;
      } catch {
        // fall through to copy
      }
    }
    await copy(openUrl ?? url, openUrl ? "Invite copied" : "Invite link copied");
  }

  async function copy(value = url, label = "Page link copied") {
    try {
      await navigator.clipboard.writeText(value);
      onToast(label);
    } catch {
      onToast(value);
    }
  }

  return (
    <div className="paper p-4">
      <div className="flex items-start gap-4">
        <div className="w-28 flex-none overflow-hidden rounded-2xl border border-[var(--line)] bg-white p-1.5">
          {qr ? <img src={qr} alt="Invite QR code" className="block w-full" /> : <div className="sk aspect-square" />}
        </div>
        <div className="min-w-0">
          <p className="micro">Invite link</p>
          <p className="mt-1 text-sm">{openUrl ? "The QR opens this invite inside Nimiq Pay. If it doesn't, copy the page link into Mini Apps → Custom URL." : "Scan it, or paste the link into Nimiq Pay → Mini Apps → Custom URL."}</p>
          <p className="mono mt-2 truncate text-[var(--muted)]">{url.replace(/^https?:\/\//, "")}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn btn-primary btn-small" onClick={() => void share()}>Share invite</button>
        <button className="btn btn-ghost btn-small" onClick={() => void copy()}>Copy page link</button>
      </div>
    </div>
  );
}
