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
  const wallet = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"; // Replace with new wallet address

  console.log(`Removing address ${wallet}...`);

  // Call remove function
  const tx = await contract.connect(deployer).removeAddress(wallet);
  await tx.wait();

  console.log("Address removal completed!");
  console.log("Transaction hash:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
