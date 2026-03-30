import fs from "fs";
import path from "path";
import os from "os";

export const WALLET_PATH = path.join(os.homedir(), ".crops.cash", "wallet.json");

export function walletExists(): boolean {
  return fs.existsSync(WALLET_PATH);
}

export function readWallet(): { signature: any } {
  const raw = fs.readFileSync(WALLET_PATH, "utf-8");
  return JSON.parse(raw);
}
