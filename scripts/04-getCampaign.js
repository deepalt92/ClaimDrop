const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const readAddressesHelper = require("./helpers/readAddresses");
async function main() {
  const { ethers } = hre;

  const addresses = await readAddressesHelper();
  const proxyAddress = addresses.proxy;

  console.log("Using proxy address:", proxyAddress);

  const contract = await ethers.getContractAt("MantraClaimDropV2", proxyAddress);

  const rawJsonLike = await contract.getCampaign();
  if (!rawJsonLike) {
    console.log("getCampaign returned empty string or null");
    return;
  }

  try {
    const parsed = JSON.parse(rawJsonLike);
    console.log(JSON.stringify(parsed, null, 2));
  } catch (err) {
    console.warn("Returned string is not valid JSON -- printing raw value:");
    console.log(rawJsonLike);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
