const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const readAddressesHelper = require("./helpers/readAddresses");
async function main() {
  const [deployer] = await ethers.getSigners();
  // Read the addresses from the JSON file
  const addresses = await readAddressesHelper();

  const proxyAddress = addresses.proxy
  if (!proxyAddress) {
    throw new Error("Proxy address not found in addresses.json");
  }

  // Attach to the deployed contract
  const MantraClaimDropV2 = await hre.ethers.getContractFactory("MantraClaimDropV2");
  const contract = await MantraClaimDropV2.attach(proxyAddress);

  // Replace these addresses with the actual ones you want to use
  const wallet = "0x2f6dd239973702b0525118faca9c4eacb9d595d8"; // Replace with new wallet address

  console.log(`Blacklisting address ${wallet}...`);

  // Call remove function
  const tx = await contract.connect(deployer).blacklistAddress(wallet, false);
  await tx.wait();

  console.log("Address blacklist completed!");
  console.log("Transaction hash:", tx.hash);

  const output = await contract.isBlacklisted(wallet);
  console.log(`Is address ${wallet} blacklisted?`, output);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
