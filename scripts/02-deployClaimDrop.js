const hre = require("hardhat");
const saveAddresses = require("./helpers/saveAddresses");
const readAddressesHelper = require("./helpers/readAddresses");
async function main() {
  const { ethers, upgrades } = hre;

  const [deployer, user1, user2] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Get ContractFactory
  const MantraClaimDropV2 = await ethers.getContractFactory("MantraClaimDropV2");

  // Deploy using OpenZeppelin's built-in beacon proxy deployment
  console.log("Deploying MantraClaimDropV2...");
  const savedAddresses = await readAddressesHelper();

  // current unix timestamp as BigInt (seconds)
  const now = BigInt(Math.floor(Date.now() / 1000));

  const initializeArgs = [
    deployer.address, // owner
  ];
  // Deploy the beacon
  console.log("Deploying beacon...");
  const beacon = await upgrades.deployBeacon(MantraClaimDropV2);
  await beacon.waitForDeployment();
  const beaconAddress = await beacon.getAddress();
  console.log("Beacon deployed to:", beaconAddress);

  // Deploy proxy using the beacon
  console.log("Deploying proxy...");
  const proxy = await upgrades.deployBeaconProxy(beacon, MantraClaimDropV2, initializeArgs);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("Proxy deployed to:", proxyAddress);

  // Get implementation address
  const implementationAddress = await upgrades.beacon.getImplementationAddress(beaconAddress);
  console.log("Implementation deployed to:", implementationAddress);

  const rewardToken = await ethers.getContractAt(
    "RewardToken",
    (await readAddressesHelper()).rewardToken
  );
  console.log("Approving reward token transfer...");
  rewardToken.connect(deployer).approve(
    proxyAddress, // approve to proxy address
    888888888888n
  );
  // Save all deployment addresses

  savedAddresses.implementation = implementationAddress;
  savedAddresses.beacon = beaconAddress;
  savedAddresses.proxy = proxyAddress;

  await saveAddresses(savedAddresses);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});