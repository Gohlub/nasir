import { createPublicClient, createWalletClient, defineChain, http, type Account } from "viem";

export function defineTempoChain(chainId: number, rpcUrl: string) {
  return defineChain({
    id: chainId,
    name: `Tempo ${chainId}`,
    nativeCurrency: {
      decimals: 18,
      name: "Tempo",
      symbol: "TMP"
    },
    rpcUrls: {
      default: {
        http: [rpcUrl]
      }
    }
  });
}

export function createTempoPublicClient(chainId: number, rpcUrl: string) {
  return createPublicClient({
    chain: defineTempoChain(chainId, rpcUrl),
    transport: http(rpcUrl)
  });
}

export function createTempoWalletClient(chainId: number, rpcUrl: string, account: Account) {
  return createWalletClient({
    account,
    chain: defineTempoChain(chainId, rpcUrl),
    transport: http(rpcUrl)
  });
}

