/** Usage: pnpm testnet:pay <walletName> <recipient NQ..> <amountNIM> "<memo>" */
import { balanceOf, loadWallets, sendNim } from "./nimiq-signer";

async function main() {
  const [name, recipient, amount, memo = ""] = process.argv.slice(2);
  if (!name || !recipient || !amount) throw new Error('Usage: testnet:pay <walletName> <recipient> <amountNIM> "<memo>"');
  const wallet = loadWallets()[name];
  if (!wallet) throw new Error(`No wallet named ${name}`);
  const luna = BigInt(Math.round(Number(amount) * 100000));
  console.log(`From ${wallet.address} (balance ${(await balanceOf(wallet.address)) / 1e5} NIM)`);
  const hash = await sendNim(wallet, recipient, luna, memo);
  console.log(`Sent ${amount} NIM to ${recipient}\nhash ${hash}\nhttps://test.nimiq.watch/#${hash}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
