import { confirm } from "@inquirer/prompts";
import { runAuthFlow } from "curvy-mcp/lib";
import { walletExists, WALLET_PATH } from "../lib/wallet.js";

export async function onboard(): Promise<void> {
  if (walletExists()) {
    const proceed = await confirm({
      message: "A wallet already exists at " + WALLET_PATH + ". Re-onboarding will replace it. Continue?",
      default: false,
    });
    if (!proceed) {
      console.log("Onboarding cancelled.");
      return;
    }
  }

  console.log("Starting onboarding...");
  console.log("A browser window will open for you to authenticate.\n");

  await runAuthFlow(WALLET_PATH);

  console.log("\nOnboarding complete! Wallet saved to", WALLET_PATH);
}
