# Cross-chain swaps (NEAR Intents)

Gasless swaps through the public intents shard: token-id formats, quote, execute, reading the realized fill.

---

## Cross-Chain Swaps (NEAR Intents)

Swap tokens across 20+ blockchains using NEAR Intents protocol. All swaps are atomic - either both sides complete or nothing happens.

### Token ID Format (CRITICAL)

| Endpoint | Format | Example |
|----------|--------|---------|
| `/intents/swap` and `/intents/swap/quote` | Defuse asset ID with prefix | `nep141:wrap.near` |
| `/intents/deposit` | Plain NEAR contract ID | `wrap.near` |
| `/intents/withdraw` | Either format (auto-prefixed); `near`/`native`/omitted = native NEAR | `near` (native), `wrap.near` or `nep141:wrap.near` (wNEAR) |
| `/intents/transfer` | Either format (auto-prefixed); **required** (no native concept — send NEAR as `nep141:wrap.near`) | `nep141:usdt.tether-token.near` or `usdt.tether-token.near` |
| `/intents/ft-withdraw` | Plain NEAR contract ID | `wrap.near` |
| `/balance` (wallet) | Plain NEAR contract ID | `wrap.near` |
| `/balance?source=intents` | Either format (auto-prefixed) | `wrap.near` or `nep141:wrap.near` |
| `/payment-check/*` | Plain NEAR contract ID | `17208628f...a1` (USDC) |
| `/deposit-intent` | Defuse asset id (`source_asset`) | `nep141:base-0x833…omft.near` |

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

> **WARNING** **`symbol` is NOT unique — never resolve a token by symbol.** The same
> display symbol appears once per chain (e.g. "USDC" returns ~17 entries:
> `nep141:17208628…` native NEAR USDC, `nep141:eth-0xa0b8…omft.near` Ethereum
> USDC, `nep141:base-0x833…omft.near` Base USDC, plus arb/sol/avax/pol/op/…).
> A naive `symbol === "USDC"` lookup grabs the first match (usually the
> Ethereum-bridged one) and you deposit/withdraw against the WRONG chain's
> asset — funds end up stuck or lost. Always select the entry by its exact
> `defuse_asset_id`, choosing the one whose `chains` array contains your target
> chain. See [token-reference.md](token-reference.md) for the
> chain-disambiguated list of common assets.

**2. Check the INTENTS balance — not optional, and not the wallet balance:**
```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/balance?token=wrap.near&source=intents"
```

Swaps spend **only** this balance. Reading `?chain=near` instead and finding
NEAR there proves nothing — that is the gas balance. Skip this step and the
swap in step 4 returns:

```
400  Insufficient intents balance: Have: 0, need: 500000000000000000000000
```

`Have: 0` means the deposit below never ran. It does **not** mean the wallet is
out of money, and sending it more NEAR changes nothing — the fix is to deposit,
not to fund. Only ask the user for funds once `?chain=near` has actually shown
you a balance too small to cover the amount plus gas.

If tokens are on the NEAR account (not in intents), deposit them first:
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"token":"wrap.near","amount":"1000000000000000000000000"}' \
  "https://api.outlayer.ai/wallet/v1/intents/deposit"
```

**Swapping NEAR? Wrap it first — `/intents/deposit` does not.** The endpoint
runs `ft_transfer_call`, so `token: "wrap.near"` spends the **wNEAR** balance,
which is a different balance from the native NEAR that `?chain=near` reports.
With native NEAR only, the tx fails with a panic *from inside wrap.near*:

```json
{"ActionError":{"kind":{"FunctionCallError":{"ExecutionError":
  "Smart contract panicked: The account doesn't have enough balance"}}}}
```

Do not read that as "fund the wallet" — it means "you have no wNEAR". The full
native-NEAR sequence is three on-chain calls:

```bash
# 1. register storage on wrap.near (once; idempotent, ~0.00125 NEAR)
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"token":"wrap.near"}' \
  "https://api.outlayer.ai/wallet/v1/storage-deposit"

# 2. wrap: native NEAR -> wNEAR (the NEAR goes in the `deposit` field)
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"receiver_id":"wrap.near","method_name":"near_deposit","args":{},"gas":"30000000000000","deposit":"1000000000000000000000000"}' \
  "https://api.outlayer.ai/wallet/v1/call"

