// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import "./interfaces/IMantraClaimDropV2.sol";

abstract contract MantraAdmin is IMantraClaimDropV2, AccessControlEnumerable {
    bytes32 public constant AUTHORIZED_ROLE = keccak256("AUTHORIZED_ROLE"); 
    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");

    Campaign public campaign;
    // current owner (primary DEFAULT_ADMIN_ROLE holder at initialization)
    address public owner;
    address public pendingOwner;
    uint256 public ownershipExpiry;
     mapping(address => bool) public blacklisted; // track blacklisted addresses
     // authorize or revoke admin
    function manageAuthorizedWallets(address[] calldata acct, bool allow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < acct.length; i++) {
            if (allow) {
                grantRole(AUTHORIZED_ROLE, acct[i]);
                grantRole(BLACKLISTER_ROLE, acct[i]);
            } else {
                revokeRole(AUTHORIZED_ROLE, acct[i]);
                revokeRole(BLACKLISTER_ROLE, acct[i]);
            }
            emit AuthorizedToggled(acct[i], allow);
        }
    }

    function isAuthorized(address acct) public view returns (bool) {
        return hasRole(AUTHORIZED_ROLE, acct);
    }

    /**
     * @notice Return a paginated list of authorized wallets (AUTHORIZED_ROLE members)
     * @param startAfter Address to start after (use address(0) to start from beginning)
     * @param limit Maximum number of addresses to return (0 => defaults to 50)
     * @return wallets Array of authorized wallet addresses
     *
     * Behaviour: If startAfter != address(0) and is not found among role members, returns empty array.
     */
    function getAuthorizedWallets(address startAfter, uint256 limit) public view returns (address[] memory wallets) {
        uint256 total = getRoleMemberCount(AUTHORIZED_ROLE);
        if (total == 0) {
            return new address[](0);
        }

        uint256 startIndex = 0;
        if (startAfter != address(0)) {
            bool found = false;
            for (uint256 i = 0; i < total; i++) {
                if (getRoleMember(AUTHORIZED_ROLE, i) == startAfter) {
                    startIndex = i + 1; // start after the found element
                    found = true;
                    break;
                }
            }
            if (!found) {
                return new address[](0);
            }
        }

        if (limit == 0) {
            limit = 50;
        }

        if (startIndex >= total) {
            return new address[](0);
        }

        uint256 remaining = total - startIndex;
        uint256 take = remaining < limit ? remaining : limit;

        wallets = new address[](take);
        for (uint256 i = 0; i < take; i++) {
            wallets[i] = getRoleMember(AUTHORIZED_ROLE, startIndex + i);
        }
        return wallets;
    }
     // Replace a placeholder id (with zero-address) with actual wallet. Keeps claimed amounts attached.
    function replaceAddress(address oldWallet, address newWallet) external onlyRole(AUTHORIZED_ROLE) {
        require(oldWallet != address(0), "oldWallet zero");
        require(newWallet != address(0), "newWallet zero");
        uint256 len = campaign.allocations.length;
        for (uint256 i = 0; i < len; i++) {
            if (campaign.allocations[i].wallet == oldWallet) {
                campaign.allocations[i].wallet = newWallet;
                emit ReplacedAddress(oldWallet, newWallet);
            }
        }
    }

    function removeAllocationByIndexPreserveOrder(uint256 i) internal {
        uint256 len = campaign.allocations.length;
        require(i < len, "index OOB");
        for (uint256 j = i; j + 1 < len; ++j) {
            campaign.allocations[j] = campaign.allocations[j + 1];
        }
        campaign.allocations.pop();
    }

    // remove address from allocation
    function removeAddress(address wallet) external onlyRole(AUTHORIZED_ROLE) {
        require(wallet != address(0), "wallet zero");
        require(block.timestamp < campaign.startTime, "campaign active");
        uint256 len = campaign.allocations.length;
        for (uint256 i = 0; i < len; i++) {
            if (campaign.allocations[i].wallet == wallet) {
                removeAllocationByIndexPreserveOrder(i);
                emit AddressRemoved(wallet);
            }
        }
    }

    function blacklistAddress(address acct, bool _blacklisted) external onlyRole(BLACKLISTER_ROLE) {
        blacklisted[acct] = _blacklisted;
        emit Blacklisted(acct, _blacklisted);
    }

    function isBlacklisted(address acct) public view returns (bool) {
        return blacklisted[acct];
    }

    /**
     * @notice Proposes to transfer the contract's ownership to a new account
     * @param newOwner The address to transfer ownership to
     * @param expiry The timestamp until which the ownership transfer can be accepted (0 for no expiry)
     */
    function proposeOwnership(address newOwner, uint256 expiry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newOwner != address(0), "Zero address owner");
        require(expiry == 0 || expiry > block.timestamp, "Invalid expiry time");
        
        pendingOwner = newOwner;
        ownershipExpiry = expiry;
        
        emit OwnershipProposed(newOwner, expiry);
    }

    /**
     * @notice Accepts a pending ownership transfer. Can only be called by the pending owner.
     */
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        require(ownershipExpiry == 0 || block.timestamp <= ownershipExpiry, "Transfer expired");

        address previousOwner = owner;

        // grant role to the new owner and revoke from the previous owner
        _grantRole(DEFAULT_ADMIN_ROLE, pendingOwner);
        if (previousOwner != address(0)) {
            _revokeRole(DEFAULT_ADMIN_ROLE, previousOwner);
        }

        // set the new owner
        owner = pendingOwner;

        // Clear pending ownership data
        pendingOwner = address(0);
        ownershipExpiry = 0;

        emit OwnershipTransferred(previousOwner, owner);
    }

    /**
     * @notice Cancels a pending ownership transfer. Can only be called by the current owner.
     */
    function cancelOwnershipTransfer() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(pendingOwner != address(0), "No pending transfer");
        
        address cancelledOwner = pendingOwner;
        pendingOwner = address(0);
        ownershipExpiry = 0;

        emit OwnershipTransferCancelled(cancelledOwner);
    }

    /**
     * @notice Return ownership triplet
     * @return current owner, pending owner, pending expiry timestamp
     */
    function checkOwnership() public view returns (address, address, uint256) {
        return (owner, pendingOwner, ownershipExpiry);
    }

}