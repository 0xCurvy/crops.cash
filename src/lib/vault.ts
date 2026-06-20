import { createPublicClient, http, encodeFunctionData } from "viem";
import { arbitrum } from "viem/chains";
import { createGaslessClient } from "./gasless.js";

export type LifiVault = {
  address: string;
  protocol: string;
  apy: number;
  tvl: number;
  underlyingToken: string;
  chainId: number;
};

async function assertResponse(response: Response, url: string): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`LiFi request failed for ${url}: ${response.status} ${response.statusText} — ${body}`);
  }
}

function getLifiHeaders(): Record<string, string> {
  const apiKey = process.env.LIFI_API_KEY;
  return apiKey ? { "x-lifi-api-key": apiKey } : {};
}

const TOKEN_ADDRESSES: Record<string, Record<number, string>> = {
  USDC: {
    42161: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    8453: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  },
  USDT: {
    42161: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    1: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  },
};

function resolveTokenAddress(symbol: string, chainId: number): string | undefined {
  return TOKEN_ADDRESSES[symbol.toUpperCase()]?.[chainId];
}

export async function fetchVaults(token: string, chainId: number): Promise<LifiVault[]> {
  if (!process.env.LIFI_API_KEY) throw new Error("LIFI_API_KEY is not set");

  const tokenAddress = resolveTokenAddress(token, chainId);
  if (!tokenAddress) throw new Error(`No token address found for ${token} on chain ${chainId}`);

  const url = new URL("https://earn.li.fi/v1/vaults");
  url.searchParams.set("chainId", String(chainId));

  const response = await fetch(url.toString(), { headers: getLifiHeaders() });
  await assertResponse(response, url.toString());

  const json = (await response.json()) as any;
  const raw: any[] = Array.isArray(json) ? json : json?.data ?? [];

  return raw
    .filter((entry) =>
      entry.underlyingTokens?.some(
        (t: any) => t.address.toLowerCase() === tokenAddress.toLowerCase()
      )
    )
    .map((entry) => ({
      address: String(entry.address).trim(),
      protocol: String(entry.protocol?.id ?? entry.protocol ?? "").trim(),
      apy: Number(entry.analytics?.apy?.total ?? 0),
      tvl: Number(entry.analytics?.tvl?.usd ?? 0),
      underlyingToken: tokenAddress,
      chainId: Number(entry.chainId ?? chainId),
    }))
    .filter((v) => v.address && v.protocol)
    .sort((a, b) => b.apy - a.apy);
}

export async function getWithdrawQuote(vaultAddress: string, underlyingToken: string, chainId: number, fromAddress: string, vaultTokenAmount: bigint): Promise<any> {
  if (!process.env.LIFI_API_KEY) throw new Error("LIFI_API_KEY is not set");
  const url = new URL("https://li.quest/v1/quote");
  url.searchParams.set("fromChain", String(chainId));
  url.searchParams.set("toChain", String(chainId));
  url.searchParams.set("fromToken", vaultAddress);
  url.searchParams.set("toToken", underlyingToken);
  url.searchParams.set("fromAmount", vaultTokenAmount.toString());
  url.searchParams.set("fromAddress", fromAddress);

  const response = await fetch(url.toString(), { headers: getLifiHeaders() });
  await assertResponse(response, url.toString());
  return response.json();
}

export async function getDepositQuote(vault: LifiVault, fromAddress: string, amount: bigint): Promise<any> {
  const url = new URL("https://li.quest/v1/quote");
  url.searchParams.set("fromChain", String(vault.chainId));
  url.searchParams.set("toChain", String(vault.chainId));
  url.searchParams.set("fromToken", vault.underlyingToken);
  url.searchParams.set("toToken", vault.address);
  url.searchParams.set("fromAmount", amount.toString());
  url.searchParams.set("fromAddress", fromAddress);

  const response = await fetch(url.toString(), { headers: getLifiHeaders() });
  await assertResponse(response, url.toString());
  return response.json();
}


