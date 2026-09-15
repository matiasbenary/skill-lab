---
name: agent-custody
description: Multi-chain custody wallet for AI agents with cross-chain swaps and payment checks via NEAR Intents. Register a gasless wallet, swap tokens across 20+ chains, send/receive on NEAR, Ethereum, Bitcoin, Solana, and more. Use when an agent needs crypto operations - transfers, swaps, payment checks, contract calls, or cross-chain movements.
metadata:
  api:
    base_url: https://api.outlayer.ai
    version: v1
    auth: Bearer token
---

# OutLayer Agent Custody Wallet

Multi-chain custody wallet for AI agents. Supports NEAR transfers, smart contract calls, and cross-chain swaps via NEAR Intents protocol - no gas tokens needed on destination chains.

## When to Use This Skill

## Things only the user can do â€” hand them a link

Four steps need a human: they need a NEAR key you do not have, or money you
cannot spend. For each there is a page. **Send the link with a sentence saying
what it is for** â€” a bare URL from an agent asking for account access is what a
phishing attempt looks like.

| You want | Say this, with this link |
|---|---|
| **Act under their account** | "Open this and sign once â€” it lets me act as `alice.near` instead of a hex address: `https://app.outlayer.ai/wallet/connect?key={api_key}`" |
| **A credential for a connector** | "The <service> connector needs its API token. Store it here â€” it is encrypted in your browser and I never see it: `https://app.outlayer.ai/secrets?project={connector_project_id}&name={VAR_NAME}`" |
| **A limit on what you may spend** | "I can spend from your account now. Set a cap, an address list, or an approval threshold here: `https://app.outlayer.ai/wallet?key={api_key}`" |
| **Money to work with** | "Fund me here: `https://app.outlayer.ai/wallet/fund?to={near_account_id}&amount={amount}&token={token}&msg={message}&dest=intents`" |

Two rules for all four:

* **Never ask for the secret itself in chat.** Not the token, not the seed
  phrase, not the private key. The pages encrypt in the browser precisely so
  that nobody â€” you, us, the page â€” holds the value.
* **Raise the policy one yourself, before you are asked.** After a binding goes
  active you can move everything in that account until a policy says otherwise.
  You are the party that benefits from the limit being absent, so you are the
  party who has to mention it.

| You need... | Action |
|-------------|--------|
| A crypto wallet for your agent | Register via `POST /register` |
| Try the connectors for free | Claim a trial key with `POST /trial-key`, then send it as `X-Payment-Key` |
| Check what is left on any key | `GET /payment-keys/balance` with `X-Payment-Key` |
| Run your own WASI module | No free tier â€” create and fund a payment key |
| Upgrade to paid execution | Use `POST /wallet/v1/create-payment-key` (USDC or NEAR) |
| Give an agent a key to spend | Claim the trial (`POST /trial-key`) or create one (`POST /wallet/v1/create-payment-key`), then hand it the string |
| Stop paying per call for connectors | Buy a subscription for the key the agent presents â€” see section 6 |
| Check the agent's allowance and expiry | `GET /subscription/status` with `Authorization: Bearer wk_` |
| Send NEAR to someone | Use `POST /wallet/v1/transfer` with `chain: "near"` |
| Send FT tokens (USDT, wNEAR) to someone | Use `POST /wallet/v1/call` with `ft_transfer` (see FT transfer section) |
| Swap tokens (e.g. wNEAR to USDT) | Use `POST /wallet/v1/intents/swap` - gasless swap via 1Click. Tokens must be in intents balance first |
| Preview swap rate before committing | Use `POST /wallet/v1/intents/swap/quote` - read-only, no gas spent |
| List available tokens for swaps | Use `GET /wallet/v1/tokens` - returns ~200 tokens across 20+ chains |
| Withdraw native NEAR (gasless) | Use `POST /wallet/v1/intents/withdraw` with `chain: "near"` and `token: "near"` (default). Unwraps your wNEAR â†’ native NEAR; receiver needs **no** storage. Recipient account must already exist (or be a 64-char implicit account) |
| Send tokens cross-chain (gasless) | Use `POST /wallet/v1/intents/withdraw` with `chain` param - gasless. **For non-NEAR chains pass `"async": true` and poll the result (the bridge rarely finishes in the sync window).** For NEAR delivering wNEAR (`token: "nep141:wrap.near"`): receiver must have storage (use `/storage-deposit` first). For Solana: use `chain: "solana"` |
| Register token storage | Use `POST /wallet/v1/storage-deposit` - needed before withdrawing to accounts without storage |
| Transfer tokens to another account's intents balance | Use `POST /wallet/v1/intents/transfer` with `{ to, amount, token }` â€” gasless; stays **inside** `intents.near` (recipient is credited there, not on-chain). NOT a withdrawal â€” use this when the recipient also holds an intents balance. Recipient need not exist on-chain (64-hex implicit is fine) |
| Move FT from wallet into Intents | Use `POST /wallet/v1/intents/deposit` - on-chain, needs gas |
| Call a NEAR smart contract | Use `POST /wallet/v1/call` - on-chain, needs gas |
| Check your balance | Use `GET /wallet/v1/balance?chain=near` or `&token=usdt.tether-token.near` |
| Check intents deposit balance | Use `GET /wallet/v1/balance?token=wrap.near&source=intents` |
| Get your NEAR, EVM, or Solana address | Use `GET /wallet/v1/address?chain=near` (or `?chain=polygon`/`ethereum`/`base`/â€¦ â€” all EVM chains return ONE shared `0x` address; `?chain=solana` returns the base58 ed25519 address); the account is in the `address` field |
| Sign an EIP-712 order / typed data (EVM) | `POST /wallet/v1/evm/sign-typed-data` with `{chain, typed_data}` â€” off-chain; signs Polymarket-style CLOB orders. Gated by `evm_sign` |
| Sign an EIP-191 message (EVM) | `POST /wallet/v1/evm/sign-message` with `{chain, message}` â€” e.g. venue L1 auth / CLOB API-key derivation |
| Sign a raw EVM transaction | `POST /wallet/v1/evm/sign-transaction` with `{chain, unsigned_tx}` â€” you serialize + broadcast; gated by `evm_sign.raw_tx` (default-OFF) |
| Sign a Solana off-chain message | `POST /wallet/v1/solana/sign-message` with `{chain:"solana", message}` â€” Sign-in-with-Solana / venue auth; raw-bytes ed25519, base58 signature. Gated by `solana_sign` |
| Sign a Solana transaction | `POST /wallet/v1/solana/sign-transaction` with `{chain:"solana", unsigned_tx}` (base64 serialized tx **message**) â€” you assemble + broadcast; gated by `solana_sign.raw_tx` (default-OFF) |
| Delete the wallet | Use `POST /wallet/v1/delete` - deletes on-chain account, sends NEAR to beneficiary. Wallet must have NEAR balance |
| Ask user to fund your wallet | Generate a fund link (see below) or share your NEAR address |
| Pay another agent (write a check) | `POST /wallet/v1/payment-check/create` - get `check_key` to send |
| Pay multiple agents at once | `POST /wallet/v1/payment-check/batch-create` - up to 10 checks |
| Receive payment from another agent | `POST /wallet/v1/payment-check/claim` with the `check_key` you received |
| Claim only part of a check | `POST /wallet/v1/payment-check/claim` with `amount` param |
| See if your check was cashed | `GET /wallet/v1/payment-check/status?check_id={id}` |
| Take back an unclaimed check | `POST /wallet/v1/payment-check/reclaim` (supports partial via `amount`) |
| Check a check's balance by key | `POST /wallet/v1/payment-check/peek` with `check_key` |
| Deposit from another chain (Solana, Ethereum, etc.) | `POST /wallet/v1/intents/deposit/cross-chain` (alias `/deposit-intent`) with `source_asset` (defuse asset id from `GET /wallet/v1/tokens`) - get a deposit address, user sends tokens, 1Click bridges to intents |
| Check cross-chain deposit status | `GET /wallet/v1/intents/deposit/cross-chain/status?id={intent_id}` - poll until `success` |
| Withdraw to another chain | `POST /wallet/v1/intents/withdraw` with `chain` param (e.g. `"solana"`, `"ethereum"`) - gasless. **Pass `"async": true` and poll `GET /wallet/v1/requests/{request_id}` â€” the bridge rarely settles within the synchronous window (see "Async mode")** |
| List cross-chain deposits | `GET /wallet/v1/intents/deposit/cross-chain/list` (alias `/deposits`) |
| Move funds into the private (confidential) shard | `POST /wallet/v1/confidential/shield` with `{ token, amount }` â€” SHIELD from public intents balance; **publicly links your wallet on chain** (entry reveal). Canonical; legacy alias `/wallet/v1/confidential/deposit` still works |
| Move funds back from private to public | `POST /wallet/v1/confidential/unshield` with `{ token, amount }` â€” reverse SHIELD (exit reveal) |
| Fund private balance **without** linking your wallet | `POST /wallet/v1/confidential/deposit/cross-chain` with `{ source_asset, amount }` â†’ returns a bridge address on the source chain; send funds there. Your NEAR wallet never touches the public chain. Canonical; legacy alias `/wallet/v1/confidential/deposit-intent` still works |
| Withdraw private balance to an external chain (no link) | `POST /wallet/v1/confidential/withdraw` with `{ chain, to, amount, token }` â€” gasless; your wallet stays off the public chain. `chain` must be the token's **home chain** or `"near"` (mismatch â†’ 400). `chain="near"` delivers **native NEAR** for `wrap.near` (1Click runs `native_withdraw` on `intents.near`) and the **NEP-141 token on NEAR** for omft bridge assets (e.g. ZEC â†’ `zec.omft.near` to a NEAR account); for sending back to your **own** public balance use `unshield` instead |
| Preview a confidential withdraw | `POST /wallet/v1/confidential/withdraw/dry-run` â€” same body, no commit |
| Private transfer to another wallet's private balance | `POST /wallet/v1/confidential/transfer` with `{ to, amount, token }` â€” no public-chain trace |
| Swap tokens privately | `POST /wallet/v1/confidential/swap` with `{ token_in, token_out, amount_in, min_amount_out? }` â€” distinct assets, no public-chain trace |
| Preview a confidential swap | `POST /wallet/v1/confidential/swap/quote` |
| Read your private (confidential) balance | `GET /wallet/v1/confidential/balance?token={defuse_id}` or omit `token` for all |
| Authenticate to an external service | `POST /wallet/v1/sign-message` - NEP-413 signed message for login/auth |
| Let the user set spending limits | Share the `handoff_url` from registration |
| Create wallets for users (no per-user keys) | Use deterministic registration: `POST /register` with NEAR signature fields |
| Authenticate with NEAR key (no stored secrets) | Use `Bearer near:<base64url>` header instead of `Bearer wk_...` |
| Use your OWN per-customer master (no shared TEE) | Tell the user to deploy a sovereign vault â€” see "Sovereign Vaults" section |
| Create sub-agent (custody wallet) | `PUT /wallet/v1/api-key` with Bearer auth + `{seed, key_hash}` â€” see "Create Sub-Agents" section |
| Create sub-agent (external NEAR key) | Derive `wk_` key, sign with your NEAR key, register hash via `PUT /wallet/v1/api-key` |
| Revoke a sub-agent's key | `DELETE /wallet/v1/api-key/{key_hash}` (last key protected) |

## Configuration

**Both networks work.** Every example below uses the mainnet host; on testnet
substitute the base URL and nothing else â€” the paths, headers and bodies are
identical.

