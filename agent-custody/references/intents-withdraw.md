# Withdrawing and transferring inside Intents

withdraw vs ft-withdraw, async mode and the exact status values, result fields, Idempotency-Key, and intents-internal transfers.

---

### `/intents/withdraw` vs `/intents/ft-withdraw`

Same result, different execution:
- `/intents/withdraw` - **gasless**. Signs NEP-413 intent, solver relay executes. Use this by default.
  - **For `chain=near`, the `token` field picks what the recipient gets:** omitted / `near` / `native` (default) delivers **native NEAR** — intents.near unwraps your wNEAR (`native_withdraw` intent), and the receiver needs **no** storage. `nep141:wrap.near` (or any `nep141:<token>`) delivers that NEP-141 instead, and the receiver **must** have storage registered (use `/storage-deposit` first).
  - **Native-NEAR caveat:** the recipient account must already exist (or be a 64-char implicit account). Withdrawing native NEAR to a non-existent named account is rejected up front (the unwrapped wNEAR would otherwise be burned).
- `/intents/ft-withdraw` - **on-chain**. Calls `ft_withdraw` on `intents.near`. Needs NEAR for gas. NEP-141 only (no native NEAR).

### Async mode — strongly recommended for cross-chain withdrawals

`/intents/withdraw` accepts `"async": true`. In async mode the call returns immediately with `status: "processing"` and a `poll_url`; the withdrawal settles in the background and you poll `GET /wallet/v1/requests/{request_id}` until the row reaches a terminal status. **The exact status values are a short, fixed set — see "Status values (exact)" below; do not invent synonym sets, and do not forget `needs_review`.**

- **Cross-chain withdrawals (`chain` â‰  `near`): always prefer `async: true`.** The 1Click bridge almost always takes longer than the synchronous response window — a sync call blocks up to ~90s and then returns `processing` anyway, and can hit the gateway request timeout first. Async is the reliable path; treat it as the default for any non-NEAR `chain`.
- **Same-chain NEAR (`chain: "near"`)** settles in seconds — a synchronous call is fine and `async` is optional.
- Auth, policy and validation errors are returned **synchronously** in both modes. In async mode only an *execution* failure surfaces as the request's `failed` status (read it from the poll, not the POST response).

```bash
# Cross-chain withdraw — async (recommended)
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"to":"0x742d35Cc6634C0532925a3b844Bc9e7595f8b4f5","amount":"100000000","token":"nep141:usdt.tether-token.near","chain":"ethereum","async":true}' \
  "https://api.outlayer.ai/wallet/v1/intents/withdraw"
# → { "request_id": "<id>", "status": "processing", "poll_url": "/wallet/v1/requests/<id>" }

# Poll until terminal (processing → success | failed | needs_review)
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/requests/<id>"
```

#### Status values (exact)

The `GET /wallet/v1/requests/{id}` row for a withdraw/swap holds **only** these `status` strings — match them exactly (case-sensitive). Do **not** build broad synonym sets (`settled`/`completed`/`confirmed`/`done`/…); none of those are ever emitted, and inventing them gives false confidence while missing the one that matters (`needs_review`).

| `status` | Terminal? | Meaning / how to handle |
|----------|-----------|--------------------------|
| `processing` | no | Still settling. Keep polling. |
| `success` | **yes** | Done. `result` carries `amount_out`, `transfer_intent_hash`, `deposit_address` (identifiers) plus — on cross-chain ops — nullable `destination_tx_hash`, the **one** real destination-chain tx (see "Result fields are identifiers, NOT tx hashes" below). |
| `failed` | **yes** | Execution failed (a 1Click refund/expiry is also normalized to `failed`; the reason is in `result.reason`). Safe to surface as a failure. |
| `needs_review` | **yes (stop)** | **Execution was interrupted or unresolved; fund state is UNKNOWN.** Surface as "needs manual review / contact support". **Do NOT auto-retry** — the original transfer may have fired, so a retry can double-spend. This is the status integrators most often forget — without it you poll forever. |
| `pending_approval` / `approved` | no | **Multisig wallets only.** The withdrawal needs the approval flow to complete; it will not settle by polling alone. |
| `rejected` | **yes** | Multisig: approvers rejected. Treat as failure. |

**Multisig limits.** One signing request may carry at most **16** approval votes and **16**
rejections; more is rejected with HTTP 400 before anything in the ballot is checked. Verifying a
vote costs a signature check, so the ballot is capped rather than left open-ended. Two consequences
for an integrator: send only the votes that count toward the threshold rather than every signature
you have collected, and do not configure a policy with more than 16 approvers — its threshold could
never be met, because the votes would not fit in the request.

Notes:
- `success`/`failure` detection in your client should be: success = `{"success"}`, failure = `{"failed","rejected"}`, plus `needs_review` as a distinct non-retryable outcome.
- `"bridging"` and `"pending_deposit"` belong to the **deposit** endpoint (`/intents/deposit/cross-chain/status`), **not** to `/requests/{id}` — don't expect them here.
- **Submit status:** a successful async submit is exactly `"processing"` (never `pending`/`queued`). On a **multisig** wallet the submit returns `"pending_approval"` instead — handle that before assuming you can just poll.
- **Sync fallback** (`async` false/absent): the POST blocks and usually returns a terminal `status` in the same body, **but a slow bridge can still return `"processing"`** — branch on the status (poll via the returned `request_id`), don't assume the sync body is always terminal.
- **Errors:** auth, policy (limits/whitelist/multisig) and request-shape validation are returned **synchronously** as HTTP 4xx. Insufficient balance and the bridge execution itself are deferred in async mode and surface as the polled row's `failed` status — not as a POST error.
- **Webhook (preferred over long polling for the slow tail):** if the wallet's policy has a `webhook_url`, OutLayer POSTs a `request_completed` event (HMAC-signed, header `X-Webhook-Signature`) on the terminal transition, including bridges that outlive your poll window. Payload: `{ request_id, type, status, result }`, where `type` is `intents_withdraw` / `intents_cross_chain_withdraw` / `intents_swap`.

