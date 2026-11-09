import { createId } from "./vendor/paylink-core";
import { fetchReceipt, normalizeEvmHash, verifyUsdtReceipt } from "./chain/evm";
import { NimiqRpc, nimiqExplorerUrl, normalizeNimiqHash, verifyNimiqTransaction, type NimiqNetwork, type NimiqRpcTransaction } from "./chain/nimiq";
import { sameEvmAddress, sameNimiqAddress } from "./domain/address";
import {
  GroupError,
  buildGroup,
  chainFor,
  currentRoundIndex,
  joinMember,
  markSharePaid,
  memberById,
  recipientAddress,
  recipientOf,
  roundsOf,
  shareView,
  sharesNeedingReminder,
  totalsFor,
  type NewGroupInput,
} from "./domain/groups";
import { hexToUtf8, memoFor, parseMemo } from "./domain/memo";
import { formatAmount } from "./domain/money";
import type { Group, Payment, Share } from "./domain/types";
import { appUrl, evmConfigFor, nimiqNetwork, nimiqRpcUrlFor, usdtEnabled } from "./env";
import { sendReminderEmail } from "./mail";
import { nimiqPayOpenUrl } from "./open-link";
import { findGroupByInvite, insertGroup, mutateGroup, readGroup } from "./store";
import { hashToken, newToken, tokenMatches } from "./tokens";

export { GroupError };

function nimiqFor(group: Group): { network: NimiqNetwork; rpc: NimiqRpc } {
  const network: NimiqNetwork = group.chain === "nimiq-mainnet" ? "mainnet" : "testnet";
  return { network, rpc: new NimiqRpc(nimiqRpcUrlFor(network)) };
}

function evmFor(group: Group) {
  return evmConfigFor(group.chain === "sepolia" ? "sepolia" : "polygon");
}

function canonicalHash(hash: string): string {
  return hash.trim().replace(/^0x/i, "").toLowerCase();
}

export async function createGroup(input: NewGroupInput, now = new Date()) {
  if (input.asset === "USDT" && !usdtEnabled()) throw new GroupError("USDT isn't configured on this server");
  const adminToken = newToken();
  const memberToken = newToken();
  const group = buildGroup(input, {
    chain: chainFor(input.asset, { nimiqNetwork: nimiqNetwork(), evmChain: evmConfigFor(process.env.USDT_CHAIN === "sepolia" ? "sepolia" : "polygon").id }),
    adminTokenHash: hashToken(adminToken),
    organizerTokenHash: hashToken(memberToken),
    now,
  });
  await insertGroup(group);
  const organizer = group.members.find((member) => member.isOrganizer);
  return { group, adminToken, memberToken, memberId: organizer?.id ?? "" };
}

export function requireGroup(id: string): Group {
  const group = readGroup(id);
  if (!group) throw new GroupError("Group not found", 404);
  return group;
}

export function isAdmin(group: Group, adminToken: string | null): boolean {
  return tokenMatches(adminToken, group.adminTokenHash);
}

export function memberForToken(group: Group, memberToken: string | null) {
  if (!memberToken) return undefined;
  return group.members.find((member) => tokenMatches(memberToken, member.tokenHash));
}

/** What the client sees. Strips token hashes and emails of other members. */
export function publicGroup(group: Group, viewer: { memberToken?: string | null; adminToken?: string | null } = {}, now = new Date()) {
  const me = memberForToken(group, viewer.memberToken ?? null);
  const admin = isAdmin(group, viewer.adminToken ?? null);
  const rounds = roundsOf(group);
  const current = group.kind === "ajo" ? currentRoundIndex(group, now) : null;
  const relevant = group.kind === "ajo" ? group.shares.filter((share) => share.round === current) : group.shares;
  const totals = totalsFor(relevant);
  const overall = totalsFor(group.shares);
  return {
    id: group.id,
    kind: group.kind,
    title: group.title,
    note: group.note,
    asset: group.asset,
    chain: group.chain,
    totalAmount: group.totalAmount,
    contribution: group.contribution,
    frequency: group.frequency,
    startDate: group.startDate,
    dueDate: group.dueDate,
    inviteCode: admin || me ? group.inviteCode : undefined,
    createdAt: group.createdAt,
    isAdmin: admin,
    meId: me?.id ?? null,
    currentRound: current,
    totals: { expected: totals.expected.toString(), collected: totals.collected.toString(), paid: totals.paidCount, count: totals.dueCount },
    overall: { expected: overall.expected.toString(), collected: overall.collected.toString(), paid: overall.paidCount, count: overall.dueCount },
    members: group.members
      .slice()
      .sort((left, right) => left.slot - right.slot)
      .map((member) => ({
        id: member.id,
        slot: member.slot,
        name: member.name,
        isOrganizer: member.isOrganizer,
        joined: Boolean(member.joinedAt),
        nimAddress: member.nimAddress,
        evmAddress: member.evmAddress,
        hasEmail: Boolean(member.email),
      })),
    rounds: rounds.map((round) => {
      const shares = group.shares.filter((share) => share.round === round.index);
      const roundTotals = totalsFor(shares);
      return {
        ...round,
        recipientName: memberById(group, round.recipientMemberId)?.name ?? "Member",
        expected: roundTotals.expected.toString(),
        collected: roundTotals.collected.toString(),
        paid: roundTotals.paidCount,
        count: roundTotals.dueCount,
      };
    }),
    shares: group.shares.map((share) => shareView(group, share, now)),
    payments: group.payments.map((payment) => ({ ...payment })),
    activity: group.activity.slice(-40).reverse(),
  };
}

