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
    console.error("Proxy addsress not found. Provide --proxy or add 'proxy' to addresses.json");
    process.exitCode = 1;
    return;
  }

  console.log("Using proxy address:", proxyAddress);
  const contract = await ethers.getContractAt("MantraClaimDropV2", proxyAddress);

  console.log(`Claiming for user: ${await user1.getAddress()}`);
  // address addrFilter, address startFrom, uint256 limit
  const raw = await contract.connect(user1).getRewards(await user1.getAddress());
    if (!raw) {
        console.log("getRewards returned empty string or null");
        return;
    }

    try {
        const parsed = JSON.parse(raw);
        console.log(JSON.stringify(parsed, null, 2));
    } catch (err) {
        console.warn("Returned string is not valid JSON -- printing raw value:");
        console.log(raw);
    }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});