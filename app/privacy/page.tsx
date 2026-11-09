import Link from "next/link";

export const metadata = { title: "Privacy · PayLink Circles" };

export default function Privacy() {
  return (
    <main className="app">
      <header className="py-2"><Link href="/" className="btn btn-ghost btn-small">Back</Link></header>
      <article className="paper mt-4 grid gap-3 p-5 text-sm leading-relaxed">
        <h1 className="h1">Privacy</h1>
        <p>PayLink Circles stores only what it needs to run your group: the group name, each member&apos;s display name, the wallet address they connect, and an email address if they choose to give one.</p>
        <p>Names and wallet addresses are visible to anyone holding the group link. Emails are never shown to other members and are used only for payment reminders the organizer sends.</p>
        <p>PayLink never holds or moves funds. Payments go straight from your wallet to the recipient in Nimiq Pay, and transactions are public on the blockchain.</p>
        <p>Your device keeps a private access key for the groups you create or join. We store only a hash of it.</p>
        <p>To delete a group&apos;s data, ask the organizer to contact 181 Labs. There is no tracking, advertising or analytics.</p>
      </article>
    </main>
  );
}
