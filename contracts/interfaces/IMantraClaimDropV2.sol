// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IMantraClaimDropV2 {
    
    // Distribution types for campaign initialization
    struct Distribution {
        string kind;
        uint256 percentage;
        uint64 start;
        uint64 end;
        uint64 cliff;
    }

    struct Allocation {
        address wallet;
        uint256 amount;
    }

    struct Campaign {
        string name;
        string description;
        string typeLabel;
        string rewardDenom;
        address rewardTokenAddress;
        uint256 totalRewardAmount;
        Distribution[] distributions;
        Allocation[] allocations;
        uint64 startTime;
        uint64 endTime;
        bool exists;
    }

    struct Action {
        string actionType;
        Campaign campaignData;
    }

    struct Claimed {
        string denom;
        uint256 amount;
    }

    struct Pending {
        string denom;
        uint256 amount;
    }

    struct Available {
        string denom;
        uint256 amount;
    }

    struct Rewards {
        Claimed claim;
        Pending pending;
        Available available;
    }

    // Events (subset mirrored from implementation)
    event CampaignCreated(string name, address indexed token, uint256 totalReward);
    event AllocationAdded(bytes32 indexed id, address wallet, uint256 lump, uint256 vesting);
    event ReplacedAddress(address indexed oldWallet, address indexed newWallet);
    event AddressRemoved(address indexed wallet);
    event Claim(address indexed claimant, uint256 amount);
    event Blacklisted(address indexed acct, bool blacklisted);
    event AuthorizedToggled(address indexed acct, bool authorized);
    event CampaignClosed(string name, address indexed owner, uint256 returnedAmount);
    // Ownership transfer events
    event OwnershipProposed(address indexed newOwner, uint256 expiry);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferCancelled(address indexed previouslyProposedOwner);

    // Core external/public functions implemented by the contract
   
    function createCampaign(Campaign calldata _campaign) external payable;

    function manageCampaign(Action calldata action) external payable;

    function manageAuthorizedWallets(address[] calldata acct, bool allow) external;

    function batchUpload(Allocation[] calldata _allocations) external;

    function addAllocation(Allocation calldata _allocation) external returns (uint256);

    function replaceAddress(address oldWallet, address newWallet) external;

    function removeAddress(address wallet) external;

    function blacklistAddress(address acct, bool blacklisted) external;

    function claim(address receiver, uint256 amount) external;

    function topUpERC20(uint256 amount) external;

    // public getters present on the implementation
    function claimed(address) external view returns (bool);
}

