# Circles — bill splits and ajo inside Nimiq Pay

Circles is a Nimiq Pay mini app for paying people back as a group. Split a bill, or run an **ajo** (a rotating savings circle, also called esusu or susu) where everyone puts in each round and one member collects the whole pot. Every share is paid in **NIM or USDT**, wallet to wallet in Nimiq Pay, and confirmed on chain.

**Live:** [https://circles.181labs.build](https://circles.181labs.build)

Built for Nimiq Mini Apps Competition III (category: **Pay**). MIT licensed. Live defaults are **mainnet NIM + Polygon USDT** — both real money.

181 Labs · Khalil Salami

## Open it in Nimiq Pay

Circles is not yet in the public Nimiq Pay catalog. Until it is listed:

1. Open **Nimiq Pay** on your phone.
2. Go to **Mini Apps → Custom URL**.
3. Paste `https://circles.181labs.build` and tap **Open**.

After catalog approval, the deep link `https://nimpay.app/miniapps/open/circles.181labs.build` will also work.

## What it does

- **Create a group**: a bill split (equal shares, remainder spread to the unit) or an ajo circle (weekly, every 2 weeks, or monthly, with an optional shuffled payout order).
- **Invite with a link or QR code**. Members claim a spot, connect Nimiq Pay, and can leave an optional email for reminders.
- **See each share and the schedule**: who has paid, who is overdue, and the ajo payout rotation.
- **Pay in one tap inside Nimiq Pay.** NIM uses `sendBasicTransactionWithData` with a memo that ties the payment to the share. USDT uses `window.ethereum` with an ERC-20 `transfer` on Polygon.
- **On-chain confirmation**: the server checks each transaction (network, recipient, amount, memo, success, at least one confirmation). A NIM payment from any wallet is still matched by scanning the recipient's incoming transactions for the memo.
- **Reminders**: the organizer can nudge unpaid members (12-hour cooldown) via WhatsApp / share sheet, optional email, and in-app **Pay now** / **Later**.
- **A receipt for every payment**, with an explorer link.

Circles never holds funds. Bill shares go to the organizer who fronted the bill. Ajo contributions go directly to that round's collector.

## Tech stack

- Next.js 15 (App Router) + React 19 + TypeScript + Tailwind
- `@nimiq/mini-app-sdk` for Nimiq Pay host detection and NIM payments
- `viem` for Polygon USDT (official USDT `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`)
- JSON file store (mount `DATA_DIR` as a volume in production)
- Outfit display font (SIL OFL 1.1), self-hosted in `app/fonts/`

## Run locally

```bash
pnpm install
pnpm dev          # http://0.0.0.0:3020, mainnet NIM by default
```

Checks:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

To try the UI on a phone before catalog listing: Nimiq Pay → **Mini Apps → Custom URL** → `http://<your-LAN-IP>:3020`.

For local **testnet NIM**, start with `NIMIQ_NETWORK=testnet pnpm dev`. In Nimiq Pay, long-press Settings (~10s) for the developer menu, switch to testnet, and tap **Get free NIM**. USDT on Polygon stays real money unless you separately configure Sepolia.

### Local/test helper: testnet end-to-end

Start a separate local server with `NIMIQ_NETWORK=testnet`. Then:

```bash
BASE_URL=http://localhost:3020 pnpm testnet:e2e
```

Uses throwaway testnet keys from `NIMIQ_TEST_KEYS` (a JSON file of `{name: {address, privateKey}}`; the script never prints them). Do not point this at the live mainnet host.

```bash
pnpm testnet:pay <wallet> <NQ..> <NIM> "<memo>"
```

## Configuration

Copy `.env.example` to `.env.local`. Names only — never commit values.

| Variable | Purpose |
| --- | --- |
| `NIMIQ_NETWORK` | `mainnet` (default). Only exact `testnet` selects testnet. Applies to **new** NIM groups. |
| `NIMIQ_RPC_URL` | Optional Albatross JSON-RPC override for the selected network. |
| `USDT_CHAIN` | `polygon` (default, official USDT) or `sepolia` (needs `USDT_TOKEN_ADDRESS`). |
| `USDT_RPC_URL` | Optional RPC for the selected USDT chain. |
| `USDT_TOKEN_ADDRESS` | Required for Sepolia only; ignored on Polygon. |
| `APP_URL` | Public origin used in reminder links. |
| `DATA_DIR` | JSON store path (mount a volume in production). |
| `RESEND_API_KEY` / `RESEND_FROM` | Optional email reminders. Leave unset to skip email. |

Confirm after deploy: `GET /api/health` and `GET /api/config` should show `"nimiqNetwork":"mainnet"` and the official Polygon USDT address. USDT needs a little POL for gas. NIM payments are refused when Nimiq Pay's NIM network does not match the group's.

## Deploy

```bash
docker build -t paylink-circles .
docker run -d -p 3020:3020 -v circles-data:/data -e APP_URL=https://circles.181labs.build paylink-circles
```

Behind Traefik/Coolify: `deploy/compose.yaml` and `deploy/deploy-vps.sh <ssh-host>`. Keep env on the host (mode 600); data in the `circles_circles-data` volume. Serve over HTTPS for Nimiq Pay users.

## Data and privacy

Stores group names, member display names, connected wallet addresses, and optional emails — only to run the group. Emails are never shown to other members. Each device keeps a random access token; the server stores only its SHA-256 hash. See `/privacy`. No analytics or tracking.

## Licence

MIT. See [`LICENSE`](LICENSE). Copyright (c) 2026 Khalil Salami (181 Labs).

The UI typeface is Outfit (`app/fonts/Outfit-Variable.ttf`), licensed under the SIL Open Font License 1.1 (`app/fonts/OFL.txt`). App code and vendored helpers in `lib/vendor/paylink-core/` are MIT. Do not describe the font files as MIT.

Competition paste copy: [`docs/COMPETITION.md`](docs/COMPETITION.md) (do not submit from this README).
