// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./MantraHelpers.sol";
import "./MantraAdmin.sol";
import "./interfaces/IMantraClaimDropV2.sol";


contract MantraClaimDropV2 is IMantraClaimDropV2, MantraHelpers, MantraAdmin {

    // Ownership transfer variables
    uint256 public totalClaimed;
    
    bool private _initialized;

    mapping(address => bool) public claimed; // track claimed leaves
    // track claimed totals per address (for reporting)
    mapping(address => uint256) public claimedAmounts;
    // Track claimed amounts by leaf hash to prevent double claims
    mapping(address => Rewards) public rewards;

    modifier onlyAuthorized() {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || 
            hasRole(AUTHORIZED_ROLE, msg.sender),
            "not authorized"
        );
        _;
    }

    // No constructor: this contract is designed to be used as an implementation behind
    // a proxy (beacon proxy). Use `initialize` to set owner and optional action.

    function initialize(address _owner) external payable {
        require(!_initialized, "already initialized");
        require(_owner != address(0), "owner required");
        
        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(AUTHORIZED_ROLE, _owner);
        _grantRole(BLACKLISTER_ROLE, _owner);
        // set explicit owner variable in MantraAdmin
        owner = _owner;
        
        _initialized = true;

    }

    function createCampaign(
        Campaign memory _campaign
    ) public payable {
        require(!_campaign.exists, "campaign already exists");

        // populate campaign data from action
        campaign.name = _campaign.name;
        campaign.description = _campaign.description;
        campaign.typeLabel = _campaign.typeLabel;
        campaign.rewardDenom = _campaign.rewardDenom;
        campaign.rewardTokenAddress = _campaign.rewardTokenAddress;
        campaign.totalRewardAmount = _campaign.totalRewardAmount;
        campaign.startTime = _campaign.startTime;
        campaign.endTime = _campaign.endTime;
        campaign.exists = true;

        // clear any existing distributions first
        while (campaign.distributions.length > 0) {
            campaign.distributions.pop();
        }

        // copy distributions from action data, properly creating new struct instances
        uint256 sumPct = 0;
        for (uint256 i = 0; i < _campaign.distributions.length; i++) {
            Distribution memory dist = _campaign.distributions[i];
            campaign.distributions.push(Distribution({
                kind: dist.kind,
                percentage: dist.percentage,
                start: dist.start,
                end: dist.end,
                cliff: dist.cliff
            }));
            sumPct += dist.percentage;
        }

        // expect percentages scaled by 1e6 to sum to 1e6 (100%)
        require(sumPct == 1_000_000, "percentages must sum 1e6");

        // handle token transfer or native ETH
        if (campaign.rewardTokenAddress == address(0)) {
            require(msg.value == campaign.totalRewardAmount, "native value mismatch");
        } else {
            bool ok = IERC20(campaign.rewardTokenAddress).transferFrom(msg.sender, address(this), campaign.totalRewardAmount);
            require(ok, "transferFrom failed");
        }

        emit CampaignCreated(campaign.name, campaign.rewardTokenAddress, campaign.totalRewardAmount);
    }


    // Create a campaign. Caller must transfer the tokens (ERC20) to this contract first using approve+transferFrom
    // For ERC20: token != address(0) and owner approves and this function will pull the tokens.
    // For native ETH: caller must send `msg.value == totalReward` and set token = address(0)
    function manageCampaign(Action calldata action) public onlyRole(DEFAULT_ADMIN_ROLE) payable {
        bytes32 a = keccak256(bytes(action.actionType));
        bytes32 createHash = keccak256(bytes("create_campaign"));
        bytes32 closeHash = keccak256(bytes("close_campaign"));
        if (a == createHash) {
            createCampaign(action.campaignData);
        } else if (a == closeHash) {
            closeCampaign();
        } else {
            revert("unknown action");
        }
    }
   
    // Batch upload allocations before or right after campaign creation but before any claims
    // ids are arbitrary bytes32 identifiers (e.g., keccak256(abi.encodePacked("user@example")) or hashed address)
    function batchUpload(Allocation[] calldata _allocations) external onlyAuthorized {
        for (uint256 i = 0; i < _allocations.length; i++) {
            Allocation memory alloc = _allocations[i];
            addAllocation(alloc);
        }
    }
       
    // internal helper to reduce stack usage in batchUpload
    function addAllocation(
      Allocation memory _allocation
    ) public onlyAuthorized() returns (uint256) {
        require(campaign.startTime > block.timestamp, "campaign started");
           campaign.allocations.push(Allocation({
               wallet: _allocation.wallet,
               amount: _allocation.amount     
           }));
           return campaign.allocations.length - 1;
    }

    // Claim rewards entitled to the allocation.
    // amount: amount to claim (0 means claim all available)

    // allocationData: Raw data that was used to generate the leaf node (address, lumpAmount, vestingAmount, etc.)
    function claim(
        address receiver,
        uint256 amount
    ) external {
        require(campaign.exists, "campaign not active");
        require(receiver == msg.sender, "not claim receiver");
        require(!blacklisted[msg.sender], "address blacklisted");
        require(block.timestamp >= campaign.startTime, "campaign not started");
       
        uint256 lumpPercentage;
        uint256 vestingPercentage;
        uint256 vestingStart;   
        uint256 vestingEnd;
        for (uint256 i = 0; i < campaign.distributions.length; i++) {
            if (keccak256(bytes(campaign.distributions[i].kind)) == keccak256(bytes("lump_sum"))) {
                lumpPercentage = campaign.distributions[i].percentage;

            } else if (keccak256(bytes(campaign.distributions[i].kind)) == keccak256(bytes("linear_vesting"))) {
                vestingPercentage = campaign.distributions[i].percentage;
                vestingStart = campaign.distributions[i].start;
                vestingEnd = campaign.distributions[i].end;
            }
        }

        // Find the caller's total allocation (sum if multiple entries)
        uint256 allocationAmount = 0;
        for (uint256 i = 0; i < campaign.allocations.length; i++) {
            if (campaign.allocations[i].wallet == msg.sender) {
                allocationAmount += campaign.allocations[i].amount;
            }
        }
        require(allocationAmount > 0, "no allocation");

        // Compute portions based on the user's full allocation (not the requested amount)
        uint256 lumpPortion = (allocationAmount * lumpPercentage) / 1_000_000;
        uint256 vestingTotal = (allocationAmount * vestingPercentage) / 1_000_000;

        // Calculate vested portion based on current time
        uint256 vestingNow = 0;
        if (vestingTotal > 0) {
            if (block.timestamp < vestingStart) {
                vestingNow = 0;
            } else if (block.timestamp >= vestingEnd) {
                vestingNow = vestingTotal;
            } else {
                uint256 elapsed = block.timestamp - vestingStart;
                uint256 duration = vestingEnd - vestingStart;
                vestingNow = (vestingTotal * elapsed) / duration;
            }
        }

        // Total claimable for this user at this time
        uint256 totalClaimable = lumpPortion + vestingNow;

        // Subtract any amount already claimed by this address
        uint256 alreadyClaimed = claimedAmounts[msg.sender];
        uint256 remainingClaimable = 0;
        if (totalClaimable > alreadyClaimed) {
            remainingClaimable = totalClaimable - alreadyClaimed;
        }

        require(remainingClaimable > 0, "nothing to claim");

        // If amount specified, verify it's not more than available
        uint256 claimAmount = amount == 0 ? remainingClaimable : amount;
        require(claimAmount <= remainingClaimable, "amount exceeds claimable");

        // track claimed amounts per address
        claimedAmounts[msg.sender] += claimAmount;

        // If user has fully claimed their allocation, mark as claimed
        if (claimedAmounts[msg.sender] >= allocationAmount) {
            claimed[msg.sender] = true;
        }

        // Decrease remaining reward
        campaign.totalRewardAmount -= claimAmount;
        totalClaimed += claimAmount;

        Claimed memory claimedReward = Claimed({
            denom: campaign.rewardDenom,
            amount: claimedAmounts[msg.sender]
        });
        Available memory availableReward = Available({
            denom: campaign.rewardDenom,
            amount: remainingClaimable
        });

        uint256 pendingAmount = 0;
        uint256 totalClaimedPlusAvailable = claimedAmounts[msg.sender] + remainingClaimable;

        Pending memory pendingReward;
        for (uint256 i = 0; i < campaign.allocations.length; i++) {
            if (campaign.allocations[i].wallet == msg.sender) {
                if (campaign.allocations[i].amount > totalClaimedPlusAvailable) {
                    unchecked {
                        pendingAmount = campaign.allocations[i].amount - totalClaimedPlusAvailable;
                    }
                }
                pendingReward = Pending({
                    denom: campaign.rewardDenom,
                    amount: pendingAmount
                });
            }
        }
        rewards[msg.sender] = Rewards({
            claim: claimedReward,
            pending: pendingReward,
            available: availableReward
        });

        // Transfer tokens
        _transferReward(msg.sender, claimAmount);

        emit Claim(msg.sender, claimAmount);
    }

    function _transferReward(address to, uint256 amount) internal {
        if (campaign.rewardTokenAddress == address(0)) {
            // native
            (bool ok, ) = payable(to).call{value: amount}('');
            require(ok, "native transfer failed");
        } else {
            bool ok = IERC20(campaign.rewardTokenAddress).transfer(to, amount);
            require(ok, "token transfer failed");
        }
    }

    // Allow contract to receive native ETH top-ups
    receive() external payable {
        require(campaign.exists && campaign.rewardTokenAddress == address(0), "cannot accept native");
        campaign.totalRewardAmount += msg.value;
    }

    // For ERC20 top-ups: owner can transfer tokens to the contract and call this to increase remainingReward
    function topUpERC20(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(campaign.exists && campaign.rewardTokenAddress != address(0), "not ERC20 campaign");
        bool ok = IERC20(campaign.rewardTokenAddress).transferFrom(msg.sender, address(this), amount);
        require(ok, "transferFrom failed");
        campaign.totalRewardAmount += amount;
    }

    // Close campaign and return remaining funds to the campaign owner.
    // Only owner or authorized wallets can perform this action.
    // Remaining unclaimed funds are returned to the owner.
    function closeCampaign() internal {
        require(campaign.exists, "no campaign exists");

        // Close the campaign
        campaign.exists = false;

        // Calculate remaining rewards (unclaimed funds)
        uint256 toReturn;
        if (campaign.rewardTokenAddress == address(0)) {
            // For native tokens, use contract's balance
            toReturn = address(this).balance;
        } else {
            // For ERC20, check token balance
            toReturn = (IERC20(campaign.rewardTokenAddress).balanceOf(address(this)));
        }

        if (toReturn > 0) {
            if (campaign.rewardTokenAddress == address(0)) {
                // Return native tokens
                (bool ok, ) = payable(msg.sender).call{value: toReturn}("");
                require(ok, "native return failed");
            } else {
                // Return ERC20 tokens
                bool ok = IERC20(campaign.rewardTokenAddress).transfer(msg.sender, toReturn);
                require(ok, "token return failed");
            }
        }

        // Update campaign state
        campaign.totalRewardAmount = 0;

        emit CampaignClosed(campaign.name,msg.sender, toReturn);
    }

    /*
        getter functions
    */

    /**
     * @notice Returns campaign details as a JSON-like string. Useful for off-chain display.
     * Note: this packs available on-chain fields into a JSON string. Some fields (like total claimed)
     * may not be derivable on-chain if original total deposit isn't stored separately.
     */
    /**
     * @notice Get rewards info for a specific address
     * @param receiver The address to check rewards for
     * @return A JSON string containing claimed, pending, and available amounts
     */
    function getRewards(address receiver) public view returns (string memory) {
        // Recompute rewards on-the-fly so callers get up-to-date available/pending values
        if (!campaign.exists) {
            return string(abi.encodePacked("{\"claimed\":{\"denom\":\"", "\",\"amount\":\"0\"},\"pending\":{\"denom\":\"", "\",\"amount\":\"0\"},\"available\":{\"denom\":\"", "\",\"amount\":\"0\"}}"));
        }

        uint256 lumpPercentage;
        uint256 vestingPercentage;
        uint256 vestingStart;
        uint256 vestingEnd;
        for (uint256 i = 0; i < campaign.distributions.length; i++) {
            if (keccak256(bytes(campaign.distributions[i].kind)) == keccak256(bytes("lump_sum"))) {
                lumpPercentage = campaign.distributions[i].percentage;
            } else if (keccak256(bytes(campaign.distributions[i].kind)) == keccak256(bytes("linear_vesting"))) {
                vestingPercentage = campaign.distributions[i].percentage;
                vestingStart = campaign.distributions[i].start;
                vestingEnd = campaign.distributions[i].end;
            }
        }

        // Find total allocation for the receiver
        uint256 allocationAmount = 0;
        for (uint256 i = 0; i < campaign.allocations.length; i++) {
            if (campaign.allocations[i].wallet == receiver) {
                allocationAmount += campaign.allocations[i].amount;
            }
        }

        // If no allocation, return zeros
        if (allocationAmount == 0) {
            return string(abi.encodePacked("{\"claimed\":{\"denom\":\"", campaign.rewardDenom, "\",\"amount\":\"0\"},\"pending\":{\"denom\":\"", campaign.rewardDenom, "\",\"amount\":\"0\"},\"available\":{\"denom\":\"", campaign.rewardDenom, "\",\"amount\":\"0\"}}"));
        }

        uint256 lumpPortion = (allocationAmount * lumpPercentage) / 1_000_000;
        uint256 vestingTotal = (allocationAmount * vestingPercentage) / 1_000_000;

        uint256 vestingNow = 0;
        if (vestingTotal > 0) {
            if (block.timestamp < vestingStart) {
                vestingNow = 0;
            } else if (block.timestamp >= vestingEnd) {
                vestingNow = vestingTotal;
            } else {
                uint256 elapsed = block.timestamp - vestingStart;
                uint256 duration = vestingEnd - vestingStart;
                vestingNow = (vestingTotal * elapsed) / duration;
            }
        }

        uint256 totalClaimable = lumpPortion + vestingNow;
        uint256 alreadyClaimed = claimedAmounts[receiver];
        uint256 remainingClaimable = 0;
        if (totalClaimable > alreadyClaimed) {
            remainingClaimable = totalClaimable - alreadyClaimed;
        }

        uint256 pendingAmount = 0;
        if (allocationAmount > alreadyClaimed + remainingClaimable) {
            pendingAmount = allocationAmount - alreadyClaimed - remainingClaimable;
        }

        // Build JSON output
        string memory json = string(
            abi.encodePacked(
                "{",
                    "\"claimed\":{\"denom\":\"", campaign.rewardDenom, "\",\"amount\":\"", uintToString(alreadyClaimed), "\"},",
                    "\"pending\":{\"denom\":\"", campaign.rewardDenom, "\",\"amount\":\"", uintToString(pendingAmount), "\"},",
                    "\"available\":{\"denom\":\"", campaign.rewardDenom, "\",\"amount\":\"", uintToString(remainingClaimable), "\"}",
                "}"
            )
        );

        return json;
    }

    /**
     * @notice Get list of claimed amounts.
     * @param addrFilter If non-zero, return only this address's claimed amount.
     * @param startFrom If non-zero, start listing from this address (first occurrence in allocations).
     * @param limit If non-zero, limit the number of returned entries.
     * @return JSON string of the form {"claimed":[["addr",{"denom":"uom","amount":"1000"}], ...]}
     */
    function getClaim(address addrFilter, address startFrom, uint256 limit) public view returns (string memory) {
        string memory denom = campaign.rewardDenom;

        // If explicit address requested, return single-entry array
        if (addrFilter != address(0)) {
            string memory addrStr = addressToString(addrFilter);
            string memory amt = uintToString(claimedAmounts[addrFilter]);
            string memory entry = string(abi.encodePacked("[\"", addrStr, "\",{\"denom\":\"", denom, "\",\"amount\":\"", amt, "\"}]") );
            return string(abi.encodePacked("{\"claimed\":[", entry, "]}"));
        }

        uint256 len = campaign.allocations.length;
        if (len == 0) {
            return "{\"claimed\":[]}";
        }

        uint256 startIndex = 0;
        if (startFrom != address(0)) {
            // find first occurrence
            for (uint256 i = 0; i < len; i++) {
                if (campaign.allocations[i].wallet == startFrom) {
                    startIndex = i;
                    break;
                }
            }
        }

        uint256 endIndex = len;
        if (limit > 0) {
            uint256 maybeEnd = startIndex + limit;
            if (maybeEnd < endIndex) endIndex = maybeEnd;
        }

        string memory list = "";
        uint256 count = 0;
        for (uint256 i = startIndex; i < endIndex; i++) {
            address w = campaign.allocations[i].wallet;
            string memory addrStr = addressToString(w);
            string memory amt = uintToString(claimedAmounts[w]);
            string memory entry = string(abi.encodePacked("[\"", addrStr, "\",{\"denom\":\"", denom, "\",\"amount\":\"", amt, "\"}]") );
            list = i == startIndex ? entry : string(abi.encodePacked(list, ",", entry));
            count++;
        }

        return string(abi.encodePacked("{\"claimed\":[", list, "]}"));
    }

    /**
     * @notice Get allocations with optional filters and pagination
     * @param addr If non-zero, return only allocations for this address
     * @param start_after If non-zero, start listing after this address (exclusive)
     * @param limit Max number of entries to return (0 = no limit)
     * @return JSON string: {"allocations":[["addr","amount"], ...]}
     */
    function getAllocations(address addr, address start_after, uint256 limit) public view returns (string memory) {
        uint256 len = campaign.allocations.length;
        if (len == 0) {
            return "{\"allocations\":[]}";
        }

        // If specific address provided, return only matching allocations
        if (addr != address(0)) {
            // collect all allocations for this address (there may be duplicates)
            string memory entries = "";
            bool first = true;
            for (uint256 i = 0; i < len; i++) {
                if (campaign.allocations[i].wallet == addr) {
                    string memory e = string(abi.encodePacked("[\"", addressToString(addr), "\",\"", uintToString(campaign.allocations[i].amount), "\"]"));
                    entries = first ? e : string(abi.encodePacked(entries, ",", e));
                    first = false;
                }
            }
            return string(abi.encodePacked("{\"allocations\":[", entries, "]}"));
        }

        // Find starting index (start_after is exclusive)
        uint256 startIndex = 0;
        if (start_after != address(0)) {
            for (uint256 i = 0; i < len; i++) {
                if (campaign.allocations[i].wallet == start_after) {
                    startIndex = i + 1;
                    break;
                }
            }
            if (startIndex > len) startIndex = len; // safety
        }

        uint256 endIndex = len;
        if (limit > 0) {
            uint256 maybeEnd = startIndex + limit;
            if (maybeEnd < endIndex) endIndex = maybeEnd;
        }

        string memory list = "";
        bool firstEntry = true;
        for (uint256 i = startIndex; i < endIndex; i++) {
            address w = campaign.allocations[i].wallet;
            string memory amt = uintToString(campaign.allocations[i].amount);
            string memory entry = string(abi.encodePacked("[\"", addressToString(w), "\",\"", amt, "\"]"));
            list = firstEntry ? entry : string(abi.encodePacked(list, ",", entry));
            firstEntry = false;
        }

        return string(abi.encodePacked("{\"allocations\":[", list, "]}"));
    }

    function getCampaign() public view returns (string memory) {
        // Basic fields
        string memory name = campaign.name;
        string memory description = campaign.description;
        string memory rewardDenom = campaign.rewardDenom;

        string memory totalRewardAmount = uintToString(campaign.totalRewardAmount);

        // claimed amount is not tracked as a single number on-chain in this implementation,
        // so we return 0 here (off-chain tooling should compute exact claimed value if needed).
        string memory claimedAmount = uintToString(totalClaimed);

        // distributions
        string memory distJson = "[";
        for (uint256 i = 0; i < campaign.distributions.length; i++) {
            Distribution memory d = campaign.distributions[i];
            string memory pct = formatPercentage(d.percentage);
            if (keccak256(bytes(d.kind)) == keccak256(bytes("lump_sum"))) {
                distJson = string(abi.encodePacked(distJson, i==0?"":" , ", "{\"lump_sum\":{\"percentage\":\"", pct, "\",\"start_time\":", uintToString(d.start), "}}"));
            } else if (keccak256(bytes(d.kind)) == keccak256(bytes("linear_vesting"))) {
                distJson = string(abi.encodePacked(distJson, i==0?"":" , ", "{\"linear_vesting\":{\"percentage\":\"", pct, "\",\"start_time\":", uintToString(d.start), ",\"end_time\":", uintToString(d.end), ",\"cliff_duration\":", uintToString(d.cliff), "}}"));
            } else {
                // unknown kind, include raw
                distJson = string(abi.encodePacked(distJson, i==0?"":" , ", "{\"", d.kind, "\":{\"percentage\":\"", pct, "\"}}"));
            }
        }
        distJson = string(abi.encodePacked(distJson, "]"));

        string memory startTime = uintToString(campaign.startTime);
        string memory endTime = uintToString(campaign.endTime);
        string memory closed = campaign.exists ? "0" : uintToString(block.timestamp);

        // Build final JSON
        string memory json = string(
            abi.encodePacked(
                "{",
                    "\"name\":\"", name, "\",",
                    "\"description\":\"", description, "\",",
                    "\"reward_denom\":\"", rewardDenom, "\",",
                    "\"total_reward\":{\"denom\":\"", rewardDenom, "\",\"amount\":\"", totalRewardAmount, "\"},",
                    "\"claimed\":{\"denom\":\"", rewardDenom, "\",\"amount\":\"", claimedAmount, "\"},",
                    "\"distribution_type\":", distJson, ",",
                    "\"start_time\":", startTime, ",",
                    "\"end_time\":", endTime, ",",
                    "\"closed\":", closed,
                "}"
            )
        );

        return json;
    }

    /**
     * @notice Return ownership info as JSON
     * @return JSON string {"owner":"0x..","pending_owner":"0x..","pending_expiry":123}
     */
    function getOwnership() public view returns (string memory) {
        string memory ownerStr = owner == address(0) ? "0x0000000000000000000000000000000000000000" : addressToString(owner);
        string memory pendingStr = pendingOwner == address(0) ? "0x0000000000000000000000000000000000000000" : addressToString(pendingOwner);
        string memory expiryStr = uintToString(ownershipExpiry);
        return string(abi.encodePacked(
            "{",
            "\"owner\":\"", ownerStr, "\",",
            "\"pending_owner\":\"", pendingStr, "\",",
            "\"pending_expiry\":", expiryStr,
            "}"
        ));
    }
}
