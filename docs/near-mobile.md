# NEAR Mobile (Android): integration notes and test plan

Status: wired in, NOT yet verified with the installed NEAR Mobile Android app. Do not treat it as supported until the checklist below passes on a real phone.

## Network question (testnet)
The website's `network: "testnet"` does not change the wallet. It only tells the NEAR Mobile relay which network the request is for.
- **What the app does with it** (from the app's public source, `Peersyst/near-mobile-wallet`, whose last public commit is dated 2025-04-10, so it may be older than the build in the store): the app compares its own selected network with the request's network. On a mismatch it shows "Network mismatch: This request is expecting a different network" and does not let you approve. So signing a testnet request works only when the app itself is set to Testnet.
- **The switch in that source:** a MAINNET/TESTNET chip in the app header, and Settings, General, "Select your network", both controlled by `enableChangeNetwork` (true in the production config). Switching keeps separate wallets per network. If your store build has neither, it has probably been removed since, and the official app cannot be used for testnet.
- **The relay:** accepts `network: "testnet"` (verified, HTTP 201).
- **Deep link:** the app registers the `near-mobile-wallet` scheme. For transaction requests it has no code that reopens the website after approval, so you switch back manually and the site picks up the result by polling. Only the NEAR Mobile in-app browser avoids that.
- **Account check added to our site:** after any wallet connects, the site asks the testnet RPC whether the account exists there and signs it out with a message if not. (Mainnet-only or unfunded accounts fail it. Also note the treasury account `bd73...6669` does not exist on testnet yet: it can receive USDC, but needs a little testnet NEAR before it can spend or move it.)

## Recommended mobile wallet for testnet
Meteor Wallet: its listing in HOT Connect's wallet manifest marks testnet and mainnet both supported, with signMessage, on Android, iOS and web, and it is already in our wallet list. MyNearWallet's testnet web wallet (testnet.mynearwallet.com) also works in a phone browser. Neither has been tested on a phone by us.

## What was checked from source and the network
| Check | Result |
|---|---|
| `@near-wallet-selector/near-mobile-wallet` 10.1.4 (same version as our selector) | Works with `network: testnet` in its code (`Network = "testnet" \| "mainnet"`) |
| Connection model | Request relay, not a callback. The site creates a request on NEAR Mobile's hosted relay, shows a panel with a QR code and an Approve button, the user approves in the app, and the site polls the relay for the result (up to 10 minutes) |
| Relay accepts testnet | Yes: `POST /api/signer-request` with `network: "testnet"` returned HTTP 201, and the status endpoint answered |
| Android hand-off | The Approve button opens `.../api/deep-link?uuid=...`, which redirects to `near-mobile-wallet://sign/request/<id>`. The widget's own source says this is "a temporary solution to make the button work on Android" |
| Inside the NEAR Mobile in-app browser | The widget detects `window.isNearMobile` and goes straight to the request, which is the smoothest path |
| Sign-in | Adds a limited key for our contract, which needs the contract id. We pass it (a known failure otherwise is `receiverIdNotSpecified`) |
| Message signing (admin sign-in) | Supported by the module |
| Request metadata | The relay rejects the whole request unless the app name logo and URL are valid public https URLs. On localhost or http they are omitted |
| HOT Connect (`@hot-labs/near-connect` 0.12.0) | Rejected: its manifest lists NEAR Mobile with `"testnet": false`, and a public bug report describes NEAR Mobile failing to connect through HOT Connect on iOS and Android |

## What is not verified (needs the phone)
1. The Approve button actually launches the app from Android Chrome.
2. The app shows testnet requests (the app must be switched to testnet) and approves them.
3. The site resumes and detects the account when you switch back to the browser.
4. Signing: `ft_transfer_call` on USDC (needs approval in the app each time), `settle_invoice` (may be signed silently with the limited key) and the admin sign-in message.
5. The admin account `mouseng20.testnet` must exist inside NEAR Mobile (imported). The admin sign-in only accepts that account.

## Behaviour in the app
- On Android, Connect starts NEAR Mobile directly. "Use another wallet" opens the full list (MyNearWallet, Meteor, HERE, NEAR Mobile).
- On desktop nothing changes: the wallet list opens as before.
- Network stays NEAR Testnet.

## Test checklist (Android, NEAR Mobile installed, set to testnet)
1. Open the deployed site in Chrome, go to /admin, tap Connect school wallet. Expected: a panel with a QR code and Approve.
2. Tap Approve. Expected: NEAR Mobile opens with a sign-in request. Approve it, then return to Chrome. Expected: the site shows your account.
3. Press Sign in. Expected: NEAR Mobile asks to sign a message, then the dashboard opens.
4. Create an invoice. Expected: NEAR Mobile asks to approve `create_invoice` (or signs silently).
5. On a payer account, open a payment link and press Pay. Expected: NEAR Mobile asks to approve the USDC transfer, then Finish payment.
6. Repeat steps 1 to 3 inside the NEAR Mobile in-app browser.
Report for each step: what happened, and any error text shown on the site or in the app.
