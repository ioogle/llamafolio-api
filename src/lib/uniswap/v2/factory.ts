import { Contract } from "ethers";
import { providers, Chain } from "@defillama/sdk/build/general";
import { multicall } from "@lib/multicall";
import UniswapV2Factory from "./abis/UniswapV2Factory.json";
import { getERC20Details } from "@lib/erc20";
import { Token } from "@lib/token";
import { isNotNullish } from "@lib/type";

export type GetPairsInfoParams = {
  chain: Chain;
  factoryAddress: string;
  // optional number of pairs
  length?: number;
};

export async function getPairsInfo({
  chain,
  factoryAddress,
  length,
}: GetPairsInfoParams) {
  const provider = providers[chain];
  const factory = new Contract(factoryAddress, UniswapV2Factory, provider);

  let allPairsLength = (await factory.allPairsLength()).toNumber();
  if (length !== undefined) {
    allPairsLength = Math.min(allPairsLength, length);
  }

  const allPairsRes = await multicall({
    chain,
    calls: Array(allPairsLength)
      .fill(undefined)
      .map((_, i) => ({
        target: factory.address,
        params: [i],
      })),
    abi: {
      constant: true,
      inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      name: "allPairs",
      outputs: [{ internalType: "address", name: "", type: "address" }],
      payable: false,
      stateMutability: "view",
      type: "function",
    },
  });

  const addresses = allPairsRes
    .filter((res) => res.success)
    .map((res) => res.output.toLowerCase());

  const [pairs, token0sRes, token1sRes] = await Promise.all([
    getERC20Details(chain, addresses),

    multicall({
      chain,
      calls: addresses.map((address) => ({
        target: address,
        params: [],
      })),
      abi: {
        constant: true,
        inputs: [],
        name: "token0",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        payable: false,
        stateMutability: "view",
        type: "function",
      },
    }),

    multicall({
      chain,
      calls: addresses.map((address) => ({
        target: address,
        params: [],
      })),
      abi: {
        constant: true,
        inputs: [],
        name: "token1",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        payable: false,
        stateMutability: "view",
        type: "function",
      },
    }),
  ]);

  const token0Addresses = token0sRes
    .filter((res) => res.success)
    .map((res) => res.output.toLowerCase());

  const token1Addresses = token1sRes
    .filter((res) => res.success)
    .map((res) => res.output.toLowerCase());

  const [token0s, token1s] = await Promise.all([
    getERC20Details(chain, token0Addresses),
    getERC20Details(chain, token1Addresses),
  ]);

  // map token0 and token1 to their pairs
  const underlyingsByPairAddress: {
    [key: string]: { token0?: string; token1?: string };
  } = {};
  const token0ByAddress: { [key: string]: Token } = {};
  const token1ByAddress: { [key: string]: Token } = {};

  for (const token0Res of token0sRes) {
    if (token0Res.success) {
      if (!underlyingsByPairAddress[token0Res.input.target]) {
        underlyingsByPairAddress[token0Res.input.target] = {};
      }
      underlyingsByPairAddress[token0Res.input.target].token0 =
        token0Res.output.toLowerCase();
    }
  }

  for (const token1Res of token1sRes) {
    if (token1Res.success) {
      if (!underlyingsByPairAddress[token1Res.input.target]) {
        underlyingsByPairAddress[token1Res.input.target] = {};
      }
      underlyingsByPairAddress[token1Res.input.target].token1 =
        token1Res.output.toLowerCase();
    }
  }

  for (const token0 of token0s) {
    token0ByAddress[token0.address] = token0;
  }

  for (const token1 of token1s) {
    token1ByAddress[token1.address] = token1;
  }

  return pairs
    .map((pair) => {
      const underlyings = underlyingsByPairAddress[pair.address];
      if (!underlyings?.token0 || !underlyings?.token1) {
        return null;
      }

      const token0 = token0ByAddress[underlyings.token0];
      const token1 = token0ByAddress[underlyings.token1];

      if (!token0 || !token1) {
        return null;
      }

      return { ...pair, token0, token1 };
    })
    .filter(isNotNullish);
}
