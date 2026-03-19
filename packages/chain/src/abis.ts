import type { Abi } from "viem";

export const auctionHouseAbi = [
  {
    type: "function",
    name: "createAuction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "lotId", type: "bytes32" },
      { name: "metadataHash", type: "bytes32" }
    ],
    outputs: [{ name: "lotPayee", type: "address" }]
  },
  {
    type: "function",
    name: "closeAuction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "lotId", type: "bytes32" },
      { name: "winnerChannelId", type: "bytes32" },
      { name: "clearingPrice", type: "uint128" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "cancelAuction",
    stateMutability: "nonpayable",
    inputs: [{ name: "lotId", type: "bytes32" }],
    outputs: []
  },
  {
    type: "function",
    name: "getAuction",
    stateMutability: "view",
    inputs: [{ name: "lotId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "lotPayee", type: "address" },
          { name: "metadataHash", type: "bytes32" },
          { name: "winnerChannelId", type: "bytes32" },
          { name: "clearingPrice", type: "uint128" },
          { name: "status", type: "uint8" }
        ]
      }
    ]
  }
] as const satisfies Abi;

export const lotPayeeAbi = [
  {
    type: "function",
    name: "executeWinner",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cumulativeAmount", type: "uint128" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "lotId_", type: "bytes32" },
      { name: "winnerChannelId_", type: "bytes32" },
      { name: "winnerPayer_", type: "address" },
      { name: "clearingPrice_", type: "uint128" },
      { name: "executed_", type: "bool" }
    ]
  }
] as const satisfies Abi;

export const tempoEscrowAbi = [
  {
    type: "function",
    name: "getChannel",
    stateMutability: "view",
    inputs: [{ name: "channelId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "payer", type: "address" },
          { name: "payee", type: "address" },
          { name: "token", type: "address" },
          { name: "authorizedSigner", type: "address" },
          { name: "deposit", type: "uint128" },
          { name: "settled", type: "uint128" },
          { name: "closeRequestedAt", type: "uint64" },
          { name: "finalized", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "computeChannelId",
    stateMutability: "view",
    inputs: [
      { name: "payer", type: "address" },
      { name: "payee", type: "address" },
      { name: "token", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "authorizedSigner", type: "address" }
    ],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "getVoucherDigest",
    stateMutability: "view",
    inputs: [
      { name: "channelId", type: "bytes32" },
      { name: "cumulativeAmount", type: "uint128" }
    ],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [
      { name: "payee", type: "address" },
      { name: "token", type: "address" },
      { name: "deposit", type: "uint128" },
      { name: "salt", type: "bytes32" },
      { name: "authorizedSigner", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "topUp",
    stateMutability: "nonpayable",
    inputs: [
      { name: "channelId", type: "bytes32" },
      { name: "amount", type: "uint128" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "close",
    stateMutability: "nonpayable",
    inputs: [
      { name: "channelId", type: "bytes32" },
      { name: "cumulativeAmount", type: "uint128" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "requestClose",
    stateMutability: "nonpayable",
    inputs: [{ name: "channelId", type: "bytes32" }],
    outputs: []
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "channelId", type: "bytes32" }],
    outputs: []
  }
] as const satisfies Abi;

