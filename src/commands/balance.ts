import { initSDK } from "curvy-mcp/lib";
import { readWallet } from "../lib/wallet.js";

export async function balance(): Promise<void> {
  const { signature } = readWallet();
  const sdk = await initSDK("testnet", signature);

  const activeWalletId = sdk.walletManager.activeWallet.id;
  const balances = await sdk.storage.getBalances(activeWalletId);

  if (balances.length === 0) {
    console.log("{}");
    return;
  }

  const result: Record<string, string> = {};

  for (const b of balances) {
    for (const network of sdk.activeNetworks) {
      const currency = network.currencies.find((c: any) => c.symbol === b.symbol);
      if (currency) {
        const key = `${network.name}.${b.symbol}`;
        const existing = result[key] ? BigInt(result[key]) : BigInt(0);
        result[key] = (existing + b.balance).toString();
      }
    }
  }

  console.log(JSON.stringify(result, null, 2));
}
