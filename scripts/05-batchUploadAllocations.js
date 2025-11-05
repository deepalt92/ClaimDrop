const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const readAddressesHelper = require("./helpers/readAddresses");
async function main() {
  const { ethers } = hre;
  const [deployer, user1, user2, user3] = await ethers.getSigners();

  const allocations = [
      [
        (await user1.getAddress()).toString(),
        "100000"
      ],
      [
        (await user2.getAddress()).toString(),
        "200000"
      ],
      [
        (await user3.getAddress()).toString(),
        "300000"
      ]
    ]

  const addresses = await readAddressesHelper();
  const proxyAddress = addresses.proxy;

  console.log("Using proxy address:", proxyAddress);
  const contract = await ethers.getContractAt("MantraClaimDropV2", proxyAddress);

  // Convert amounts to BigNumber when sending
  console.log(`Uploading ${allocations.length} allocations as ${deployer.address}...`);
  const tx = await contract.connect(deployer).batchUpload(allocations);
  console.log("tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("batchUpload confirmed in block", receipt.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
