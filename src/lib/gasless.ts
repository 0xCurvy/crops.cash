import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { to7702SimpleSmartAccount, toSimpleSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint08Address } from "viem/account-abstraction";

const SIMPLE_ACCOUNT_IMPL = "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as `0x${string}`;

export async function createGaslessClient(signer: any) {
  const apiKey = process.env.PIMLICO_API_KEY;
  if (!apiKey) throw new Error("PIMLICO_API_KEY is not set");

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http("https://arb1.arbitrum.io/rpc"),
  });

  const code = await publicClient.getCode({ address: signer.address });
  const alreadyDelegated = Boolean(code);

  // If 7702 delegation is already set, use as a regular smart account (no authorization needed).
  // If fresh, use 7702 account which will include authorization on first use.
  const account = alreadyDelegated
    ? await toSimpleSmartAccount({
        client: publicClient,
        owner: signer,
        address: signer.address,
        entryPoint: { address: entryPoint08Address, version: "0.8" },
      })
    : await to7702SimpleSmartAccount({
        client: publicClient,
        owner: signer,
        entryPoint: { address: entryPoint08Address, version: "0.8" },
      });

  const pimlicoClient = createPimlicoClient({
    chain: arbitrum,
    transport: http(`https://api.pimlico.io/v2/42161/rpc?apikey=${apiKey}`),
    entryPoint: { address: entryPoint08Address, version: "0.8" },
  });

  const smartAccountClient = createSmartAccountClient({
    client: publicClient,
    chain: arbitrum,
    account,
    paymaster: pimlicoClient,
    bundlerTransport: http(`https://api.pimlico.io/v2/42161/rpc?apikey=${apiKey}`),
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });

  async function getAuthorization() {
    if (alreadyDelegated) return undefined;
    const nonce = await publicClient.getTransactionCount({ address: signer.address });
    return signer.signAuthorization({
      contractAddress: SIMPLE_ACCOUNT_IMPL,
      chainId: arbitrum.id,
      nonce,
    });
  }

  return { client: smartAccountClient, getAuthorization };
}
