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

A custody wallet an agent can register for itself in one unauthenticated POST,
then use to hold, move and swap value on NEAR and 20+ other chains. Keys live in
a TEE; cross-chain movement goes through NEAR Intents, so the agent never needs
a gas token on the destination chain.

It covers value and keys, nothing else. A task that is not about moving,
holding or signing for money is not a task for this skill — answer it the way
you would with the skill absent, and do not route it to an endpoint.

## Read this page, then load ONE reference

This page covers registration, balances and transfers — the operations most
tasks need and nothing else. Everything past that lives in `references/`, one
file per job. **Read the file for the job you are doing; do not read them all.**
If the answer is already on this page — hosts, amounts, gas, the two balances,
register, balance, `transfer` — answer from it and open nothing.

| The task in front of you | Read |
|---|---|
| Register a wallet with a NEAR key you own, mint deterministic or vault-bound wallets, create sub-agents, recover a lost key | `references/register-and-auth.md` |
| Send FT tokens, call a contract, sign a NEP-413 message, register token storage, delete the wallet | `references/wallet-ops.md` |
| Swap tokens (any pair, any chain) | `references/intents-swap.md` |
| Withdraw out of intents, or move tokens between two agents' intents balances (`/intents/transfer`); anything that returns `processing` and has to be polled; which `tx_hash` an explorer will actually find | `references/intents-withdraw.md` |
| Bring funds in from Solana / an EVM chain / Bitcoin, or send them there | `references/cross-chain.md` |
| Do it privately — shielded balances, private transfer or swap | `references/confidential.md` |
| Pay another agent with a check it has to cash, or get paid by one | `references/payment-checks.md` |
| Sign an EIP-712 order, a `personal_sign`, or a Solana transaction | `references/signing-evm-solana.md` |
| Act as `alice.near` rather than a hex address; spend from a user's account | `references/account-binding.md` |
| Call a connector: claim its free trial, buy the flat-rate subscription, give it an upstream credential | `references/connectors.md` |
| The wallet has no NEAR and the next step is on-chain — ask the user to fund it | `references/payment-keys.md` |
| Out of allowance and need to keep executing — mint or fund a payment key; ask the user for money or for a spend policy | `references/payment-keys.md` |
| Drive the `outlayer` CLI with a `wk_` instead of a NEAR key | `references/cli.md` |
| Last resort: no row above fits and you need to find an endpoint, status value or error code | `references/api-index.md` |
| Pick the right token id for a chain | `references/token-reference.md` |

## Configuration

Every example uses the mainnet host. On testnet substitute the base URL and
nothing else — paths, headers and bodies are identical.

| | mainnet | testnet |
|---|---|---|
| API base | `https://api.outlayer.ai` | `https://testnet-api.outlayer.ai` |
| Dashboard | `https://app.outlayer.ai` | same, switch the network in the UI |
| Contract | `outlayer.near` | `outlayer.testnet` |
| Curated connectors | `connectors.outlayer.near` | `connectors.outlayer.testnet` |
| USDC (what you pay us in) | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | `usdc.fakes.testnet` |

There is no network PARAMETER anywhere — the host is the choice. A `wk_` minted
on one network means nothing on the other, and so does a wallet address.

**Do not guess the testnet host.** It is `testnet-api.outlayer.ai` — not
`api-testnet.` and not `testnet.api.`. Those do not resolve, and an agent that
tried them once concluded testnet was unsupported and refused a user's request.

**Testnet caveat:** NEAR Intents do not exist there — no solvers. Swaps,
cross-chain withdrawals and intents balances are mainnet-only, and the
coordinator answers `503` for them on testnet. Everything else works on both.

So a request for a swap, a cross-chain move or an intents balance *on testnet*
has no curl to give: say there are no solvers on testnet, that the call returns
`503`, and that mainnet is the only place it runs. Do not hand over a
`testnet-api.outlayer.ai/wallet/v1/intents/swap` command that cannot succeed.

## Auth

Every endpoint except `POST /register` and `PUT /wallet/v1/api-key` takes
`Authorization: Bearer <api_key>`. Three credential shapes:

| Header | What it is |
|---|---|
| `Bearer wk_…` | The custody wallet key from `/register`. The default. |
| `Bearer near:<base64url>` | A signed token, for callers holding their own NEAR key — see `references/register-and-auth.md` |
| `X-Payment-Key: …` | Pays for a `/call` execution. **A `wk_` never pays** — sending it gets `wk_is_not_a_payer`. See `references/connectors.md` |

## Amounts

Always a **string**, always in minimal units.

| Token | Decimals | 1 unit |
|---|---|---|
| NEAR / wNEAR | 24 | `1000000000000000000000000` |
| USDT / USDC | 6 | `1000000` |
| ETH / wETH | 18 | `1000000000000000000` |
| BTC / wBTC | 8 | `100000000` |
| SOL | 9 | `1000000000` |

Sanity check before every call: a yocto amount for ≥0.01 NEAR has 22+ digits.
Shorter and you scaled wrong (1e18 is Ethereum, NEAR is 1e24) — the quote comes
back `"No liquidity available"`.

