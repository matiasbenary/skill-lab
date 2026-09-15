# Using the OutLayer CLI with a wallet key

Logging the CLI in with wk_ and which commands route through /wallet/v1/call.

---

## Using OutLayer CLI with Wallet Key

Agents with custody wallets can use the OutLayer CLI directly - no NEAR private key needed. The CLI routes all contract operations through `POST /wallet/v1/call` transparently.

### Login with wallet key

```bash
outlayer login --wallet-key wk_15807dbda492636df5280629d7617c3ea80f915ba960389b621e420ca275e545
outlayer login testnet --wallet-key wk_...
```

The CLI is a CONVENIENCE, never a prerequisite: everything it does is an HTTP
call you can make yourself, and nothing in this skill needs it. The network
argument here is the same axis as the API host — credentials are kept per
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
# POST https://api.outlayer.ai/register → gets wk_...

# 2. Login to CLI with wallet key
outlayer login --wallet-key wk_15807dbda...

# 3. All commands work transparently
outlayer deploy my-agent
outlayer keys create
outlayer run alice.near/my-agent '{"test": true}'
outlayer secrets set '{"API_KEY":"sk-..."}' --project alice.near/my-agent
outlayer earnings
```
