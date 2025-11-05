const hre = require("hardhat");
const saveAddresses = require("./helpers/saveAddresses");
const readAddressesHelper = require("./helpers/readAddresses");
async function main() {
  const { ethers, upgrades } = hre;

  const [deployer, user1, user2] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const rewardToken = await ethers.getContractAt(
    "RewardToken",
    (await readAddressesHelper()).rewardToken
  );
  /*console.log("Approving reward token transfer...");
  rewardToken.connect(deployer).approve(
    (await readAddressesHelper()).proxy, // approve to proxy address
    888888888888n
  );*/
  
  const savedAddresses = await readAddressesHelper();

  const MantraClaimDropV2 = await ethers.getContractAt(
    "MantraClaimDropV2",
    savedAddresses.proxy
  );
  // current unix timestamp as BigInt (seconds)
  const now = BigInt(Math.floor(Date.now() / 1000));

  const action = [
    {  // initial action
      actionType: "create_campaign",  // empty string for no initial action
      campaignData: {
        name: "My Campaign",
        description: "This is a claim drop campaign on Mantra",
        typeLabel: "Campaign label",
        rewardDenom: "uom",
        rewardTokenAddress: savedAddresses.rewardToken,
        totalRewardAmount: 888888888888n,
        // example distributions; adjust percentages and times as needed
        distributions: [
          {
            kind: "lump_sum",
            percentage: 200000n, // 20.00% if using basis points
            start: now,
            end: now + (60n * 60n * 24n * 30n), // +30 days
            cliff: now // set cliff to now (no cliff) to avoid undefined
          },
          {
            kind: "linear_vesting",
            percentage: 800000n, // 80.00%
            start: now,
            end: now + (60n * 60n * 24n * 365n), // +365 days
            cliff: now // no cliff
          }
        ],
        // example allocations: array of [address, amount]
        allocations: [
          [deployer.address, 100000n],
          [await user1.getAddress(), 50000n],
          [await user2.getAddress(), 25000n]
        ],
        startTime: now + 300n,
        endTime: now + (60n * 60n * 24n * 365n),
        exists: false
      }
    }
  ];

  await MantraClaimDropV2.connect(deployer).manageCampaign(action[0]);
  console.log("Initial campaign created via manageCampaign");

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});