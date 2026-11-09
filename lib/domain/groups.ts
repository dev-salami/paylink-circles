import { createId } from "../vendor/paylink-core";
import { isValidEvmAddress, isValidNimiqAddress, normalizeNimiqAddress } from "./address";
import { daysUntil, isOverdue, roundDate } from "./dates";
import { createShareCode } from "./memo";
import { splitEvenly, toUnits } from "./money";
import type { Asset, ChainId, Frequency, Group, GroupKind, Member, Payment, Round, Share } from "./types";

export const MAX_MEMBERS = 20;
export const REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export interface NewGroupInput {
  kind: GroupKind;
  title: string;
  note?: string;
  asset: Asset;
  /** Bill: the total bill. Ajo: the per-round contribution. Decimal string, e.g. "120.50". */
  amount: string;
  /** Everyone in the group, organizer first. Empty names become "Member N". */
  memberNames: string[];
  organizer: { name: string; nimAddress?: string; evmAddress?: string; email?: string };
  frequency?: Frequency;
  /** Bill: due date. Ajo: first payout date. ISO day. */
  date: string;
  /** Ajo: shuffle the payout order (organizer keeps their slot only if not shuffled). */
  shuffle?: boolean;
}

export class GroupError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function chainFor(asset: Asset, env: { nimiqNetwork: "testnet" | "mainnet"; evmChain: "polygon" | "sepolia" }): ChainId {
  if (asset === "NIM") return env.nimiqNetwork === "mainnet" ? "nimiq-mainnet" : "nimiq-testnet";
  return env.evmChain;
}

function cleanName(name: string, fallback: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim().slice(0, 40);
  return trimmed || fallback;
}

export function validateNewGroup(input: NewGroupInput): void {
  if (input.kind !== "bill" && input.kind !== "ajo") throw new GroupError("Pick a bill split or an ajo circle");
  if (input.asset !== "NIM" && input.asset !== "USDT") throw new GroupError("Pay in NIM or USDT");
  if (!input.title.trim()) throw new GroupError("Give the group a name");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new GroupError("Pick a date");
  if (input.memberNames.length < 2) throw new GroupError("A group needs at least 2 people");
  if (input.memberNames.length > MAX_MEMBERS) throw new GroupError(`A group can have at most ${MAX_MEMBERS} people`);
  let units: bigint;
  try {
    units = toUnits(input.amount, input.asset);
  } catch {
    throw new GroupError("Enter a valid amount");
  }
  if (units <= 0n) throw new GroupError("Amount must be more than zero");
  if (input.kind === "bill" && units < BigInt(input.memberNames.length)) throw new GroupError("Amount is too small to split");
  if (input.kind === "ajo" && !input.frequency) throw new GroupError("Pick how often the circle pays out");
  const { nimAddress, evmAddress } = input.organizer;
  if (input.asset === "NIM" && (!nimAddress || !isValidNimiqAddress(nimAddress))) {
    throw new GroupError("Connect Nimiq Pay so payments can reach your NIM address");
  }
  if (input.asset === "USDT" && (!evmAddress || !isValidEvmAddress(evmAddress))) {
    throw new GroupError("Connect Nimiq Pay so payments can reach your USDT address");
  }
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
  }
  return copy;
}

