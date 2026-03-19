import type { Address, Hex } from "viem";

export const voucherTypes = {
  Voucher: [
    { name: "channelId", type: "bytes32" },
    { name: "cumulativeAmount", type: "uint128" }
  ]
} as const;

type BuildVoucherTypedDataParams = {
  escrowContract: Address;
  chainId: number;
  channelId: Hex;
  cumulativeAmount: string;
  name?: string;
  version?: string;
};

export function buildVoucherTypedData(params: BuildVoucherTypedDataParams) {
  return {
    domain: {
      name: params.name ?? "TempoSessionEscrow",
      version: params.version ?? "1",
      chainId: params.chainId,
      verifyingContract: params.escrowContract
    },
    types: voucherTypes,
    primaryType: "Voucher" as const,
    message: {
      channelId: params.channelId,
      cumulativeAmount: BigInt(params.cumulativeAmount)
    }
  };
}