#### Result fields are identifiers, NOT tx hashes — except `destination_tx_hash`

**`/intents/withdraw` has NO `tx_hash` field.** The only destination-chain transaction in its `result` is the dedicated `destination_tx_hash` field — do not synthesize explorer links from any *other* withdraw/swap field, and do not carry over the `tx_hash` field you saw on `/call`.

- **Exact `result` shape (this is all there is):**
  - Cross-chain (`chain` â‰  `near`): `{ "to", "amount_out", "transfer_intent_hash", "cross_chain": true, "chain", "deposit_address", "destination_tx_hash" }`
  - Same-chain NEAR (`chain: "near"`): `{ "intent_hash", "delivered" }`
- **`destination_tx_hash` is the one real destination-chain txid** — the delivery transaction on the destination chain, safe to render as an explorer link *on the requested `chain`*. It is **nullable**: `null` while the bridge is still settling (a sync response that returned `"processing"`, or an async row before settlement); the lazy re-poll fills it in, so re-read `GET /wallet/v1/requests/{id}` at `success` (the `request_completed` webhook carries it too). Gasless `/intents/swap` rows gain the same nullable `result.destination_tx_hash` on settlement.
- **`transfer_intent_hash` / `intent_hash` are NEAR-Intents identifiers** (solver-relay intent hashes), **not** transactions on Base/Arbitrum/Solana/Polygon/etc. The value is NOT an EVM/Solana txid even when it looks like `0x{64}`. Building `basescan.org/tx/…`, `arbiscan.io/tx/…`, `solscan.io/tx/…`, … from it produces dead 404 links. **Never regex a `0x{64}` out of these fields and never guess the destination network to build a link.**
- **Confidential ops** expose the same information as an array: the request row's `result.swap_details.destinationChainTxHashes` (plain hash strings; note the **camelCase** inner keys — the `swap_details` container is snake_case, its contents are 1Click-style camelCase) carries the real destination-chain delivery tx once terminal (see `confidential.md`).
- **Real NEAR `tx_hash` exists only on the on-chain endpoints:** `/wallet/v1/call`, `/transfer`, `/intents/deposit`, `/intents/ft-withdraw`, `/storage-deposit`, `/delete`. The gasless/intents endpoints (`/intents/withdraw`, `/intents/swap`, `/intents/transfer`) return intent hashes (plus `destination_tx_hash` where noted) — no `tx_hash` field.
- **Receipts:** show `deposit_address` and `request_id` as ids/text; render `transfer_intent_hash`/`intent_hash` as a NEAR-Intents identifier, never as an EVM/Solana explorer link; link `destination_tx_hash` on the destination chain's explorer once non-null.

#### Idempotency-Key — one key per operation

State-changing calls (`/intents/withdraw`, `/swap`, `/intents/transfer`, `/intents/deposit`, …) accept an optional `Idempotency-Key` HTTP header. Dedup is **by key only** — scoped to `(wallet, key)`; the request **body is never compared or hashed**. This has two consequences integrators get wrong:

- **A reused key does NOT return the prior result and does NOT re-execute.** It returns **HTTP `200`** (not a 4xx) with an *error* body:
  ```json
  { "error": "duplicate_idempotency_key", "message": "Request already processed: <request_id of the FIRST call>" }
  ```
  There is no `status` / `request_id` / `poll_url` field here — the original id is only embedded in `message`. Because it's `200`, your HTTP-error handling won't catch it: **check `body.error === "duplicate_idempotency_key"` explicitly.**
- **Use a distinct key per logical operation. Never share one key across two different operations.** Reusing one key across e.g. a `withdraw` and a later `deliver`/top-up call means the second call is rejected with the duplicate response above — your client sees no pollable `request_id` (the embedded id points at the *first*, different-amount operation) and silently stalls.

Correct usage:
- **Same key = a retry of the *same* operation** (network blip, re-send). Recover by detecting `body.error`, parsing the id from `message`, and `GET /wallet/v1/requests/{id}` to read the original result.
- **Different operation = different key.** A fresh UUID per intended state change.
- **No header at all** → the server generates a fresh UUID per call, so there is no dedup (each call executes).

### Transfer inside Intents (`/intents/transfer`) vs Withdraw

`POST /wallet/v1/intents/transfer` moves a token from your `intents.near` balance to **another account's `intents.near` balance** — gasless, and the funds **stay inside the intents pool** (the recipient is credited there, nothing lands on the public chain). This is **not** a withdrawal.

- **Use `/intents/transfer`** when the recipient also holds an intents balance (e.g. another OutLayer custody wallet) and you want to keep funds inside intents — cheapest, no exit.
- **Use `/intents/withdraw`** when the recipient should receive funds on a plain on-chain account (it runs `ft_withdraw`/`native_withdraw`, leaving the intents pool).

NEAR-only: no `chain` field, and `token` is **required** (to send NEAR, transfer `nep141:wrap.near`). The recipient need not exist on-chain — a 64-hex implicit account is a valid recipient. Same policy gating as withdraw (recipient whitelist + per-token amount limit; multisig returns `status=pending_approval`).

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"to":"partner.near","amount":"1000000","token":"nep141:usdt.tether-token.near"}' \
  "https://api.outlayer.ai/wallet/v1/intents/transfer"
```
