# Endpoint index, statuses and errors

Every endpoint in one table, the transaction status values, and the error codes worth branching on.

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
| Move FT: wallet → intents.near | POST | `/wallet/v1/intents/deposit` | on-chain |
| Withdraw on-chain (ft_withdraw) | POST | `/wallet/v1/intents/ft-withdraw` | on-chain |
| Withdraw native NEAR / wNEAR / cross-chain (gasless, default) | POST | `/wallet/v1/intents/withdraw` | gasless |
| Dry-run withdrawal | POST | `/wallet/v1/intents/withdraw/dry-run` | - |
| Swap tokens | POST | `/wallet/v1/intents/swap` | gasless |
| Swap quote | POST | `/wallet/v1/intents/swap/quote` | - |
| Deposit from any chain | POST | `/wallet/v1/intents/deposit/cross-chain` | cross-chain (alias `/deposit-intent`) |
| Check deposit status | GET | `/wallet/v1/intents/deposit/cross-chain/status?id={id}` | - (alias `/deposit-status`) |
| List deposits | GET | `/wallet/v1/intents/deposit/cross-chain/list` | - (alias `/deposits`) |
| Confidential: SHIELD public→confidential | POST | `/wallet/v1/confidential/shield` | confidential (alias `/confidential/deposit`) |
| Confidential: confidential→public | POST | `/wallet/v1/confidential/unshield` | confidential |
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
| Sign EVM typed data / message / raw tx | POST | `/wallet/v1/evm/sign-typed-data` · `/evm/sign-message` · `/evm/sign-transaction` | - (off-chain; you broadcast) |
| Sign Solana message / transaction | POST | `/wallet/v1/solana/sign-message` · `/solana/sign-transaction` | - (off-chain; you broadcast) |
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

## Reading Transaction Statuses

| Status | Meaning | Action |
|--------|---------|--------|
| `success` | Completed | Read result fields |
| `failed` | Failed | Check `result` for error details |
| `processing` | In progress | Poll `GET /wallet/v1/requests/{id}` |
| `pending_approval` | Needs multisig | Inform user, provide dashboard link |
| `pending_deposit` | Confidential op accepted by 1Click, waiting for solver settlement | Poll `GET /wallet/v1/requests/{id}` (typical 5–30s) |
| `refunded` | Confidential op failed mid-flight; funds refunded inside the confidential balance | Inspect `result.swap_details.refundReason`; safe to retry |
| `partially_failed` | Only for `w_execute_extension` on a bound account: some promises in the request succeeded and some did not. **Not an error** — the wallet runs its promises independently, so the ones that succeeded moved real money | Read `result.promises[]`: each has `index`, `receiver`, `status` (`success` / `failed` / `unknown`) and the chain's `failure`. Retry only the failed ones |

## Error Handling

| Error | Meaning |
|-------|---------|
| `missing_auth` | No `Authorization: Bearer` header |
| `invalid_api_key` | Key revoked or not found |
| `policy_denied` | Operation blocked by policy rules |
| `wallet_frozen` | Wallet frozen by controller |
| `insufficient_balance` | Not enough funds |
| `"Insufficient intents balance: Have: 0, need: N"` | The swap/check/withdraw spends the **intents** balance and nothing was deposited into it. Not a funding problem: run `/intents/deposit` (wrapping first if the token is native NEAR). See `intents-swap.md` |
| `unsupported_token` | Token not supported - check `/tokens` |
| `pending_approval` | Needs multisig approval (not an error) |
| `"too many approval votes"` | More than **16** approvals or rejections in one signing request (HTTP 400). Send only the votes that count toward the threshold — see "Multisig limits" below |
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
| `timestamp_expired` | Signature timestamp outside allowed window (±30s for Bearer, ±5min for register/api-key) |
| `conflict` | Cannot revoke last active API key (409) |
| `"Ambiguous auth"` | PUT /api-key received both Bearer header and signature fields in body — use one or the other |
| `"seed: 1-256 chars required"` | Empty or oversized seed in register or api-key |
| `"seed: only [a-zA-Z0-9._-] allowed"` | Seed contains forbidden characters (NUL, colon, whitespace, Unicode, etc) — use SHA-256 hex or alphanumeric |
| `trial_already_claimed` | This account has already had its trial key, and it is shown only once |
| `trial_window_closed` | The wallet is older than `claim_within_days`; create and fund a payment key instead |
| `trial_ip_limit` | Too many trial keys claimed from this network address |
| `out_of_funds` | The allowance is spent or has burned. TERMINAL — fund a payment key or buy a subscription |
| `agent_connect_denied` | The account-binding pre-flight refused the call BEFORE signing, so no gas was spent. The body carries `class`, `promise_index` and **`terminal`** — read `terminal` first: `true` means retrying is pointless and the owner must act (issue a new grant, re-provision the executor, fund the account, rewrite the request); `false` means the same request may work later unchanged (a freeze lifted, recognized code restored) |

