import { input, select } from "@inquirer/prompts";
import { initSDK, tools } from "curvy-mcp/lib";
import { readWallet } from "../lib/wallet.js";

export async function send(): Promise<void> {
  const { signature } = readWallet();
  const sdk = await initSDK("testnet", signature);

  const destination = await input({
    message: "Destination (wallet address or name.curvy.name):",
  });

  const networks = sdk.activeNetworks;
  const networkId = await select({
    message: "Network:",
    choices: networks.map((n) => ({ name: n.name, value: n.id })),
  });

  const network = sdk.getNetwork(networkId);
  const currencySymbol = await select({
    message: "Currency:",
    choices: network.currencies.map((c) => ({ name: c.symbol, value: c.symbol })),
  });

  const amount = await input({
    message: "Amount (e.g., 0.001):",
  });

  const allTools = tools(sdk);
  const isCurvyName = destination.endsWith(".curvy.name");

  console.log("\nSending funds...");

  if (isCurvyName) {
    const sendTool = allTools.find((t) => t.getName() === "curvy-send-funds-internal")!;
    const result = await sendTool.execute({
      recipientCurvyName: destination,
      amount,
      currencySymbol,
      networkId,
    });
    for (const content of result.content) {
      console.log(content.text);
    }
  } else {
    const withdrawTool = allTools.find((t) => t.getName() === "curvy-withdraw-funds")!;
    const result = await withdrawTool.execute({
      destinationAddress: destination,
      amount,
      currencySymbol,
      networkId,
    });
    for (const content of result.content) {
      console.log(content.text);
    }
  }
}
