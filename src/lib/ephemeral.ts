import { privateKeyToAccount } from "viem/accounts";

export async function deriveEphemeralAddress(sdk: any) {
  const { S, V, s, v } = sdk.walletManager.activeWallet.keyPairs;
  const { R, viewTag } = await sdk.core.send(S, V);
  // Scan immediately to get the spending private key, then derive the correct
  // secp256k1 Ethereum address (deriveAddress from curvy-sdk uses a broken hash)
  const { spendingPrivKeys } = await sdk.core.scanNotes(s, v, [{ ephemeralKey: R, viewTag }]);
  const account = privateKeyToAccount(spendingPrivKeys[0]);
  return { ephemeralAddress: account.address, R, viewTag };
}

export async function recoverEphemeralSigner(sdk: any, R: string, viewTag: string) {
  const { s, v } = sdk.walletManager.activeWallet.keyPairs;
  const { spendingPrivKeys } = await sdk.core.scanNotes(s, v, [{ ephemeralKey: R, viewTag }]);
  return privateKeyToAccount(spendingPrivKeys[0]);
}
