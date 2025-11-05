const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const readAddressesHelper = require("./helpers/readAddresses");

async function main() {
  const { ethers } = hre;
  const [deployer, user1, user2, user3] = await ethers.getSigners();

  const addresses = await readAddressesHelper();
  const proxyAddress = addresses.proxy;

  if (!proxyAddress) {
    console.error("Proxy address not found. Provide --proxy or add 'proxy' to addresses.json");
    process.exitCode = 1;
    return;
  }

  const addrFilter = ethers.ZeroAddress;
  const startAfter = ethers.ZeroAddress;
  const limitArg = 0;
  const limit = limitArg ? Number(limitArg) : 0;

    // Use zero address for empty filters
  const zero = ethers.ZeroAddress;
  const addrParam = addrFilter || zero;
  const startAfterParam = startAfter || zero;
  const limitParam = limit || 0;

  console.log("Using proxy address:", proxyAddress);
  const contract = await ethers.getContractAt("MantraClaimDropV2", proxyAddress);

  console.log(`Claiming for user: ${await user1.getAddress()}`);
  // address addrFilter, address startFrom, uint256 limit
  const raw = await contract.connect(user1).getClaim(addrParam, startAfterParam, limitParam);
    if (!raw) {
        console.log("getAllocations returned empty string or null");
        return;
    }

    try {
        const parsed = JSON.parse(raw);
        console.log(JSON.stringify(parsed, null, 2));
    } catch (err) {
        console.warn("Returned string is not valid JSON -- printing raw value:");
        console.log(raw);
    }
    const rewardToken = await ethers.getContractAt("RewardToken", addresses.rewardToken);
    const user1Balance = await rewardToken.balanceOf(await user1.getAddress());
    console.log(`User1 reward token balance: ${user1Balance}`);
    const user2Balance = await rewardToken.balanceOf(await user2.getAddress());
    console.log(`User2 reward token balance: ${user2Balance}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});