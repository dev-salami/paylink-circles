import type { PublicGroup } from "../service";
import type { Asset } from "../domain/types";

export type GroupShare = PublicGroup["shares"][number];

/** Shares that are "live" now: every bill share, or the current ajo round. */
export function liveShares(group: PublicGroup): GroupShare[] {
  return group.kind === "ajo" ? group.shares.filter((share) => share.round === group.currentRound) : group.shares;
}

export function recipientIdOf(group: PublicGroup, share: GroupShare): string | undefined {
  if (group.kind === "bill") return group.members.find((member) => member.isOrganizer)?.id;
  return group.rounds.find((round) => round.index === share.round)?.recipientMemberId;
}

/** Unpaid shares the viewer owes, earliest first. */
export function myOpenShares(group: PublicGroup): GroupShare[] {
  if (!group.meId) return [];
  return group.shares
    .filter((share) => share.memberId === group.meId && share.status === "unpaid")
    .filter((share) => group.kind === "bill" || (share.round ?? 0) <= (group.currentRound ?? 0))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}

/** Unpaid shares that will be paid to the viewer (now). */
export function owedToMe(group: PublicGroup): GroupShare[] {
  if (!group.meId) return [];
  return liveShares(group).filter((share) => share.status === "unpaid" && recipientIdOf(group, share) === group.meId);
}

export function sumBy(groups: PublicGroup[], pick: (group: PublicGroup) => GroupShare[]): Record<Asset, bigint> {
  const out: Record<Asset, bigint> = { NIM: 0n, USDT: 0n };
  for (const group of groups) for (const share of pick(group)) out[group.asset] += BigInt(share.amount);
  return out;
}

export function ratio(collected: string, expected: string): number {
  const total = BigInt(expected);
  if (total === 0n) return 0;
  return Number((BigInt(collected) * 1000n) / total) / 1000;
}
