---
name: crops-cash
description: Privacy layer for crypto payments. Funds are shielded inside the Curvy protocol — when a payment is needed (e.g. x402 via AgentCash), crops.cash unshields funds to the destination, breaking the link between the user's identity and the payment.
homepage: https://crops.cash
metadata:
  version: 1
---

# Crops.cash

Crops.cash is a privacy-first CLI for crypto payments via the Curvy protocol. All funds held through Curvy are **shielded** — hidden behind zero-knowledge proofs so that balances, ownership, and transaction history are completely private.

## Privacy Model

Curvy uses ZK-SNARKs, stealth addresses, and sparse Merkle trees to provide privacy:

- **Shielded balances**: Funds inside Curvy are encrypted Notes. Only the owner can decrypt and see their balance. No one else can see how much you hold or in what currency.
- **Private transfers**: Sending between Curvy users (`.curvy.name`) is fully private — sender, recipient, amount, and currency are all hidden.
- **Unshielding**: When funds leave Curvy to a public address, observers can see the destination and amount, but **cannot trace where the funds came from**. The link to the original owner is broken.

## How It Works with AgentCash

AgentCash makes x402 micropayments to premium APIs, but those payments are fully transparent — anyone can see who paid what to whom.

**Crops.cash solves this.** When an x402 payment is needed:

1. The user's funds are already shielded inside Curvy (private, invisible to observers)
2. Crops.cash unshields the required amount to the payment destination address
3. The x402 payment completes, but **the source of funds is untraceable**

This gives the user the convenience of AgentCash's API access with the privacy of Curvy's ZK protocol.

**Flow:**
- **Fund your Curvy wallet** → funds are automatically shielded on receipt
- **Agent needs to call a paid API** → crops.cash unshields USDC to the x402 payment address
- **API provider sees payment** → but cannot link it back to your identity

## Setup

The user must onboard first. This creates a wallet at `~/.crops.cash/wallet.json`:

```bash
npx crops.cash@latest onboard
```

This opens a browser window to `https://app.curvy.box/auth` for authentication. The wallet is saved locally after the user completes sign-in.

If the user runs any other command without onboarding, they will be prompted to onboard automatically.

## Commands

### Check Supported Networks & Currencies

```bash
npx crops.cash@latest supported
```

### Check Balances

```bash
npx crops.cash@latest balance
```

Outputs JSON in the format `{ "NetworkName.SYMBOL": "balanceBigint" }`. These are your shielded balances — only you can see them.

### Send Funds

Interactive command that prompts for destination, network, currency, and amount:

```bash
npx crops.cash@latest send
```

- To send privately to a Curvy user: enter their `.curvy.name` address (e.g., `alice.curvy.name`) — fully private transfer
- To unshield to an external wallet: enter the wallet address (hex string) — destination is public but source is untraceable

## Triggers

Use this skill when the user wants to:

- Send crypto privately to someone (wallet address or Curvy name)
- Make a private payment to an x402 endpoint via AgentCash
- Check their shielded crypto balances
- See which networks and currencies are supported
- Set up or reset their Curvy wallet
- Unshield funds to a specific address for a payment

## Non-Interactive Usage (for Agents)

For full programmatic control, agents should use the `curvy-mcp` MCP server directly, which exposes the same functionality as MCP tools:

- `curvy-get-balances` — Get shielded wallet balances
- `curvy-send-funds-internal` — Private transfer to a `.curvy.name` recipient
- `curvy-withdraw-funds` — Unshield and withdraw to an external wallet address
- `curvy-get-supported-networks` — List supported networks

## Support

- **Homepage**: https://crops.cash
