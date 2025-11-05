const hre = require("hardhat");
const saveAddresses = require("./helpers/saveAddresses");
const readAddressesHelper = require("./helpers/readAddresses");
async function main() {
  const { ethers, upgrades } = hre;

  const [deployer, user1, user2] = await ethers.getSigners();

  
  const savedAddresses = await readAddressesHelper();

  const MantraClaimDropV2 = await ethers.getContractAt(
    "MantraClaimDropV2",
    savedAddresses.proxy
  );
  // current unix timestamp as BigInt (seconds)
  const now = BigInt(Math.floor(Date.now() / 1000));

  const rewardToken = await ethers.getContractAt("RewardToken", savedAddresses.rewardToken);
  const deployerBalanceBefore = await rewardToken.balanceOf(await deployer.getAddress());
  console.log(`Deployer reward token balance before: ${deployerBalanceBefore}`);

  const action = [
    {  // initial action
      actionType: "close_campaign",  // empty string for no initial action
      campaignData: {
        name: "",
        description: "",
        typeLabel: "",
        rewardDenom: "",
        rewardTokenAddress: ethers.ZeroAddress,
        totalRewardAmount: 0,
        distributions: [],
        allocations: [],
        startTime: 0,
        endTime: 0,
        exists: false
      }
    }
  ];

  await MantraClaimDropV2.connect(deployer).manageCampaign(action[0]);
  console.log("Campaign closed.");

  const deployerBalanceAfter = await rewardToken.balanceOf(await deployer.getAddress());
  console.log(`Deployer reward token balance after: ${deployerBalanceAfter}`);



}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});