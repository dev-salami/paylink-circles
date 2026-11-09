"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { splitAmount } from "@/lib/domain/money";
import type { Asset } from "@/lib/domain/types";

/** Keel number: giant whole part, greyed decimals, small asset label. */
export function Amount({ units, asset, size = "giant", showAsset = true }: { units: string; asset: Asset; size?: "giant" | "big" | "md" | "sm"; showAsset?: boolean }) {
  const { whole, decimals } = splitAmount(units, asset);
  const cls = size === "giant" ? "giant" : size === "big" ? "big" : size === "md" ? "text-2xl" : "text-base";
  return (
    <span className={`num ${cls}`}>
      {whole}
      <span className="dec">.{decimals}</span>
      {showAsset ? <span className={size === "giant" || size === "big" ? "ml-2 align-top text-sm tracking-wide" : "ml-1 text-xs"} style={{ letterSpacing: "0.04em" }}>{asset}</span> : null}
    </span>
  );
}

export function AssetChip({ asset, chain }: { asset: Asset; chain?: string }) {
  const label = chain === "nimiq-testnet" ? "NIM · testnet" : chain === "sepolia" ? "USDT · Sepolia" : chain === "polygon" ? "USDT · Polygon" : asset;
  return (
    <span className={`asset ${asset === "USDT" ? "usdt" : ""}`}>
      <b>{asset === "NIM" ? "N" : "₮"}</b>
      {label}
    </span>
  );
}

export function StatusPill({ status, overdue }: { status: "unpaid" | "paid" | "self"; overdue?: boolean }) {
  if (status === "paid") return <span className="pill paid"><i />Paid</span>;
  if (status === "self") return <span className="pill self">Collector</span>;
  if (overdue) return <span className="pill overdue"><i />Overdue</span>;
  return <span className="pill unpaid"><i />Unpaid</span>;
}

export function Avatar({ name, on, dark }: { name: string; on?: boolean; dark?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return <span className={`avatar ${on ? "on" : ""} ${dark ? "dark" : ""}`}>{initials || "?"}</span>;
}

/** Thin bars, one per share; mint when paid. */
export function Bars({ values, height = 72 }: { values: Array<{ on: boolean; weight?: number }>; height?: number }) {
  const max = Math.max(1, ...values.map((value) => value.weight ?? 1));
  return (
    <div className="bars" style={{ height }} aria-hidden>
      {values.map((value, index) => (
        <i key={index} className={value.on ? "on" : ""} style={{ height: `${Math.max(14, ((value.weight ?? 1) / max) * 100) * (value.on ? 1 : 0.62)}%` }} />
      ))}
    </div>
  );
}

export function Meter({ ratio }: { ratio: number }) {
  return (
    <div className="meter">
      <span style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%` }} />
    </div>
  );
}

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        {title ? <p className="h2 mb-3">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function useToast(): [string | null, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(() => setText(null), 2600);
    return () => clearTimeout(timer);
  }, [text]);
  return [text, setText];
}

export function Toast({ text }: { text: string | null }) {
  return text ? <div className="toast" role="status">{text}</div> : null;
}

export function BackLink({ href = "/", label = "Back" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="icon-btn" aria-label={label}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
    </Link>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="PayLink Circles home">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#181C25" />
        <circle cx="32" cy="32" r="15" fill="none" stroke="#71FC8F" strokeWidth="5" strokeDasharray="14 6" />
        <circle cx="32" cy="32" r="5" fill="#fff" />
      </svg>
      <span className="text-[1.05rem] tracking-wide">PayLink <span className="muted">Circles</span></span>
    </Link>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`sk ${className}`} />;
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-3 rounded-2xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{text}</p>;
}

export function InfoNote({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-2xl bg-[var(--paper)] px-4 py-3 text-sm muted">{children}</div>;
}
