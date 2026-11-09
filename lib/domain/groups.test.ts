import { describe, expect, it } from "vitest";
import { buildGroup, currentRoundIndex, GroupError, joinMember, recipientOf, roundsOf, sharesNeedingReminder, totalsFor, type NewGroupInput } from "./groups";

const ORG = "NQ93 4CUM HV4V A1T8 YM6Y XLB7 DCTT JM6F LJDX";
const A = "NQ34 8B9Y 9C0H 57LY 35PH 8LYV 93CV 4SMV JXCQ";
const now = new Date("2026-11-05T09:00:00Z");
const ctx = { chain: "nimiq-testnet" as const, adminTokenHash: "a", organizerTokenHash: "o", now };

function bill(overrides: Partial<NewGroupInput> = {}): NewGroupInput {
  return { kind: "bill", title: "Dinner", asset: "NIM", amount: "100", memberNames: ["Khalil", "Ada", "Tunde"], organizer: { name: "Khalil", nimAddress: ORG }, date: "2026-11-08", ...overrides };
}

describe("bill split", () => {
  it("splits evenly and settles the organizer's share", () => {
    const group = buildGroup(bill(), ctx);
    expect(group.shares).toHaveLength(3);
    const total = group.shares.reduce((sum, share) => sum + BigInt(share.amount), 0n);
    expect(total).toBe(10000000n);
    expect(group.shares.filter((share) => share.status === "self")).toHaveLength(1);
    const unpaid = group.shares.find((share) => share.status === "unpaid");
    expect(unpaid && recipientOf(group, unpaid)?.isOrganizer).toBe(true);
    expect(totalsFor(group.shares).paidCount).toBe(1);
  });

  it("requires the organizer's wallet for the asset", () => {
    expect(() => buildGroup(bill({ organizer: { name: "K" } }), ctx)).toThrow(GroupError);
    expect(() => buildGroup(bill({ asset: "USDT", organizer: { name: "K", nimAddress: ORG } }), ctx)).toThrow(/USDT/);
    expect(() => buildGroup(bill({ memberNames: ["Solo"] }), ctx)).toThrow(/at least 2/);
  });

  it("lets a member claim an open spot", () => {
    const group = buildGroup(bill(), ctx);
    const member = joinMember(group, { name: "Ada O.", nimAddress: A }, "h", now);
    expect(member.slot).toBe(1);
    expect(member.joinedAt).toBeTruthy();
    expect(() => joinMember(group, { memberId: member.id, name: "x" }, "h2", now)).toThrow(/taken/);
  });

  it("flags shares needing a reminder, with a cooldown", () => {
    const group = buildGroup(bill(), ctx);
    expect(sharesNeedingReminder(group, now, 3)).toHaveLength(2);
    const first = group.shares.find((share) => share.status === "unpaid");
    if (first) first.remindedAt = now.toISOString();
    expect(sharesNeedingReminder(group, now, 3)).toHaveLength(1);
  });
});

describe("ajo circle", () => {
  const ajo = (): NewGroupInput => ({ ...bill(), kind: "ajo", title: "Ajo", amount: "50", frequency: "weekly", memberNames: ["Khalil", "Ada", "Tunde", "Bisi"] });

  it("creates one round per member with the collector's own share settled", () => {
    const group = buildGroup(ajo(), ctx);
    const rounds = roundsOf(group);
    expect(rounds.map((round) => round.dueDate)).toEqual(["2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
    expect(group.shares).toHaveLength(16);
    for (const round of rounds) {
      const shares = group.shares.filter((share) => share.round === round.index);
      expect(shares.filter((share) => share.status === "self").map((share) => share.memberId)).toEqual([round.recipientMemberId]);
    }
    expect(group.dueDate).toBe("2026-11-29");
  });

  it("moves to the next round after a payout day passes", () => {
    const group = buildGroup(ajo(), ctx);
    expect(currentRoundIndex(group, now)).toBe(0);
    expect(currentRoundIndex(group, new Date("2026-11-09T08:00:00Z"))).toBe(1);
    expect(currentRoundIndex(group, new Date("2027-01-01T08:00:00Z"))).toBe(3);
  });

  it("requires a payout wallet to join", () => {
    const group = buildGroup(ajo(), ctx);
    expect(() => joinMember(group, { name: "Ada" }, "h", now)).toThrow(/payout/);
  });

  it("can shuffle the payout order", () => {
    let seed = 0.9;
    const group = buildGroup({ ...ajo(), shuffle: true }, { ...ctx, random: () => (seed = (seed * 7.3) % 1) });
    expect(new Set(group.members.map((member) => member.slot)).size).toBe(4);
  });
});
