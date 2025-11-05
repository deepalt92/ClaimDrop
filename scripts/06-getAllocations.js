const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const readAddressesHelper = require("./helpers/readAddresses");
async function main() {
  const { ethers } = hre;


  const addrFilter = ethers.ZeroAddress;
  const startAfter = ethers.ZeroAddress;
  const limitArg = 3;
  const limit = limitArg ? Number(limitArg) : 0;

  const addresses = await readAddressesHelper();
  const proxyAddress = addresses.proxy;

  if (!proxyAddress) {
    console.error("Proxy address not found. Provide --proxy or add 'proxy' to addresses.json");
    process.exitCode = 1;
    return;
  }

  console.log("Using proxy address:", proxyAddress);

  const contract = await ethers.getContractAt("MantraClaimDropV2", proxyAddress);

  // Use zero address for empty filters
  const zero = ethers.ZeroAddress;
  const addrParam = addrFilter || zero;
  const startAfterParam = startAfter || zero;
  const limitParam = limit || 0;

  console.log(`Calling getAllocations(addr=${addrParam}, start_after=${startAfterParam}, limit=${limitParam})`);
  const raw = await contract.getAllocations(addrParam, startAfterParam, limitParam);
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
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
