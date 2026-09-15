# Calling connectors: trial, subscription, secrets

The free trial key, flat-rate subscriptions, storing an upstream credential the connector needs, and reading a refusal from /call.

---

## 2. Free Trial: Try the Connectors

> **⚠ UNVERIFIED — these endpoints return `404` on both networks.** Checked
> 2026-09-14 against `api.outlayer.ai` and `testnet-api.outlayer.ai` with the
> real HTTP method: `POST /trial-key` and `GET /subscription/status` all answer `404`, while control routes on the same
> hosts answer normally (`POST /register` → `200`, `GET /payment-keys/balance`
> → `401`). They are also absent from `openapi.json`, from
> `outlayer.fastnear.com/docs/agent-custody`, and from the `out-layer/api-spec`
> source of truth. Most likely the feature is not deployed yet. **Confirm with
> the OutLayer team before building on this page** — do not hand a user a curl
> from here expecting it to work.

The trial is a **payment key we give you**, holding a small allowance. You ask
for it, you receive a real key, and you spend it exactly like a key you paid for
— same header, same balance endpoint, same refusals. Nothing is billed to you
implicitly and nothing happens without you asking.

**It pays for connectors only.** Plain WASI modules have no free tier: to run
your own code, create and fund a payment key (see `payment-keys.md`). The trial exists so you
can try the connectors before subscribing.

### Claim it

```bash
curl -s -X POST -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/trial-key"
```

```json
{
  "payment_key": "a1b2…8f90:0:4c1d…9ab3",
  "owner": "a1b2…8f90",
  "nonce": 0,
  "allowance_usd": "1000000",
  "days": 7,
  "project_ids": ["connectors.outlayer.near/*"],
  "note": "Send this as the X-Payment-Key header. It is shown once…"
}
```

**Store `payment_key` immediately.** It is shown once and cannot be recovered or
re-issued. If you lose it, your only route forward is a funded payment key.

Registration tells you in advance whether there is anything to claim — the
`trial` object in the `/register` response carries `available`, `allowance_usd`,
`days` and `claim_within_days`.

### Spend it

It is an ordinary payment key, so use it as one — and a connector is an ordinary
project, called through the ordinary call route:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "X-Payment-Key: $TRIAL_KEY" \
  -d '{"input": {"operation": "send", "to": "someone@example.com", "subject": "hi", "body": "…"}}' \
  "https://api.outlayer.ai/call/connectors.outlayer.near/near-email"
```

**Two things to get right, and they are the same two for every connector:**

* the path is `/call/connectors.outlayer.near/{connector}`. Every connector we
  curate lives under that one account, so its project id is just the namespace
  and its name. There is no separate connector endpoint;
* the body is the ordinary `{"input": {...}}` wrapper, and inside it the
  operation is named by a top-level **`operation`** string. That one field is
  what is priced, billed and dispatched on — a request without it is refused
  before anything runs, and so is one that spells it `op`.

Prices are per operation and public: `GET /subscription/status` lists every
connector, its operations and what each costs. Free operations are priced at
`0` and are genuinely free — they still need a key that could pay.

And check what is left the same way any paying caller does:

```bash
curl -s -H "X-Payment-Key: $TRIAL_KEY" \
  "https://api.outlayer.ai/payment-keys/balance"
