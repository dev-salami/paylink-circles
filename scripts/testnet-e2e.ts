/**
 * Local/test helper: start a separate server with NIMIQ_NETWORK=testnet first.
 * Real Nimiq testnet end-to-end run against that PayLink Circles server, never the live mainnet host.
 *   1. Bill split: organizer creates, two members join, each pays a real testnet tx with the share memo.
 *      One payment is confirmed through the claim endpoint (what the mini app does after
 *      sendBasicTransactionWithData returns a hash), the other through the chain memo scan.
 *   2. Ajo circle: two members pay round 1 to the collector; the collector pays round 2 ahead.
 * Writes tx hashes to ./tmp/testnet-results.json by default. Never prints keys.
 *
 * Usage: BASE_URL=http://localhost:3020 pnpm testnet:e2e
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadWallets, sendNim, type TestWallet } from "./nimiq-signer";

const BASE = (process.env.BASE_URL || "http://localhost:3020").replace(/\/$/, "");
const OUT = process.env.E2E_OUT || "./tmp/testnet-results.json";
const SESSION = process.env.E2E_SESSION || "./tmp/nimiq-e2e-session.json";

interface Share { id: string; memberId: string; status: string; amount: string; round: number | null }
interface Group { id: string; inviteCode?: string; shares: Share[]; members: Array<{ id: string; name: string; slot: number; joined: boolean }>; activity: Array<{ text: string }> }
interface Intent { recipient: string; memo: string; amount: string }

async function call<T>(path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.status}`);
  return data;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function payShare(groupId: string, share: Share, wallet: TestWallet) {
  const intent = await call<Intent>(`/api/groups/${groupId}/shares/${share.id}/intent`);
  const hash = await sendNim(wallet, intent.recipient, BigInt(intent.amount), intent.memo);
  console.log(`  ${wallet.name} sent ${Number(intent.amount) / 1e5} NIM, memo "${intent.memo}", tx ${hash}`);
  return { hash, intent };
}

async function claimUntilPaid(groupId: string, shareId: string, hash: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await call<{ status: string; reason?: string; payment?: { id: string; blockNumber?: number } }>(`/api/groups/${groupId}/shares/${shareId}/claim`, { method: "POST", body: JSON.stringify({ txHash: hash }) });
    if (result.status === "paid") return result.payment;
    if (result.status === "rejected") throw new Error(`claim rejected: ${result.reason}`);
    await sleep(3000);
  }
  throw new Error("claim timed out");
}

async function syncUntil(groupId: string, shareIds: string[]) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const { group } = await call<{ matched: number; group: Group }>(`/api/groups/${groupId}/sync`, { method: "POST" });
    if (shareIds.every((id) => group.shares.find((share) => share.id === id)?.status === "paid")) return group;
    await sleep(3000);
  }
  throw new Error("sync timed out");
}

async function main() {
  const config = await call<{ nimiqNetwork: string }>("/api/config");
  if (config.nimiqNetwork !== "testnet") {
    throw new Error("This helper requires a separate local/test server started with NIMIQ_NETWORK=testnet. No groups or payments were created.");
  }
  const wallets = loadWallets();
  const organizer = wallets.organizer;
  const ada = wallets.memberA;
  const tunde = wallets.memberB;
  if (!organizer || !ada || !tunde) throw new Error("Need organizer, memberA and memberB wallets");
  const results: Record<string, unknown> = { network: "nimiq-testnet", ranAt: new Date().toISOString(), base: BASE, transactions: [] as unknown[] };
  const txs = results.transactions as Array<Record<string, unknown>>;
  const session: Record<string, unknown> = {};

  console.log("Bill split");
  const bill = await call<{ group: Group; adminToken: string; memberToken: string; memberId: string }>("/api/groups", {
    method: "POST",
    body: JSON.stringify({ kind: "bill", title: "Suya night at Ikoyi", asset: "NIM", amount: "300", memberNames: ["Khalil", "Ada", "Tunde", "Bisi"], organizer: { name: "Khalil", nimAddress: organizer.address }, date: iso(3) }),
  });
  const billId = bill.group.id;
  const code = bill.group.inviteCode ?? "";
  const billJoins: Record<string, { memberId: string; memberToken: string }> = {};
  for (const [wallet, name] of [[ada, "Ada"], [tunde, "Tunde"]] as const) {
    billJoins[name] = await call(`/api/groups/${billId}/join`, { method: "POST", body: JSON.stringify({ inviteCode: code, name, nimAddress: wallet.address }) });
  }
  const billGroup = await call<Group>(`/api/groups/${billId}`);
  const adaShare = billGroup.shares.find((share) => share.memberId === billJoins.Ada?.memberId);
  const tundeShare = billGroup.shares.find((share) => share.memberId === billJoins.Tunde?.memberId);
  if (!adaShare || !tundeShare) throw new Error("missing bill shares");

  const adaPay = await payShare(billId, adaShare, ada);
  const adaPayment = await claimUntilPaid(billId, adaShare.id, adaPay.hash);
  console.log(`  confirmed by claim in block ${adaPayment?.blockNumber}`);
  txs.push({ flow: "bill · claim by hash", group: billId, from: ada.address, to: adaPay.intent.recipient, nim: Number(adaPay.intent.amount) / 1e5, memo: adaPay.intent.memo, hash: adaPay.hash, block: adaPayment?.blockNumber, receipt: `${BASE}/r/${billId}/${adaPayment?.id}` });

  const tundePay = await payShare(billId, tundeShare, tunde);
  await syncUntil(billId, [tundeShare.id]);
  const afterBill = await call<Group & { payments: Array<{ id: string; txHash: string; blockNumber?: number }> }>(`/api/groups/${billId}`);
  const tundePayment = afterBill.payments.find((payment) => payment.txHash === tundePay.hash);
  console.log(`  confirmed by memo scan in block ${tundePayment?.blockNumber}`);
  txs.push({ flow: "bill · memo scan", group: billId, from: tunde.address, to: tundePay.intent.recipient, nim: Number(tundePay.intent.amount) / 1e5, memo: tundePay.intent.memo, hash: tundePay.hash, block: tundePayment?.blockNumber, receipt: `${BASE}/r/${billId}/${tundePayment?.id}` });

  const reminders = await call<{ reminders: Array<{ memberName: string }> }>(`/api/groups/${billId}/remind`, { method: "POST", headers: { "x-admin-token": bill.adminToken }, body: JSON.stringify({}) });
  console.log(`  reminders created for ${reminders.reminders.map((item) => item.memberName).join(", ")}`);
  session.bill = { id: billId, adminToken: bill.adminToken, memberToken: bill.memberToken, memberId: bill.memberId, members: billJoins };

  console.log("Ajo circle");
  const ajo = await call<{ group: Group; adminToken: string; memberToken: string; memberId: string }>("/api/groups", {
    method: "POST",
    body: JSON.stringify({ kind: "ajo", title: "Lekki Friends Ajo", asset: "NIM", amount: "50", memberNames: ["Khalil", "Ada", "Tunde"], organizer: { name: "Khalil", nimAddress: organizer.address }, frequency: "weekly", date: iso(2) }),
  });
  const ajoId = ajo.group.id;
  const ajoJoins: Record<string, { memberId: string; memberToken: string }> = {};
  for (const [wallet, name] of [[ada, "Ada"], [tunde, "Tunde"]] as const) {
    ajoJoins[name] = await call(`/api/groups/${ajoId}/join`, { method: "POST", body: JSON.stringify({ inviteCode: ajo.group.inviteCode, name, nimAddress: wallet.address }) });
  }
  const ajoGroup = await call<Group>(`/api/groups/${ajoId}`);
  const round0 = ajoGroup.shares.filter((share) => share.round === 0 && share.status === "unpaid");
  const pays: Array<{ share: Share; hash: string; intent: Intent; wallet: TestWallet }> = [];
  for (const share of round0) {
    const wallet = share.memberId === ajoJoins.Ada?.memberId ? ada : tunde;
    const paid = await payShare(ajoId, share, wallet);
    pays.push({ share, wallet, ...paid });
  }
  for (const item of pays) {
    const payment = await claimUntilPaid(ajoId, item.share.id, item.hash);
    txs.push({ flow: "ajo round 1 · claim by hash", group: ajoId, from: item.wallet.address, to: item.intent.recipient, nim: Number(item.intent.amount) / 1e5, memo: item.intent.memo, hash: item.hash, block: payment?.blockNumber, receipt: `${BASE}/r/${ajoId}/${payment?.id}` });
  }
  // The round-1 collector pays their round-2 contribution to Ada ahead of time, from the pot they just received.
  const ahead = ajoGroup.shares.find((share) => share.round === 1 && share.memberId === ajo.memberId);
  if (ahead) {
    await sleep(2000);
    const paid = await payShare(ajoId, ahead, organizer);
    const payment = await claimUntilPaid(ajoId, ahead.id, paid.hash);
    txs.push({ flow: "ajo round 2 · paid ahead · claim", group: ajoId, from: organizer.address, to: paid.intent.recipient, nim: Number(paid.intent.amount) / 1e5, memo: paid.intent.memo, hash: paid.hash, block: payment?.blockNumber, receipt: `${BASE}/r/${ajoId}/${payment?.id}` });
  }
  const finalAjo = await call<Group>(`/api/groups/${ajoId}`);
  console.log(`  activity: ${finalAjo.activity.map((item) => item.text).join(" | ")}`);
  session.ajo = { id: ajoId, adminToken: ajo.adminToken, memberToken: ajo.memberToken, memberId: ajo.memberId, members: ajoJoins };

  mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  writeFileSync(SESSION, JSON.stringify(session, null, 2), { mode: 0o600 });
  console.log(`\n${txs.length} testnet payments confirmed. Results: ${OUT}`);
  for (const tx of txs) console.log(`  ${tx.flow}: https://test.nimiq.watch/#${tx.hash}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
