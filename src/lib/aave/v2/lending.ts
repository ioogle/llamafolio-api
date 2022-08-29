import { ethers, BigNumber } from "ethers";
import { Chain } from "@defillama/sdk/build/general";
import { Balance, BaseContext } from "@lib/adapter";
import { getERC20Balances } from "@lib/erc20";
import { getReserveTokens } from "./tokens";
import ChefIncentivesControllerABI from "./abis/ChefIncentivesController.json";

export type GetLendingPoolBalancesParams = {
  chain: Chain;
  lendingPoolAddress: string;
  chefIncentivesControllerAddress: string;
};

export async function getLendingPoolBalances(
  ctx: BaseContext,
  params: GetLendingPoolBalancesParams
) {
  const balances: Balance[] = [];

  const reserveTokens = await getReserveTokens({
    chain: params.chain,
    lendingPoolAddress: params.lendingPoolAddress,
  });
  const aTokens = reserveTokens.map(
    (reserveToken) => reserveToken.aTokenAddress
  );
  const stableDebtTokenAddresses = reserveTokens.map(
    (reserveToken) => reserveToken.stableDebtTokenAddress
  );
  const variableDebtTokenAddresses = reserveTokens.map(
    (reserveToken) => reserveToken.variableDebtTokenAddress
  );

  const [
    aBalances,
    stableDebtTokenAddressesBalances,
    variableDebtTokenAddressesBalances,
  ] = await Promise.all([
    getERC20Balances(ctx, params.chain, aTokens),
    getERC20Balances(ctx, params.chain, stableDebtTokenAddresses),
    getERC20Balances(ctx, params.chain, variableDebtTokenAddresses),
  ]);

  for (let i = 0; i < aBalances.length; i++) {
    const aBalance = aBalances[i];

    balances.push({
      chain: aBalance.chain,
      // address: aBalance.address,
      //substitute the token for it's "native" version
      address: reserveTokens[i].underlyingTokenAddress,
      symbol: aBalance.symbol,
      decimals: aBalance.decimals,
      amount: aBalance.amount,
      category: "lend",
    });
  }

  for (let i = 0; i < stableDebtTokenAddressesBalances.length; i++) {
    const stableDebtTokenAddressesBalance = stableDebtTokenAddressesBalances[i];

    balances.push({
      chain: stableDebtTokenAddressesBalance.chain,
      // address: stableDebtTokenAddressesBalance.address,
      //substitute the token for it's "native" version
      address: reserveTokens[i].underlyingTokenAddress,
      symbol: stableDebtTokenAddressesBalance.symbol,
      decimals: stableDebtTokenAddressesBalance.decimals,
      amount: stableDebtTokenAddressesBalance.amount,
      category: "borrow",
      stable: true,
    });
  }

  for (let i = 0; i < variableDebtTokenAddressesBalances.length; i++) {
    const variableDebtTokenAddressesBalance =
      variableDebtTokenAddressesBalances[i];

    balances.push({
      chain: variableDebtTokenAddressesBalance.chain,
      // address: variableDebtTokenAddressesBalance.address,
      //substitute the token for it's "native" version
      address: reserveTokens[i].underlyingTokenAddress,
      symbol: variableDebtTokenAddressesBalance.symbol,
      decimals: variableDebtTokenAddressesBalance.decimals,
      amount: variableDebtTokenAddressesBalance.amount,
      category: "borrow",
      stable: false,
    });
  }

  // Lending rewards
  const chefIncentives = new ethers.Contract(
    chefIncentivesControllerAddress,
    ChefIncentivesControllerABI,
    provider
  );

  const lmRewardsCount = (await chefIncentives.poolLength()).toNumber();

  const registeredTokensRes = await multicall({
    chain,
    calls: Array(lmRewardsCount)
      .fill(undefined)
      .map((_, i) => ({
        target: chefIncentives.address,
        params: [i],
      })),
    abi: {
      inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      name: "registeredTokens",
      outputs: [{ internalType: "address", name: "", type: "address" }],
      stateMutability: "view",
      type: "function",
    },
  });
  const registeredTokensAddresses = registeredTokensRes.map(
    (res) => res.output
  );

  const lmClaimableRewards: BigNumber[] = await chefIncentives.claimableReward(
    ctx.address,
    registeredTokensAddresses
  );

  // collect aTokens underlyings
  const underlyingTokensAddresses = await multicall({
    chain,
    calls: registeredTokensAddresses.map((address) => ({
      target: address,
      params: [],
    })),
    abi: {
      inputs: [],
      name: "UNDERLYING_ASSET_ADDRESS",
      outputs: [{ internalType: "address", name: "", type: "address" }],
      stateMutability: "view",
      type: "function",
    },
  });

  const lmRewards = lmClaimableRewards.map((reward, i) => ({
    amount: reward,
    underlying: underlyingTokensAddresses[i].output,
  }));

  let totalLMRewards = BigNumber.from("0");
  for (let index = 0; index < lmRewards.length; index++) {
    totalLMRewards = totalLMRewards.add(lmRewards[index].amount);
  }

  const lendingEarnedBalance: Balance = {
    chain: params.chain,
    address: stakingToken.address,
    symbol: stakingToken.symbol,
    decimals: stakingToken.decimals,
    amount: totalLMRewards,
    category: "lend-rewards",
    parent: "lend",
  };
  balances.push(lendingEarnedBalance);

  return balances;
}