That message has **two** causes and neither is a missing pair. Either the
amount was mis-scaled, or it is genuinely too small: **the practical minimum is
~$1 equivalent**, below which no solver bothers to quote. NEAR→USDC/USDT are
the deepest pairs on Intents, so read it as "no solver quotes this size", check
the digit count first, then the dollar value.

## Gas model

| Category | Who pays | NEAR on the wallet? | Endpoints |
|---|---|---|---|
| **On-chain** | the wallet | yes, ~0.001 NEAR/tx | `/call`, `/transfer`, `/delete`, `/intents/deposit`, `/intents/ft-withdraw`, `/storage-deposit` |
| **Gasless** | solver relay | no | `/intents/withdraw`, `/intents/transfer`, `/intents/swap`, `/payment-check/*` |
| **Cross-chain** | 1Click solver | no | `/intents/deposit/cross-chain`, `/intents/withdraw` with a non-NEAR `chain` |
| **Confidential** | 1Click solver | no | `/confidential/*` |
| **Read** | nobody | no | `/balance`, `/address`, `/tokens`, `/requests`, all `sign-*` |

Gasless means the wallet signs a NEP-413 message off-chain and a relay executes
it — it works with a zero NEAR balance.

## Three balances, and they are not the same money

- **Wallet balance** (`chain=near`) — what the NEAR account holds directly.
  Needed for gas, `ft_transfer`, contract calls.
- **FT balance** (`chain=near&token=…`) — an NEP-141 the account holds, wNEAR
  included. Native NEAR and wNEAR are different balances on the same account.
- **Intents balance** (`source=intents`) — tokens deposited into `intents.near`.
  Needed for swaps, payment checks and cross-chain withdrawals. A swap can spend
  **nothing else**: with this at zero it fails `400 Insufficient intents
  balance`, however much NEAR the account holds.

Moving wallet → intents is `POST /wallet/v1/intents/deposit` (on-chain, needs
gas). Asking the user for funds with `dest=intents` skips that step.

**`/intents/deposit` will not convert native NEAR for you.**
That endpoint only moves an **FT** (it runs `ft_transfer_call`), so depositing
`wrap.near` spends your **wNEAR** balance — not the native NEAR the gas balance
shows. A wallet holding 1 NEAR and 0 wNEAR gets:

    ActionError / FunctionCallError:
    "Smart contract panicked: The account doesn't have enough balance"

That panic comes from inside `wrap.near` and means *no wNEAR*. It is not the
runtime's `NotEnoughBalance`, and sending more native NEAR does not fix it.
Wrap first — `near_deposit` on `wrap.near` with the NEAR attached as `deposit`:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"receiver_id":"wrap.near","method_name":"near_deposit","args":{},"gas":"30000000000000","deposit":"500000000000000000000000"}' \
  "https://api.outlayer.ai/wallet/v1/call"
```

So native NEAR → intents is always three calls: `/storage-deposit` (once, on
`wrap.near`), `near_deposit` via `/call`, then `/intents/deposit`. Leave ~0.05
NEAR unwrapped for gas. Tokens that are already FTs (USDC, USDT) skip the wrap.

Once the intents balance reads back non-zero, the swap itself is
`POST /wallet/v1/intents/swap` (and `/intents/swap/quote`, same body). **That
body takes exactly four fields: `token_in`, `token_out`, `amount_in`,
`min_amount_out`** — the first three required, `min_amount_out` optional and
taken from the quote. There is no `slippage_bps`, no `slippage`, no `deadline`
input, and unknown keys are dropped without an error, so a slippage field you
invent looks accepted and does nothing. Quote first, execute straight away —
quotes expire. Full workflow and token-id formats: `references/intents-swap.md`.

A wallet with a zero NEAR balance cannot do any of the on-chain ones. You do not
top it up yourself — you send the user a fund link and wait:

    https://app.outlayer.ai/wallet/fund?to={near_account_id}&amount=5&token=near&msg=Gas+for+on-chain+steps

Drop `dest` for native NEAR into the wallet (gas); add `dest=intents` only when
the money is FT tokens meant for swaps, checks or withdrawals.

## 1. Register

No auth, no signature, no CLI, no wallet of your own — an empty POST is the
whole thing, and the network is decided by which host you send it to.

```bash
curl -s -X POST https://api.outlayer.ai/register
```

```json
{
  "api_key": "wk_15807dbda492636df5280629d7617c3ea80f915ba960389b621e420ca275e545",
  "wallet_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "near_account_id": "36842e2f73d0b7b2f2af6e0d94a7a997398c2c09d9cf09ca3fa23b5426fccf88",
  "handoff_url": "https://app.outlayer.ai/wallet?key=wk_...",
  "trial": { "available": true, "allowance_usd": "1000000", "days": 7, "claim_within_days": 7 }
}
```

**`api_key` is shown once. Persist it immediately** — to a file or session
state, before you do anything else. Default handling, applied without asking:
append `OUTLAYER_KEY=wk_…` to `.env`, creating it and adding `.env` to
`.gitignore` if the project has one. Then print `wallet_id`, `near_account_id`
and the key once, saying it cannot be retrieved again. Recovery afterwards depends on the user
having set a policy (`references/register-and-auth.md`).

`near_account_id` is the NEAR implicit account (hex of the public key). The
`trial` object says whether there is a free connector allowance to claim
(`references/connectors.md`).

For deterministic wallets, vault-bound wallets or sub-agents, read
`references/register-and-auth.md` before calling `/register` — the body differs.

## 2. Read a balance

```bash
# native NEAR (this is the gas balance)
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/balance?chain=near"