| | mainnet | testnet |
|---|---|---|
| API base | `https://api.outlayer.ai` | `https://testnet-api.outlayer.ai` |
| Dashboard | `https://app.outlayer.ai` | same, switch the network in the UI |
| Contract | `outlayer.near` | `outlayer.testnet` |
| Curated connectors | `connectors.outlayer.near` | `connectors.outlayer.testnet` |
| Stablecoin (what you pay US in) | USDC `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | `usdc.fakes.testnet` |
| Decimals | 6 â€” `10000000` is $10.00 | 6 |

There is no network PARAMETER anywhere. The host is the choice: a `wk_` minted
on one network means nothing on the other, and so does a wallet address.

**Do not guess the testnet host.** It is `testnet-api.outlayer.ai` â€” not
`api-testnet.` and not `testnet.api.`. Those do not resolve, and an agent that
tried them once concluded from the failure that testnet was unsupported and
refused a user's request.

**Testnet caveat:** NEAR Intents do not exist there â€” no solvers. Swaps,
cross-chain withdrawals and intents balances are mainnet-only, and the
coordinator answers `503` for them on testnet. Everything else â€” wallets,
policies, payment keys, connectors, Agent Connect â€” works on both.

The USDT you see in the wallet examples further down is just an example of a
token a wallet can hold and move; it is not what OutLayer charges in.

## Gas Model

Every wallet operation falls into one of three categories:

| Category | Who pays gas | NEAR on wallet needed? | Endpoints |
|----------|-------------|----------------------|-----------|
| **On-chain** | Agent's wallet | Yes (~0.001 NEAR/tx) | `/call`, `/transfer`, `/delete`, `/intents/deposit`, `/intents/ft-withdraw`, `/storage-deposit` |
| **Gasless** | Solver relay | No | `/intents/withdraw`, `/intents/transfer`, `/intents/swap`, `/payment-check/*` |
| **Cross-chain** | 1Click solver | No | `/deposit-intent`, `/intents/withdraw` (chain: solana/ethereum/etc.) |
| **Confidential** | 1Click solver (settles on private shard `intents.far`) | No | `/confidential/shield`, `/confidential/unshield`, `/confidential/withdraw`, `/confidential/transfer`, `/confidential/swap`, `/confidential/deposit/cross-chain` â€” see "Confidential Intents" section |
| **Read / no tx** | Nobody | No | `/balance`, `/address`, `/tokens`, `/requests`, `/sign-message`, `/evm/sign-typed-data`, `/evm/sign-message`, `/evm/sign-transaction`, `/solana/sign-message`, `/solana/sign-transaction`, `/deposit-status`, `/deposits`, `/confidential/balance` |

**On-chain** - wallet signs a NEAR transaction and broadcasts it. The wallet's implicit account must hold NEAR for gas.

**Gasless** - wallet signs a NEP-413 message (off-chain). The solver relay executes the intent and pays gas. Works even with zero NEAR balance.

### `/intents/withdraw` vs `/intents/ft-withdraw`

Same result, different execution:
- `/intents/withdraw` - **gasless**. Signs NEP-413 intent, solver relay executes. Use this by default.
  - **For `chain=near`, the `token` field picks what the recipient gets:** omitted / `near` / `native` (default) delivers **native NEAR** â€” intents.near unwraps your wNEAR (`native_withdraw` intent), and the receiver needs **no** storage. `nep141:wrap.near` (or any `nep141:<token>`) delivers that NEP-141 instead, and the receiver **must** have storage registered (use `/storage-deposit` first).
  - **Native-NEAR caveat:** the recipient account must already exist (or be a 64-char implicit account). Withdrawing native NEAR to a non-existent named account is rejected up front (the unwrapped wNEAR would otherwise be burned).
- `/intents/ft-withdraw` - **on-chain**. Calls `ft_withdraw` on `intents.near`. Needs NEAR for gas. NEP-141 only (no native NEAR).

### Async mode â€” strongly recommended for cross-chain withdrawals

`/intents/withdraw` accepts `"async": true`. In async mode the call returns immediately with `status: "processing"` and a `poll_url`; the withdrawal settles in the background and you poll `GET /wallet/v1/requests/{request_id}` until the row reaches a terminal status. **The exact status values are a short, fixed set â€” see "Status values (exact)" below; do not invent synonym sets, and do not forget `needs_review`.**

- **Cross-chain withdrawals (`chain` â‰  `near`): always prefer `async: true`.** The 1Click bridge almost always takes longer than the synchronous response window â€” a sync call blocks up to ~90s and then returns `processing` anyway, and can hit the gateway request timeout first. Async is the reliable path; treat it as the default for any non-NEAR `chain`.
- **Same-chain NEAR (`chain: "near"`)** settles in seconds â€” a synchronous call is fine and `async` is optional.
- Auth, policy and validation errors are returned **synchronously** in both modes. In async mode only an *execution* failure surfaces as the request's `failed` status (read it from the poll, not the POST response).

```bash
# Cross-chain withdraw â€” async (recommended)
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"to":"0x742d35Cc6634C0532925a3b844Bc9e7595f8b4f5","amount":"100000000","token":"nep141:usdt.tether-token.near","chain":"ethereum","async":true}' \
  "https://api.outlayer.ai/wallet/v1/intents/withdraw"
# â†’ { "request_id": "<id>", "status": "processing", "poll_url": "/wallet/v1/requests/<id>" }

# Poll until terminal (processing â†’ success | failed | needs_review)
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/requests/<id>"
```

#### Status values (exact)

The `GET /wallet/v1/requests/{id}` row for a withdraw/swap holds **only** these `status` strings â€” match them exactly (case-sensitive). Do **not** build broad synonym sets (`settled`/`completed`/`confirmed`/`done`/â€¦); none of those are ever emitted, and inventing them gives false confidence while missing the one that matters (`needs_review`).

| `status` | Terminal? | Meaning / how to handle |
|----------|-----------|--------------------------|
| `processing` | no | Still settling. Keep polling. |
| `success` | **yes** | Done. `result` carries `amount_out`, `transfer_intent_hash`, `deposit_address` (identifiers) plus â€” on cross-chain ops â€” nullable `destination_tx_hash`, the **one** real destination-chain tx (see "Result fields are identifiers, NOT tx hashes" below). |
| `failed` | **yes** | Execution failed (a 1Click refund/expiry is also normalized to `failed`; the reason is in `result.reason`). Safe to surface as a failure. |
| `needs_review` | **yes (stop)** | **Execution was interrupted or unresolved; fund state is UNKNOWN.** Surface as "needs manual review / contact support". **Do NOT auto-retry** â€” the original transfer may have fired, so a retry can double-spend. This is the status integrators most often forget â€” without it you poll forever. |
| `pending_approval` / `approved` | no | **Multisig wallets only.** The withdrawal needs the approval flow to complete; it will not settle by polling alone. |
| `rejected` | **yes** | Multisig: approvers rejected. Treat as failure. |

**Multisig limits.** One signing request may carry at most **16** approval votes and **16**
rejections; more is rejected with HTTP 400 before anything in the ballot is checked. Verifying a
vote costs a signature check, so the ballot is capped rather than left open-ended. Two consequences
for an integrator: send only the votes that count toward the threshold rather than every signature
you have collected, and do not configure a policy with more than 16 approvers â€” its threshold could
never be met, because the votes would not fit in the request.

Notes:
- `success`/`failure` detection in your client should be: success = `{"success"}`, failure = `{"failed","rejected"}`, plus `needs_review` as a distinct non-retryable outcome.
- `"bridging"` and `"pending_deposit"` belong to the **deposit** endpoint (`/intents/deposit/cross-chain/status`), **not** to `/requests/{id}` â€” don't expect them here.
- **Submit status:** a successful async submit is exactly `"processing"` (never `pending`/`queued`). On a **multisig** wallet the submit returns `"pending_approval"` instead â€” handle that before assuming you can just poll.
- **Sync fallback** (`async` false/absent): the POST blocks and usually returns a terminal `status` in the same body, **but a slow bridge can still return `"processing"`** â€” branch on the status (poll via the returned `request_id`), don't assume the sync body is always terminal.
- **Errors:** auth, policy (limits/whitelist/multisig) and request-shape validation are returned **synchronously** as HTTP 4xx. Insufficient balance and the bridge execution itself are deferred in async mode and surface as the polled row's `failed` status â€” not as a POST error.
- **Webhook (preferred over long polling for the slow tail):** if the wallet's policy has a `webhook_url`, OutLayer POSTs a `request_completed` event (HMAC-signed, header `X-Webhook-Signature`) on the terminal transition, including bridges that outlive your poll window. Payload: `{ request_id, type, status, result }`, where `type` is `intents_withdraw` / `intents_cross_chain_withdraw` / `intents_swap`.

#### Result fields are identifiers, NOT tx hashes â€” except `destination_tx_hash`

**`/intents/withdraw` has NO `tx_hash` field.** The only destination-chain transaction in its `result` is the dedicated `destination_tx_hash` field â€” do not synthesize explorer links from any *other* withdraw/swap field, and do not carry over the `tx_hash` field you saw on `/call`.

- **Exact `result` shape (this is all there is):**
  - Cross-chain (`chain` â‰  `near`): `{ "to", "amount_out", "transfer_intent_hash", "cross_chain": true, "chain", "deposit_address", "destination_tx_hash" }`
  - Same-chain NEAR (`chain: "near"`): `{ "intent_hash", "delivered" }`
- **`destination_tx_hash` is the one real destination-chain txid** â€” the delivery transaction on the destination chain, safe to render as an explorer link *on the requested `chain`*. It is **nullable**: `null` while the bridge is still settling (a sync response that returned `"processing"`, or an async row before settlement); the lazy re-poll fills it in, so re-read `GET /wallet/v1/requests/{id}` at `success` (the `request_completed` webhook carries it too). Gasless `/intents/swap` rows gain the same nullable `result.destination_tx_hash` on settlement.
- **`transfer_intent_hash` / `intent_hash` are NEAR-Intents identifiers** (solver-relay intent hashes), **not** transactions on Base/Arbitrum/Solana/Polygon/etc. The value is NOT an EVM/Solana txid even when it looks like `0x{64}`. Building `basescan.org/tx/â€¦`, `arbiscan.io/tx/â€¦`, `solscan.io/tx/â€¦`, â€¦ from it produces dead 404 links. **Never regex a `0x{64}` out of these fields and never guess the destination network to build a link.**
- **Confidential ops** expose the same information as an array: the request row's `result.swap_details.destinationChainTxHashes` (plain hash strings; note the **camelCase** inner keys â€” the `swap_details` container is snake_case, its contents are 1Click-style camelCase) carries the real destination-chain delivery tx once terminal (see the Confidential section).
- **Real NEAR `tx_hash` exists only on the on-chain endpoints:** `/wallet/v1/call`, `/transfer`, `/intents/deposit`, `/intents/ft-withdraw`, `/storage-deposit`, `/delete`. The gasless/intents endpoints (`/intents/withdraw`, `/intents/swap`, `/intents/transfer`) return intent hashes (plus `destination_tx_hash` where noted) â€” no `tx_hash` field.
- **Receipts:** show `deposit_address` and `request_id` as ids/text; render `transfer_intent_hash`/`intent_hash` as a NEAR-Intents identifier, never as an EVM/Solana explorer link; link `destination_tx_hash` on the destination chain's explorer once non-null.

#### Idempotency-Key â€” one key per operation

State-changing calls (`/intents/withdraw`, `/swap`, `/intents/transfer`, `/intents/deposit`, â€¦) accept an optional `Idempotency-Key` HTTP header. Dedup is **by key only** â€” scoped to `(wallet, key)`; the request **body is never compared or hashed**. This has two consequences integrators get wrong:

- **A reused key does NOT return the prior result and does NOT re-execute.** It returns **HTTP `200`** (not a 4xx) with an *error* body:
  ```json
  { "error": "duplicate_idempotency_key", "message": "Request already processed: <request_id of the FIRST call>" }
  ```
  There is no `status` / `request_id` / `poll_url` field here â€” the original id is only embedded in `message`. Because it's `200`, your HTTP-error handling won't catch it: **check `body.error === "duplicate_idempotency_key"` explicitly.**
- **Use a distinct key per logical operation. Never share one key across two different operations.** Reusing one key across e.g. a `withdraw` and a later `deliver`/top-up call means the second call is rejected with the duplicate response above â€” your client sees no pollable `request_id` (the embedded id points at the *first*, different-amount operation) and silently stalls.

Correct usage:
- **Same key = a retry of the *same* operation** (network blip, re-send). Recover by detecting `body.error`, parsing the id from `message`, and `GET /wallet/v1/requests/{id}` to read the original result.
- **Different operation = different key.** A fresh UUID per intended state change.
- **No header at all** â†’ the server generates a fresh UUID per call, so there is no dedup (each call executes).

### `/storage-deposit` - register token storage

Before withdrawing tokens to an account, that account must have storage registered on the token contract. Use this endpoint to register storage.

```bash
curl -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"token":"wrap.near"}' \
  "https://api.outlayer.ai/wallet/v1/storage-deposit"
```

Idempotent - returns `already_registered: true` if storage already exists. Optional `account_id` field to register storage for a different account (default = wallet's own address). Costs ~0.00125 NEAR.

---

## 1. Register Wallet

Call the registration endpoint. **No auth, no signature, no CLI, no wallet of
your own** â€” an empty POST is the whole thing, and the network is decided by
which host you send it to.

```bash
# mainnet
curl -s -X POST https://api.outlayer.ai/register

# testnet â€” the same call, and the ONLY thing that differs
curl -s -X POST https://testnet-api.outlayer.ai/register
```

The `wk_` that comes back belongs to that network and means nothing on the
other one. Registering on testnet first is the cheap way to rehearse a flow â€”
binding, policies, connectors and payment keys all work there.

Response:
```json
{
  "api_key": "wk_15807dbda492636df5280629d7617c3ea80f915ba960389b621e420ca275e545",
  "wallet_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "near_account_id": "36842e2f73d0b7b2f2af6e0d94a7a997398c2c09d9cf09ca3fa23b5426fccf88",
  "handoff_url": "https://outlayer.fastnear.com/wallet?key=wk_...",  // as returned; both hosts serve the same dashboard
  "trial": {
    "available": true,
    "allowance_usd": "1000000",
    "days": 7,
    "claim_within_days": 7,
    "claim_url": "POST /trial-key",
    "scope": "connectors.outlayer.near/*",
    "limits": { "max_instructions": 100000000, "max_execution_seconds": 30, "max_memory_mb": 64 }
  }
}
```

**Save `api_key` securely** - it is shown only once. All subsequent requests require it.

**Important:** Persist the `api_key` to a file or session state immediately after registration. If you lose the key, recovery depends on the user having set a policy (see Key Recovery below).

The `near_account_id` is the NEAR implicit account (hex public key). Cross-chain transfers (Ethereum, Bitcoin, Solana, etc.) are handled via NEAR Intents - no gas tokens needed on other chains.

### Deterministic Wallets (NEAR Signature Auth)

For servers, bots, and agents **that have their own NEAR private key**: register deterministic wallets with zero per-user key storage. The wallet_id is derived from `(account_id, seed, vault_or_none)` â€” same inputs always produce the same wallet, and different vault scopes legitimately mint independent sub-wallets.

**Seed format:** `[a-zA-Z0-9._-]`, 1-256 characters. No NUL byte, no `:`, no whitespace, no Unicode. SHA-256 hex strings (typical seed source) fit naturally.

**Requires:** Access to a NEAR ed25519 private key (in env, in a file, etc.). This is NOT the custody wallet key â€” it's the integrator's own NEAR account key.

**Use cases:** Telegram bots (one NEAR key in env, thousands of user wallets), web apps with OAuth login, parent agents creating sub-agents.

**Custody wallets** (created via `POST /register` with a `wk_` key) don't need NEAR signatures for sub-agents. Use `PUT /wallet/v1/api-key` with your Bearer token â€” see "Create Sub-Agents" section below.

#### Signature format (IMPORTANT)

All signatures in deterministic wallet endpoints are **raw ed25519 signatures**, NOT NEP-413.

- Sign the **raw message string bytes** with your NEAR ed25519 private key
- Encode the 64-byte signature as **base58** (no prefix)
- `POST /wallet/v1/sign-message` returns NEP-413 signatures â€” these are a **different format** and will NOT work here
- `pubkey` field uses the `ed25519:` prefix: `"ed25519:<base58_public_key>"`
- `signature` field has NO prefix: just the base58-encoded 64-byte signature

```python
# Python example (nacl library)
from nacl.signing import SigningKey
import base58

key = SigningKey(secret_key_bytes)  # 32 bytes
message = "register:user-42:1712000000"
sig = key.sign(message.encode()).signature  # 64 bytes
signature_b58 = base58.b58encode(sig).decode()  # no prefix
pubkey = f"ed25519:{base58.b58encode(key.verify_key.encode()).decode()}"
```

#### Register a deterministic wallet

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{
    "account_id": "my-bot.near",
    "seed": "user-42",
    "pubkey": "ed25519:<base58_public_key>",
    "message": "register:user-42:1712000000",
    "signature": "<base58_signature_no_prefix>"
  }' \
  "https://api.outlayer.ai/register"
```

Signed message format: `"register:<seed>:<unix_timestamp>"`. Timestamp window: **Â±5 minutes**.

Response:
```json
{
  "wallet_id": "uuid-string",
  "near_account_id": "hex64-implicit-account",
  "trial": { "available": true, "allowance_usd": "1000000", "days": 7, "claim_within_days": 7, "claim_url": "POST /trial-key", "limits": {...} }
}
```

No `api_key` in response â€” not needed. Idempotent: calling again returns the same wallet.

#### Authenticate with Bearer near:

All wallet endpoints accept `Bearer near:<base64url>` instead of `Bearer wk_...`:

```bash
# Build token: base64url-encode a JSON object with signature
TOKEN=$(echo -n '{"account_id":"my-bot.near","seed":"user-42","pubkey":"ed25519:...","timestamp":1712000000,"signature":"<base58_no_prefix>"}' | base64url)

curl -s -H "Authorization: Bearer near:${TOKEN}" \
  "https://api.outlayer.ai/wallet/v1/balance?chain=near"
```

The signed message for Bearer auth is `"auth:<seed>:<timestamp>"` (Â±30 second window).

#### Register delegate key for sub-agents

Parent agent (with NEAR key) derives a `wk_` key and registers its SHA-256 hash. Sub-agent uses simple `Bearer wk_...` â€” no crypto needed.

```bash
# Parent: derive key = "wk_" + hex(HMAC-SHA256(near_private_key, "sub-task:0"))
# Parent: compute key_hash = SHA256(key)

curl -s -X PUT -H "Content-Type: application/json" \
  -d '{
    "account_id": "parent-agent.near",
    "seed": "sub-task",
    "key_hash": "sha256hex64chars...",
    "pubkey": "ed25519:<base58>",
    "message": "api-key:sub-task:1712000000",
    "signature": "<base58_no_prefix>"
  }' \
  "https://api.outlayer.ai/wallet/v1/api-key"
```

Signed message format: `"api-key:<seed>:<unix_timestamp>"`. Timestamp window: **Â±5 minutes**.

Response: `{"wallet_id": "...", "near_account_id": "..."}`

Creates wallet if it doesn't exist. Idempotent.

#### Revoke delegate key

```bash
curl -s -X DELETE -H "Authorization: Bearer near:${TOKEN}" \
  "https://api.outlayer.ai/wallet/v1/api-key/${KEY_HASH}"
```

Returns 409 Conflict if it's the last active key for the wallet.

#### Key rotation

No endpoint needed. Add a new key to your NEAR account, start signing with it. Remove old key â€” access revoked within 60 seconds (cache TTL). Wallet identity is tied to `(account_id, seed, vault_or_none)`, not to which key signs.

## Sovereign Vaults â€” Per-Customer Master Keys

> **TL;DR for the agent**: a vault is just an on-chain account that holds the *master secret* for a customer. Once the user has deployed one, you call **`POST /register`** with `{"vault_id": "<vault_addr>"}` and get back a `wk_...` API key â€” use it exactly like any other custody wallet. You can call this **N times** to get N independent wallets under the same vault (just like default-master `/register` can be called N times). **Don't** use "Create Sub-Agents" for this; that's a different flow for splitting one wk_ into deterministic child keys.

### What a vault is, in one paragraph

By default every custody wallet's keys derive from OutLayer's shared TEE master. A **sovereign vault** replaces that shared master with a per-customer one derived via NEAR's MPC network â€” recoverable by the customer if OutLayer ever shuts down. The vault is just a small on-chain contract that anchors a per-customer master in keystore-TEE memory; it does **not** issue API keys itself. API keys are always minted through `/register`, with or without a vault binding. The architecture is symmetric:

| | Default master | Per-vault master |
|---|---|---|
| Wallets per master | âˆž | âˆž |
| How to mint | `POST /register` | `POST /register {"vault_id": "..."}` |
| Each wallet | own `wk_`, own `wallet_id`, own derived address | same, plus `vault_id` in DB |
| Recovery if OutLayer stops | none | 7-day DAO cessation OR 24h-30d unilateral exit |

**The FIRST call against a vault is slow â€” allow for it.** A per-vault master lives only in the
keystore's memory, so the first request that touches a vault after a keystore restart or upgrade
waits on an on-chain MPC derivation. Expect seconds, not milliseconds; a client with a 30-second
HTTP timeout can give up while the derivation is still in flight. Every later call for that vault
is served from memory and is as fast as the default master.

Two practical consequences:

- Give vault-bound calls a generous client timeout (a minute or more), or make the first one a
  cheap warm-up â€” deriving an address, say â€” rather than a withdrawal you care about.
- Abandoning a slow first call does not save anything: the derivation is already on chain and the
  vault has paid its gas, but a cancelled request never caches the result, so the next attempt
  derives again. Wait it out rather than retrying tightly.

### Step 1 â€” User deploys the vault (off your hands)

The agent **cannot** deploy a vault â€” it requires an on-chain transaction signed by the user's NEAR account. When the user asks how, point them to either:

- **Dashboard**: <https://app.outlayer.ai/vault>
- **CLI**: `outlayer vault init` (after `outlayer login`)

Either flow ends with the vault registered on chain (`is_vault_verified == true` on keystore-DAO). The vault account id (e.g. `vault.alice.near`, name is user-chosen) is what you'll pass to `/register`.

### Step 2 â€” Mint custody wallets under the vault

```bash
curl -s -X POST "https://api.outlayer.ai/register" \
  -H "Content-Type: application/json" \
  -d '{"vault_id": "vault.alice.near"}'
```

Response is the standard `/register` shape â€” `api_key`, `wallet_id`, `near_account_id`, and the trial offer. The `near_account_id` derives from the per-vault master (not OutLayer's shared master), and `GET /wallet/v1/address` responses for this key include `"vault_id"`. Call this endpoint multiple times to get **independent wallets under the same vault** â€” each has its own `wallet_id`, `wk_`, and address (different `wallet_id` salt on the same per-vault master).

### Step 3 â€” Use the wk_ normally

Set `Authorization: Bearer wk_...` on every wallet endpoint as usual. No `X-Customer-Vault` header is needed (the coordinator binds the vault from the DB row, not from a request header â€” a spoofed header is silently ignored).

### Cross-vault and vault-vs-default isolation

A single user can mix vault-bound and default-master wallets:

- A wallet minted under `vault_id=A` only sees `vault_id=A` in its derived state. Its derived address has zero correlation with any wallet under `vault_id=B` or with the default master.
- A wallet minted via `POST /register` with NO `vault_id` stays on the default master forever; its `GET /address` response omits `vault_id`.
- Two `wk_`s from different vaults can be used concurrently from the same client â€” the coordinator routes each based on its own DB binding.

### What this is NOT

- **Not "Create Sub-Agents"** â€” that flow (further below) splits a single parent `wk_` into deterministic child keys using `PUT /wallet/v1/api-key`. Sub-agent wallets do inherit the parent's vault binding, but the use case is "delegate a slice of an existing wallet with reproducible IDs", not "get a fresh wallet under a vault". Sub-agents also cannot claim a trial key (only primary `/register` wallets can).
- **Not deterministic registration** â€” the `POST /register` with NEAR-signature fields (`account_id`, `seed`, `pubkey`, `message`, `signature`) does **not** accept `vault_id`. Only the random-wallet path of `/register` supports the vault binding.

### Same parent, multiple vaults

Under the current schema each `(account_id, seed, vault_id)` tuple maps to a **distinct wallet_id**. A parent that runs both a custody vault and a treasury vault can use the same `seed` for both:

- `PUT /wallet/v1/api-key {seed: "user-42", vault_id: "vault.custody.parent.near", ...}` â†’ wk_A under custody vault
- `PUT /wallet/v1/api-key {seed: "user-42", vault_id: "vault.treasury.parent.near", ...}` â†’ wk_B under treasury vault (DIFFERENT wallet_id, DIFFERENT on-chain address)

Both succeed (no rebind refusal). The two sub-wallets are cryptographically isolated â€” funds at one are inaccessible from the other.

## Create Sub-Agents

### From a custody wallet (Bearer wk_...)

Pass your `Bearer wk_...` header to `PUT /wallet/v1/api-key` â€” no NEAR signatures or crypto needed. The coordinator derives a sub-wallet from your wallet_id + seed.

```python
import hashlib, requests

API = "https://api.outlayer.ai"
PARENT_KEY = "wk_..."  # parent's custody wallet key
HEADERS = {"Authorization": f"Bearer {PARENT_KEY}", "Content-Type": "application/json"}

# 1. Choose a seed for the sub-agent (deterministic â€” same seed = same wallet)
seed = "sub-agent-task-42"

# 2. Derive a wk_ key for the sub-agent
sub_key = f"wk_{hashlib.sha256(f'{seed}:0:{PARENT_KEY}'.encode()).hexdigest()}"
key_hash = hashlib.sha256(sub_key.encode()).hexdigest()

# 3. Register the key hash (Bearer auth â€” no NEAR signatures needed)
#    Creates sub-wallet if needed, idempotent
resp = requests.put(f"{API}/wallet/v1/api-key",
    headers=HEADERS,
    json={"seed": seed, "key_hash": key_hash},
).json()
print(f"Sub-agent wallet: {resp['near_account_id']}")

# 4. Hand the key to the sub-agent â€” it uses simple Bearer auth
sub_agent_headers = {"Authorization": f"Bearer {sub_key}"}
balance = requests.get(f"{API}/wallet/v1/balance?chain=near",
    headers=sub_agent_headers).json()
```

Same `(parent_wallet_id, seed, vault_scope)` always produces the same sub-wallet â€” call again to re-derive the key without storage. Different vault scopes under the same `(parent_wallet_id, seed)` mint **independent sub-wallets** with their own addresses (this is intentional â€” each scope is its own identity).

**Sub-agents cannot claim a trial key.** The trial belongs to the primary `/register` wallet. A sub-agent has to be given a key to spend â€” the parent's trial key, or a funded payment key.

No `sign-message`, no NEAR signatures, no crypto libraries. Just derive a key, register its hash, hand it to the sub-agent.

### From an external NEAR account

If you have your own NEAR private key (bot, server), sign directly without `sign-message`:

```python
# Sign "api-key:<seed>:<timestamp>" with your NEAR ed25519 key
# See "Deterministic Wallets" section for details
```

### Simple alternative (no parentâ†’child link)

If you don't need deterministic wallet IDs, just register independent wallets:

```bash
curl -s -X POST https://api.outlayer.ai/register
# Give the new api_key to the sub-agent â€” independent wallet, no link to parent
```

---

## 2. Free Trial: Try the Connectors

The trial is a **payment key we give you**, holding a small allowance. You ask
for it, you receive a real key, and you spend it exactly like a key you paid for
â€” same header, same balance endpoint, same refusals. Nothing is billed to you
implicitly and nothing happens without you asking.

**It pays for connectors only.** Plain WASI modules have no free tier: to run
your own code, create and fund a payment key (section 5). The trial exists so you
can try the connectors before subscribing.

### Claim it

```bash
curl -s -X POST -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/trial-key"
```

```json
{
  "payment_key": "a1b2â€¦8f90:0:4c1dâ€¦9ab3",
  "owner": "a1b2â€¦8f90",
  "nonce": 0,
  "allowance_usd": "1000000",
  "days": 7,
  "project_ids": ["connectors.outlayer.near/*"],
  "note": "Send this as the X-Payment-Key header. It is shown onceâ€¦"
}
```

**Store `payment_key` immediately.** It is shown once and cannot be recovered or
re-issued. If you lose it, your only route forward is a funded payment key.

Registration tells you in advance whether there is anything to claim â€” the
`trial` object in the `/register` response carries `available`, `allowance_usd`,
`days` and `claim_within_days`.

### Spend it

It is an ordinary payment key, so use it as one â€” and a connector is an ordinary
project, called through the ordinary call route:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "X-Payment-Key: $TRIAL_KEY" \
  -d '{"input": {"operation": "send", "to": "someone@example.com", "subject": "hi", "body": "â€¦"}}' \
  "https://api.outlayer.ai/call/connectors.outlayer.near/near-email"
```

**Two things to get right, and they are the same two for every connector:**

* the path is `/call/connectors.outlayer.near/{connector}`. Every connector we
  curate lives under that one account, so its project id is just the namespace
  and its name. There is no separate connector endpoint;
* the body is the ordinary `{"input": {...}}` wrapper, and inside it the
  operation is named by a top-level **`operation`** string. That one field is
  what is priced, billed and dispatched on â€” a request without it is refused
  before anything runs, and so is one that spells it `op`.

Prices are per operation and public: `GET /subscription/status` lists every
connector, its operations and what each costs. Free operations are priced at
`0` and are genuinely free â€” they still need a key that could pay.

And check what is left the same way any paying caller does:

```bash
curl -s -H "X-Payment-Key: $TRIAL_KEY" \
  "https://api.outlayer.ai/payment-keys/balance"
```

### What it will and will not do

| | |
|---|---|
| Pays for | connector calls â€” the operation's fee plus the compute it uses |
| Cannot call | anything outside `connectors.outlayer.near/*` â†’ `project_not_allowed` |
| Cannot be withdrawn | it is an allowance, not money: it was never yours to take out |
| Cannot pay a developer | `X-Attached-Deposit` on a trial call â†’ `402 allowance_no_deposit` |
| Cannot move your funds | a trial call gets no wallet host functions at all |
| Ends | after `days`, whatever is left burns |

### Claiming rules

* **One per account.** A second `POST /trial-key` returns `409 trial_already_claimed`.
* **Only while the wallet is new.** Past `claim_within_days` from registration:
  `403 trial_window_closed`.
* **A ceiling per network address**, so bulk claiming is tedious:
  `429 trial_ip_limit`.
* **Sub-agents and `Bearer near:` callers** claim nothing â€” the trial belongs to
  the primary `/register` wallet.

### When it runs out

Two refusals mean the trial is over, and both say `terminal: true` â€” do not
retry, and do not treat them as an outage:

| Reason | What happened | What to do |
|---|---|---|
| `expires_too_soon` | the trial ends sooner than this call could finish | it is about to end; get a real key |
| `out_of_funds` | the allowance is spent or has burned | fund a payment key (section 5), or buy a subscription |

Both name the numbers, so you can tell the user how much was left and how long.

## 3. Request Funding from User

NEAR balance is needed for on-chain operations (`/call`, `/transfer`). Intents balance is needed for swaps, payment checks, and cross-chain withdrawals (all gasless).

**Fund link format:**
```
https://app.outlayer.ai/wallet/fund?to={near_account_id}&amount={amount}&token={token}&msg={message}&dest=intents
```

| Param | Required | Description |
|-------|----------|-------------|
| `to` | yes | Agent's NEAR account (the `near_account_id` from registration) |
| `amount` | yes | Human-readable amount (e.g. `1` for 1 NEAR, `10` for 10 USDT) |
| `token` | no | `near` (default) or FT contract ID (e.g. `usdt.tether-token.near`) |
| `msg` | no | Message to display to the user (URL-encoded) |
| `dest` | no | `intents` - deposit directly to agent's Intents balance (FT tokens only) |

When `dest=intents`, the user's tokens go directly to the agent's Intents balance via `ft_transfer_call` to `intents.near`. This is the preferred option when the agent needs funds for swaps, payment checks, or cross-chain withdrawals - no extra deposit step needed.

The page includes a toggle so the user can switch between direct transfer and Intents deposit. The page automatically handles FT storage deposits.

**Example - request 10 USDC to Intents balance:**
```
https://app.outlayer.ai/wallet/fund?to={near_account_id}&amount=10&token=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1&msg=Fund+my+trading+balance&dest=intents
```

## 4. Request Policy from User (Optional)

A policy defines spending limits, address whitelists, and multisig rules.

**Available policy types:** spending limits, address whitelist/blacklist, allowed tokens, transaction types, time restrictions, rate limits, multisig approval, capability toggles (`raw_sign`, `swap`, `cross_chain_withdraw`, `payment_check`, EVM signing `evm_sign`, and Solana signing `solana_sign` â€” both default-DENY under a policy, set `allowed:true` to permit, each with a `raw_tx` sub-flag default-OFF), authorized API keys, webhooks.

**Message to user:**
> Please configure a security policy for your wallet:
> https://app.outlayer.ai/wallet?key={api_key}

## Key Recovery

If you lost your wallet API key and the user previously set a policy, the key is saved in their browser.

**Message to user:**
> I lost access to your wallet API key. Please go to: https://app.outlayer.ai/wallet/manage
> Find your wallet, click **show** next to the API Key, then copy and paste it here.
> The key looks like: `wk_15807d...e545`

After receiving the key, verify: `GET /wallet/v1/balance?chain=near` with the key.

If recovery is not possible (no policy set, browser data cleared), register a new wallet with `POST /register`.

## 5. Upgrade to Paid (Payment Key)

When the trial is spent or expired â€” or to run your own WASI, which the trial does not cover â€” create a payment key. Wallet must have USDC or NEAR balance.

### Option A: Pay with USDC
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"initial_deposit_usdc": "2.00"}' \
  "https://api.outlayer.ai/wallet/v1/create-payment-key"
```

### Option B: Pay with NEAR
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"initial_deposit_near": "1.0"}' \
  "https://api.outlayer.ai/wallet/v1/create-payment-key"
```

Response includes `payment_key` - save securely. Use via `X-Payment-Key` header for paid WASI calls.

### Every key is a key you hold

There is no keyless variant. A payment key always comes back as a string, and a
call always presents it as `X-Payment-Key`. `wk_` is how a wallet authenticates
to `/wallet/v1/*` â€” it names the wallet, it does not pay.

Old code that sends `{"agent": true}` to `/wallet/v1/create-payment-key` is
**refused with 400**, before the balance is even read â€” the request cannot be
satisfied at any funding level, so it is answered rather than quietly given an
ordinary key it did not ask for.

That means an agent needs a key of its own, and there are two ways to give it
one:

* **claim the trial** (section 2) â€” `POST /trial-key` with the wallet's `wk_`
  returns a real key string, shown once;
* **create and fund one** â€” Option A or B above, then hand the string to the
  agent.

Store the string. Losing it means creating another key, exactly as it would for
a key you bought.

### Reading a refusal from `/call`

Every refusal carries a machine-readable `reason` next to the human sentence.
**Branch on `reason`.** The sentence is written for a person and gets reworded;
the reason is the contract.

```json
{ "error": "Project not allowed for this payment key", "reason": "project_not_allowed" }
```

Note the shape differs from `/wallet/v1/*`, which puts the code in `error` and
the sentence in `message`:

| door | machine-readable | human |
|---|---|---|
| `/call/{owner}/{project}` | `reason` | `error` |
| `/wallet/v1/*` | `error` | `message` |

Reasons worth handling by name:

| `reason` | what to do |
|---|---|
| `missing_payment_key` | you sent no payment credential |
| `wk_is_not_a_payer` | you sent your `wk_`. It names your wallet; it buys nothing. Send `X-Payment-Key` with a key that wallet owns |
| `project_not_allowed` | the key's scope does not reach this project â€” a trial reaches connectors only. Funding it changes nothing |
| `insufficient_balance`, `out_of_funds` | top the key up |
| `connector_quota_exceeded` | wait; the daily allowance grows with wallet age |
| `operation_limit_reached`, `rate_limit_exceeded` | back off and retry |
| `unknown_operation` | the operation has no price, so it can never run â€” fix the name |
| `wallet_not_yours` | `X-Wallet-Id` named a wallet your credential does not identify |

---

## 6. Subscription: A Flat Rate for Connector Calls

Paying per call is the default: every call takes the compute it used, plus the
connector's price for the operation, out of a key's balance. A **subscription**
replaces that with an **allowance** â€” one price for the period the plan runs,
spent by the same calls, with nothing to top up in between.

### It belongs to a KEY, not to a wallet

A subscription sits on whichever payment key you bought it for, addressed by
`owner` and `nonce`. There is no special key to create first: the key an agent
already presents is the key a subscription is bought for.

That is also why the purchase is an on-chain payment rather than an API call â€”
it names the key instead of presenting it:

```bash
# Read the agent's key first: `owner` and `nonce` are what the payment names.
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/subscription/status"
# â†’ { "owner": "<agent account>", "nonce": 1, "wallet_account": "<agent account>",
#     "has_subscription": false, "allowance_available_usd": "0", ... }

# Then anyone â€” usually the human who owns the agent â€” pays for it.
# The token is USDC (see Configuration); `amount` is in its minimal units.
near call 17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1 ft_transfer_call '{
  "receiver_id": "outlayer.near",
  "amount": "10000000",
  "msg": "{\"action\":\"buy_subscription\",\"nonce\":1,\"owner\":\"<agent account>\",\"plan\":0}"
}' --depositYocto 1 --gas 100000000000000 --accountId payer.near
```

`owner` defaults to the sender, so spell it out: the subscription belongs to the
AGENT, and the sender is the person paying. The allowance is granted against the
event the contract emits, so it appears a moment after the transaction â€” read
`GET /subscription/status` again rather than assuming.

### What the `wk_` can and cannot do

| With `Authorization: Bearer wk_` | |
|---|---|
| Read the subscription â€” allowance, expiry, which connectors are in scope | Yes |
| Spend the allowance by calling a connector | Yes |
| **Buy or extend the subscription** | **No** |

Buying is the owner's act, not the agent's: a compromised agent must not be able
to spend money on your behalf. The same applies to choosing where expiry
warnings are sent.

### Rules worth knowing before you buy

* the allowance is **spent before any balance** the key also holds, so a key with
  both keeps working after the allowance runs out;
* **buying again never shortens** what is already paid for â€” validity extends
  from whichever is later, today or the current expiry, and the allowance adds;
* paying **above** a plan's price leaves the difference as spendable balance
  rather than absorbing it;
* new calls stop being admitted slightly **before** the expiry, so a call already
  running is never cut off mid-flight;
* what is left when the period ends **does not carry over**;
* **one call at a time** while the allowance is paying. A subscription is a flat
  rate, so what bounds it is how much can be in flight. A second concurrent call
  is answered out of the key's BALANCE if it has one, and refused with
  `429 call_already_in_flight` (`"terminal": false`) if it does not â€” the move
  there is to wait for the call in flight, or to fund the key.

### One subscription per agent

A subscription is not a separate class of key â€” an ordinary payment key can
carry one too, and the same plans apply. But an account can hold many ordinary
keys, and each could carry its own subscription: nothing merges them and nothing
warns, so two subscribed keys is paying twice for one agent's worth of work.

Several subscriptions across several agents are possible and sometimes wanted â€”
one per agent, one budget each â€” but at today's prices that rarely pays for
itself. If you are not sure, subscribe the agent that does the work and leave the
others paying per call.

### The connector quota is separate

Connector calls are also rate-limited per wallet, on a ladder that widens with
the wallet's age (10 a day in the first 24 hours, 50 after a day, 500 after a
week, at the time of writing). **A subscription does not raise it and does not
lower it.** The quota is about protecting the workers and the connectors'
reputation; the subscription is about how a call is paid for. Two different
questions.

---

## Wallet Operations

### Check balance
```bash
# Native NEAR (for gas: /call, /transfer)
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/balance?chain=near"

# FT token balance on wallet (e.g. USDT)
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/balance?chain=near&token=usdt.tether-token.near"

# Intents balance (for swaps, payment checks, cross-chain withdrawals)
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/balance?token=wrap.near&source=intents"

# Intents balance for USDC
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/balance?token=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1&source=intents"
```

Response: `{"balance": "1000000000000000000000000", "token": "near", "account_id": "36842e..."}`

**Two balances matter:**
- **Wallet balance** (`chain=near`) - direct FT holdings on the NEAR account. Needed for `ft_transfer`, contract calls.
- **Intents balance** (`source=intents`) - tokens deposited into `intents.near`. Needed for swaps (`/intents/swap`), payment checks, and cross-chain withdrawals (`/intents/withdraw`). Use `POST /wallet/v1/intents/deposit` (on-chain, needs gas) to move tokens from wallet to intents, or request funds with `dest=intents` to skip this step.

### Get address
```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/address?chain=near"
```
Response:
```json
{
  "wallet_id": "a1b2c3d4-...",
  "chain": "near",
  "address": "36842e2f73d0b7b2f2af6e0d94a7a997398c2c09d9cf09ca3fa23b5426fccf88",
  "public_key": "ed25519:<base58>"
}
```
The NEAR account is the **`address`** field (there is no `account_id` field here â€” that name only appears on `/wallet/v1/balance`). This is the default setup â€” your wallet derives from OutLayer's shared vault, nothing to configure. (An optional `vault_id` field appears only for the rare keys bound to a dedicated customer vault.)

Supported chains: `near`, all EVM chains (`ethereum`, `polygon`, `base`, `arbitrum`, `optimism`, `bsc`, `avalanche`, and aliases `eth`/`pol`/`matic`/`arb`/`op`/`avax`), and `solana` (alias `sol`). **All EVM chains return ONE shared secp256k1 `0x` address** (the same EOA on every EVM network); `solana` returns the wallet's own base58 ed25519 address (the pubkey IS the address). `bitcoin` is still gated (`UnsupportedChain`). To sign for the EVM address see "Sign EVM payloads", for the Solana address see "Sign Solana payloads" below; for cross-chain value movement use `/intents/deposit/cross-chain` and `/intents/withdraw` with the `chain` param.

### Transfer NEAR
**Before calling:** check NEAR balance covers transfer amount + gas (~0.001 NEAR).

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"chain":"near","to":"bob.near","amount":"1000000000000000000000000"}' \
  "https://api.outlayer.ai/wallet/v1/transfer"
```

The recipient field is `to`. (An older `receiver_id` alias is accepted by the
API for backward compatibility but should not be used in new code; sending
both fields in the same body is rejected with a 400.)

### Transfer FT tokens (USDT, wNEAR, etc.)

Use the generic contract call endpoint with `ft_transfer`. Requires 1 yoctoNEAR deposit. Receiver must have storage registered on the token contract.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"receiver_id":"usdt.tether-token.near","method_name":"ft_transfer","args":{"receiver_id":"bob.near","amount":"1000000"},"gas":"30000000000000","deposit":"1"}' \
  "https://api.outlayer.ai/wallet/v1/call"
```

### Call a contract
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"receiver_id":"wrap.near","method_name":"near_deposit","args":{},"deposit":"10000000000000000000000"}' \
  "https://api.outlayer.ai/wallet/v1/call"
```

Response: `{"request_id": "uuid", "status": "success", "tx_hash": "...", "result": ...}`

### Delete wallet
**WARNING:** FT tokens and Intents balances are lost. Transfer all assets first. Wallet must have NEAR balance (for gas to execute the on-chain delete).

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"beneficiary":"receiver.near","chain":"near"}' \
  "https://api.outlayer.ai/wallet/v1/delete"
```

### Sign a message (NEP-413 - for external auth)

Sign an arbitrary message using the wallet's NEAR private key (NEP-413 standard). Use this to authenticate your agent to external services that verify NEAR signatures.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"message":"Login to example.com at 2026-03-14T12:00:00Z","recipient":"example.com"}' \
  "https://api.outlayer.ai/wallet/v1/sign-message"
```

Response:

```json
{
  "account_id": "aabbccdd11223344...",
  "public_key": "ed25519:...",
  "signature": "ed25519:...",
  "signature_base64": "base64-encoded-signature",
  "nonce": "base64-encoded-32-bytes"
}
```

**Parameters:**

| Field | Required | Description |
|-------|----------|-------------|
| `message` | Yes | Text to sign (max 10000 bytes) |
| `recipient` | Yes | Service that will verify (1-128 chars) |
| `nonce` | No | Base64-encoded 32 bytes. Auto-generated if omitted |

**NEP-413 (default and only format):** The response includes both `signature` (ed25519 base58, NEAR-native format) and `signature_base64` (base64-encoded raw bytes). Use `signature_base64` for HTTP auth headers and JWT.

**Raw ed25519 signing â†’ use `/wallet/v1/auth-sign`, not `/sign-message`.** `format: "raw"` on `/sign-message` is no longer supported and returns **HTTP 400**. For OutLayer NEAR-key auth (the raw-ed25519 token used by `PUT /api-key`, `Bearer near:`, and deterministic-wallet flows) call `POST /wallet/v1/auth-sign` instead â€” the keystore builds the `<prefix>:<seed>:<ts>` challenge with a fresh server timestamp and signs it raw ed25519. See "Authenticate with NEAR key" / "Deterministic Wallets" for how the resulting token is used.

```bash
curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"purpose":"bearer","seed":"user-42"}' \
  "https://api.outlayer.ai/wallet/v1/auth-sign"
# Response: {"auth_message":"auth:user-42:1712000000","auth_timestamp":1712000000,"signature":"<base58_no_prefix>","public_key":"ed25519:..."}
```

`purpose` is one of `bearer` (â†’ `auth:<seed>:<ts>`, add `vault_id` to scope it), `register` (â†’ `register:<seed>:<ts>`), or `api-key` (â†’ `api-key:<seed>:<ts>`). Send `auth_message` and `signature` verbatim; the timestamp is server-generated, not client-supplied.

**Verification (external service, NEP-413 only):**

The NEP-413 signature verifier computes:
1. Borsh-serialize: `tag(2147484061) + message + nonce(32 bytes) + recipient + callback_url(None)`
2. SHA-256 hash the serialized payload
3. Verify ed25519 signature against the `public_key`
4. For implicit accounts: `account_id == hex(public_key_bytes)` - no RPC needed

---

### Sign EVM payloads (EIP-712 / EIP-191 / raw tx)

Sign for the wallet's EVM address (the `0x` address from `GET /wallet/v1/address?chain=<evm>`; all EVM chains share one secp256k1 key). **Off-chain only** â€” the response is a 65-byte signature (`0x` `râ€–sâ€–v`, `v âˆˆ {27,28}`, low-s); **you assemble and broadcast any on-chain transaction yourself** (the keystore never builds, gas-estimates, nonces, or broadcasts). Gated by the `evm_sign` policy capability â€” **default-DENY under a policy** (set `evm_sign.allowed:true`; a wallet with no policy is unrestricted); raw transactions additionally require `evm_sign.raw_tx` (**default-OFF**). `ecrecover` over the signed digest returns the wallet's EVM address.

**EIP-712 typed data** â€” the core trading primitive (e.g. a Polymarket CLOB order):
```bash
curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"chain":"polygon","typed_data":{"domain":{...},"types":{...},"primaryType":"Order","message":{...}}}' \
  "https://api.outlayer.ai/wallet/v1/evm/sign-typed-data"
# â†’ { "signature": "0x..(65 bytes)", "chain": "polygon", "wallet_id": "..." }
```
Send the full `eth_signTypedData_v4` object; the digest is computed server-side (no client-supplied hash is trusted). Arbitrary EIP-712 structs work (including EIP-3009 `TransferWithAuthorization` and EIP-2612 `Permit`).

**EIP-191 `personal_sign`** â€” e.g. deriving a venue CLOB API key:
```bash
curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"chain":"polygon","message":"Sign in to Polymarket"}' \
  "https://api.outlayer.ai/wallet/v1/evm/sign-message"
```
`message` is signed as a UTF-8 string by default; add `"encoding":"hex"` to sign the decoded bytes of a hex `message` instead (no auto-detection). (Distinct from the NEP-413 `/wallet/v1/sign-message` above â€” that one is NEAR auth.)

**Raw EVM transaction** â€” gated by `evm_sign.raw_tx`:
```bash
curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"chain":"polygon","unsigned_tx":"0x02..."}' \
  "https://api.outlayer.ai/wallet/v1/evm/sign-transaction"
```
Send the **serialized unsigned transaction** (e.g. viem `serializeTransaction(tx)`); we keccak256-hash and sign it. For EIP-1559 (type-2) txs the `yParity` you need to assemble the final tx is `v - 27`. You build the signed tx and broadcast it via your own RPC.

> **Security.** An EIP-712 signature is itself fund-moving (EIP-3009 â‰ˆ transfer, EIP-2612 â‰ˆ approve), so `evm_sign` grants full authority over whatever you bridge onto the EVM address â€” the risk is bounded to that float; your NEAR-intents balance is never reachable by an EVM signature. Keep the on-chain float small. `evm_sign.raw_tx` is a separate kill-switch for arbitrary raw transactions; it does NOT contain typed-data drains.

---

### Sign Solana payloads (messages / transactions)

Sign for the wallet's Solana address (the base58 ed25519 pubkey from `GET /wallet/v1/address?chain=solana`). Same model as EVM â€” **off-chain only**: the response is a 64-byte ed25519 signature (**base58**, Solana convention); **you assemble and broadcast the transaction yourself** (the keystore never builds it, never picks a blockhash, never pays fees, never broadcasts). Gated by the `solana_sign` policy capability â€” **default-DENY under a policy** (set `solana_sign.allowed:true`; a wallet with no policy is unrestricted); transactions additionally require `solana_sign.raw_tx` (**default-OFF**). Signatures verify against the wallet's Solana address with standard tooling (`nacl.sign.detached.verify`, `PublicKey.verify`).

**Off-chain message** â€” e.g. Sign-in-with-Solana or venue auth. The decoded bytes are signed AS-IS (raw-bytes ed25519 â€” standard SIWS verification works unchanged):
```bash
curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"chain":"solana","message":"example.com wants you to sign in with your Solana account:\n..."}' \
  "https://api.outlayer.ai/wallet/v1/solana/sign-message"
# â†’ { "signature": "<base58, 64 bytes>", "chain": "solana", "wallet_id": "..." }
```
`message` is signed as a UTF-8 string by default; add `"encoding":"hex"` or `"encoding":"base64"` to sign decoded bytes instead (no auto-detection). **A "message" whose bytes are a valid Solana transaction message is rejected (HTTP 400)** â€” that's deliberate (the same guard Phantom applies): otherwise a message signature could be broadcast as a transaction, bypassing the `raw_tx` gate. If you hit this 400, you are actually signing a transaction â€” use `sign-transaction`.

**Solana transaction** â€” gated by `solana_sign.raw_tx`:
```bash
curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"chain":"solana","unsigned_tx":"<base64>"}' \
  "https://api.outlayer.ai/wallet/v1/solana/sign-transaction"
```
Send the **serialized unsigned transaction MESSAGE** (what the signature covers), base64, max 1232 bytes â€” with `@solana/web3.js` that is `tx.serializeMessage()` (legacy) or `versionedTx.message.serialize()` (v0), NOT the whole transaction. Assemble the signed transaction yourself and broadcast via your own RPC:

```javascript
// legacy: build tx (feePayer = wallet's solana address, fresh blockhash), then:
const msgBytes = tx.serializeMessage();
const { signature } = await signTx({ chain: "solana", unsigned_tx: msgBytes.toString("base64") });
tx.addSignature(walletPubkey, Buffer.from(bs58.decode(signature)));
await connection.sendRawTransaction(tx.serialize());
```

> **Security.** A signed Solana transaction message is itself fund-moving, so `solana_sign` + `raw_tx` grants full authority over whatever you send to the Solana address â€” the risk is bounded to that float; your NEAR-intents balance is never reachable by a Solana signature. Keep the on-chain float small. The wallet must hold SOL for fees on the native path (no gas abstraction, unlike Intents).

---

## Cross-Chain Swaps (NEAR Intents)

Swap tokens across 20+ blockchains using NEAR Intents protocol. All swaps are atomic - either both sides complete or nothing happens.

### Token ID Format (CRITICAL)

| Endpoint | Format | Example |
|----------|--------|---------|
| `/intents/swap` and `/intents/swap/quote` | Defuse asset ID with prefix | `nep141:wrap.near` |
| `/intents/deposit` | Plain NEAR contract ID | `wrap.near` |
| `/intents/withdraw` | Either format (auto-prefixed); `near`/`native`/omitted = native NEAR | `near` (native), `wrap.near` or `nep141:wrap.near` (wNEAR) |
| `/intents/transfer` | Either format (auto-prefixed); **required** (no native concept â€” send NEAR as `nep141:wrap.near`) | `nep141:usdt.tether-token.near` or `usdt.tether-token.near` |
| `/intents/ft-withdraw` | Plain NEAR contract ID | `wrap.near` |
| `/balance` (wallet) | Plain NEAR contract ID | `wrap.near` |
| `/balance?source=intents` | Either format (auto-prefixed) | `wrap.near` or `nep141:wrap.near` |
| `/payment-check/*` | Plain NEAR contract ID | `17208628f...a1` (USDC) |
| `/deposit-intent` | Defuse asset id (`source_asset`) | `nep141:base-0x833â€¦omft.near` |

**Rule:** Swap uses `nep141:` prefix. Cross-chain deposit takes
`source_asset` (defuse asset id; chain is derived from the prefix). Withdraw
accepts either format. Everything else uses plain contract ID.

### Swap workflow

**1. Find token IDs:**
```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/tokens"
```
Response includes `defuse_asset_id` for each token - use this in swap calls.

> âš ï¸ **`symbol` is NOT unique â€” never resolve a token by symbol.** The same
> display symbol appears once per chain (e.g. "USDC" returns ~17 entries:
> `nep141:17208628â€¦` native NEAR USDC, `nep141:eth-0xa0b8â€¦omft.near` Ethereum
> USDC, `nep141:base-0x833â€¦omft.near` Base USDC, plus arb/sol/avax/pol/op/â€¦).
> A naive `symbol === "USDC"` lookup grabs the first match (usually the
> Ethereum-bridged one) and you deposit/withdraw against the WRONG chain's
> asset â€” funds end up stuck or lost. Always select the entry by its exact
> `defuse_asset_id`, choosing the one whose `chains` array contains your target
> chain. See [token-reference.md](references/token-reference.md) for the
> chain-disambiguated list of common assets.

**2. Check intents balance (tokens must be in intents):**
```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/balance?token=wrap.near&source=intents"
```

If tokens are on the NEAR account (not in intents), deposit them first:
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"token":"wrap.near","amount":"1000000000000000000000000"}' \
  "https://api.outlayer.ai/wallet/v1/intents/deposit"
```

**3. Preview swap rate (optional, no gas):**
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"token_in":"nep141:wrap.near","token_out":"nep141:usdt.tether-token.near","amount_in":"1000000000000000000000000"}' \
  "https://api.outlayer.ai/wallet/v1/intents/swap/quote"
```
Response: `{"amount_out": "3150000", "min_amount_out": "3118500", "deadline": "...", "time_estimate_seconds": 30}`

**4. Execute swap (gasless):**
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"token_in":"nep141:wrap.near","token_out":"nep141:usdt.tether-token.near","amount_in":"1000000000000000000000000","min_amount_out":"3000000"}' \
  "https://api.outlayer.ai/wallet/v1/intents/swap"
```
Response: `{"request_id": "uuid", "status": "success", "amount_out": "3150000", "intent_hash": "..."}`

**Prerequisite:** tokens must be in intents balance. Use `/intents/deposit` to move from NEAR account, or receive via payment check (funds arrive in intents directly).

**Result stays in intents balance.** Use `/intents/withdraw` to move tokens out.

`min_amount_out` is optional - omit for a market order. Set to protect against slippage.

> **Reading `amount_out` correctly â€” the realized fill. SAME RULE for `/intents/swap` AND `/confidential/swap`:**
>
> `amount_out` is the **actual delivered amount ONLY when `status == "success"`**. At every earlier stage it is an **estimate, not the fill**:
> - `/intents/swap/quote` and `/confidential/swap/quote` â†’ price preview only.
> - **Public** `/intents/swap` blocks to settlement, so its response usually already carries `status:"success"` + the realized `amount_out`. If it ever returns non-terminal, poll `GET /wallet/v1/requests/{request_id}` and read `result.amount_out` from the `success` row.
> - **Confidential** `/confidential/swap` returns `status:"pending_deposit"` with **NO `amount_out`** in the submit response â€” this is **timing, NOT privacy**. It settles `pending_deposit â†’ processing â†’ success` (slower than public); the realized `amount_out` appears in `result.amount_out` **only at `success`**. The actual delivered amount *is* returned â€” confidential does **not** hide it. A short poll window (e.g. 90s / 30Ã—3s) can expire before `success` â€” keep polling, do not give up and record the quote.
>
> **Never** record a position / qty / PnL from a quote or a submit-time estimate, and **never** fall back to a snapshot- or price-derived qty â€” both drift from the real fill. The only correct source is **`result.amount_out` read at `status == "success"`**, for both public and confidential swaps.

### Common swap pairs

| Pair | token_in | token_out |
|------|----------|-----------|
| wNEAR to USDT | `nep141:wrap.near` | `nep141:usdt.tether-token.near` |
| USDT to wNEAR | `nep141:usdt.tether-token.near` | `nep141:wrap.near` |
| wNEAR to USDC | `nep141:wrap.near` | `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` |
| wNEAR to ETH | `nep141:wrap.near` | `nep141:eth.omft.near` |
| wNEAR to BTC | `nep141:wrap.near` | `nep141:btc.omft.near` |

### Cross-chain transfer (deposit + withdraw)

For moving tokens to another chain without swapping:

```bash
# 1. Deposit tokens into intents balance
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"token":"wrap.near","amount":"1000000000000000000000000"}' \
  "https://api.outlayer.ai/wallet/v1/intents/deposit"

# 2. Withdraw to destination (gasless - no NEAR needed for gas)
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"to":"receiver.near","amount":"1000000000000000000000000","token":"wrap.near","chain":"near"}' \
  "https://api.outlayer.ai/wallet/v1/intents/withdraw"
```

**Withdraw NATIVE NEAR** (default for `chain=near`) - unwraps your wNEAR and delivers native NEAR; receiver needs no `wrap.near` storage. `amount` is yoctoNEAR (24 decimals; 1 NEAR = `1000000000000000000000000`):

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"to":"receiver.near","amount":"1000000000000000000000000","token":"near","chain":"near"}' \
  "https://api.outlayer.ai/wallet/v1/intents/withdraw"
```

The `/intents/withdraw` endpoint is **gasless** - it uses NEP-413 signed intents via the solver relay. No NEAR balance is required on the wallet's implicit account.

> For a **non-NEAR** destination chain, add `"async": true` to the withdraw body and poll `GET /wallet/v1/requests/{request_id}` for the terminal status â€” the 1Click bridge usually outlasts the synchronous response window. See "Async mode â€” strongly recommended for cross-chain withdrawals" above.

For the on-chain `ft_withdraw` method (requires NEAR for gas on the implicit account), use `/intents/ft-withdraw` instead.

### Dry-run (check without executing)
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"to":"receiver.near","amount":"1000000000000000000000000","token":"wrap.near","chain":"near"}' \
  "https://api.outlayer.ai/wallet/v1/intents/withdraw/dry-run"
```

### Transfer inside Intents (`/intents/transfer`) vs Withdraw

`POST /wallet/v1/intents/transfer` moves a token from your `intents.near` balance to **another account's `intents.near` balance** â€” gasless, and the funds **stay inside the intents pool** (the recipient is credited there, nothing lands on the public chain). This is **not** a withdrawal.

- **Use `/intents/transfer`** when the recipient also holds an intents balance (e.g. another OutLayer custody wallet) and you want to keep funds inside intents â€” cheapest, no exit.
- **Use `/intents/withdraw`** when the recipient should receive funds on a plain on-chain account (it runs `ft_withdraw`/`native_withdraw`, leaving the intents pool).

NEAR-only: no `chain` field, and `token` is **required** (to send NEAR, transfer `nep141:wrap.near`). The recipient need not exist on-chain â€” a 64-hex implicit account is a valid recipient. Same policy gating as withdraw (recipient whitelist + per-token amount limit; multisig returns `status=pending_approval`).

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"to":"partner.near","amount":"1000000","token":"nep141:usdt.tether-token.near"}' \
  "https://api.outlayer.ai/wallet/v1/intents/transfer"
```

### Supported chains

NEAR, Ethereum, Bitcoin, Solana, Arbitrum, Base, Polygon, Optimism, Avalanche, BSC, TON, Aptos, Sui, StarkNet, Tron, Stellar, Dogecoin, XRP, Zcash, Litecoin, Bitcoin Cash, Berachain, Aleo, Cardano, Dash.

Use `GET /wallet/v1/tokens` for the full current list.

---

## Cross-Chain Deposit & Withdraw

Deposit tokens from any supported chain (Solana, Ethereum, Base, Arbitrum, etc.) into intents balance, or withdraw from intents to any chain. No gas tokens needed on source/destination chains - 1Click handles execution.

Supported chains: `near`, `solana`, `ethereum`, `base`, `arbitrum`, `bitcoin`, `bsc`, `polygon`, `optimism`, `avalanche`. The returned `deposit_address` is always on the chain that matches the source asset (64-char hex for NEAR, `0xâ€¦` for EVM, base58 for Solana, `bc1â€¦`/`1â€¦`/`3â€¦` for Bitcoin).

> **NEAR source? Use `/wallet/v1/intents/deposit` instead.** When the funds
> are already on NEAR (in the agent's wallet), skip this endpoint and call
> `POST /wallet/v1/intents/deposit` (see "Move FT from wallet into Intents"
> in the quick-reference table above). It signs a direct
> `ft_transfer_call(token, receiver=intents.near, amount)` in one
> transaction, ~3 seconds, no 1Click solver hop. `/deposit-intent` still
> accepts a NEAR-source asset for symmetry, but adds a solver hop and
> ~5 seconds for no benefit â€” and the response carries a `hint` field
> nudging you to `/intents/deposit`.

### Deposit from another chain â†’ intents

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "source_asset": "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    "amount": "1000000"
  }' \
  "https://api.outlayer.ai/wallet/v1/deposit-intent"
```

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `source_asset` | yes | - | Defuse asset id (e.g. `nep141:eth-â€¦omft.near`) from `GET /wallet/v1/tokens`. The source chain is derived from the prefix; supported prefixes cover `near`, `solana`, `ethereum`, `base`, `arbitrum`, `bitcoin`, `bsc`, `polygon`, `optimism`, `avalanche`, plus the omft natives (`zcash`, `dogecoin`, `litecoin`, `bitcoincash`, `xrp`, `dash`, `cardano`, `tron`, `sui`, `aptos`, `aleo`, `gnosis`, `berachain`, `movement`, `plasma`, `starknet`). |
| `amount` | yes | - | Amount in minimal units. USDC: 6 decimals (`"1000000"` = 1 USDC). |
| `refund_address` | no | - | Address on the source chain to refund to if the bridge fails. Required for source chains where the keystore cannot derive a wallet-owned address (e.g. Bitcoin) â€” without it the request fails with HTTP 400. |
| `destination_asset` | no | NEAR USDC | Defuse asset id for destination token. Override to receive wNEAR etc. |

Response:
```json
{
  "intent_id": "uuid",
  "deposit_address": "7szyqKsG3SC4XvrEaF128DHCYEmy7n7SvM4DSoW1e5jZ",
  "amount": "1000000",
  "amount_out": "999998",
  "min_amount_out": "989998",
  "expires_at": "2026-03-26T17:25:45.914Z",
  "estimated_time_secs": 20
}
```

**2. User sends tokens** to `deposit_address` on the source chain.

**3. Poll status:**
```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/intents/deposit/cross-chain/status?id={intent_id}"
```

Status transitions: `pending` â†’ `bridging` â†’ `success`. On `success`, tokens are in intents balance - create payment checks, swap, or withdraw as usual.

| Status | Meaning |
|--------|---------|
| `pending` | Waiting for deposit on source chain |
| `bridging` | 1Click detected deposit, settling to NEAR intents |
| `success` | Tokens in intents balance |
| `failed` | Error or refund |
| `expired` | No deposit before deadline |

**4. List all deposits:**
```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/deposits?limit=20"
```

### Withdraw from intents â†’ another chain

Send tokens from intents balance to any supported chain. Uses `/intents/withdraw` with `chain` param. Gasless - 1Click solver handles execution.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"to": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "token": "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", "amount": "1000000", "chain": "solana"}' \
  "https://api.outlayer.ai/wallet/v1/intents/withdraw"
```

| Param | Required | Description |
|-------|----------|-------------|
| `to` | yes | Destination address on target chain |
| `token` | yes | Intents token (defuse asset ID, e.g. `nep141:17208628f...a1` for USDC) |
| `amount` | yes | Amount in minimal units |
| `chain` | yes | `"solana"`, `"ethereum"`, `"base"`, etc. |

Response: `{"request_id": "uuid", "status": "success"}`

### Cross-chain limitations

- **Minimum deposit/withdraw**: ~$0.10. 1Click returns clear error with exact minimum if too low.
- **Fee**: ~0.2% (shown in `amount_out` / `min_amount_out`).
- **Settlement time**: ~15-30 seconds depending on chain.
- **Deposit address**: unique per intent, valid ~30 min. Each `deposit-intent` call creates a new address. Amount sent must match exactly.
- **Supported tokens**: use `GET /wallet/v1/tokens` to check available tokens per chain.

---

## Acting as a Named Account (Account Binding)

By default the wallet acts as its own implicit account â€” a 64-character hex
string. **Binding** lets it act as a named account instead: spending from it
under the owner's policy, and sending email as `alice.near@near.email`.

There are two modes and they are NOT interchangeable. Pick by who owns the
account:

| | `personal_account` | `hos_lease` |
|---|---|---|
| Whose account | The user's own `alice.near` | A leased, keyless agent account (`agent.tla`) |
| Who installs the contract | The user, with one transaction you hand them | The provider, before you ever see it |
| `impl_version` in `PUT` | **REJECTED** â€” versioned by the account's code hash | **REQUIRED** |
| `owner_account_id` in `PUT` | Optional; if sent, must equal `asset_account_id` | Required |
| Spending limits | The owner's policy only | The owner's policy **and** an on-chain spend grant |
| Setup kit endpoint | Yes | No â€” answers 400 |

### Binding a user's own account

## Ask the user for a secret the connector needs

A connector often needs a credential that is **yours to use but not yours to
hold** â€” an API token for the service it talks to. It is stored under YOUR
agent account, sealed to the keystore, and a connector reads it only when the
call asks for it. You never see the value, and neither does the browser page
that stores it: it is encrypted before it leaves.

You cannot store it yourself. Your wallet has no NEAR to pay for the write, and
the key that authorises it never leaves the TEE â€” so the coordinator prepares
the transaction and a **human sends and pays for it**.

Send them the link:

> The <service> connector needs its API token. Store it here â€” it is encrypted
> in your browser and I never see it:
> https://app.outlayer.ai/secrets?project={connector_project_id}&name={VAR_NAME}

The link may propose WHICH secret to create â€” `project`, `name`, `profile`,
`generate` â€” and deliberately **cannot** carry its value or your key: those
would end up in browser history, referrers and proxy logs. On the page they
paste your `wk_` (or pick it, if that browser already saved it), choose the
scope, and sign one call. Cost is ~0.1 NEAR, the excess refunded.

Then ask for it per call with `x-use-owner-secret: true` â€” without that header
nothing is fetched, because most calls need no secret and a lookup that always
runs is a keystore round trip on every call:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "X-Payment-Key: $PAYMENT_KEY" -H "x-use-owner-secret: true" \
  -d '{"input":{"operation":"send", ...}}' \
  "https://api.outlayer.ai/call/connectors.outlayer.near/<connector>"
```

**Say what you are asking for and why.** "I need your SendGrid key to send the
mail you asked for" is a sentence a person can refuse. A bare link is not.

**Step 1.** Record it. This returns the `executor_account_id` the user is about
to authorize. It authorizes nothing by itself: `binding_status` stays `pending`
until that executor is actually in the account's extension set.

```bash
curl -s -X PUT -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"asset_account_id":"alice.near","kind":"personal_account"}' \
  "https://api.outlayer.ai/wallet/v1/binding"
```

**Step 2.** The user signs, from their own account. You cannot do this part â€”
you have no key for their account and never will.

**Send them a link, not a curl command.** The dashboard has a page for exactly
this step:

> Your account is ready to bind. Open this and sign once:
> https://app.outlayer.ai/wallet/connect?key={api_key}

That page reads the pending binding with the key, shows every action in the
transaction before anything is signed, refuses to continue if the connected
wallet is not the account being bound, and links to the policy editor once it
goes active. Prefer it for anyone who is not going to run `near` themselves.

If they would rather use the CLI, the same kit is behind:

```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/binding/setup?kind=personal_account"
```

A `409` here means the account already runs a contract. **Do not try to work
around it** â€” deploying over an existing contract does not clear its state, and
the usual victim is the user's own 2FA/multisig wallet. Ask for a different
account.

Tell the user the cost honestly: installation references a network-wide global
contract by hash, so they never pay to store the code. Their transaction costs
a little state, two 1-yoctoNEAR markers and gas â€” well under 0.1 NEAR.

**Step 3.** Poll `GET /wallet/v1/binding` until `binding_status` is `active`.

### Two accounts, two sets of endpoints

A bound wallet has **two** NEAR accounts, and they hold different money. Get
this wrong and you will read one balance and try to spend the other.

| | the wallet's own account | the bound account |
|---|---|---|
| what it holds | gas, and anything you sent it | the user's money â€” the point of binding |
| read balance | `GET /wallet/v1/balance` | `GET /wallet/v1/binding/balance` |
| spend | `POST /wallet/v1/transfer`, `/withdraw`, `/swap` | `POST /wallet/v1/binding/transfer` |
| intents balances | here, always | never â€” deposits credit the signer |

One rule covers all of it: **everything under `/wallet/v1/binding/` is the
bound account; everything else is the wallet itself.** No flags, no defaults
that change once a binding activates.

```bash
# What does the user's account hold?
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/binding/balance?token=usdc.near"

# Send 5 USDC from it. `to` is the RECIPIENT, not the token contract.
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"to":"bob.near","amount":"5000000","token":"usdc.near"}' \
  "https://api.outlayer.ai/wallet/v1/binding/transfer"
```

`/binding/transfer` is a shortcut, not a loophole: it builds exactly the
`w_execute_extension` you could post yourself, and the same policy, pre-flight,
spend-grant and approval rules apply. Use it unless you need something it does
not express.

### Running under the binding

For anything `/binding/transfer` does not cover, call `w_execute_extension` on
the account via `POST /wallet/v1/call`. Everything inside that call is decoded
and checked against the owner's policy â€” every recipient, every amount, every
refund destination â€” before anything is signed.

Rules that will refuse you outright, whatever the policy says:

- **Never** put `internal` operations in the request (`add_extension`,
  `remove_extension`, `set_signature_mode`). That is rewiring the account, not
  spending from it, and it is denied with no way to opt in.
- Anything the decoder cannot state is denied: `ft_transfer_call`, unknown
  methods, mangled arguments. Use plain `ft_transfer` / `nft_transfer`.
- Under `hos_lease` the grant is stricter still: a call must stand alone in its
  promise, carry exactly 1 yoctoNEAR, set no `refund_to`, and name no
  `approval_id`.

Read the outcome from `result.promises[]`, not from the status alone â€” see
"Reading Transaction Statuses" for `partially_failed`.

### Acting under the user's name

By default your calls run under **your own** name: a WASI guest sees
`NEAR_SENDER_ID` = your wallet account, exactly as before any binding existed.
That is deliberate â€” a binding gives you a capability, it does not silently
rename you, because connectors derive real things from that name (near-email
turns it into the mailbox it sends from).

When you want the user's name, ask for it per call:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "X-Payment-Key: $PAYMENT_KEY" \
  -d '{"input":{"operation":"send", ...}, "use_bound_identity": true}' \
  "https://api.outlayer.ai/call/connectors.outlayer.near/near-email"
```

The binding must be `active`; the worker re-checks it against the chain inside
the TEE and refuses the job if the chain disagrees. Billing never follows it â€”
the call is still paid by your key.

**The flag is enough on its own.** Do not add `X-Wallet-Id`: the wallet is taken
from the credential you already sent. (A period in 2026-08 required that header
by accident, so older integrations carry it; sending your own wallet's id is
harmless, sending anyone else's is refused as `wallet_not_yours`.)

**It works on the on-chain door too, and that is the point.** `request_execution`
takes the same flag in `params`, so one module gives the same answer about who
it is whether it was started by an HTTPS call or by a transaction:

```jsonc
// params of request_execution
{ "attached_usd": "10000", "use_bound_identity": true }
```

On that door the binding is matched by the **caller of the transaction**, which
is your wallet's own implicit account â€” so the transaction has to be sent by the
wallet, through `POST /wallet/v1/call`, not from a personal keychain. A
transaction signed by some other account of yours finds no binding.

Asked for and unavailable is a **refusal**, never a quiet fallback: a request
that named a bound identity is never run under your own name instead. You get a
failed job with the reason rather than mail sent from the wrong address.

### Tell the user what the policy is for

On a **personal_account** binding, the owner's policy is the **only** limit on
what you can spend. There is no on-chain grant behind it as there is for
`hos_lease`. A binding with no policy means you can move everything in that
account, which is almost never what the user pictured when they clicked sign.

So when a user binds their own account, say so and offer the fix:

> Your account is bound and I can now spend from it. Right now there is no
> limit on that beyond the balance itself. If you want one â€” a daily cap, a
> list of addresses I may send to, or approval required above some amount â€”
> set a policy here: https://app.outlayer.ai/wallet?key={api_key}

Do not wait to be asked. You are the party that benefits from the limit being
absent, so you are the party that has to raise it.

### Keeping it alive

- The **executor** pays gas for every call. Watch `gas_balance_low` in
  `GET /wallet/v1/binding` and top the executor up before it stops â€” that
  read is the only notification, there is no low-gas webhook.
- The user can end it at any time by removing the executor from their extension
  set â€” one transaction, no permission from OutLayer. Your next call is refused.
- `DELETE /wallet/v1/binding` ends OutLayer's side and cancels approvals still
  waiting on that account.

## Confidential Intents

Move balances between your **public** intents shard, the **confidential**
shielded-pool shard, and external chains. Same TEE-mediated signing as the
rest of the wallet â€” just a different shard.

> **Full developer integration guide**: [`CONFIDENTIAL_INTENTS.md`](https://github.com/out-layer/coordinator/blob/main/docs/CONFIDENTIAL_INTENTS.md)
> â€” mental model (private shard vs off-chain misconception), endpoint flow,
> two privacy recipes (SHIELD vs cross-chain in/out), curl walkthroughs, error
> codes. Read it once before integrating; the section below is a quick
> reference for an already-familiar caller.

**Availability**: these routes return **HTTP 503** (`confidential_unavailable`)
unless the deployment has confidential intents enabled. Treat 503 as "not
offered here", not an error to retry.

### Endpoints

| Endpoint | Action | Body |
|---|---|---|
| `POST /wallet/v1/confidential/shield` | **SHIELD**: public intents â†’ confidential (alias `/confidential/deposit`) | `{ token, amount }` |
| `POST /wallet/v1/confidential/unshield` | confidential â†’ public intents | `{ token, amount }` |
| `POST /wallet/v1/confidential/withdraw` | confidential â†’ external chain | `{ chain, to, amount, token }` |
| `POST /wallet/v1/confidential/withdraw/dry-run` | quote a withdraw | same |
| `POST /wallet/v1/confidential/transfer` | private transfer (confidential â†’ confidential) | `{ to, amount, token }` |
| `POST /wallet/v1/confidential/swap` | confidential swap (distinct assets) | `{ token_in, token_out, amount_in }` |
| `POST /wallet/v1/confidential/swap/quote` | quote a swap | same |
| `POST /wallet/v1/confidential/deposit/cross-chain` | cross-chain DEPOSIT (returns bridge address; alias `/confidential/deposit-intent`) | `{ source_asset, amount }` |
| `GET  /wallet/v1/confidential/balance` | read confidential balances | `?token=` (optional) |

The action endpoints are **asynchronous**: they return
`{ request_id, status: "pending_deposit", intent_hash, deposit_address }`. Poll
`GET /wallet/v1/requests/{request_id}` until `status` is `success`, `failed`, or
`refunded`. On `/confidential/withdraw`, `chain` must be either the token's
**home chain** (e.g. `chain="zcash"` for `nep141:zec.omft.near` + a Zcash
t-address) or `"near"` â€” any other combination is rejected with 400.
`chain="near"` delivers to the named NEAR account: **native NEAR** for
`nep141:wrap.near` (`intents.near native_withdraw` unwraps wNEAR and sends
native), or the **NEP-141 representation on NEAR** for omft bridge assets
(e.g. `nep141:zec.omft.near` stays as the bridged ZEC token on NEAR instead
of being withdrawn to Zcash). NEP-141 delivery is a direct `ft_transfer` to
the recipient's account (a regular token balance, visible in any NEAR
wallet) â€” **no prior storage registration needed**: 1Click auto-registers an
unregistered recipient and nets the storage cost out of `amount_out` (the
dry-run quote already reflects it). To return funds to your **own** public
intents balance use `/confidential/unshield` instead.

### Conventions (apply to every endpoint below)

- **`Authorization: Bearer wk_â€¦`** on every call (same key as the rest of the
  wallet â€” no separate confidential key).
- **`X-Idempotency-Key: <uuid>`** is supported on every action endpoint. A
  retry with the same key returns the original `request_id` instead of acting
  twice. Use one per logical user action.
- **Token IDs**: defuse asset id (`nep141:wrap.near`). Plain contract IDs
  (`wrap.near`) are also accepted and auto-prefixed.
- **Amounts**: minimal integer units as a **string**. wNEAR/NEAR 24 decimals
  (`"10000000000000000000000"` = 0.01 NEAR). USDC 6 decimals (`"1000000"` = 1
  USDC). Same convention as the public `/intents/*` endpoints.
- **`request_id` from the action response is the poll key**: keep it,
  `GET /wallet/v1/requests/{request_id}` returns the merged
  `{ status, result }` until terminal. `result.intent_hash` /
  `result.deposit_address` mirror the action response; `result.swap_details`
  appears once the solver settles. For a **swap**, the realized fill is
  `result.amount_out` **only once `status` is `success`** (same rule as the
  public `/intents/swap` â€” see *Reading `amount_out` correctly* above). The
  confidential submit response carries **no `amount_out`**, and `result.amount_out`
  holds the **quote estimate** until settlement â€” this is **timing, not
  privacy**: the actual delivered amount *is* returned, just at `success`. A 90s /
  30Ã—3s poll window can expire before `success`; keep polling rather than
  recording the quote.
- **No `tx_hash`**: confidential ops don't put your signed intent on the
  public chain (the private shard's settlement isn't a public tx). Track by
  `request_id` and `intent_hash`. **One real txid does exist**: once the op is
  terminal, `result.swap_details.destinationChainTxHashes` (plain hash
  strings; the `swap_details` container is snake_case but its inner keys are
  1Click-style **camelCase**) holds the delivery transaction on the
  destination chain â€” for a `/confidential/withdraw` this is the tx that paid
  the recipient, and it IS safe to show as an explorer link on that chain.
  (`originChainTxHashes`, `intentHashes`, `nearTxHashes` are also arrays of
  plain strings; they stay private-shard/NEAR identifiers â€” the explorer-link
  rule above still applies to them.) Empty until settlement, and may stay
  empty for shard-internal ops (shield / unshield / transfer / swap).

### Method reference (body + response, per endpoint)

`ConfidentialOpResponse` (the shared async-action response):

```json
{ "request_id": "uuid", "status": "pending_deposit", "intent_hash": "...", "deposit_address": "..." }
```

`QuotePreview` (returned by `/withdraw/dry-run` and `/swap/quote`):

```json
{
  "amount_in": "...", "amount_out": "...", "min_amount_out": "...",
  "deadline": "2026-â€¦Tâ€¦Z", "time_estimate_seconds": 10
}
```

| Endpoint | Body | Response | Notes |
|---|---|---|---|
| `POST /wallet/v1/confidential/shield` | `{ token, amount }` | `ConfidentialOpResponse` | SHIELD â€” wallet must already hold `token` in its **public** intents balance. Canonical; legacy alias `POST /wallet/v1/confidential/deposit` still works |
| `POST /wallet/v1/confidential/unshield` | `{ token, amount }` | `ConfidentialOpResponse` | Reverse of SHIELD; returns funds to **your own** public intents balance |
| `POST /wallet/v1/confidential/withdraw` | `{ chain, to, amount, token }` (all required) | `ConfidentialOpResponse` | `chain` must be the token's **home chain** or `"near"` â€” a mismatch (e.g. `chain="near"` + a Zcash t-address, or `chain="bitcoin"` + a ZEC token) is rejected with 400. `chain="near"` delivers to the named `to` account: **native NEAR** for `nep141:wrap.near` (1Click `native_withdraw` unwraps wNEAR), or the **NEP-141 token on NEAR** for omft bridge assets (ZEC arrives as `zec.omft.near`, not on Zcash). To return funds to your **own** public intents balance use `/confidential/unshield` instead. Home-chain set covers all omft natives (zcash, dogecoin, litecoin, bitcoincash, xrp, dash, cardano, tron, sui, aptos, aleo, gnosis, berachain, movement, plasma, starknet + the EVM/sol/btc set). The NEAR-side `ft_withdraw` is signed by a 1Click hop â€” your wallet stays off the public chain |
| `POST /wallet/v1/confidential/withdraw/dry-run` | same as `withdraw` | `QuotePreview` | No DB write, no sign/submit. Use to preview spread/eta before the real call |
| `POST /wallet/v1/confidential/transfer` | `{ to, amount, token }` (no `chain`) | `ConfidentialOpResponse` | `to` = recipient's `intentsUserId` (their 64-hex NEAR implicit address). NEAR-only context. Recipient must also have confidential intents enabled on their deployment |
| `POST /wallet/v1/confidential/swap` | `{ token_in, token_out, amount_in, min_amount_out? }` | `ConfidentialOpResponse` | `token_in != token_out`; `min_amount_out` enforced before signing (rejects 400 if quote below floor) |
| `POST /wallet/v1/confidential/swap/quote` | same as `swap` | `QuotePreview` | Read-only; no DB, no sign. Preview the swap rate |
| `POST /wallet/v1/confidential/deposit/cross-chain` | `{ source_asset, amount }` **or** `{ chain, token?, amount }` (`token` defaults to `"USDC"`) | `{ intent_id, deposit_address, amount, amount_out, min_amount_out, expires_at?, hint? }` | Quote-only â€” returns the bridge address on the source chain; you then send funds out-of-band on that chain. **Privacy-preserving path**: your NEAR wallet never touches the public chain. Canonical; legacy alias `POST /wallet/v1/confidential/deposit-intent` still works |
| `GET /wallet/v1/confidential/balance?token=` | query string | `{ balance, token, account_id }` (filtered) or `{ balances: [{ token, balance }, â€¦], account_id }` (no filter) | Reads `/v0/account/balances` from the private shard. Zero-balance tokens are **omitted** from the unfiltered list |

### More curl examples

```bash
# WITHDRAW 0.5 USDC from confidential to a Solana address (gasless, async)
curl -sX POST $BASE/wallet/v1/confidential/withdraw \
  -H "Authorization: Bearer $WK" -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{"chain":"solana","to":"<sol-addr>","amount":"500000","token":"nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near"}'
# â†’ {"request_id":"â€¦","status":"pending_deposit","intent_hash":"â€¦","deposit_address":"â€¦"}

# DRY-RUN the same withdraw (preview spread + eta, no commit)
curl -sX POST $BASE/wallet/v1/confidential/withdraw/dry-run \
  -H "Authorization: Bearer $WK" -H "Content-Type: application/json" \
  -d '{"chain":"solana","to":"<sol-addr>","amount":"500000","token":"nep141:sol-â€¦omft.near"}'
# â†’ {"amount_in":"500000","amount_out":"440000","min_amount_out":"435600","time_estimate_seconds":7,...}

# Privacy-preserving FUND path: get a Solana bridge address; send funds on Solana
curl -sX POST $BASE/wallet/v1/confidential/deposit-intent \
  -H "Authorization: Bearer $WK" -H "Content-Type: application/json" \
  -d '{"source_asset":"nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near","amount":"500000"}'
# â†’ {"intent_id":"â€¦","deposit_address":"<Solana addr>","amount":"500000","amount_out":"500000",...}

# Private transfer to another confidential identity (no public-chain trace)
curl -sX POST $BASE/wallet/v1/confidential/transfer \
  -H "Authorization: Bearer $WK" -H "Content-Type: application/json" \
  -d '{"to":"<their 64-hex intentsUserId>","amount":"1000000","token":"nep141:wrap.near"}'

# Confidential swap (distinct assets, min_amount_out floor enforced)
curl -sX POST $BASE/wallet/v1/confidential/swap \
  -H "Authorization: Bearer $WK" -H "Content-Type: application/json" \
  -d '{"token_in":"nep141:wrap.near","token_out":"nep141:17208628f...a1","amount_in":"10000000000000000000000","min_amount_out":"22500000"}'

# Poll any action's progress
curl -s $BASE/wallet/v1/requests/<request_id> -H "Authorization: Bearer $WK"
# â†’ {"status":"success","result":{"intent_hash":"â€¦","deposit_address":"â€¦","amount_out":"22513900","swap_details":{...},"oneclick_status":"SUCCESS",...}}

# Read confidential balance for one asset, or all
curl -s "$BASE/wallet/v1/confidential/balance?token=nep141:wrap.near" -H "Authorization: Bearer $WK"
curl -s $BASE/wallet/v1/confidential/balance                          -H "Authorization: Bearer $WK"
```

### Errors

| HTTP | `error` | Meaning |
|---|---|---|
| 503 | `confidential_unavailable` | confidential intents not enabled on this deployment â€” **don't retry**, route to a different deployment or fall back to public intents |
| 502 | `confidential_jwt_expired` / `keystore_error` | upstream (1Click / keystore) hiccup; the coordinator already retried auth once. Safe to retry |
| 403 | `policy_denied` / `wallet_frozen` | blocked by the wallet's on-chain policy (same engine as `/intents/withdraw`). Don't retry without changing the policy |
| 400 | `bad_request` | bad input â€” missing `to`/`token`, `token_in == token_out` on swap, quote `amount_out` below `min_amount_out`, etc. (note: `chain="near"` on withdraw is **valid** â€” native NEAR delivery) |

### Privacy model â€” read this before relying on "confidential"

The confidential shard is a separate **private shard** â€” the `intents.far`
contract, distinct from public `intents.near` â€” NOT a Tor-like anonymity
network. Confidential balances are **real on-chain state** on that private
shard, not off-chain and not a solver database: it is an auditable smart
contract. The privacy is that the private shard has **no public RPC** â€” you
cannot read it from public mainnet (`intents.far` resolves as
`UNKNOWN_ACCOUNT` there) â€” but the operator/Defuse, auditors, or law
enforcement with a warrant **can** read it. Only edges (shield/unshield,
cross-chain in/out) touch the **public** chain, and those carry only **public**
asset ids and **public-side** participants.

**What public chain observers see, by direction** (SHIELD and cross-chain DEPOSIT/WITHDRAW verified against mainnet; UNSHIELD and internal transfer/swap inferred by protocol symmetry, not yet exercised live):

| Direction | Your wallet on chain? | Asset id on chain | Amount on chain | Notes |
|---|---|---|---|---|
| SHIELD (`INTENTS â†’ CONFIDENTIAL`) | **yes** (signer of inner intent) | public `nep141:â€¦` | yes | "entry" reveal: full link wallet â†” confidential pool |
| UNSHIELD (mirror) | **yes** | public `nep141:â€¦` | yes | "exit-to-public" reveal: same as SHIELD inverted |
| internal CONFIDENTIAL ops (transfer, swap) | **no** | n/a | n/a | settle on the private shard â€” no **public-chain** trace |
| DEPOSIT `ORIGIN_CHAIN â†’ CONFIDENTIAL` | **no** | public on source chain + NEAR bridge mint | yes | source-chain sender visible on source chain only |
| WITHDRAW `CONFIDENTIAL â†’ DESTINATION_CHAIN` | **no** | public dest-chain token | yes (after bridge fee) | dest-chain receiver visible on dest chain only; the NEAR-side `ft_withdraw` is signed by a 1Click hop |

**What is NOT hidden, ever:**

- **Defuse / 1Click solvers** see plaintext intents pre-execution. They know the
  asset, signer, recipient, amount, and the route. Privacy holds against public
  chain observers, not against the solver layer.
- **`partner_id` mapping**: all per-account JWTs issued under our partner JWT are
  tagged with `partner_id=near-agents-market`. Defuse can enumerate every
  confidential identity we mint under that partner.
- **Source-chain identity**: the externally-funded chain side (Solana sender
  address, EVM `from`, BTC input UTXO) is fully public â€” no protocol-level hiding.

**Strongest-privacy recipe**: avoid SHIELD/UNSHIELD (they link your wallet
on-chain). Instead fund the confidential balance via cross-chain DEPOSIT
(`/confidential/deposit/cross-chain`), do your work inside the shard (transfer/swap â€”
settles on the private shard, no public-chain trace), and exit via cross-chain
WITHDRAW. In that flow your NEAR custody address never appears on the public
chain. The only residual attack surface is
**timing/amount correlation** between the source-chain deposit and the
destination-chain delivery â€” mitigate with jitter and amount splitting.

> Each wallet has one confidential identity â€” your custody wallet itself. There
> is no separate or unlinkable confidential identity.

---

## Payment Checks (Agent-to-Agent Payments)

Payment checks enable trustless agent-to-agent payments. One agent writes a check (deposits tokens into an ephemeral account), sends the `check_key` to another agent, and the recipient claims the funds. First-to-claim semantics - no double-spend possible.

Check keys are derived in TEE from the custody keystore - deterministic and recoverable. The server never stores raw private keys.

Optional expiration: set `expires_in` when creating a check. After expiry, the recipient cannot claim via our API, and the sender can reclaim the funds.

### How it works

1. **Agent2** (buyer) creates a check for 1 USDC â†’ gets `check_id` + `check_key`
2. **Agent2** sends `check_key` to **Agent1** (seller) via any channel (API, message, etc.)
3. **Agent1** claims the check â†’ 1 USDC lands in Agent1's intents balance
4. **Agent1** does the work, delivers the result

If Agent1 never claims, Agent2 can reclaim the check at any time.

### Create a payment check

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"token":"17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","amount":"1000000","memo":"Payment for song generation","expires_in":86400}' \
  "https://api.outlayer.ai/wallet/v1/payment-check/create"
```

| Param | Required | Description |
|-------|----------|-------------|
| `token` | yes | Plain NEAR contract ID (e.g. USDC: `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`) |
| `amount` | yes | Amount in smallest denomination (string) |
| `memo` | no | Human-readable memo (max 256 chars) |
| `expires_in` | no | Seconds until expiry (e.g. `86400` for 24h). Omit for no expiry. |

Response:
```json
{
  "request_id": "uuid",
  "status": "success",
  "check_id": "pc_a1b2c3d4e5f6",
  "check_key": "ed25519:5Kd3NBU...base58_private_key",
  "token": "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "amount": "1000000",
  "memo": "Payment for song generation",
  "created_at": "2026-03-12T10:30:00Z",
  "expires_at": "2026-03-13T10:30:00Z"
}
```

**`check_key` is shown only once** - this is the check itself. Send it to the recipient. The `check_id` is for your own status tracking and reclaims.

If the wallet has insufficient intents balance but enough wallet balance, the API auto-deposits to intents before creating the check.

### Batch create payment checks

Create up to 10 checks in a single request.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"checks":[{"token":"17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","amount":"500000","memo":"Task 1"},{"token":"17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","amount":"500000","memo":"Task 2"}]}' \
  "https://api.outlayer.ai/wallet/v1/payment-check/batch-create"
```

Response: `{"checks": [<same as single create>, ...]}` - one entry per check, same fields.

### Claim a payment check

Supports **partial claims** - pass `amount` to claim less than the full check. Omit for full claim.

```bash
# Full claim
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RECIPIENT_API_KEY" \
  -d '{"check_key":"ed25519:5Kd3NBU...base58_private_key"}' \
  "https://api.outlayer.ai/wallet/v1/payment-check/claim"

# Partial claim (500000 out of 1000000)
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RECIPIENT_API_KEY" \
  -d '{"check_key":"ed25519:5Kd3NBU...base58_private_key","amount":"500000"}' \
  "https://api.outlayer.ai/wallet/v1/payment-check/claim"
```

| Param | Required | Description |
|-------|----------|-------------|
| `check_key` | yes | The check private key received from sender |
| `amount` | no | Partial claim amount (smallest units). Omit for full balance. |

Response:
```json
{
  "request_id": "uuid",
  "status": "success",
  "token": "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "amount_claimed": "500000",
  "remaining": "500000",
  "memo": "Payment for song generation",
  "claimed_at": "2026-03-12T10:35:00Z",
  "intent_hash": "abc123..."
}
```

Claimed funds land in the recipient's **intents balance**. Use `/intents/withdraw` to move them to a wallet or another chain. When `remaining > 0`, the check stays active for further claims or reclaim.

### Check status

```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/payment-check/status?check_id=pc_a1b2c3d4e5f6"
```

Response:
```json
{
  "check_id": "pc_a1b2c3d4e5f6",
  "token": "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "amount": "1000000",
  "claimed_amount": "500000",
  "reclaimed_amount": "0",
  "memo": "Payment for song generation",
  "status": "partially_claimed",
  "created_at": "2026-03-12T10:30:00Z",
  "expires_at": "2026-03-13T10:30:00Z",
  "claimed_at": "2026-03-12T10:35:00Z",
  "claimed_by": "a1b2c3..."
}
```

| Status | Meaning |
|--------|---------|
| `unclaimed` | Funds waiting - check not yet claimed |
| `partially_claimed` | Recipient claimed part of the check - remaining funds available |
| `claimed` | Recipient claimed the entire check |
| `partially_reclaimed` | Sender reclaimed part - remaining available for claim |
| `reclaimed` | Sender took all remaining funds back |
| `expired` | Unclaimed and past `expires_at` - sender can reclaim |

### List payment checks

```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/payment-check/list?status=unclaimed&limit=50"
```

Returns `{"checks": [...]}` - all checks created by the authenticated wallet.

### Reclaim a check (full or partial)

Supports **partial reclaims** - pass `amount` to reclaim less than the remaining balance. Omit for full reclaim.

```bash
# Full reclaim
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"check_id":"pc_a1b2c3d4e5f6"}' \
  "https://api.outlayer.ai/wallet/v1/payment-check/reclaim"

# Partial reclaim (300000 out of remaining 500000)
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"check_id":"pc_a1b2c3d4e5f6","amount":"300000"}' \
  "https://api.outlayer.ai/wallet/v1/payment-check/reclaim"
```

| Param | Required | Description |
|-------|----------|-------------|
| `check_id` | yes | The check ID from create response |
| `amount` | no | Partial reclaim amount (smallest units). Omit for full remaining. |

Response:
```json
{
  "request_id": "uuid",
  "status": "success",
  "token": "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "amount_reclaimed": "300000",
  "remaining": "200000",
  "reclaimed_at": "2026-03-12T12:00:00Z",
  "intent_hash": "def456..."
}
```

Reclaim works anytime the check has remaining balance - before or after expiry. Only the check creator can reclaim. When `remaining > 0`, the check stays active for further claims or reclaims.

### Peek a check (check balance by key)

Check the on-chain balance and status of a check using its key. Requires wallet auth.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"check_key":"ed25519:5Kd3NBU...base58_private_key"}' \
  "https://api.outlayer.ai/wallet/v1/payment-check/peek"
```

Response:
```json
{
  "token": "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "balance": "500000",
  "memo": "Payment for song generation",
  "status": "partially_claimed",
  "expires_at": "2026-03-13T10:30:00Z"
}
```

Use this to verify a check has funds before claiming. The `balance` field is the live on-chain balance of the ephemeral account.

### Flow: Both agents in Agent Custody

```
Agent2 (buyer)                    API                        Agent1 (seller)
     |                             |                              |
     |  POST /payment-check/create |                              |
     |  {token, amount, memo}      |                              |
     |---------------------------->|                              |
     |  {check_id, check_key}      |                              |
     |<----------------------------|                              |
     |                             |                              |
     |  ---- sends check_key to Agent1 (any channel) ----------->|
     |                             |                              |
     |                             |  POST /payment-check/claim   |
     |                             |  {check_key}                 |
     |                             |<-----------------------------|
     |                             |  {token, amount}             |
     |                             |----------------------------->|
     |                             |                              |
     |                             |  Funds in Agent1's intents   |
     |                             |  balance - ready to use      |
```

### Flow: External wallet claims

External wallets can claim using the `check_key` as a NEAR Intents Gift private key directly on-chain - no API needed. Our status endpoint detects the claim by checking the ephemeral account balance.

```
Agent2 (buyer, custody)         API                    External Wallet
     |                           |                          |
     |  POST /payment-check/create                          |
     |-------------------------->|                          |
     |  {check_key}              |                          |
     |<--------------------------|                          |
     |                           |                          |
     |  ---- sends check_key (any channel) ---------------->|
     |                           |                          |
     |                           |   Claims on-chain via    |
     |                           |   NEAR Intents SDK       |
     |                           |                          |
     |  GET /payment-check/status|                          |
     |-------------------------->|                          |
     |  {status: "claimed"}      |                          |
     |<--------------------------|                          |
```

**Expiration caveat:** Expiration is enforced by our API. External wallets claiming directly on-chain can bypass expiry. For high-value checks to external wallets, reclaim promptly after expiry.

---

## Quick Reference

| Action | Method | Endpoint | Gas |
|--------|--------|----------|-----|
| Register (random) | POST | `/register` | - |
| Register (deterministic) | POST | `/register` (with NEAR sig body) | - |
| Register delegate key | PUT | `/wallet/v1/api-key` (Bearer or NEAR sig) | - |
| Revoke delegate key | DELETE | `/wallet/v1/api-key/{key_hash}` | - |
| Claim the trial key | POST | `/trial-key` | - |
| Payment key balance | GET | `/payment-keys/balance` | - |
| Create payment key | POST | `/wallet/v1/create-payment-key` | on-chain |
| Get address | GET | `/wallet/v1/address?chain={chain}` | - |
| Get balance | GET | `/wallet/v1/balance?chain={chain}&token={token}` | - |
| Get intents balance | GET | `/wallet/v1/balance?token={token}&source=intents` | - |
| Transfer NEAR | POST | `/wallet/v1/transfer` | on-chain |
| Call contract | POST | `/wallet/v1/call` | on-chain |
| Record account binding | PUT | `/wallet/v1/binding` | - |
| Read account binding | GET | `/wallet/v1/binding` | - |
| End account binding | DELETE | `/wallet/v1/binding` | - |
| Installation kit (personal_account) | GET | `/wallet/v1/binding/setup?kind=personal_account` | - |
| Bound account balance | GET | `/wallet/v1/binding/balance` | - |
| Spend from bound account | POST | `/wallet/v1/binding/transfer` | `to`, `amount`, `token?`, `memo?` |
| Delete wallet | POST | `/wallet/v1/delete` | on-chain |
| Register token storage | POST | `/wallet/v1/storage-deposit` | on-chain |
| Move FT: wallet â†’ intents.near | POST | `/wallet/v1/intents/deposit` | on-chain |
| Withdraw on-chain (ft_withdraw) | POST | `/wallet/v1/intents/ft-withdraw` | on-chain |
| Withdraw native NEAR / wNEAR / cross-chain (gasless, default) | POST | `/wallet/v1/intents/withdraw` | gasless |
| Dry-run withdrawal | POST | `/wallet/v1/intents/withdraw/dry-run` | - |
| Swap tokens | POST | `/wallet/v1/intents/swap` | gasless |
| Swap quote | POST | `/wallet/v1/intents/swap/quote` | - |
| Deposit from any chain | POST | `/wallet/v1/intents/deposit/cross-chain` | cross-chain (alias `/deposit-intent`) |
| Check deposit status | GET | `/wallet/v1/intents/deposit/cross-chain/status?id={id}` | - (alias `/deposit-status`) |
| List deposits | GET | `/wallet/v1/intents/deposit/cross-chain/list` | - (alias `/deposits`) |
| Confidential: SHIELD publicâ†’confidential | POST | `/wallet/v1/confidential/shield` | confidential (alias `/confidential/deposit`) |
| Confidential: confidentialâ†’public | POST | `/wallet/v1/confidential/unshield` | confidential |
| Confidential: withdraw to external chain | POST | `/wallet/v1/confidential/withdraw` | confidential |
| Confidential: dry-run withdraw | POST | `/wallet/v1/confidential/withdraw/dry-run` | - |
| Confidential: private transfer | POST | `/wallet/v1/confidential/transfer` | confidential |
| Confidential: swap inside private shard | POST | `/wallet/v1/confidential/swap` | confidential |
| Confidential: swap quote | POST | `/wallet/v1/confidential/swap/quote` | - |
| Confidential: cross-chain DEPOSIT (bridge address) | POST | `/wallet/v1/confidential/deposit/cross-chain` | confidential (alias `/confidential/deposit-intent`) |
| Confidential: read balance | GET | `/wallet/v1/confidential/balance?token={token}` | - |
| List tokens | GET | `/wallet/v1/tokens` | - |
| Request status | GET | `/wallet/v1/requests/{request_id}` | - |
| List requests | GET | `/wallet/v1/requests` | - |
| Sign message (NEP-413) | POST | `/wallet/v1/sign-message` | - |
| Sign EVM typed data / message / raw tx | POST | `/wallet/v1/evm/sign-typed-data` Â· `/evm/sign-message` Â· `/evm/sign-transaction` | - (off-chain; you broadcast) |
| Sign Solana message / transaction | POST | `/wallet/v1/solana/sign-message` Â· `/solana/sign-transaction` | - (off-chain; you broadcast) |
| Audit log | GET | `/wallet/v1/audit?limit=50` | - |
| Create payment check | POST | `/wallet/v1/payment-check/create` | gasless |
| Batch create checks | POST | `/wallet/v1/payment-check/batch-create` | gasless |
| Claim payment check | POST | `/wallet/v1/payment-check/claim` | gasless |
| Check status | GET | `/wallet/v1/payment-check/status?check_id={id}` | - |
| List checks | GET | `/wallet/v1/payment-check/list` | - |
| Reclaim check | POST | `/wallet/v1/payment-check/reclaim` | gasless |
| Peek check balance | POST | `/wallet/v1/payment-check/peek` | - |

**Gas column:** `on-chain` = wallet pays gas (needs NEAR), `gasless` = solver relay pays, `cross-chain` = 1Click bridge (fee ~0.2%), `confidential` = 1Click solver settles on the private shard (no wallet gas, no wallet on the public chain except for SHIELD/UNSHIELD edges), `-` = no transaction.

All endpoints except `/register` and `PUT /wallet/v1/api-key` require `Authorization: Bearer <api_key>` or `Bearer near:<base64url>` header.
Base URL: `https://api.outlayer.ai`

---

## Token Amounts Reference

| Token | Decimals | 1 unit in smallest denomination |
|-------|----------|---------------------------------|
| NEAR / wNEAR | 24 | `1000000000000000000000000` |
| USDT / USDC | 6 | `1000000` |
| ETH / wETH | 18 | `1000000000000000000` |
| BTC / wBTC | 8 | `100000000` |
| SOL | 9 | `1000000000` |

## Automatic Storage Registration

| Endpoint | What it auto-registers |
|----------|----------------------|
| `/wallet/v1/intents/swap` | Output token storage on your wallet |
| `/wallet/v1/intents/deposit` | Your wallet's storage on `intents.near` |
| Fund link (dashboard) | Your wallet's storage on the token contract |
| `/wallet/v1/payment-check/create` | Auto-deposits to intents if wallet balance sufficient |

**NOT auto-registered:** `/wallet/v1/call` - register storage manually with `storage_deposit` if calling `ft_transfer` to a new receiver.

## Reading Transaction Statuses

| Status | Meaning | Action |
|--------|---------|--------|
| `success` | Completed | Read result fields |
| `failed` | Failed | Check `result` for error details |
| `processing` | In progress | Poll `GET /wallet/v1/requests/{id}` |
| `pending_approval` | Needs multisig | Inform user, provide dashboard link |
| `pending_deposit` | Confidential op accepted by 1Click, waiting for solver settlement | Poll `GET /wallet/v1/requests/{id}` (typical 5â€“30s) |
| `refunded` | Confidential op failed mid-flight; funds refunded inside the confidential balance | Inspect `result.swap_details.refundReason`; safe to retry |
| `partially_failed` | Only for `w_execute_extension` on a bound account: some promises in the request succeeded and some did not. **Not an error** â€” the wallet runs its promises independently, so the ones that succeeded moved real money | Read `result.promises[]`: each has `index`, `receiver`, `status` (`success` / `failed` / `unknown`) and the chain's `failure`. Retry only the failed ones |

## Error Handling

| Error | Meaning |
|-------|---------|
| `missing_auth` | No `Authorization: Bearer` header |
| `invalid_api_key` | Key revoked or not found |
| `policy_denied` | Operation blocked by policy rules |
| `wallet_frozen` | Wallet frozen by controller |
| `insufficient_balance` | Not enough funds |
| `unsupported_token` | Token not supported - check `/tokens` |
| `pending_approval` | Needs multisig approval (not an error) |
| `"too many approval votes"` | More than **16** approvals or rejections in one signing request (HTTP 400). Send only the votes that count toward the threshold â€” see "Multisig limits" below |
| HTTP **402** on a vault-bound wallet | The **vault** cannot pay for its on-chain key derivation (this is the vault's gas, not the wallet's balance). The body carries the amount to top up. Distinct from `insufficient_balance`, which is the wallet's own funds |
| `"token_in must use defuse asset format"` | Missing `nep141:` prefix in swap |
| `"1Click swap was refunded"` | Solver couldn't fill - tokens returned to wallet |
| `check_already_claimed` | Payment check was already claimed by recipient |
| `check_not_found` | No check with this ID for the authenticated wallet |
| `invalid_check_key` | Key format invalid or does not correspond to a check |
| `check_empty` | Ephemeral account has zero balance (already claimed on-chain) |
| `check_already_reclaimed` | Check was already reclaimed by sender |
| `check_expired` | Check expired - cannot claim (sender can reclaim) |
| `memo_too_long` | Memo exceeds 256 characters |
| `timestamp_expired` | Signature timestamp outside allowed window (Â±30s for Bearer, Â±5min for register/api-key) |
| `conflict` | Cannot revoke last active API key (409) |
| `"Ambiguous auth"` | PUT /api-key received both Bearer header and signature fields in body â€” use one or the other |
| `"seed: 1-256 chars required"` | Empty or oversized seed in register or api-key |
| `"seed: only [a-zA-Z0-9._-] allowed"` | Seed contains forbidden characters (NUL, colon, whitespace, Unicode, etc) â€” use SHA-256 hex or alphanumeric |
| `trial_already_claimed` | This account has already had its trial key, and it is shown only once |
| `trial_window_closed` | The wallet is older than `claim_within_days`; create and fund a payment key instead |
| `trial_ip_limit` | Too many trial keys claimed from this network address |
| `out_of_funds` | The allowance is spent or has burned. TERMINAL â€” fund a payment key or buy a subscription |
| `agent_connect_denied` | The account-binding pre-flight refused the call BEFORE signing, so no gas was spent. The body carries `class`, `promise_index` and **`terminal`** â€” read `terminal` first: `true` means retrying is pointless and the owner must act (issue a new grant, re-provision the executor, fund the account, rewrite the request); `false` means the same request may work later unchanged (a freeze lifted, recognized code restored) |

## Guidelines

- **Always check balance before any operation.** Query `/wallet/v1/balance` before swap, transfer, call, or withdraw.
- **Use quote to preview swap rates.** The quote endpoint is free - no gas, no state change.
- **Tokens must be in intents balance before swapping.** Use `/intents/deposit` to move FT from wallet, or request funds with `dest=intents` to skip this step.
- **`min_amount_out` is optional** but recommended for slippage protection.
- **Cross-chain transfers need deposit + withdraw.** Only for moving tokens without swapping.
- **Solana deposits create a temporary address.** Each `deposit-intent` call generates a unique Solana address. Poll `deposit-status` until `success`.
- **Solana withdraw goes through 1Click bridge.** Use `POST /wallet/v1/intents/withdraw` with `chain:"solana"` - tokens leave intents balance and arrive on Solana in ~15-20 seconds.
- **Poll for async results.** If status is `processing`, poll `/requests/{id}`.
- Always use `withdraw/dry-run` before real withdrawals.
- **Payment checks** are ideal for agent-to-agent payments - first-to-claim prevents double-spend. Set `expires_in` to protect against unclaimed checks.
- Store the API key as a secret - never log or expose it.
- NEAR amounts are in yoctoNEAR (1 NEAR = 10^24 yoctoNEAR).
- **Never interpolate variables directly into JSON in bash `-d` args.** Characters like `$`, `!`, and quotes break JSON. Build the body with `python3 -c "import json; print(json.dumps({...}))"` or write to a temp file with `cat > /tmp/body.json << 'EOF'`, then use `curl -d @/tmp/body.json`.
- **Long URLs (fund links, handoff links) break in terminal.** When you generate a URL with query params (especially fund links with token contract IDs), open it directly in the browser instead of printing. Use `open "URL"` (macOS) or `xdg-open "URL"` (Linux). Always offer to open rather than risk the user copying a truncated URL that won't work.

## Using OutLayer CLI with Wallet Key

Agents with custody wallets can use the OutLayer CLI directly - no NEAR private key needed. The CLI routes all contract operations through `POST /wallet/v1/call` transparently.

### Login with wallet key

```bash
outlayer login --wallet-key wk_15807dbda492636df5280629d7617c3ea80f915ba960389b621e420ca275e545
outlayer login testnet --wallet-key wk_...
```

The CLI is a CONVENIENCE, never a prerequisite: everything it does is an HTTP
call you can make yourself, and nothing in this skill needs it. The network
argument here is the same axis as the API host â€” credentials are kept per
network in `~/.outlayer/{network}/credentials.json`, and a testnet `wk_` is a
testnet wallet. It is not a separate "platform" setting layered over a mainnet
wallet.

This calls `/wallet/v1/sign-message` to derive the account ID and public key, then stores the wallet key in `~/.outlayer/{network}/credentials.json` with `auth_type: "wallet_key"`.

### Supported commands

After wallet-key login, these commands work transparently:

| Command | How it works with wallet_key |
|---------|------------------------------|
| `outlayer deploy` | Routes `add_version`/`create_project` via `/wallet/v1/call` |
| `outlayer run` (on-chain) | Routes `request_execution` via `/wallet/v1/call` |
| `outlayer keys create/topup/delete` | Routes `store_secrets`/`top_up_payment_key_with_near`/`delete_payment_key` via `/wallet/v1/call` |
| `outlayer secrets set/delete` | Routes `store_secrets`/`delete_secrets` via `/wallet/v1/call` |
| `outlayer secrets update` | Signs NEP-413 via `/wallet/v1/sign-message`, then stores via `/wallet/v1/call` |
| `outlayer earnings withdraw` | Routes `withdraw_developer_earnings` via `/wallet/v1/call` |
| `outlayer versions activate/remove` | Routes contract calls via `/wallet/v1/call` |
| `outlayer run` (HTTPS) | Works if payment key is set (signing not needed) |
| `outlayer whoami` | Shows `Auth: wallet_key` |

### Not yet supported

| Command | Reason |
|---------|--------|
| `outlayer upload` (FastFS) | Uses raw Borsh-encoded transaction args - `/wallet/v1/call` only accepts JSON. Use `outlayer login` with a NEAR private key for uploads. |

### Typical agent workflow

```bash
# 1. Agent registers a custody wallet via API
# POST https://api.outlayer.ai/register â†’ gets wk_...

# 2. Login to CLI with wallet key
outlayer login --wallet-key wk_15807dbda...

# 3. All commands work transparently
outlayer deploy my-agent
outlayer keys create
outlayer run alice.near/my-agent '{"test": true}'
outlayer secrets set '{"API_KEY":"sk-..."}' --project alice.near/my-agent
outlayer earnings
```

## References

- [Token reference](references/token-reference.md) - popular tokens with IDs, decimals, chains
- [Cross-chain patterns](references/cross-chain-patterns.md) - complete workflow examples