```

### What it will and will not do

| | |
|---|---|
| Pays for | connector calls — the operation's fee plus the compute it uses |
| Cannot call | anything outside `connectors.outlayer.near/*` → `project_not_allowed` |
| Cannot be withdrawn | it is an allowance, not money: it was never yours to take out |
| Cannot pay a developer | `X-Attached-Deposit` on a trial call → `402 allowance_no_deposit` |
| Cannot move your funds | a trial call gets no wallet host functions at all |
| Ends | after `days`, whatever is left burns |

### Claiming rules

* **One per account.** A second `POST /trial-key` returns `409 trial_already_claimed`.
* **Only while the wallet is new.** Past `claim_within_days` from registration:
  `403 trial_window_closed`.
* **A ceiling per network address**, so bulk claiming is tedious:
  `429 trial_ip_limit`.
* **Sub-agents and `Bearer near:` callers** claim nothing — the trial belongs to
  the primary `/register` wallet.

### When it runs out

Two refusals mean the trial is over, and both say `terminal: true` — do not
retry, and do not treat them as an outage:

| Reason | What happened | What to do |
|---|---|---|
| `expires_too_soon` | the trial ends sooner than this call could finish | it is about to end; get a real key |
| `out_of_funds` | the allowance is spent or has burned | fund a payment key (see `payment-keys.md`), or buy a subscription |

Both name the numbers, so you can tell the user how much was left and how long.

## 6. Subscription: A Flat Rate for Connector Calls

Paying per call is the default: every call takes the compute it used, plus the
connector's price for the operation, out of a key's balance. A **subscription**
replaces that with an **allowance** — one price for the period the plan runs,
spent by the same calls, with nothing to top up in between.

### It belongs to a KEY, not to a wallet

A subscription sits on whichever payment key you bought it for, addressed by
`owner` and `nonce`. There is no special key to create first: the key an agent
already presents is the key a subscription is bought for.

That is also why the purchase is an on-chain payment rather than an API call —
it names the key instead of presenting it:

```bash
# Read the agent's key first: `owner` and `nonce` are what the payment names.
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/subscription/status"
# → { "owner": "<agent account>", "nonce": 1, "wallet_account": "<agent account>",
#     "has_subscription": false, "allowance_available_usd": "0", ... }

# Then anyone — usually the human who owns the agent — pays for it.
# The token is USDC (see Configuration); `amount` is in its minimal units.
near call 17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1 ft_transfer_call '{
  "receiver_id": "outlayer.near",
  "amount": "10000000",
  "msg": "{\"action\":\"buy_subscription\",\"nonce\":1,\"owner\":\"<agent account>\",\"plan\":0}"
}' --depositYocto 1 --gas 100000000000000 --accountId payer.near
```

`owner` defaults to the sender, so spell it out: the subscription belongs to the
AGENT, and the sender is the person paying. The allowance is granted against the
event the contract emits, so it appears a moment after the transaction — read
`GET /subscription/status` again rather than assuming.

### What the `wk_` can and cannot do

| With `Authorization: Bearer wk_` | |
|---|---|
| Read the subscription — allowance, expiry, which connectors are in scope | Yes |
| Spend the allowance by calling a connector | Yes |
| **Buy or extend the subscription** | **No** |

Buying is the owner's act, not the agent's: a compromised agent must not be able
to spend money on your behalf. The same applies to choosing where expiry
warnings are sent.

### Rules worth knowing before you buy

* the allowance is **spent before any balance** the key also holds, so a key with
  both keeps working after the allowance runs out;
* **buying again never shortens** what is already paid for — validity extends
  from whichever is later, today or the current expiry, and the allowance adds;
* paying **above** a plan's price leaves the difference as spendable balance
  rather than absorbing it;
* new calls stop being admitted slightly **before** the expiry, so a call already
  running is never cut off mid-flight;
* what is left when the period ends **does not carry over**;
* **one call at a time** while the allowance is paying. A subscription is a flat
  rate, so what bounds it is how much can be in flight. A second concurrent call
  is answered out of the key's BALANCE if it has one, and refused with
  `429 call_already_in_flight` (`"terminal": false`) if it does not — the move
  there is to wait for the call in flight, or to fund the key.

### One subscription per agent

A subscription is not a separate class of key — an ordinary payment key can
carry one too, and the same plans apply. But an account can hold many ordinary
keys, and each could carry its own subscription: nothing merges them and nothing
warns, so two subscribed keys is paying twice for one agent's worth of work.

Several subscriptions across several agents are possible and sometimes wanted —
one per agent, one budget each — but at today's prices that rarely pays for
itself. If you are not sure, subscribe the agent that does the work and leave the
others paying per call.

### The connector quota is separate

Connector calls are also rate-limited per wallet, on a ladder that widens with
the wallet's age (10 a day in the first 24 hours, 50 after a day, 500 after a
week, at the time of writing). **A subscription does not raise it and does not
lower it.** The quota is about protecting the workers and the connectors'
reputation; the subscription is about how a call is paid for. Two different
questions.

## Ask the user for a secret the connector needs

A connector often needs a credential that is **yours to use but not yours to
hold** — an API token for the service it talks to. It is stored under YOUR
agent account, sealed to the keystore, and a connector reads it only when the
call asks for it. You never see the value, and neither does the browser page
that stores it: it is encrypted before it leaves.

You cannot store it yourself. Your wallet has no NEAR to pay for the write, and
the key that authorises it never leaves the TEE — so the coordinator prepares
the transaction and a **human sends and pays for it**.

Send them the link:

> The <service> connector needs its API token. Store it here — it is encrypted
> in your browser and I never see it:
> https://app.outlayer.ai/secrets?project={connector_project_id}&name={VAR_NAME}

The link may propose WHICH secret to create — `project`, `name`, `profile`,
`generate` — and deliberately **cannot** carry its value or your key: those
would end up in browser history, referrers and proxy logs. On the page they
paste your `wk_` (or pick it, if that browser already saved it), choose the
scope, and sign one call. Cost is ~0.1 NEAR, the excess refunded.

Then ask for it per call with `x-use-owner-secret: true` — without that header
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
| `project_not_allowed` | the key's scope does not reach this project — a trial reaches connectors only. Funding it changes nothing |
| `insufficient_balance`, `out_of_funds` | top the key up |
| `connector_quota_exceeded` | wait; the daily allowance grows with wallet age |
| `operation_limit_reached`, `rate_limit_exceeded` | back off and retry |
| `unknown_operation` | the operation has no price, so it can never run — fix the name |
| `wallet_not_yours` | `X-Wallet-Id` named a wallet your credential does not identify |
