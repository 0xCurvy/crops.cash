#!/usr/bin/env node

import { walletExists } from "./lib/wallet.js";
import { onboard } from "./commands/onboard.js";
import { balance } from "./commands/balance.js";
import { send } from "./commands/send.js";
import { info } from "./commands/info.js";

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

function printUsage(): void {
  console.log(`crops.cash - CLI for sending and receiving crypto via Curvy

Usage: crops.cash <command>

Commands:
  onboard     Create or replace your wallet
  balance     Show your account balances
  send        Send funds to another account
  info        List supported networks and currencies`);
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
  case "info":
    await ensureOnboarded();
    await info();
    break;
  default:
    printUsage();
    break;
}