export type PublicGroup = ReturnType<typeof publicGroup>;

export async function join(
  groupId: string,
  input: { inviteCode: string; memberId?: string; name: string; nimAddress?: string; evmAddress?: string; email?: string },
  now = new Date(),
) {
  const memberToken = newToken();
  const member = await mutateGroup(groupId, (group) => {
    if (group.inviteCode !== input.inviteCode) throw new GroupError("This invite link isn't valid", 403);
    const already = group.members.find(
      (item) =>
        item.joinedAt &&
        ((input.nimAddress && sameNimiqAddress(item.nimAddress, input.nimAddress)) || (input.evmAddress && sameEvmAddress(item.evmAddress, input.evmAddress))),
    );
    if (already) {
      // Don't hand an existing spot to whoever knows the address: that would lock out the real member.
      throw new GroupError(`${already.name} already joined with this wallet. Open the group on the device you joined from.`, 409);
    }
    return joinMember(group, input, hashToken(memberToken), now);
  });
  return { memberId: member.id, memberToken };
}

export function groupForInvite(code: string): Group | undefined {
  return findGroupByInvite(code);
}

export interface PayIntent {
  groupId: string;
  shareId: string;
  asset: Group["asset"];
  chain: Group["chain"];
  amount: string;
  amountLabel: string;
  recipient: string;
  recipientName: string;
  memo: string;
  payerName: string;
  dueDate: string;
  status: Share["status"];
  paymentId?: string;
  evm?: { chainIdHex: string; token: string; payer?: string; gasToken: string; chainName: string };
}

export function payIntent(group: Group, shareId: string): PayIntent {
  const share = group.shares.find((item) => item.id === shareId);
  if (!share) throw new GroupError("Share not found", 404);
  const recipient = recipientOf(group, share);
  const address = recipientAddress(group, share);
  if (!recipient) throw new GroupError("No one to pay for this share yet", 409);
  if (!address) throw new GroupError(`${recipient.name} hasn't joined with a wallet yet, so this share can't be paid`, 409);
  if (recipient.id === share.memberId) throw new GroupError("This is the collector's own share", 409);
  const payer = memberById(group, share.memberId);
  const evm = group.asset === "USDT" ? evmFor(group) : undefined;
  return {
    groupId: group.id,
    shareId: share.id,
    asset: group.asset,
    chain: group.chain,
    amount: share.amount,
    amountLabel: formatAmount(share.amount, group.asset),
    recipient: address,
    recipientName: recipient.name,
    memo: memoFor(share.code, group.title),
    payerName: payer?.name ?? "Member",
    dueDate: share.dueDate,
    status: share.status,
    paymentId: share.paymentId,
    evm: evm
      ? { chainIdHex: evm.chainIdHex, token: evm.usdt, payer: payer?.evmAddress, gasToken: evm.gasToken, chainName: evm.name }
      : undefined,
  };
}

function txUsed(group: Group, hash: string): boolean {
  const needle = canonicalHash(hash);
  return group.payments.some((payment) => canonicalHash(payment.txHash) === needle);
}

export type ClaimResult =
  | { status: "paid"; payment: Payment }
  | { status: "pending"; reason: string }
  | { status: "rejected"; reason: string };

