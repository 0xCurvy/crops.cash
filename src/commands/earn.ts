import { initSDK, tools } from "@0xcurvy/curvy-mcp/lib";
import { readWallet } from "../lib/wallet.js";
import { formatUnits, parseUnits } from "viem";
import { deriveEphemeralAddress, recoverEphemeralSigner } from "../lib/ephemeral.js";
import {
  fetchVaults,
  getDepositQuote,
  getWithdrawQuote,
  executeQuote,
  getTokenBalance,
} from "../lib/vault.js";
import fs from "fs";
import path from "path";
import os from "os";

const POSITIONS_PATH = path.join(os.homedir(), ".crops.cash", "positions.json");

function readPositions(): any[] {
  try {
    return JSON.parse(fs.readFileSync(POSITIONS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writePositions(positions: any[]): void {
  const dir = path.dirname(POSITIONS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(POSITIONS_PATH, JSON.stringify(positions, null, 2));
}

export async function earnDiscover(token: string, chainId: number): Promise<void> {
  const vaults = await fetchVaults(token, chainId);

  if (vaults.length === 0) {
    console.log(`No vaults found for ${token} on chain ${chainId}.`);
    return;
  }

  console.log(`\nVaults for ${token} on chain ${chainId}:`);
  console.log("Protocol                        APY      TVL              Chain");
  console.log("-------------------------------------------------------------");
  for (const vault of vaults) {
    console.log(
      `${vault.protocol.padEnd(30)} ${vault.apy.toFixed(2).padStart(7)}% ${String(vault.tvl).padStart(15)} ${String(vault.chainId).padStart(6)}`
    );
  }
}

export async function earnDeposit(amount: string, token: string, chainId: number, protocol: string): Promise<void> {
  if (!amount) {
    throw new Error("Amount is required for earn deposit.");
  }

  const { signature } = readWallet();
  const sdk = await initSDK("mainnet", signature);
  const vaults = await fetchVaults(token, chainId);
  const vault = vaults.find((v) => v.protocol === protocol);

  if (!vault) {
    throw new Error(`Protocol ${protocol} not found in LiFi Earn vaults`);
  }

  const PENDING_PATH = path.join(os.homedir(), ".crops.cash", "pending-ephemeral.json");

  // Reuse pending ephemeral address if it already has the token (e.g. after a failed deposit)
  let ephemeralAddress!: string, R!: string, viewTag!: string;
  if (fs.existsSync(PENDING_PATH)) {
    const pending = JSON.parse(fs.readFileSync(PENDING_PATH, "utf-8"));
    const pendingToken = await getTokenBalance(vault.underlyingToken, pending.ephemeralAddress);
    if (pendingToken > 0n) {
      ({ ephemeralAddress, R, viewTag } = pending);
      console.log(`\nReusing ephemeral address with existing token balance: ${ephemeralAddress}`);
    }
  }

  if (!ephemeralAddress!) {
    ({ ephemeralAddress, R, viewTag } = await deriveEphemeralAddress(sdk));
    fs.writeFileSync(PENDING_PATH, JSON.stringify({ ephemeralAddress, R, viewTag }, null, 2));
  }

  console.log(`\nEphemeral address: ${ephemeralAddress}`);

  const activeWalletId = sdk.walletManager.activeWallet.id;
  const balances = await sdk.storage.getBalances(activeWalletId);
  const network = sdk.getNetwork("arbitrum");
  const currency = network.currencies.find((c: any) => c.symbol === token);
  if (!currency) throw new Error(`${token} is not supported on Arbitrum in Curvy`);

  const [intPart, decPart = ""] = amount.split(".");
  const decPadded = decPart.padEnd(currency.decimals, "0").slice(0, currency.decimals);
  const amountInBase = BigInt(intPart + decPadded);

  const tokenBalances = balances.filter((b: any) => b.symbol === token);
  const totalBalance = tokenBalances.reduce((sum: bigint, b: any) => sum + b.balance, BigInt(0));

  if (totalBalance < amountInBase) {
    const fmt = (n: bigint) => (Number(n) / 10 ** currency.decimals).toFixed(currency.decimals);
    throw new Error(
      `Insufficient Curvy balance: have ${fmt(totalBalance)} ${token}, need ${fmt(amountInBase)} ${token}`
    );
  }

  const ephemeralTokenBalance = await getTokenBalance(vault.underlyingToken, ephemeralAddress);
  if (ephemeralTokenBalance > 0n) {
    console.log(`\nEphemeral address already has ${formatUnits(ephemeralTokenBalance, currency.decimals)} ${token}, skipping Curvy withdrawal.`);
  } else {
    console.log("\nWithdrawing from Curvy to ephemeral address...");
    const allTools = tools(sdk);
    const withdrawTool = allTools.find((t: any) => t.getName() === "curvy-withdraw-funds")!;

    const withdrawResult = await withdrawTool.execute({
      destinationAddress: ephemeralAddress,
      amount,
      currencySymbol: token,
      networkId: "arbitrum",
    });

    if (withdrawResult.isError) {
      throw new Error(withdrawResult.content?.[0]?.text ?? "Withdraw failed.");
    }

    for (const content of withdrawResult.content) {
      console.log(content.text);
    }
  }

  console.log("\nDepositing into " + protocol + " via LiFi...");
  const signer = await recoverEphemeralSigner(sdk, R, viewTag);
  // Use actual on-chain balance — Curvy applies fees so received < requested
  const actualBalance = await getTokenBalance(vault.underlyingToken, ephemeralAddress);
  const quote = await getDepositQuote(vault, ephemeralAddress, actualBalance);
  const txHash = await executeQuote(signer, quote);

  console.log(`\nDeposit tx: https://arbiscan.io/tx/${txHash}`);

  const positions = readPositions();
  positions.push({
    id: crypto.randomUUID(),
    protocol: vault.protocol,
    vaultAddress: vault.address,
    underlyingToken: vault.underlyingToken,
    chainId: vault.chainId,
    amount: formatUnits(actualBalance, 6),
    token,
    depositedAt: new Date().toISOString(),
    ephemeralKey: R,
    viewTag,
    ephemeralAddress,
  });

  if (fs.existsSync(PENDING_PATH)) fs.unlinkSync(PENDING_PATH);
  writePositions(positions);
  console.log("Position saved ✓");
}

export async function earnPositions(): Promise<void> {
  const positions = readPositions();
  if (positions.length === 0) {
    console.log("No open positions");
    return;
  }

  console.log("\nOpen positions:");
  console.log("Protocol          Deposited     Current       Yield         Since");
  console.log("---------------------------------------------------------------------------");

  for (const position of positions) {
    const currentBalance = await getTokenBalance(position.vaultAddress, position.ephemeralAddress);
    const depositedAmount = parseUnits(position.amount, 6);
    const yieldAmount = currentBalance > depositedAmount ? currentBalance - depositedAmount : BigInt(0);

    console.log(
      `${position.protocol.padEnd(17)} ${formatUnits(depositedAmount, 6).padStart(11)} ${formatUnits(currentBalance, 6).padStart(13)} ${formatUnits(yieldAmount, 6).padStart(13)} ${new Date(position.depositedAt).toISOString()}`
    );
  }
}

export async function earnWithdraw(protocol: string): Promise<void> {
  const positions = readPositions();
  const position = positions.find((p) => p.protocol === protocol);

  if (!position) {
    console.log(`No open position for ${protocol}`);
    return;
  }

  const { signature } = readWallet();
  const sdk = await initSDK("mainnet", signature);
  const signer = await recoverEphemeralSigner(sdk, position.ephemeralKey, position.viewTag);
  const vaultTokenBalance = await getTokenBalance(position.vaultAddress, position.ephemeralAddress);
  const quote = await getWithdrawQuote(position.vaultAddress, position.underlyingToken, position.chainId, position.ephemeralAddress, vaultTokenBalance);
  const txHash = await executeQuote(signer, quote);

  const currentBalance = BigInt(quote.estimate?.toAmount ?? "0");
  const depositedAmount = parseUnits(position.amount, 6);
  const yieldAmount = currentBalance > depositedAmount ? currentBalance - depositedAmount : BigInt(0);

  writePositions(positions.filter((p) => p.id !== position.id));

  console.log(`Withdraw tx: https://arbiscan.io/tx/${txHash}`);
  console.log(`Withdrawn: ${formatUnits(currentBalance, 6)} ${position.token}`);
  console.log(`Yield captured: ${formatUnits(yieldAmount, 6)} ${position.token}`);
  console.log("Position closed ✓");
}
