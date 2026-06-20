import { initSDK } from "@0xcurvy/curvy-mcp/lib";
import { readWallet } from "../lib/wallet.js";

export async function info(): Promise<void> {
  const { signature } = readWallet();
  const sdk = await initSDK("mainnet", signature);

  const { curvyHandle, ownerAddress } = sdk.walletManager.activeWallet;
  console.log(`Curvy handle:  ${curvyHandle ?? "(none)"}`);
  console.log(`Owner address: ${ownerAddress ?? "(none)"}`);
  console.log();
  console.log("Supported networks and currencies:\n");

  for (const network of sdk.activeNetworks) {
    console.log(`  ${network.name} (${network.id})`);
    for (const currency of network.currencies) {
      console.log(`    - ${currency.symbol}`);
    }
    console.log();
  }
}