/** Verify a transaction hash against a share on chain, and mark the share paid if it checks out. */
export async function claimPayment(groupId: string, shareId: string, txHash: string, now = new Date()): Promise<ClaimResult> {
  const snapshot = requireGroup(groupId);
  const share = snapshot.shares.find((item) => item.id === shareId);
  if (!share) throw new GroupError("Share not found", 404);
  if (share.status === "paid" && share.paymentId) {
    const payment = snapshot.payments.find((item) => item.id === share.paymentId);
    if (payment) return { status: "paid", payment };
  }
  const recipient = recipientAddress(snapshot, share);
  if (!recipient) return { status: "rejected", reason: "This share has no recipient wallet yet" };

  let verified: { from: string; to: string; value: bigint; blockNumber?: number; memo?: string };
  let explorerUrl: string;
  let storedHash: string;
  if (snapshot.asset === "NIM") {
    const hash = normalizeNimiqHash(txHash);
    if (!hash) return { status: "rejected", reason: "That doesn't look like a transaction hash" };
    storedHash = hash;
    const { network, rpc } = nimiqFor(snapshot);
    const tx = await rpc.getTransaction(hash);
    const result = verifyNimiqTransaction(tx, { network, recipient, minValue: BigInt(share.amount), memoCode: share.code });
    if (!result.ok) return result.retry ? { status: "pending", reason: result.reason } : { status: "rejected", reason: result.reason };
    verified = result;
    explorerUrl = nimiqExplorerUrl(network, hash);
  } else {
    const hash = normalizeEvmHash(txHash);
    if (!hash) return { status: "rejected", reason: "That doesn't look like a transaction hash" };
    storedHash = hash;
    const evm = evmFor(snapshot);
    const payer = memberById(snapshot, share.memberId)?.evmAddress;
    const receipt = await fetchReceipt(evm.rpcUrl, hash);
    const result = verifyUsdtReceipt(receipt, { token: evm.usdt, recipient, minValue: BigInt(share.amount), payer });
    if (!result.ok) return result.retry ? { status: "pending", reason: result.reason } : { status: "rejected", reason: result.reason };
    verified = result;
    explorerUrl = `${evm.explorer}${hash}`;
  }

  return mutateGroup(groupId, (group) => {
    const live = group.shares.find((item) => item.id === shareId);
    if (!live) throw new GroupError("Share not found", 404);
    if (live.status === "paid" && live.paymentId) {
      const existing = group.payments.find((item) => item.id === live.paymentId);
      if (existing) return { status: "paid", payment: existing } satisfies ClaimResult;
    }
    if (txUsed(group, storedHash)) return { status: "rejected", reason: "That transaction already paid another share" } satisfies ClaimResult;
    const payment: Payment = {
      id: createId("rcpt"),
      groupId,
      shareId,
      asset: group.asset,
      chain: group.chain,
      txHash: storedHash,
      from: verified.from,
      to: verified.to,
      amount: verified.value.toString(),
      memo: verified.memo,
      blockNumber: verified.blockNumber,
      confirmedAt: now.toISOString(),
      explorerUrl,
      source: "claim",
    };
    markSharePaid(group, live, payment, now);
    return { status: "paid", payment } satisfies ClaimResult;
  });
}

/**
 * Scan recipients' incoming NIM transactions for share memos. Catches payments made
 * from any Nimiq wallet, or when the app closed before it could report the hash.
 */
export async function syncGroup(groupId: string, now = new Date()): Promise<{ matched: number }> {
  const snapshot = requireGroup(groupId);
  if (snapshot.asset !== "NIM") return { matched: 0 };
  const unpaid = snapshot.shares.filter((share) => share.status === "unpaid");
  if (unpaid.length === 0) return { matched: 0 };
  const recipients = new Set<string>();
  for (const share of unpaid) {
    const address = recipientAddress(snapshot, share);
    if (address) recipients.add(address);
  }
  const { network, rpc } = nimiqFor(snapshot);
  const candidates: Array<{ share: Share; tx: NimiqRpcTransaction }> = [];
  for (const address of recipients) {
    const txs = await rpc.getTransactionsByAddress(address, 100);
    for (const tx of txs) {
      const code = parseMemo(hexToUtf8(tx.recipientData ?? ""));
      if (!code) continue;
      const share = unpaid.find((item) => item.code === code);
      if (!share) continue;
      const result = verifyNimiqTransaction(tx, { network, recipient: recipientAddress(snapshot, share) ?? "", minValue: BigInt(share.amount), memoCode: share.code });
      if (result.ok) candidates.push({ share, tx });
    }
  }
  if (candidates.length === 0) return { matched: 0 };
  return mutateGroup(groupId, (group) => {
    let matched = 0;
    for (const { share, tx } of candidates) {
      const live = group.shares.find((item) => item.id === share.id);
      if (!live || live.status !== "unpaid" || txUsed(group, tx.hash)) continue;
      markSharePaid(
        group,
        live,
        {
          id: createId("rcpt"),
          groupId,
          shareId: live.id,
          asset: "NIM",
          chain: group.chain,
          txHash: tx.hash,
          from: tx.from,
          to: tx.to,
          amount: String(tx.value),
          memo: hexToUtf8(tx.recipientData ?? ""),
          blockNumber: tx.blockNumber,
          confirmedAt: now.toISOString(),
          explorerUrl: nimiqExplorerUrl(network, tx.hash),
          source: "scan",
        },
        now,
      );
      matched++;
    }
    return { matched };
  });
}

