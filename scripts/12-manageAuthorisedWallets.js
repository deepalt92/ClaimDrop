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
  const wallets = ["0x2f6dd239973702b0525118faca9c4eacb9d595d8", "0xbbd32a1fd5c95e4db0e7a568b88bac5d1564fc6d"]; // Replace with new wallet address

  for (const wallet of wallets) {
    console.log(`adding authorised wallet address ${wallet}...`);
  }
    // Call remove function
    const tx = await contract.connect(deployer).manageAuthorizedWallets(wallets, true);
    await tx.wait();

    console.log("Address authorised wallet addition completed!");
    console.log("Transaction hash:", tx.hash);

   for (const wallet of wallets) {
    await contract.connect(deployer).isAuthorized(wallet).then((output) => {
      console.log(`Is address ${wallet} authorised?`, output);
    });
  }
  console.log("\nFetching all authorized wallets..."); 
  await contract.connect(deployer).getAuthorizedWallets(ethers.ZeroAddress, 10).then((output) => {    
    console.log("Authorized wallets:", {
      wallets: output.map(addr => addr.toString())
    });
  });

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
