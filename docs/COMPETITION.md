# Competition description

Paste the body below into Nimiq Mini Apps Competition III (category: Pay). Under 250 words. Do not submit from this repo.

---

PayLink Circles is a Nimiq Pay mini app for group payments. Split a bill, or run an ajo: a rotating savings circle, also called esusu or susu. Each round everyone puts in the same amount and one member collects the pot, until each person has been paid.

The app never holds funds. Bill shares go to the organizer who paid up front. Ajo contributions go to that round's collector. Members pay in NIM or in USDT on Polygon, from their own Nimiq Pay wallet.

Share an invite link or QR code. Each person claims a spot and connects a wallet. NIM uses sendBasicTransactionWithData with a memo that ties the transfer to the share. USDT uses window.ethereum: switch to Polygon (0x89) and transfer official USDT, 0xc2132D05D31c914a87C6611C10748AEb04B58e8F. Gas is POL.

The server checks the chain before marking a share paid: network, recipient, amount, the NIM memo, success, and inclusion. A NIM payment from any wallet still matches by scanning the recipient's incoming transfers. Every payment has a receipt and an explorer link.

Organizers can remind unpaid members at most every 12 hours, by WhatsApp, the share sheet, or email. Members also see Pay now and Later.

Open from Nimiq Pay → Mini Apps → Custom URL, or a link that launches it in the app. Live defaults are mainnet NIM and Polygon USDT: both real money. PayLink refuses NIM when the wallet network differs from the group's. If unreadable, set the wallet to the group's network before paying NIM.
