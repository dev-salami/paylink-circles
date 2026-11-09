"use client";

import { useEffect, useState } from "react";
import type { PublicConfig } from "../env";

let cached: PublicConfig | null = null;

export function useConfig(): { config: PublicConfig | null; error: boolean } {
  const [config, setConfig] = useState<PublicConfig | null>(cached);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetch("/api/config", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`config ${response.status}`);
        return response.json() as Promise<PublicConfig>;
      })
      .then((data) => {
        cached = data;
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { config, error };
}
