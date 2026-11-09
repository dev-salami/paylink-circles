import { afterEach, describe, expect, it, vi } from "vitest";
import { getHostNetwork, init } from "@nimiq/mini-app-sdk";

vi.mock("@nimiq/mini-app-sdk", () => ({
  getHostNetwork: vi.fn(),
  init: vi.fn(),
  NimiqProviderError: { is: vi.fn(() => false) },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("NIM wallet network guard", () => {
  it.each([
    ["mainnet", "testnet"],
    ["testnet", "mainnet"],
  ] as const)("refuses a %s wallet payment to a %s group", async (wallet, group) => {
    vi.stubGlobal("window", {});
    vi.mocked(getHostNetwork).mockReturnValue(wallet);
    const send = vi.fn();
    vi.mocked(init).mockResolvedValue({ sendBasicTransactionWithData: send } as unknown as Awaited<ReturnType<typeof init>>);
    // Fresh module so each case has its own cached provider.
    const { payNim: pay } = await import("./host");
    await expect(pay({ recipient: "recipient", luna: "100000", memo: "share", network: group })).rejects.toThrow(`Switch to ${group}`);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends when wallet and group match", async () => {
    vi.stubGlobal("window", {});
    vi.mocked(getHostNetwork).mockReturnValue("mainnet");
    const send = vi.fn().mockResolvedValue("hash");
    vi.mocked(init).mockResolvedValue({ sendBasicTransactionWithData: send } as unknown as Awaited<ReturnType<typeof init>>);
    const { payNim: pay } = await import("./host");
    await expect(pay({ recipient: "recipient", luna: "100000", memo: "share", network: "mainnet" })).resolves.toBe("hash");
    expect(send).toHaveBeenCalledWith({ recipient: "recipient", value: 100000, data: "share" });
  });
});
