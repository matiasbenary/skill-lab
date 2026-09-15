# Payment keys, funding and policies

Creating and funding a payment key, asking the user for money, and asking them for a spending policy.

---

## 5. Upgrade to Paid (Payment Key)

When the trial is spent or expired — or to run your own WASI, which the trial does not cover — create a payment key. Wallet must have USDC or NEAR balance.

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
to `/wallet/v1/*` — it names the wallet, it does not pay.

Old code that sends `{"agent": true}` to `/wallet/v1/create-payment-key` is
**refused with 400**, before the balance is even read — the request cannot be
satisfied at any funding level, so it is answered rather than quietly given an
ordinary key it did not ask for.

That means an agent needs a key of its own, and there are two ways to give it
one:

* **claim the trial** (see `connectors.md`) — `POST /trial-key` with the wallet's `wk_`
  returns a real key string, shown once;
* **create and fund one** — Option A or B above, then hand the string to the
  agent.

Store the string. Losing it means creating another key, exactly as it would for
a key you bought.

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

**Available policy types:** spending limits, address whitelist/blacklist, allowed tokens, transaction types, time restrictions, rate limits, multisig approval, capability toggles (`raw_sign`, `swap`, `cross_chain_withdraw`, `payment_check`, EVM signing `evm_sign`, and Solana signing `solana_sign` — both default-DENY under a policy, set `allowed:true` to permit, each with a `raw_tx` sub-flag default-OFF), authorized API keys, webhooks.

**Message to user:**
> Please configure a security policy for your wallet:
> https://app.outlayer.ai/wallet?key={api_key}
