# Wallet operations on NEAR

Balances, addresses, NEAR and FT transfers, contract calls, NEP-413 signing, storage registration, deleting the wallet.

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
The NEAR account is the **`address`** field (there is no `account_id` field here — that name only appears on `/wallet/v1/balance`). This is the default setup — your wallet derives from OutLayer's shared vault, nothing to configure. (An optional `vault_id` field appears only for the rare keys bound to a dedicated customer vault.)

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

The example below is also the **wrap step**: `near_deposit` on `wrap.near` turns
native NEAR (passed in `deposit`) into wNEAR. Needed before `/intents/deposit`
of `wrap.near`, which spends wNEAR and **does not wrap for you** — skipping it
fails with `"Smart contract panicked: The account doesn't have enough balance"`
even on a well-funded wallet. `near_withdraw` (`args: {"amount":"…"}`) unwraps.

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

**Raw ed25519 signing → use `/wallet/v1/auth-sign`, not `/sign-message`.** `format: "raw"` on `/sign-message` is no longer supported and returns **HTTP 400**. For OutLayer NEAR-key auth (the raw-ed25519 token used by `PUT /api-key`, `Bearer near:`, and deterministic-wallet flows) call `POST /wallet/v1/auth-sign` instead — the keystore builds the `<prefix>:<seed>:<ts>` challenge with a fresh server timestamp and signs it raw ed25519. See "Authenticate with NEAR key" / "Deterministic Wallets" for how the resulting token is used.

```bash
curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"purpose":"bearer","seed":"user-42"}' \
  "https://api.outlayer.ai/wallet/v1/auth-sign"
# Response: {"auth_message":"auth:user-42:1712000000","auth_timestamp":1712000000,"signature":"<base58_no_prefix>","public_key":"ed25519:..."}
```

`purpose` is one of `bearer` (→ `auth:<seed>:<ts>`, add `vault_id` to scope it), `register` (→ `register:<seed>:<ts>`), or `api-key` (→ `api-key:<seed>:<ts>`). Send `auth_message` and `signature` verbatim; the timestamp is server-generated, not client-supplied.

**Verification (external service, NEP-413 only):**

The NEP-413 signature verifier computes:
1. Borsh-serialize: `tag(2147484061) + message + nonce(32 bytes) + recipient + callback_url(None)`
2. SHA-256 hash the serialized payload
3. Verify ed25519 signature against the `public_key`
4. For implicit accounts: `account_id == hex(public_key_bytes)` - no RPC needed

### `/storage-deposit` - register token storage

Before withdrawing tokens to an account, that account must have storage registered on the token contract. Use this endpoint to register storage.

```bash
curl -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"token":"wrap.near"}' \
  "https://api.outlayer.ai/wallet/v1/storage-deposit"
```

Idempotent - returns `already_registered: true` if storage already exists. Optional `account_id` field to register storage for a different account (default = wallet's own address). Costs ~0.00125 NEAR.

## Automatic Storage Registration

| Endpoint | What it auto-registers |
|----------|----------------------|
| `/wallet/v1/intents/swap` | Output token storage on your wallet |
| `/wallet/v1/intents/deposit` | Your wallet's storage on `intents.near` |
| Fund link (dashboard) | Your wallet's storage on the token contract |
| `/wallet/v1/payment-check/create` | Auto-deposits to intents if wallet balance sufficient |

**Never auto-wrapped:** nothing converts native NEAR → wNEAR. `/intents/deposit`
registers your storage on `intents.near` but still spends an existing wNEAR
balance — call `near_deposit` yourself first (see "Call a contract").

**NOT auto-registered:** `/wallet/v1/call` - register storage manually with `storage_deposit` if calling `ft_transfer` to a new receiver.
