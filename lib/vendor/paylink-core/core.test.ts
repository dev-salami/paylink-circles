import { describe, expect, it, vi } from "vitest";
import { addDays, createConsoleMailer, createId, createResendMailer, fromAtomic, isoDate, toAtomic } from ".";

describe("vendored core helpers", () => {
  it("keeps ID prefixes and UTC date arithmetic", () => {
    expect(createId("group")).toMatch(/^group_[0-9a-f]{8}$/);
    const date = new Date("2026-12-31T23:30:00Z");
    expect(isoDate(addDays(date, 1))).toBe("2027-01-01");
    expect(date.toISOString()).toBe("2026-12-31T23:30:00.000Z");
  });

  it("converts exact NIM and USDT units without rounding", () => {
    expect(toAtomic("1.23456", 5)).toBe(123456n);
    expect(fromAtomic(123456n, 5)).toBe("1.23456");
    expect(toAtomic("1.234567")).toBe(1234567n);
    expect(fromAtomic(-1234567n)).toBe("-1.234567");
    expect(() => toAtomic("1.000001", 5)).toThrow(/decimal places/);
    expect(() => toAtomic("-1")).toThrow(/Invalid amount/);
  });

  it("delivers through the injected console mailer", async () => {
    const log = vi.fn();
    const email = { to: "member@example.com", subject: "Reminder", text: "Pay your share", html: "<p>Pay your share</p>" };
    const result = await createConsoleMailer(log).send(email);
    expect(log).toHaveBeenCalledWith({ ...email, ...result });
    expect(result.provider).toBe("console");
  });

  it("delivers through Resend without making a real request", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "message" })));
    const mailer = createResendMailer({ apiKey: "test-placeholder", from: "circles@example.com", fetchImpl });
    await expect(mailer.send({ to: "member@example.com", subject: "Reminder", text: "Pay", html: "<p>Pay</p>" })).resolves.toEqual({ provider: "resend", id: "message" });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
  });
});
