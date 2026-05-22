#!/usr/bin/env node

// Load .env file into process.env if present (no dependency on dotenv)
import fs from "fs";
import path from "path";
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) {
      const key = m[1];
      let val = m[2] || "";
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { walletExists } from "./lib/wallet.js";
import { onboard } from "./commands/onboard.js";
import { balance } from "./commands/balance.js";
import { send } from "./commands/send.js";
import { info } from "./commands/info.js";
import { earnDiscover, earnDeposit, earnPositions, earnWithdraw } from "./commands/earn.js";

async function ensureOnboarded(): Promise<void> {
  if (!walletExists()) {
    console.log("No wallet found. Starting onboarding first...\n");
    await onboard();
    if (!walletExists()) {
      console.error("Onboarding was not completed. Exiting.");
      process.exit(1);
    }
    console.log();
  }
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && args[i + 1]) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}

function printUsage(): void {
  console.log(`crops.cash - CLI for sending and receiving crypto via Curvy

Usage: crops.cash <command>

Commands:
  onboard     Create or replace your wallet
  balance     Show your account balances
  send        Send funds to another account
  info        List supported networks and currencies`);
  console.log("  earn        Discover and deposit into yield strategies privately");
}

const command = process.argv[2];

switch (command) {
  case "onboard":
    await onboard();
    break;
  case "balance":
    await ensureOnboarded();
    await balance();
    break;
  case "send":
    await ensureOnboarded();
    await send();
    break;
  case "earn": {
    await ensureOnboarded();
    const sub = process.argv[3];
    const args = parseArgs(process.argv.slice(4));
    switch (sub) {
      case "discover":
        await earnDiscover(args.token ?? "USDC", Number(args.chain ?? "42161"));
        break;
      case "deposit":
        await earnDeposit(
          args.amount,
          args.token ?? "USDC",
          Number(args.chain ?? "42161"),
          args.protocol ?? "aave-v3"
        );
        break;
      case "positions":
        await earnPositions();
        break;
      case "withdraw":
        await earnWithdraw(args.protocol ?? "aave-v3");
        break;
      default:
        console.log("Usage: crops.cash earn <discover|deposit|positions|withdraw>");
        console.log("  discover  --token USDC --chain 42161");
        console.log("  deposit   --amount 10 --token USDC --chain 42161 --protocol aave-v3");
        console.log("  positions");
        console.log("  withdraw  --protocol aave-v3");
    }
    break;
  }
  case "info":
    await ensureOnboarded();
    await info();
    break;
  default:
    printUsage();
    break;
}

process.exit(0);
