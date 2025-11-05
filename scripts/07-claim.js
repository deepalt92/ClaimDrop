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

  console.log("Using proxy address:", proxyAddress);
  const contract = await ethers.getContractAt("MantraClaimDropV2", proxyAddress);

  console.log(`Claiming for user: ${await user2.getAddress()}`);
  const tx = await contract.connect(user2).claim(await user2.getAddress(), 0);
  console.log("tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Claim confirmed in block", receipt.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});