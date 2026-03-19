import { encodeFunctionData, type Address, type Hex, type PublicClient } from "viem";

import { tempoEscrowAbi } from "./abis";

export async function readEscrowChannel(publicClient: PublicClient, escrowAddress: Address, channelId: Hex) {
  return publicClient.readContract({
    address: escrowAddress,
    abi: tempoEscrowAbi,
    functionName: "getChannel",
    args: [channelId]
  });
}

export async function computeChannelId(
  publicClient: PublicClient,
  escrowAddress: Address,
  params: {
    payer: Address;
    payee: Address;
    token: Address;
    salt: Hex;
    authorizedSigner: Address;
  }
) {
  return publicClient.readContract({
    address: escrowAddress,
    abi: tempoEscrowAbi,
    functionName: "computeChannelId",
    args: [params.payer, params.payee, params.token, params.salt, params.authorizedSigner]
  });
}

export function buildOpenData(params: {
  payee: Address;
  token: Address;
  deposit: string;
  salt: Hex;
  authorizedSigner: Address;
}) {
  return encodeFunctionData({
    abi: tempoEscrowAbi,
    functionName: "open",
    args: [params.payee, params.token, BigInt(params.deposit), params.salt, params.authorizedSigner]
  });
}

export function buildTopUpData(params: { channelId: Hex; amount: string }) {
  return encodeFunctionData({
    abi: tempoEscrowAbi,
    functionName: "topUp",
    args: [params.channelId, BigInt(params.amount)]
  });
}

export function buildRequestCloseData(channelId: Hex) {
  return encodeFunctionData({
    abi: tempoEscrowAbi,
    functionName: "requestClose",
    args: [channelId]
  });
}

export function buildWithdrawData(channelId: Hex) {
  return encodeFunctionData({
    abi: tempoEscrowAbi,
    functionName: "withdraw",
    args: [channelId]
  });
}