export function buildGroup(
  input: NewGroupInput,
  context: { chain: ChainId; adminTokenHash: string; organizerTokenHash: string; now: Date; random?: () => number },
): Group {
  validateNewGroup(input);
  const now = context.now.toISOString();
  const random = context.random ?? Math.random;
  const names = input.memberNames.map((name, index) => cleanName(name, index === 0 ? cleanName(input.organizer.name, "You") : `Member ${index + 1}`));
  let members: Member[] = names.map((name, index) => ({
    id: createId("mem"),
    slot: index,
    name: index === 0 ? cleanName(input.organizer.name, name) : name,
    isOrganizer: index === 0,
  }));
  const organizer = members[0] as Member;
  organizer.nimAddress = input.organizer.nimAddress ? normalizeNimiqAddress(input.organizer.nimAddress) : undefined;
  organizer.evmAddress = input.organizer.evmAddress?.trim() || undefined;
  organizer.email = input.organizer.email?.trim() || undefined;
  organizer.joinedAt = now;
  organizer.tokenHash = context.organizerTokenHash;

  if (input.kind === "ajo" && input.shuffle) {
    members = shuffled(members, random).map((member, slot) => ({ ...member, slot }));
  }

  const units = toUnits(input.amount, input.asset);
  const group: Group = {
    id: `grp_${createShareCode().toLowerCase()}${createShareCode().toLowerCase()}`,
    kind: input.kind,
    title: input.title.trim().slice(0, 60),
    note: input.note?.trim().slice(0, 200) || undefined,
    asset: input.asset,
    chain: context.chain,
    startDate: input.date,
    dueDate: input.date,
    inviteCode: createShareCode(),
    adminTokenHash: context.adminTokenHash,
    members,
    shares: [],
    payments: [],
    activity: [],
    createdAt: now,
    updatedAt: now,
  };

  if (input.kind === "bill") {
    group.totalAmount = units.toString();
    const parts = splitEvenly(units, members.length);
    group.shares = members.map((member, index) => ({
      id: createId("shr"),
      code: createShareCode(),
      memberId: member.id,
      round: null,
      amount: (parts[index] ?? 0n).toString(),
      dueDate: input.date,
      // The organizer fronted the bill, so their own share is already settled.
      status: member.isOrganizer ? "self" : "unpaid",
      reminderCount: 0,
    }));
  } else {
    group.contribution = units.toString();
    group.frequency = input.frequency;
    const rounds = roundsOf(group);
    group.dueDate = rounds[rounds.length - 1]?.dueDate ?? input.date;
    group.shares = rounds.flatMap((round) =>
      members.map<Share>((member) => ({
        id: createId("shr"),
        code: createShareCode(),
        memberId: member.id,
        round: round.index,
        amount: units.toString(),
        dueDate: round.dueDate,
        // The member collecting this round keeps their own contribution.
        status: member.id === round.recipientMemberId ? "self" : "unpaid",
        reminderCount: 0,
      })),
    );
  }

  group.activity.push({
    id: createId("act"),
    at: now,
    kind: "group_created",
    text: `${organizer.name} started ${group.title}`,
    memberId: organizer.id,
  });
  return group;
}

export function roundsOf(group: Pick<Group, "kind" | "members" | "startDate" | "frequency">): Round[] {
  if (group.kind !== "ajo" || !group.frequency) return [];
  const ordered = [...group.members].sort((left, right) => left.slot - right.slot);
  return ordered.map((member, index) => ({
    index,
    recipientMemberId: member.id,
    dueDate: roundDate(group.startDate, group.frequency as Frequency, index),
  }));
}

/** The round being collected now: the first round whose payout day hasn't passed, else the last. */
export function currentRoundIndex(group: Group, now: Date): number {
  const rounds = roundsOf(group);
  const open = rounds.find((round) => !isOverdue(round.dueDate, now));
  return open ? open.index : Math.max(0, rounds.length - 1);
}

export function memberById(group: Group, memberId: string): Member | undefined {
  return group.members.find((member) => member.id === memberId);
}

/** Who a share is paid to: the organizer for bills, the round's collector for ajo. */
export function recipientOf(group: Group, share: Share): Member | undefined {
  if (share.round === null) return group.members.find((member) => member.isOrganizer);
  const round = roundsOf(group)[share.round];
  return round ? memberById(group, round.recipientMemberId) : undefined;
}

export function recipientAddress(group: Group, share: Share): string | undefined {
  const recipient = recipientOf(group, share);
  if (!recipient) return undefined;
  return group.asset === "NIM" ? recipient.nimAddress : recipient.evmAddress;
}

export interface ShareView extends Share {
  memberName: string;
  recipientName: string;
  recipientAddress?: string;
  overdue: boolean;
  dueInDays: number;
  canRemind: boolean;
}

export function shareView(group: Group, share: Share, now: Date): ShareView {
  const member = memberById(group, share.memberId);
  const recipient = recipientOf(group, share);
  const overdue = share.status === "unpaid" && isOverdue(share.dueDate, now);
  const remindedRecently = share.remindedAt ? now.getTime() - new Date(share.remindedAt).getTime() < REMINDER_COOLDOWN_MS : false;
  return {
    ...share,
    memberName: member?.name ?? "Member",
    recipientName: recipient?.name ?? "Organizer",
    recipientAddress: recipientAddress(group, share),
    overdue,
    dueInDays: daysUntil(share.dueDate, now),
    canRemind: share.status === "unpaid" && !remindedRecently,
  };
}

