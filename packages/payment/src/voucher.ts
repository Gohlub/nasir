import { recoverTypedDataAddress, type Address, type Hex } from "viem";

import { buildVoucherTypedData } from "@nasir/chain";

const secp256k1HalfOrder = BigInt(
  "0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0"
);

function readSignatureS(signature: Hex): bigint {
  const normalized = signature.toLowerCase();
  if (normalized.length !== 132) {
    throw new Error("Voucher signature must be a canonical 65-byte hex string.");
  }

  return BigInt(`0x${normalized.slice(66, 130)}`);
}

export function assertLowSSignature(signature: Hex): void {
  if (readSignatureS(signature) > secp256k1HalfOrder) {
    throw new Error("Voucher signature is not canonical low-s.");
  }
}

type VerifyVoucherParams = {
  escrowContract: Address;
  chainId: number;
  channelId: Hex;
  cumulativeAmount: string;
  signature: Hex;
  expectedSigner: Address;
  domainName?: string;
  domainVersion?: string;
};

export async function verifyVoucherSignature(params: VerifyVoucherParams): Promise<boolean> {
  assertLowSSignature(params.signature);
  const typedData = buildVoucherTypedData({
    escrowContract: params.escrowContract,
    chainId: params.chainId,
    channelId: params.channelId,
    cumulativeAmount: params.cumulativeAmount,
    ...(params.domainName ? { name: params.domainName } : {}),
    ...(params.domainVersion ? { version: params.domainVersion } : {})
  });

  const recovered = await recoverTypedDataAddress({
    ...typedData,
    signature: params.signature
  });

  return recovered.toLowerCase() === params.expectedSigner.toLowerCase();
}
