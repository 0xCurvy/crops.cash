import { initSDK } from "curvy-mcp/lib";
import { readWallet } from "../lib/wallet.js";

export async function info(): Promise<void> {
  const { signature } = readWallet();
  const sdk = await initSDK("testnet", signature);

  console.log("Supported networks and currencies:\n");

  for (const network of sdk.activeNetworks) {
    console.log(`  ${network.name} (${network.id})`);
    for (const currency of network.currencies) {
      console.log(`    - ${currency.symbol}`);
    }
    console.log();
  }
}