# 3. then the /intents/deposit above
```

Keep ~0.05 NEAR unwrapped for gas — wrapping the whole balance leaves nothing to
pay for step 3. Confirm with `GET /balance?chain=near&token=wrap.near` (wNEAR on
the account) before depositing. Tokens that are already FTs skip steps 1–2.

Never hand-roll step 3 as an `ft_transfer_call` to `intents.near`: there `msg`
is the **destination account_id**, not a command, and a wrong `msg` credits the
funds to someone else.

**3. Preview swap rate (no gas) — after the deposit confirms, not before:**

Quotes expire. A quote taken before steps 1–2 is stale by the time three
on-chain calls have landed, so price it once the intents balance reads back
non-zero, then execute straight away.
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"token_in":"nep141:wrap.near","token_out":"nep141:usdt.tether-token.near","amount_in":"1000000000000000000000000"}' \
  "https://api.outlayer.ai/wallet/v1/intents/swap/quote"
```
Response: `{"amount_out": "3150000", "min_amount_out": "3118500", "deadline": "...", "time_estimate_seconds": 30}`

**The body takes four fields and no others: `token_in`, `token_out`,
`amount_in`, `min_amount_out`.** There is no `slippage_bps`, no `slippage`, no
`deadline` input — unknown keys are dropped without an error, so a slippage
field you invent looks accepted and does nothing. The returned
`min_amount_out` is the API's own default of **1% below `amount_out`**. Want a
different tolerance? Compute it yourself from `amount_out` and pass it as
`min_amount_out` in step 4.

**Minimum ~$1 equivalent.** Under that the quote returns
`"No liquidity available"` — that is the solvers declining the size, not a
missing pair. See the two causes in `SKILL.md`.

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

> **Reading `amount_out` correctly — the realized fill. SAME RULE for `/intents/swap` AND `/confidential/swap`:**
>
> `amount_out` is the **actual delivered amount ONLY when `status == "success"`**. At every earlier stage it is an **estimate, not the fill**:
> - `/intents/swap/quote` and `/confidential/swap/quote` → price preview only.
> - **Public** `/intents/swap` blocks to settlement, so its response usually already carries `status:"success"` + the realized `amount_out`. If it ever returns non-terminal, poll `GET /wallet/v1/requests/{request_id}` and read `result.amount_out` from the `success` row.
> - **Confidential** `/confidential/swap` returns `status:"pending_deposit"` with **NO `amount_out`** in the submit response — this is **timing, NOT privacy**. It settles `pending_deposit → processing → success` (slower than public); the realized `amount_out` appears in `result.amount_out` **only at `success`**. The actual delivered amount *is* returned — confidential does **not** hide it. A short poll window (e.g. 90s / 30×3s) can expire before `success` — keep polling, do not give up and record the quote.
>
> **Never** record a position / qty / PnL from a quote or a submit-time estimate, and **never** fall back to a snapshot- or price-derived qty — both drift from the real fill. The only correct source is **`result.amount_out` read at `status == "success"`**, for both public and confidential swaps.

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

> For a **non-NEAR** destination chain, add `"async": true` to the withdraw body and poll `GET /wallet/v1/requests/{request_id}` for the terminal status — the 1Click bridge usually outlasts the synchronous response window. See `intents-withdraw.md`.

For the on-chain `ft_withdraw` method (requires NEAR for gas on the implicit account), use `/intents/ft-withdraw` instead.

### Dry-run (check without executing)
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"to":"receiver.near","amount":"1000000000000000000000000","token":"wrap.near","chain":"near"}' \
  "https://api.outlayer.ai/wallet/v1/intents/withdraw/dry-run"
```

### Supported chains

NEAR, Ethereum, Bitcoin, Solana, Arbitrum, Base, Polygon, Optimism, Avalanche, BSC, TON, Aptos, Sui, StarkNet, Tron, Stellar, Dogecoin, XRP, Zcash, Litecoin, Bitcoin Cash, Berachain, Aleo, Cardano, Dash.

Use `GET /wallet/v1/tokens` for the full current list.
