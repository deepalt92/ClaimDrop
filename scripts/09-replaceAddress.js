const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const readAddressesHelper = require("./helpers/readAddresses");
async function main() {
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
  const oldWallet = "0xd8b587e201554cf9bb5c02c71f4586f4d16d63c7"; // Replace with old wallet address
  const newWallet = "0xbBD32a1fd5c95E4Db0e7a568b88BaC5D1564Fc6d"; // Replace with new wallet address

  console.log(`Replacing address ${oldWallet} with ${newWallet}...`);

  // Call replaceAddress function
  const tx = await contract.replaceAddress(oldWallet, newWallet);
  await tx.wait();

  console.log("Address replacement completed!");
  console.log("Transaction hash:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