export interface GroupTotals {
  expected: bigint;
  collected: bigint;
  paidCount: number;
  dueCount: number;
}

/** Totals over the shares that actually move money (self-settled shares count as collected). */
export function totalsFor(shares: Share[]): GroupTotals {
  let expected = 0n;
  let collected = 0n;
  let paidCount = 0;
  for (const share of shares) {
    expected += BigInt(share.amount);
    if (share.status !== "unpaid") {
      collected += BigInt(share.amount);
      paidCount++;
    }
  }
  return { expected, collected, paidCount, dueCount: shares.length };
}

export function sharesForRound(group: Group, round: number | null): Share[] {
  return group.shares.filter((share) => share.round === round);
}

/** Shares that should get a reminder: unpaid, due within `withinDays` or overdue, outside the cooldown. */
export function sharesNeedingReminder(group: Group, now: Date, withinDays = 2): Share[] {
  return group.shares.filter((share) => {
    if (share.status !== "unpaid") return false;
    if (daysUntil(share.dueDate, now) > withinDays) return false;
    if (share.remindedAt && now.getTime() - new Date(share.remindedAt).getTime() < REMINDER_COOLDOWN_MS) return false;
    const recipient = recipientOf(group, share);
    return recipient?.id !== share.memberId;
  });
}

export function joinMember(
  group: Group,
  input: { memberId?: string; name: string; nimAddress?: string; evmAddress?: string; email?: string },
  tokenHash: string,
  now: Date,
): Member {
  const open = group.members.filter((member) => !member.joinedAt);
  const target = input.memberId ? open.find((member) => member.id === input.memberId) : open[0];
  if (!target) throw new GroupError(input.memberId ? "That spot is already taken" : "This group is full", 409);
  if (group.asset === "NIM" && input.nimAddress && !isValidNimiqAddress(input.nimAddress)) throw new GroupError("That NIM address isn't valid");
  if (group.asset === "USDT" && input.evmAddress && !isValidEvmAddress(input.evmAddress)) throw new GroupError("That USDT address isn't valid");
  if (group.kind === "ajo") {
    // Ajo members receive a payout, so they must bring a wallet address.
    if (group.asset === "NIM" && !input.nimAddress) throw new GroupError("Connect Nimiq Pay so your payout can reach you");
    if (group.asset === "USDT" && !input.evmAddress) throw new GroupError("Connect Nimiq Pay so your payout can reach you");
  }
  target.name = cleanName(input.name, target.name);
  target.nimAddress = input.nimAddress ? normalizeNimiqAddress(input.nimAddress) : undefined;
  target.evmAddress = input.evmAddress?.trim() || undefined;
  target.email = input.email?.trim() || undefined;
  target.joinedAt = now.toISOString();
  target.tokenHash = tokenHash;
  group.activity.push({ id: createId("act"), at: now.toISOString(), kind: "member_joined", text: `${target.name} joined`, memberId: target.id });
  group.updatedAt = now.toISOString();
  return target;
}

export function markSharePaid(group: Group, share: Share, payment: Payment, now: Date): void {
  share.status = "paid";
  share.paymentId = payment.id;
  group.payments.push(payment);
  const member = memberById(group, share.memberId);
  const recipient = recipientOf(group, share);
  group.activity.push({
    id: createId("act"),
    at: now.toISOString(),
    kind: "payment_confirmed",
    text: `${member?.name ?? "A member"} paid ${recipient?.name ?? "the organizer"}`,
    memberId: member?.id,
    paymentId: payment.id,
  });
  if (share.round !== null) {
    const roundShares = sharesForRound(group, share.round);
    if (roundShares.every((item) => item.status !== "unpaid")) {
      group.activity.push({
        id: createId("act"),
        at: now.toISOString(),
        kind: "payout_ready",
        text: `Round ${share.round + 1} is complete: ${recipient?.name ?? "the collector"} has the full pot`,
        memberId: recipient?.id,
      });
    }
  }
  group.updatedAt = now.toISOString();
}
