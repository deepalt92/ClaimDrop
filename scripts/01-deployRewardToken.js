const hre = require("hardhat");
const saveAddresses = require("./helpers/saveAddresses");

async function main() {
  const { ethers, upgrades } = hre;

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy the reward token
  const RewardToken = await ethers.getContractFactory("RewardToken");
  const rewardToken = await RewardToken.deploy();
  await rewardToken.waitForDeployment();
  console.log("RewardToken deployed to:", await rewardToken.getAddress());
  await saveAddresses({ rewardToken: await rewardToken.getAddress() });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});