export async function executeQuote(signer: any, quote: any): Promise<string> {
  const { client: gaslessClient, getAuthorization } = await createGaslessClient(signer);
  const authorization = await getAuthorization();

  const approvalAddress = quote.estimate?.approvalAddress as `0x${string}` | undefined;
  const fromTokenAddress = quote.action?.fromToken?.address as `0x${string}` | undefined;
  if (approvalAddress && fromTokenAddress) {
    await gaslessClient.sendTransaction({
      to: fromTokenAddress,
      data: encodeFunctionData({
        abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const,
        functionName: "approve",
        args: [approvalAddress, BigInt(quote.action.fromAmount)],
      }),
      value: 0n,
      ...(authorization && { authorization }),
    });
  }

  const { gasPrice: _gp, maxFeePerGas: _mf, maxPriorityFeePerGas: _mp, ...txRest } = quote.transactionRequest as any;
  const txHash = await gaslessClient.sendTransaction({
    to: txRest.to,
    data: txRest.data,
    value: BigInt(txRest.value ?? 0),
  });
  return txHash as string;
}

export async function getTokenBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
  const publicClient = createPublicClient({ chain: arbitrum, transport: http("https://arb1.arbitrum.io/rpc") });
  return publicClient.readContract({
    address: tokenAddress as `0x${string}`,
    abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
    functionName: "balanceOf",
    args: [walletAddress as `0x${string}`],
  });
}


const AAVE_V3_POOL: Record<number, `0x${string}`> = {
  42161: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  1: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  8453: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
};

export async function withdrawFromAave(underlyingToken: string, signer: any, chainId: number, recipient: string): Promise<string> {
  const pool = AAVE_V3_POOL[chainId];
  if (!pool) throw new Error(`No Aave v3 pool for chain ${chainId}`);

  const { client: gaslessClient, getAuthorization } = await createGaslessClient(signer);
  const authorization = await getAuthorization();

  const txHash = await gaslessClient.sendTransaction({
    to: pool,
    data: encodeFunctionData({
      abi: [{ name: "withdraw", type: "function", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "to", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
      functionName: "withdraw",
      args: [underlyingToken as `0x${string}`, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), recipient as `0x${string}`],
    }),
    value: 0n,
    ...(authorization && { authorization }),
  });

  return txHash as string;
}

export async function getVaultBalance(underlyingToken: string, walletAddress: string, chainId: number): Promise<bigint> {
  const pool = AAVE_V3_POOL[chainId];
  if (!pool) throw new Error(`No Aave v3 pool for chain ${chainId}`);

  const publicClient = createPublicClient({ chain: arbitrum, transport: http("https://arb1.arbitrum.io/rpc") });

  const reserveData = await publicClient.readContract({
    address: pool,
    abi: [{ name: "getReserveData", type: "function", stateMutability: "view", inputs: [{ name: "asset", type: "address" }], outputs: [{ name: "", type: "tuple", components: [{ name: "configuration", type: "tuple", components: [{ name: "data", type: "uint256" }] }, { name: "liquidityIndex", type: "uint128" }, { name: "currentLiquidityRate", type: "uint128" }, { name: "variableBorrowIndex", type: "uint128" }, { name: "currentVariableBorrowRate", type: "uint128" }, { name: "currentStableBorrowRate", type: "uint128" }, { name: "lastUpdateTimestamp", type: "uint40" }, { name: "id", type: "uint16" }, { name: "aTokenAddress", type: "address" }, { name: "stableDebtTokenAddress", type: "address" }, { name: "variableDebtTokenAddress", type: "address" }, { name: "interestRateStrategyAddress", type: "address" }, { name: "accruedToTreasury", type: "uint128" }, { name: "unbacked", type: "uint128" }, { name: "isolationModeTotalDebt", type: "uint128" }] }] }] as const,
    functionName: "getReserveData",
    args: [underlyingToken as `0x${string}`],
  });

  const aTokenAddress = (reserveData as any).aTokenAddress as `0x${string}`;
  return publicClient.readContract({
    address: aTokenAddress,
    abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
    functionName: "balanceOf",
    args: [walletAddress as `0x${string}`],
  });
}