export interface ReminderOut {
  shareId: string;
  memberName: string;
  amountLabel: string;
  dueDate: string;
  payUrl: string;
  message: string;
  emailed: boolean;
}

/** Organizer nudges unpaid members. Returns ready-to-share messages; emails anyone who left an address. */
export async function remind(groupId: string, adminToken: string | null, options: { shareIds?: string[] } = {}, now = new Date()): Promise<ReminderOut[]> {
  const snapshot = requireGroup(groupId);
  if (!isAdmin(snapshot, adminToken)) throw new GroupError("Only the organizer can send reminders", 403);
  const targets = options.shareIds?.length
    ? snapshot.shares.filter((share) => options.shareIds?.includes(share.id) && share.status === "unpaid")
    : sharesNeedingReminder(snapshot, now, 365);
  const base = appUrl();
  const out: ReminderOut[] = [];
  for (const share of targets) {
    const view = shareView(snapshot, share, now);
    if (!view.canRemind && !options.shareIds?.length) continue;
    const member = memberById(snapshot, share.memberId);
    const amountLabel = formatAmount(share.amount, snapshot.asset);
    const payUrl = `${base}/pay/${snapshot.id}/${share.id}`;
    const openUrl = nimiqPayOpenUrl(payUrl);
    const when = view.overdue ? "was due" : "is due";
    const message = openUrl
      ? `Hi ${view.memberName}, your ${amountLabel} for "${snapshot.title}" ${when} on ${share.dueDate}. Open in Nimiq Pay: ${openUrl} — or paste ${payUrl} into Mini Apps → Custom URL.`
      : `Hi ${view.memberName}, your ${amountLabel} for "${snapshot.title}" ${when} on ${share.dueDate}. In Nimiq Pay, open Mini Apps → Custom URL and paste: ${payUrl}`;
    let emailed = false;
    if (member?.email) {
      emailed = await sendReminderEmail({ to: member.email, groupTitle: snapshot.title, memberName: view.memberName, amountLabel, dueDate: share.dueDate, payUrl, overdue: view.overdue });
    }
    out.push({ shareId: share.id, memberName: view.memberName, amountLabel, dueDate: share.dueDate, payUrl, message, emailed });
  }
  if (out.length > 0) {
    await mutateGroup(groupId, (group) => {
      for (const item of out) {
        const share = group.shares.find((candidate) => candidate.id === item.shareId);
        if (!share) continue;
        share.remindedAt = now.toISOString();
        share.reminderCount += 1;
      }
      group.activity.push({
        id: createId("act"),
        at: now.toISOString(),
        kind: "reminder_sent",
        text: `Reminder sent to ${out.map((item) => item.memberName).filter((name, index, all) => all.indexOf(name) === index).join(", ")}`,
      });
      group.updatedAt = now.toISOString();
    });
  }
  return out;
}

export function receiptFor(groupId: string, paymentId: string) {
  const group = requireGroup(groupId);
  const payment = group.payments.find((item) => item.id === paymentId);
  if (!payment) throw new GroupError("Receipt not found", 404);
  const share = group.shares.find((item) => item.id === payment.shareId);
  const payer = share ? memberById(group, share.memberId) : undefined;
  const recipient = share ? recipientOf(group, share) : undefined;
  return {
    payment,
    group: { id: group.id, title: group.title, kind: group.kind, asset: group.asset },
    payerName: payer?.name ?? "Member",
    recipientName: recipient?.name ?? "Organizer",
    round: share?.round ?? null,
    expected: share?.amount ?? payment.amount,
    dueDate: share?.dueDate,
  };
}
