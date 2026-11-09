export const ASSETS = ["NIM", "USDT"] as const;
export type Asset = (typeof ASSETS)[number];

export type GroupKind = "bill" | "ajo";
export type Frequency = "weekly" | "biweekly" | "monthly";

/** Where a group's money moves. NIM groups use a Nimiq network, USDT groups an EVM chain. */
export type ChainId = "nimiq-testnet" | "nimiq-mainnet" | "polygon" | "sepolia";

export interface Member {
  id: string;
  /** Position in the group. For ajo circles this is also the payout order (slot 0 is paid first). */
  slot: number;
  name: string;
  isOrganizer: boolean;
  nimAddress?: string;
  evmAddress?: string;
  email?: string;
  joinedAt?: string;
  /** sha256 of the member's device token. Never the token itself. */
  tokenHash?: string;
}

export type ShareStatus = "unpaid" | "paid" | "self";

export interface Share {
  id: string;
  /** Short code put in the on-chain memo so a payment can be matched to this share. */
  code: string;
  memberId: string;
  /** Ajo round index, or null for a bill split. */
  round: number | null;
  /** Atomic units: luna for NIM (1 NIM = 100,000 luna), 6-decimal units for USDT. */
  amount: string;
  dueDate: string;
  status: ShareStatus;
  paymentId?: string;
  remindedAt?: string;
  reminderCount: number;
}

export interface Payment {
  id: string;
  groupId: string;
  shareId: string;
  asset: Asset;
  chain: ChainId;
  txHash: string;
  from: string;
  to: string;
  amount: string;
  memo?: string;
  blockNumber?: number;
  confirmedAt: string;
  explorerUrl: string;
  source: "claim" | "scan";
}

export type ActivityKind =
  | "group_created"
  | "member_joined"
  | "payment_confirmed"
  | "reminder_sent"
  | "payout_ready";

export interface Activity {
  id: string;
  at: string;
  kind: ActivityKind;
  text: string;
  memberId?: string;
  paymentId?: string;
}

export interface Group {
  id: string;
  kind: GroupKind;
  title: string;
  note?: string;
  asset: Asset;
  chain: ChainId;
  /** Bill: the full bill in atomic units. */
  totalAmount?: string;
  /** Ajo: what each member puts in per round, atomic units. */
  contribution?: string;
  frequency?: Frequency;
  startDate: string;
  /** Bill: when shares are due. Ajo: the last payout date. */
  dueDate: string;
  inviteCode: string;
  adminTokenHash: string;
  members: Member[];
  shares: Share[];
  payments: Payment[];
  activity: Activity[];
  createdAt: string;
  updatedAt: string;
}

export interface Round {
  index: number;
  recipientMemberId: string;
  dueDate: string;
}