---

## Lookup by intent

What you are trying to do, and the endpoint that does it.

| You need... | Action |
|-------------|--------|
| A crypto wallet for your agent | Register via `POST /register` |
| Try the connectors for free | Claim a trial key with `POST /trial-key`, then send it as `X-Payment-Key` |
| Check what is left on any key | `GET /payment-keys/balance` with `X-Payment-Key` |
| Run your own WASI module | No free tier — create and fund a payment key |
| Upgrade to paid execution | Use `POST /wallet/v1/create-payment-key` (USDC or NEAR) |
| Give an agent a key to spend | Claim the trial (`POST /trial-key`) or create one (`POST /wallet/v1/create-payment-key`), then hand it the string |
| Stop paying per call for connectors | Buy a subscription for the key the agent presents — see `connectors.md` |
| Check the agent's allowance and expiry | `GET /subscription/status` with `Authorization: Bearer wk_` |
| Send NEAR to someone | Use `POST /wallet/v1/transfer` with `chain: "near"` |
| Send FT tokens (USDT, wNEAR) to someone | Use `POST /wallet/v1/call` with `ft_transfer` (see FT transfer section) |
| Swap tokens (e.g. wNEAR to USDT) | Use `POST /wallet/v1/intents/swap` - gasless swap via 1Click. Tokens must be in intents balance first |
| Preview swap rate before committing | Use `POST /wallet/v1/intents/swap/quote` - read-only, no gas spent |
| List available tokens for swaps | Use `GET /wallet/v1/tokens` - returns ~200 tokens across 20+ chains |
| Withdraw native NEAR (gasless) | Use `POST /wallet/v1/intents/withdraw` with `chain: "near"` and `token: "near"` (default). Unwraps your wNEAR → native NEAR; receiver needs **no** storage. Recipient account must already exist (or be a 64-char implicit account) |
| Send tokens cross-chain (gasless) | Use `POST /wallet/v1/intents/withdraw` with `chain` param - gasless. **For non-NEAR chains pass `"async": true` and poll the result (the bridge rarely finishes in the sync window).** For NEAR delivering wNEAR (`token: "nep141:wrap.near"`): receiver must have storage (use `/storage-deposit` first). For Solana: use `chain: "solana"` |
| Register token storage | Use `POST /wallet/v1/storage-deposit` - needed before withdrawing to accounts without storage |
| Transfer tokens to another account's intents balance | Use `POST /wallet/v1/intents/transfer` with `{ to, amount, token }` — gasless; stays **inside** `intents.near` (recipient is credited there, not on-chain). NOT a withdrawal — use this when the recipient also holds an intents balance. Recipient need not exist on-chain (64-hex implicit is fine) |
| Move FT from wallet into Intents | Use `POST /wallet/v1/intents/deposit` - on-chain, needs gas |
| Call a NEAR smart contract | Use `POST /wallet/v1/call` - on-chain, needs gas |
| Check your balance | Use `GET /wallet/v1/balance?chain=near` or `&token=usdt.tether-token.near` |
| Check intents deposit balance | Use `GET /wallet/v1/balance?token=wrap.near&source=intents` |
| Get your NEAR, EVM, or Solana address | Use `GET /wallet/v1/address?chain=near` (or `?chain=polygon`/`ethereum`/`base`/… — all EVM chains return ONE shared `0x` address; `?chain=solana` returns the base58 ed25519 address); the account is in the `address` field |
| Sign an EIP-712 order / typed data (EVM) | `POST /wallet/v1/evm/sign-typed-data` with `{chain, typed_data}` — off-chain; signs Polymarket-style CLOB orders. Gated by `evm_sign` |
| Sign an EIP-191 message (EVM) | `POST /wallet/v1/evm/sign-message` with `{chain, message}` — e.g. venue L1 auth / CLOB API-key derivation |
| Sign a raw EVM transaction | `POST /wallet/v1/evm/sign-transaction` with `{chain, unsigned_tx}` — you serialize + broadcast; gated by `evm_sign.raw_tx` (default-OFF) |
| Sign a Solana off-chain message | `POST /wallet/v1/solana/sign-message` with `{chain:"solana", message}` — Sign-in-with-Solana / venue auth; raw-bytes ed25519, base58 signature. Gated by `solana_sign` |
| Sign a Solana transaction | `POST /wallet/v1/solana/sign-transaction` with `{chain:"solana", unsigned_tx}` (base64 serialized tx **message**) — you assemble + broadcast; gated by `solana_sign.raw_tx` (default-OFF) |
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
| Withdraw to another chain | `POST /wallet/v1/intents/withdraw` with `chain` param (e.g. `"solana"`, `"ethereum"`) - gasless. **Pass `"async": true` and poll `GET /wallet/v1/requests/{request_id}` — the bridge rarely settles within the synchronous window (see `intents-withdraw.md`)** |
| List cross-chain deposits | `GET /wallet/v1/intents/deposit/cross-chain/list` (alias `/deposits`) |
| Move funds into the private (confidential) shard | `POST /wallet/v1/confidential/shield` with `{ token, amount }` — SHIELD from public intents balance; **publicly links your wallet on chain** (entry reveal). Canonical; legacy alias `/wallet/v1/confidential/deposit` still works |
| Move funds back from private to public | `POST /wallet/v1/confidential/unshield` with `{ token, amount }` — reverse SHIELD (exit reveal) |
| Fund private balance **without** linking your wallet | `POST /wallet/v1/confidential/deposit/cross-chain` with `{ source_asset, amount }` → returns a bridge address on the source chain; send funds there. Your NEAR wallet never touches the public chain. Canonical; legacy alias `/wallet/v1/confidential/deposit-intent` still works |
| Withdraw private balance to an external chain (no link) | `POST /wallet/v1/confidential/withdraw` with `{ chain, to, amount, token }` — gasless; your wallet stays off the public chain. `chain` must be the token's **home chain** or `"near"` (mismatch → 400). `chain="near"` delivers **native NEAR** for `wrap.near` (1Click runs `native_withdraw` on `intents.near`) and the **NEP-141 token on NEAR** for omft bridge assets (e.g. ZEC → `zec.omft.near` to a NEAR account); for sending back to your **own** public balance use `unshield` instead |
| Preview a confidential withdraw | `POST /wallet/v1/confidential/withdraw/dry-run` — same body, no commit |
| Private transfer to another wallet's private balance | `POST /wallet/v1/confidential/transfer` with `{ to, amount, token }` — no public-chain trace |
| Swap tokens privately | `POST /wallet/v1/confidential/swap` with `{ token_in, token_out, amount_in, min_amount_out? }` — distinct assets, no public-chain trace |
| Preview a confidential swap | `POST /wallet/v1/confidential/swap/quote` |
| Read your private (confidential) balance | `GET /wallet/v1/confidential/balance?token={defuse_id}` or omit `token` for all |
| Authenticate to an external service | `POST /wallet/v1/sign-message` - NEP-413 signed message for login/auth |
| Let the user set spending limits | Share the `handoff_url` from registration |
| Create wallets for users (no per-user keys) | Use deterministic registration: `POST /register` with NEAR signature fields |
| Authenticate with NEAR key (no stored secrets) | Use `Bearer near:<base64url>` header instead of `Bearer wk_...` |
| Use your OWN per-customer master (no shared TEE) | Tell the user to deploy a sovereign vault — see `register-and-auth.md` |
| Create sub-agent (custody wallet) | `PUT /wallet/v1/api-key` with Bearer auth + `{seed, key_hash}` — see `register-and-auth.md` |
| Create sub-agent (external NEAR key) | Derive `wk_` key, sign with your NEAR key, register hash via `PUT /wallet/v1/api-key` |
| Revoke a sub-agent's key | `DELETE /wallet/v1/api-key/{key_hash}` (last key protected) |
