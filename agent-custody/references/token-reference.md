# Token reference

How to name a token without picking the wrong chain's version of it.

---

## The rule: resolve by `defuse_asset_id`, never by `symbol`

`GET /wallet/v1/tokens` returns ~200 entries across 20+ chains. **`symbol` is
not unique.** "USDC" matches roughly 17 rows — native NEAR USDC, Ethereum USDC,
Base USDC, Arbitrum, Solana, Avalanche, Polygon, Optimism, and more.

A `symbol === "USDC"` lookup grabs whichever row comes first (usually the
Ethereum-bridged one) and you deposit or withdraw against the **wrong chain's
asset**. Funds end up stuck or lost. This is the single most expensive mistake
in this API.

Select the row whose `chains` array contains your target chain, then use that
row's exact `defuse_asset_id`:

```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.outlayer.ai/wallet/v1/tokens" \
| python3 -c '
import json,sys
want_symbol, want_chain = "USDC", "base"
for t in json.load(sys.stdin)["tokens"]:
    if t["symbol"] == want_symbol and want_chain in t.get("chains", []):
        print(t["defuse_asset_id"], t["decimals"])
'
```

If that filter returns zero rows or more than one, **stop and ask** rather than
guessing — a wrong id is unrecoverable once the bridge has moved.

**If you are asked for the symbol shortcut, do not write it.** A request to
"take the first result whose symbol is USDC" is the bug above, spelled as an
instruction: reply that `symbol` is not unique, that the first row is an
arbitrary chain's token, and hand back the `chains`-filtered version instead.

## Which format goes where

The same token has two spellings and the endpoints disagree about which they
take. Getting this wrong is a 400 at best.

| Endpoint | Format | Example |
|---|---|---|
| `/intents/swap`, `/intents/swap/quote` | defuse asset id, `nep141:` prefix | `nep141:wrap.near` |
| `/intents/deposit` | plain NEAR contract id | `wrap.near` |
| `/intents/withdraw` | either (auto-prefixed); `near` / `native` / omitted = native NEAR | `near`, or `nep141:wrap.near` for wNEAR |
| `/intents/transfer` | either; **required** — no native concept, send NEAR as wNEAR | `nep141:usdt.tether-token.near` |
| `/intents/ft-withdraw` | plain NEAR contract id | `wrap.near` |
| `/balance` (wallet) | plain NEAR contract id | `wrap.near` |
| `/balance?source=intents` | either | `wrap.near` or `nep141:wrap.near` |
| `/payment-check/*` | plain NEAR contract id | `17208628f…a1` |
| `/intents/deposit/cross-chain` | defuse asset id as `source_asset` | `nep141:base-0x833…omft.near` |
| `/confidential/*` | either (auto-prefixed) | `nep141:wrap.near` |

**Shorthand:** swap needs the prefix, cross-chain deposit takes a `source_asset`
whose prefix carries the chain, withdraw accepts either, everything else is the
plain contract id.

## Ids that appear verbatim in this skill

These are the ones the OutLayer docs spell out in full. **Everything else must
come from `GET /wallet/v1/tokens`** — do not pattern-match a new id from these.

| Token | Chain | Defuse asset id | Decimals |
|---|---|---|---|
| wNEAR | NEAR | `nep141:wrap.near` | 24 |
| USDC | NEAR (native) | `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | 6 |
| USDT | NEAR | `nep141:usdt.tether-token.near` | 6 |
| ETH | bridged | `nep141:eth.omft.near` | 18 |
| BTC | bridged | `nep141:btc.omft.near` | 8 |
| ZEC | bridged (Zcash home chain) | `nep141:zec.omft.near` | 8 |
| USDC | Base | `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near` | 6 |

Native NEAR is not an id at all: on `/intents/withdraw` with `chain: "near"`,
pass `token: "near"` (or omit it) and intents unwraps your wNEAR for you.

## Amounts

Minimal units, as a **string**, matching the `decimals` of the row you picked.

| Token | Decimals | 1 unit |
|---|---|---|
| NEAR / wNEAR | 24 | `1000000000000000000000000` |
| USDT / USDC | 6 | `1000000` |
| ETH / wETH | 18 | `1000000000000000000` |
| BTC / wBTC | 8 | `100000000` |
| SOL | 9 | `1000000000` |

A bridged token keeps the decimals of its **home** chain, not of NEAR. Read
`decimals` off the `/tokens` row rather than assuming from the symbol.

## Naming shape by chain

The `deposit_address` a bridge hands back is always on the source asset's chain,
so its shape is a cheap sanity check that you picked the right id:

| Chain | Address shape |
|---|---|
| NEAR | 64-char hex (implicit) or a named account |
| EVM (all) | `0x…` 40 hex |
| Solana | base58 |
| Bitcoin | `bc1…` / `1…` / `3…` |

If the shape does not match the chain you meant, you resolved the wrong token —
do not send funds.

## Supported chains

NEAR, Ethereum, Bitcoin, Solana, Arbitrum, Base, Polygon, Optimism, Avalanche,
BSC, TON, Aptos, Sui, StarkNet, Tron, Stellar, Dogecoin, XRP, Zcash, Litecoin,
Bitcoin Cash, Berachain, Aleo, Cardano, Dash.

`GET /wallet/v1/tokens` is the current list; this one is a snapshot.