# an FT on the NEAR account
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/balance?chain=near&token=usdt.tether-token.near"

# the intents balance — what swaps and checks spend from
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/balance?token=wrap.near&source=intents"
```

Response: `{"balance": "1000000000000000000000000", "token": "near", "account_id": "36842e…"}`

The address is a separate endpoint, and the field is `address`, not
`account_id`:

```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/address?chain=near"
```

`chain` accepts `near`, `solana`, and any EVM chain (`ethereum`, `polygon`,
`base`, `arbitrum`, `optimism`, `bsc`, `avalanche` + aliases). **All EVM chains
return ONE shared `0x` address.** `bitcoin` is not supported here — move value
to Bitcoin through `references/cross-chain.md`.

## 3. Send NEAR

On-chain, so check the balance covers the amount plus ~0.001 NEAR of gas first.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"chain":"near","to":"bob.near","amount":"1000000000000000000000000"}' \
  "https://api.outlayer.ai/wallet/v1/transfer"
```

The recipient field is `to`. (`receiver_id` is accepted for backward
compatibility; sending both is a 400.)

Sending an **FT** is not this endpoint — it is `ft_transfer` through
`/wallet/v1/call`. See `references/wallet-ops.md`.

## Things only the user can do — hand them a link

Four steps need a human: they need a NEAR key you do not have, or money you
cannot spend. For each there is a page. **Send the link with a sentence saying
what it is for** — a bare URL from an agent asking for account access is what a
phishing attempt looks like.

| You want | Say this, with this link |
|---|---|
| **Act under their account** | "Open this and sign once — it lets me act as `alice.near` instead of a hex address: `https://app.outlayer.ai/wallet/connect?key={api_key}`" |
| **A credential for a connector** | "The <service> connector needs its API token. Store it here — it is encrypted in your browser and I never see it: `https://app.outlayer.ai/secrets?project={connector_project_id}&name={VAR_NAME}`" |
| **A limit on what you may spend** | "I can spend from your account now. Set a cap, an address list, or an approval threshold here: `https://app.outlayer.ai/wallet?key={api_key}`" |
| **Money to work with** | "Fund me here: `https://app.outlayer.ai/wallet/fund?to={near_account_id}&amount={amount}&token={token}&msg={message}&dest=intents`" — drop `dest` when it is NEAR for gas |

Two rules for all four:

* **Never ask for the secret itself in chat.** Not the token, not the seed
  phrase, not the private key. The pages encrypt in the browser precisely so
  that nobody — you, us, the page — holds the value.
* **Raise the policy one yourself, before you are asked.** After a binding goes
  active you can move everything in that account until a policy says otherwise.
  You are the party that benefits from the limit being absent, so you are the
  party who has to mention it.

## Guidelines

- **Check the balance before any operation** — swap, transfer, call, withdraw.
  Check the *right* one: `source=intents` for a swap, check or cross-chain
  withdrawal; `chain=near` for gas and on-chain calls.
- **Quote before you swap.** The quote endpoint is free: no gas, no state
  change. Quote *after* the funds are in intents, though — quotes expire, and
  wrapping plus depositing is three on-chain calls.
- **Do not stop to ask what you can look up.** A failing step is a reason to
  read a balance, not to hand the user a menu of options. Ask only for what is
  genuinely yours to be given: money the wallet does not have, or a key.
- **Dry-run before a real withdrawal.**
- **`processing` is not a result.** Poll `GET /wallet/v1/requests/{id}` to a
  terminal status, and handle `needs_review` — it is the one integrators forget.
  Details in `references/intents-withdraw.md`.
- **Never resolve a token by `symbol`** — not even when the user asks you to.
  "USDC" matches ~17 entries across chains, so "the first row whose symbol is
  USDC" is whichever chain the API happened to list first, and the funds go to
  that chain. Say that out loud and filter by `chains` + exact
  `defuse_asset_id` instead. See `references/token-reference.md`.
- **Store the API key as a secret** — never log it, never echo it.
- **Never interpolate variables into JSON inside a bash `-d` argument.** `$`,
  `!` and quotes break it. Build the body with
  `python3 -c "import json; print(json.dumps({...}))"` or a heredoc to a temp
  file, then `curl -d @/tmp/body.json`.
- **CORS is per-path, not global.** Some endpoints send
  `Access-Control-Allow-Origin` and some do not, so a call that works from
  `curl` can fail from a browser with no useful error. Debug from `curl`
  before blaming the request.
- **Long URLs break in a terminal.** Offer to open a fund or handoff link with
  `xdg-open "URL"` (Linux) / `open "URL"` (macOS) rather than printing a URL the
  user will copy truncated.
