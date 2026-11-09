"use client";

import { useEffect, useState } from "react";
import { hostNetwork, inNimiqPay } from "./host";

export interface HostState {
  ready: boolean;
  inside: boolean;
  network: "mainnet" | "testnet" | undefined;
}

/** Detects Nimiq Pay without triggering any wallet prompt. */
export function useHost(): HostState {
  const [state, setState] = useState<HostState>({ ready: false, inside: false, network: undefined });
  useEffect(() => {
    let stopped = false;
    const check = () => {
      if (stopped) return;
      setState({ ready: true, inside: inNimiqPay(), network: hostNetwork() });
    };
    check();
    const timer = setInterval(check, 300);
    const stop = setTimeout(() => clearInterval(timer), 2400);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(stop);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return state;
}
