"use client";

import { useEffect, useState } from "react";
import { nimiqPayOpenUrl } from "@/lib/open-link";

/** Opens this page inside Nimiq Pay, and keeps a Custom URL fallback for when the deeplink misses. */
export function OpenInNimiqPay({ pageUrl }: { pageUrl?: string }) {
  const [page, setPage] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<"ok" | "show" | null>(null);

  useEffect(() => {
    const value = pageUrl || (typeof window !== "undefined" ? window.location.href : "");
    setPage(value);
    setOpen(value ? nimiqPayOpenUrl(value) : null);
    setCopied(null);
  }, [pageUrl]);

  if (!page) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(page);
      setCopied("ok");
    } catch {
      setCopied("show");
    }
  }

  return (
    <div className="mt-3 grid gap-2">
      {open ? (
        <a className="btn btn-primary btn-block" href={open}>
          Open in Nimiq Pay
        </a>
      ) : null}
      <button type="button" className="btn btn-ghost btn-block" onClick={() => void copy()}>
        {copied === "ok" ? "Link copied" : "Copy page link"}
      </button>
      {copied === "show" ? <input className="field mono" readOnly value={page} onFocus={(event) => event.currentTarget.select()} /> : null}
      <p className="text-xs muted">
        {open
          ? "Open in Nimiq Pay loads this page in the wallet. If it opens the store or a browser tab, copy the page link and paste it into Nimiq Pay → Mini Apps → Custom URL."
          : "This address isn't HTTPS. In Nimiq Pay, open Mini Apps → Custom URL and paste the page link."}
      </p>
    </div>
  );
}
