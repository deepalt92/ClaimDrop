const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const readAddressesHelper = require("./helpers/readAddresses");

async function main() {
  const [deployer, newOwner] = await ethers.getSigners();
  
  // Read the addresses from the JSON file
  const addresses = await readAddressesHelper();

  const proxyAddress = addresses.proxy;
  if (!proxyAddress) {
    throw new Error("Proxy address not found in addresses.json");
  }

  // Attach to the deployed contract
  const MantraClaimDropV2 = await hre.ethers.getContractFactory("MantraClaimDropV2");
  const contract = await MantraClaimDropV2.attach(proxyAddress);

  console.log("\nCurrent ownership status:");
  const initialOwnership = await contract.connect(deployer).checkOwnership();
  console.log({
    currentOwner: initialOwnership[0],
    pendingOwner: initialOwnership[1],
    ownershipExpiry: initialOwnership[2].toString()
  });

  // Step 1: Propose new ownership (by current owner)
  console.log("\nProposing new ownership...");
  const newOwnerAddress = newOwner.address;
  const expiryTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const proposeTx = await contract.connect(deployer).proposeOwnership(newOwnerAddress, expiryTime);
  await proposeTx.wait();
  console.log("Ownership proposed!");
  console.log("Transaction hash:", proposeTx.hash);

  // Check ownership status after proposal
  console.log("\nOwnership status after proposal:");
  const midOwnership = await contract.connect(deployer).checkOwnership();
  console.log({
    currentOwner: midOwnership[0],
    pendingOwner: midOwnership[1],
    ownershipExpiry: midOwnership[2].toString()
  });

  // Step 2: Accept ownership (by new owner)
  console.log("\nAccepting ownership...");
  const acceptTx = await contract.connect(newOwner).acceptOwnership();
  await acceptTx.wait();
  console.log("Ownership accepted!");
  console.log("Transaction hash:", acceptTx.hash);

  // Final ownership check
  console.log("\nFinal ownership status:");
  const finalOwnership = await contract.connect(deployer).checkOwnership();
  console.log({
    currentOwner: finalOwnership[0],
    pendingOwner: finalOwnership[1],
    ownershipExpiry: finalOwnership[2].toString()
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
