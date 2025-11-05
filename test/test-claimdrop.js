const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("MantraClaimDropV2", function () {
  let MantraClaimDropV2;
  let RewardToken;
  let claimDrop;
  let rewardToken;
  let owner;
  let authorized;
  let user1;
  let user2;
  let user3;
  let blacklisted;
  const ZERO_ADDRESS = ethers.ZeroAddress;

  // Constants for campaign configuration
  const TOTAL_REWARD = ethers.parseEther("1000000");
  const LUMP_PCT = 200000n; // 20%
  const VESTING_PCT = 800000n; // 80%
  const ONE_DAY = 24 * 60 * 60;
  const ONE_MILLION = 1_000_000n; // 100% in basis points (as BigInt)

  beforeEach(async function () {
    [owner, authorized, user1, user2, user3, blacklisted] = await ethers.getSigners();

    // Deploy reward token
    RewardToken = await ethers.getContractFactory("RewardToken");
    rewardToken = await RewardToken.deploy();
    await rewardToken.waitForDeployment();

     const initializeArgs = [
        owner.address, // owner
    ];

    console.log("Deploying beacon...");
    MantraClaimDropV2 = await ethers.getContractFactory("MantraClaimDropV2");
    const beacon = await upgrades.deployBeacon(MantraClaimDropV2);
    await beacon.waitForDeployment();
    const beaconAddress = await beacon.getAddress();
    console.log("Beacon deployed to:", beaconAddress);

    // Deploy proxy using the beacon
    console.log("Deploying proxy...");
    claimDrop = await upgrades.deployBeaconProxy(beacon, MantraClaimDropV2, initializeArgs);
    await claimDrop.waitForDeployment();
    const proxyAddress = await claimDrop.getAddress();
    console.log("Proxy deployed to:", proxyAddress);
    // Mint tokens to owner
    await rewardToken.mint(owner.address, TOTAL_REWARD);
    await rewardToken.approve(proxyAddress, TOTAL_REWARD);
  });

  describe("Initialization", function () {
    it("Should set the owner correctly", async function () {
      expect(await claimDrop.owner()).to.equal(owner.address);
      expect(await claimDrop.hasRole(await claimDrop.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
      expect(await claimDrop.hasRole(await claimDrop.AUTHORIZED_ROLE(), owner.address)).to.be.true;
      expect(await claimDrop.hasRole(await claimDrop.BLACKLISTER_ROLE(), owner.address)).to.be.true;
    });

    it("Should not allow double initialization", async function () {
      await expect(claimDrop.initialize(owner.address))
        .to.be.revertedWith("already initialized");
    });

    it("Should not allow zero address owner", async function () {
      const newInstance = await upgrades.deployProxy(MantraClaimDropV2, [ZERO_ADDRESS], { initializer: 'initialize' })
        .then(() => { throw new Error("should have thrown") })
        .catch(error => {
          expect(error.message).to.include("owner required");
        });
    });
  });

  describe("Campaign Management", function () {
    const now = Math.floor(Date.now() / 1000);
    const campaign = {
      name: "Test Campaign",
      description: "Test Description",
      typeLabel: "Test",
      rewardDenom: "RWD",
      rewardTokenAddress: null, // Set in test
      totalRewardAmount: TOTAL_REWARD,
      distributions: [
        {
          kind: "lump_sum",
          percentage: LUMP_PCT,
          start: now + ONE_DAY,
          end: 0,
          cliff: 0
        },
        {
          kind: "linear_vesting",
          percentage: VESTING_PCT,
          start: now + ONE_DAY,
          end: now + ONE_DAY * 30,
          cliff: 0
        }
      ],
      allocations: [], // Added missing allocations array
      startTime: now + 10,
      endTime: now + 365 * ONE_DAY,
      exists: false
    };

    beforeEach(async function () {
      campaign.rewardTokenAddress = await rewardToken.getAddress();
    });

    it("Should create a campaign successfully", async function () {
      const action = {
        actionType: "create_campaign",
        campaignData: campaign
      };

      await expect(claimDrop.connect(owner).manageCampaign(action))
        .to.emit(claimDrop, "CampaignCreated")
        .withArgs(campaign.name, campaign.rewardTokenAddress, campaign.totalRewardAmount);

      const campaignJson = await claimDrop.getCampaign();
      const result = JSON.parse(campaignJson);
      expect(result.name).to.equal(campaign.name);
      expect(result.description).to.equal(campaign.description);
      expect(result.total_reward.amount).to.equal(TOTAL_REWARD.toString());
    });

    it("Should fail if percentages don't sum to 100%", async function () {
      const badCampaign = {
        ...campaign,
        distributions: [
          {
            kind: "lump_sum",
            percentage: 500000, // 50%
            start: now + ONE_DAY,
            end: 0,
            cliff: 0
          }
        ],
        allocations: [] // Added missing allocations array
      };

      const action = {
        actionType: "create_campaign",
        campaignData: badCampaign
      };

      await expect(claimDrop.connect(owner).manageCampaign(action))
        .to.be.revertedWith("percentages must sum 1e6");
    });

    it("Should not allow creating campaign if one exists", async function () {
      // Create first campaign
      await claimDrop.connect(owner).manageCampaign({
        actionType: "create_campaign",
        campaignData: campaign
      });

      // Try to create second campaign
      await expect(claimDrop.connect(owner).manageCampaign({
        actionType: "create_campaign",
        campaignData: campaign
      })).to.be.reverted;
    });

    it("Should close campaign and return funds", async function () {
      // Create campaign
      await claimDrop.connect(owner).manageCampaign({
        actionType: "create_campaign",
        campaignData: campaign
      });

      const balanceBefore = await rewardToken.balanceOf(owner.address);

      // Close campaign
      await expect(claimDrop.connect(owner).manageCampaign({
        actionType: "close_campaign",
        campaignData: {
          name: "",
          description: "",
          typeLabel: "",
          rewardDenom: "",
          rewardTokenAddress: ZERO_ADDRESS,
          totalRewardAmount: 0,
          distributions: [],
          allocations: [],
          startTime: 0,
          endTime: 0,
          exists: false
        }
      }))
        .to.emit(claimDrop, "CampaignClosed")
        .withArgs(campaign.name, owner.address, TOTAL_REWARD);

      const balanceAfter = await rewardToken.balanceOf(owner.address);
      expect(balanceAfter - balanceBefore).to.equal(TOTAL_REWARD);
    });
  });

  describe("Allocation Management", function () {
    beforeEach(async function () {
      // Create campaign first
      const now = Math.floor(Date.now() / 1000);
      await claimDrop.connect(owner).manageCampaign({
        actionType: "create_campaign",
        campaignData: {
          name: "Test Campaign",
          description: "Test Description",
          typeLabel: "Test",
          rewardDenom: "RWD",
          rewardTokenAddress: await rewardToken.getAddress(),
          totalRewardAmount: TOTAL_REWARD,
          distributions: [
            {
              kind: "lump_sum",
              percentage: LUMP_PCT,
              start: now + ONE_DAY,
              end: 0,
              cliff: 0
            },
            {
              kind: "linear_vesting",
              percentage: VESTING_PCT,
              start: now + ONE_DAY,
              end: now + ONE_DAY * 30,
              cliff: 0
            }
          ],
          allocations: [],
          startTime: now + ONE_DAY,
          endTime: now + ONE_DAY * 365,
          exists: false
        }
      });
    });
    it ("empty allocations check", async function () {
      const result = await claimDrop.getAllocations(ZERO_ADDRESS, ZERO_ADDRESS, 0);
      const parsed = JSON.parse(result);
      console.log(parsed);
      expect(parsed.allocations.length).to.equal(0);
    });
    it("Should upload allocations in batch", async function () {
      const allocations = [
        { wallet: await user1.getAddress(), amount: ethers.parseEther("1000") },
        { wallet: await user2.getAddress(), amount: ethers.parseEther("2000") }
      ];

      await claimDrop.connect(owner).batchUpload(allocations);

      const result = await claimDrop.getAllocations(ZERO_ADDRESS, ZERO_ADDRESS, 0);
      const parsed = JSON.parse(result);
      console.log(parsed);
      expect(parsed.allocations.length).to.equal(2);
      expect(ethers.getAddress(parsed.allocations[0][0])).to.equal(await user1.getAddress());
      expect(parsed.allocations[0][1]).to.equal(ethers.parseEther("1000").toString());
    });

    it("Should handle pagination in getAllocations", async function () {
      const allocations = [
        { wallet: user1.address, amount: ethers.parseEther("1000") },
        { wallet: user2.address, amount: ethers.parseEther("2000") },
        { wallet: authorized.address, amount: ethers.parseEther("3000") }
      ];

      await claimDrop.connect(owner).batchUpload(allocations);

      // Get first page (2 items)
      const page1 = await claimDrop.getAllocations(ZERO_ADDRESS, ZERO_ADDRESS, 2);
      const parsed1 = JSON.parse(page1);
      expect(parsed1.allocations.length).to.equal(2);

      // Get rest after user1
      const page2 = await claimDrop.getAllocations(ZERO_ADDRESS, user1.address, 2);
      const parsed2 = JSON.parse(page2);
      expect(parsed2.allocations.length).to.equal(2);
      expect(ethers.getAddress(parsed2.allocations[0][0])).to.equal(await user2.getAddress());
    });

    it("Should get allocations for specific address", async function () {
      const allocations = [
        { wallet: user1.address, amount: ethers.parseEther("1000") },
        { wallet: user1.address, amount: ethers.parseEther("2000") }, // Duplicate for same user
        { wallet: user2.address, amount: ethers.parseEther("3000") }
      ];

      await claimDrop.connect(owner).batchUpload(allocations);

      const result = await claimDrop.getAllocations(user1.address, ZERO_ADDRESS, 0);
      const parsed = JSON.parse(result);
      expect(parsed.allocations.length).to.equal(2);
      expect(ethers.getAddress(parsed.allocations[0][0])).to.equal(await user1.getAddress());
      expect(ethers.getAddress(parsed.allocations[1][0])).to.equal(await user1.getAddress());
    });
  });

  describe("Claims", function () {
    const user1Allocation = ethers.parseEther("10000");
    var now;
    beforeEach(async function () {
      now = await time.latest();
      // Create campaign
      await claimDrop.connect(owner).manageCampaign({
        actionType: "create_campaign",
        campaignData: {
          name: "Test Campaign",
          description: "Test Description",
          typeLabel: "Test",
          rewardDenom: "RWD",
          rewardTokenAddress: await rewardToken.getAddress(),
          totalRewardAmount: TOTAL_REWARD,
          distributions: [
            {
              kind: "lump_sum",
              percentage: LUMP_PCT,
              start: now + ONE_DAY,
              end: 0,
              cliff: 0
            },
            {
              kind: "linear_vesting",
              percentage: VESTING_PCT,
              start: now + ONE_DAY,
              end: now + ONE_DAY * 30,
              cliff: 0
            }
          ],
          allocations: [],
          startTime: now + ONE_DAY,
          endTime: now + ONE_DAY * 365,
          exists: false
        }
      });

      // Add allocation for user1
      await claimDrop.connect(owner).batchUpload([
        { wallet: user1.address, amount: user1Allocation }
      ]);
      await time.increaseTo(now + ONE_DAY); 
    });

    it("Should allow claiming lump sum portion", async function () {
      // Move time to start of campaign
       
      const lumpSum = (user1Allocation * BigInt(LUMP_PCT)) / BigInt(ONE_MILLION);
      
      await expect(claimDrop.connect(user1).claim(user1.address, lumpSum))
        .to.emit(claimDrop, "Claim")
        .withArgs(user1.address, lumpSum);

      const balance = await rewardToken.balanceOf(user1.address);
      expect(balance).to.equal(lumpSum);

      //get claim
      const claimData = await claimDrop.connect(user1).getClaim(user1.address, ZERO_ADDRESS, 0);  
      console.log("claim data:", claimData);
      const parsedClaim = JSON.parse(claimData);
      console.log("parsed claim:", parsedClaim);
      const claimedAmount = parsedClaim.claimed[0][1].amount;
      expect(claimedAmount).to.equal(lumpSum.toString());
    });

    it("Should allow claiming vested portion over time", async function () { 
      // First claim lump sum
      const lumpSum = (user1Allocation * BigInt(LUMP_PCT)) / BigInt(ONE_MILLION);
      await claimDrop.connect(user1).claim(user1.address, lumpSum);

      // Move to middle of vesting period
      await time.increaseTo(now + ONE_DAY + (10 * ONE_DAY));

      // Calculate expected vested amount (50% of vesting portion)
      const vestingTotal = (user1Allocation * BigInt(VESTING_PCT)) / BigInt(ONE_MILLION);
      const expectedVested = vestingTotal / BigInt(4);

      // Claim vested portion
      await expect(claimDrop.connect(user1).claim(user1.address, expectedVested))
        .to.emit(claimDrop, "Claim")
        .withArgs(user1.address, expectedVested);

      const balance = await rewardToken.balanceOf(user1.address);
      expect(balance).to.equal(lumpSum + expectedVested);
    });

    it("Should not allow claiming more than available", async function () { 
      const tooMuch = user1Allocation + BigInt(1);
      await expect(claimDrop.connect(user1).claim(user1.address, tooMuch))
        .to.be.revertedWith("amount exceeds claimable");
    });

    it("Should not allow claiming if blacklisted", async function () { 
      await claimDrop.connect(owner).blacklistAddress(user1.address, true);
      await expect(claimDrop.connect(user1).claim(user1.address, 1))
        .to.be.revertedWith("address blacklisted");
    });

    it("Should show correct rewards info via getRewards", async function () { 
      const rewardsBeforeClaim = await claimDrop.getRewards(user1.address);
      const parsedBefore = JSON.parse(rewardsBeforeClaim);

      const lumpSum = user1Allocation * BigInt(LUMP_PCT) / BigInt(ONE_MILLION);
      await claimDrop.connect(user1).claim(user1.address, lumpSum);

      const rewardsAfterClaim = await claimDrop.getRewards(user1.address);
      const parsedAfter = JSON.parse(rewardsAfterClaim);

      expect(parsedAfter.claimed.amount).to.equal(lumpSum.toString());
      expect(parsedBefore.claimed.amount).to.equal("0");
    });
  });

  describe("Admin Functions", function () {
     const user1Allocation = ethers.parseEther("10000");
     var now;
     beforeEach(async function () {
      now = await time.latest();
      // Create campaign
      await claimDrop.connect(owner).manageCampaign({
        actionType: "create_campaign",
        campaignData: {
          name: "Test Campaign",
          description: "Test Description",
          typeLabel: "Test",
          rewardDenom: "RWD",
          rewardTokenAddress: await rewardToken.getAddress(),
          totalRewardAmount: TOTAL_REWARD,
          distributions: [
            {
              kind: "lump_sum",
              percentage: LUMP_PCT,
              start: now + ONE_DAY,
              end: 0,
              cliff: 0
            },
            {
              kind: "linear_vesting",
              percentage: VESTING_PCT,
              start: now + ONE_DAY,
              end: now + ONE_DAY * 30,
              cliff: 0
            }
          ],
          allocations: [],
          startTime: now + ONE_DAY,
          endTime: now + ONE_DAY * 365,
          exists: false
        }
      });

      // Add allocation for user1
      await claimDrop.connect(owner).batchUpload([
        { wallet: user1.address, amount: user1Allocation },
        { wallet: user2.address, amount: user1Allocation },
        { wallet: user3.address, amount: user1Allocation },
      ]);
      //await time.increaseTo(now + ONE_DAY); 
    });

    it("Should manage authorized wallets", async function () {
      await claimDrop.connect(owner).manageAuthorizedWallets([authorized.address], true);
      expect(await claimDrop.isAuthorized(authorized.address)).to.be.true;

      getAuthorizedWallets = await claimDrop.getAuthorizedWallets(ZERO_ADDRESS, 10);
      expect(getAuthorizedWallets).to.include(authorized.address);

      await claimDrop.connect(owner).manageAuthorizedWallets([authorized.address], false);
      expect(await claimDrop.isAuthorized(authorized.address)).to.be.false;
    });

    it("replace address with authorized", async function () {
      await expect(claimDrop.connect(owner).replaceAddress(user1.address, user3.address))
        .to.emit(claimDrop, "ReplacedAddress");
    });

    it("should remove user3 after replacement", async function () {
      // Replace user1 with user3
      await expect(claimDrop.connect(owner).removeAddress(user3.address))
      .to.emit(claimDrop, "AddressRemoved");
    });

    it("Should manage blacklist", async function () {
      await claimDrop.connect(owner).blacklistAddress(blacklisted.address, true);
      expect(await claimDrop.isBlacklisted(blacklisted.address)).to.be.true;

      await claimDrop.connect(owner).blacklistAddress(blacklisted.address, false);
      expect(await claimDrop.isBlacklisted(blacklisted.address)).to.be.false;
    });

    it("Should handle ownership transfer", async function () {
      const expiryTime = Math.floor(Date.now() / 1000) + 360000000;
      
      await claimDrop.connect(owner).proposeOwnership(authorized.address, expiryTime);
      
      const ownershipInfo = await claimDrop.checkOwnership();
      expect(ownershipInfo[1]).to.equal(authorized.address); // pending owner
      expect(ownershipInfo[2]).to.equal(expiryTime); // expiry

      await claimDrop.connect(authorized).acceptOwnership();
      const ownership = await claimDrop.connect(authorized).getOwnership();
      const parsed = JSON.parse(ownership);
      expect(ethers.getAddress(await claimDrop.owner())).to.equal(ethers.getAddress(parsed.owner));
      expect(parsed.pending_owner).to.equal("0x0000000000000000000000000000000000000000");
      expect(parsed.pending_expiry.toString()).to.equal("0");
      expect(await claimDrop.owner()).to.equal(authorized.address);
      expect(await claimDrop.hasRole(await claimDrop.DEFAULT_ADMIN_ROLE(), authorized.address)).to.be.true;
    });

    it("Should allow cancelling ownership transfer", async function () {
      const expiryTime = 0;
      
      await claimDrop.connect(owner).proposeOwnership(authorized.address, expiryTime);
      await claimDrop.connect(owner).cancelOwnershipTransfer();
      
      const ownershipInfo = await claimDrop.checkOwnership();
      expect(ownershipInfo[1]).to.equal(ZERO_ADDRESS); // pending owner should be zero
      expect(ownershipInfo[2]).to.equal(0); // expiry should be zero
    });
  });
});
