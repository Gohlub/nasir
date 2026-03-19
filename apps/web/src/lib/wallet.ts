import { buildRequestCloseData, buildVoucherTypedData, buildWithdrawData } from "@nasir/chain";
import { createWalletClient, custom, type Address, type Hex } from "viem";

import { getWebEnv } from "./env";

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

function getInjectedWalletClient() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet was found in this browser.");
  }

  return createWalletClient({
    transport: custom(window.ethereum as never)
  });
}

export async function connectInjectedWallet() {
  const walletClient = getInjectedWalletClient();
  const [account] = await walletClient.requestAddresses();

  if (!account) {
    throw new Error("No account was returned by the injected wallet.");
  }

  return account;
}

export async function signVoucherWithInjectedWallet(input: { channelId: string; cumulativeAmount: string }) {
  const env = getWebEnv();
  const walletClient = getInjectedWalletClient();
  const [account] = await walletClient.requestAddresses();

  if (!account) {
    throw new Error("Connect a wallet before signing a voucher.");
  }

  const signature = await walletClient.signTypedData({
    account,
    ...buildVoucherTypedData({
      escrowContract: env.NEXT_PUBLIC_ESCROW_ADDRESS as Hex,
      chainId: env.NEXT_PUBLIC_CHAIN_ID,
      channelId: input.channelId as Hex,
      cumulativeAmount: input.cumulativeAmount
    })
  });

  return {
    account,
    signature
  };
}

async function sendEscrowTransaction(data: Hex) {
  const env = getWebEnv();
  const walletClient = getInjectedWalletClient();
  const [account] = await walletClient.requestAddresses();

  if (!account) {
    throw new Error("Connect a wallet before sending escrow transactions.");
  }

  return walletClient.sendTransaction({
    account,
    chain: undefined,
    to: env.NEXT_PUBLIC_ESCROW_ADDRESS as Address,
    data
  });
}

export async function requestChannelClose(channelId: string) {
  return sendEscrowTransaction(buildRequestCloseData(channelId as Hex));
}

export async function withdrawChannelFunds(channelId: string) {
  return sendEscrowTransaction(buildWithdrawData(channelId as Hex));
}
