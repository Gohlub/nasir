import { encodeFunctionData, type Address, type Hex, type PublicClient } from "viem";

import { auctionHouseAbi, lotPayeeAbi } from "./abis";

export async function readAuction(publicClient: PublicClient, auctionHouseAddress: Address, lotId: Hex) {
  return publicClient.readContract({
    address: auctionHouseAddress,
    abi: auctionHouseAbi,
    functionName: "getAuction",
    args: [lotId]
  });
}

export function buildCreateAuctionData(lotId: Hex, metadataHash: Hex) {
  return encodeFunctionData({
    abi: auctionHouseAbi,
    functionName: "createAuction",
    args: [lotId, metadataHash]
  });
}

export function buildCloseAuctionData(lotId: Hex, winnerChannelId: Hex, clearingPrice: string) {
  return encodeFunctionData({
    abi: auctionHouseAbi,
    functionName: "closeAuction",
    args: [lotId, winnerChannelId, BigInt(clearingPrice)]
  });
}

export function buildCancelAuctionData(lotId: Hex) {
  return encodeFunctionData({
    abi: auctionHouseAbi,
    functionName: "cancelAuction",
    args: [lotId]
  });
}

export function buildExecuteWinnerData(cumulativeAmount: string, signature: Hex) {
  return encodeFunctionData({
    abi: lotPayeeAbi,
    functionName: "executeWinner",
    args: [BigInt(cumulativeAmount), signature]
  });
}

