# Claim Drop Hardhat Project

This is a claim drop contract developed as per the following specification: https://docs.mantrachain.io/mantra-smart-contracts/claimdrop_contract_v2.
Reasonable attempts are made to cover the specifications defined in the documentation. As the specification excludes Merkel proof verification during the claim process, this is excluded from this implementation. 

Quick start

1. Install dependencies:

```powershell
cd "c:\Users\deepa\Downloads\Claim-Drop-Contract"
npm install
```

2. Compile Contracts:

```powershell
npx hardhat compile
```

3. Run tests:

```powershell
npx hardhat test
```

4. Check the coverage:
```powershell
npx hardhat coverage
```


# Files:

## Contracts
- `contracts/MantraClaimDropV2.sol` - the main claim drop contract that contains the createCampaign, closeCampaign, claim, batchUpload, and other read functions to view rewards, claims, and allocations
- `contracts/MantraAdmin.sol` - the MantraClaimDropV2.sol inherits from this contract. This contract contains admin functionality such as manageAuthorizedWallets, replaceAddress, removeAddress, blacklistAddress, proposeOwnership, acceptOwnership, cancelOwnership, and the corresponding read functions
- `contracts/IMantraClaimDropV2` - the interface contract, to ensure the factory contracts implement the main functions
- `contracts/RewardToken.sol` - a dummy token called the reward token. This is the token that is deposited to the claimdrop contract and distributed amongst uses when they start claiming.

## Scripts

We use the beacon proxy pattern. This provides the flexibility for the owner to deploy a proxy everytime they want to start a campaign. The implementation contract does not have to be deployed everytime. Each beaconproxy can have its own campaign and hold its own state.
- generally, execute scripts in the numbered order (01 - 09) inside the scripts/ folder
- To add the claim (script 7), you need to wait until the campaign starts. Currently it is set to 5 mins. You can adjust this value from script 03
- Script 10 can only be run before the campaign starts. Afterward, an address cannot be removed
- Scripts 11, 12, 15 are admin functions. Note once an address is blacklisted, they cannot claim tokens
- Script 14 closes the campaign and sweeps the existing funds in the claimdrop contract to the owner


# Address and Transaction Hashes on Mantra
Addresses deployed on Mantra Testnet are available at: ./addresses.json

## transaction hashes
1) createCampaign transaction hash - 0x32cd1065ca4446eaf5cb09bf2719205113406a2e70a3aa2b9ba9cfcd8bf2d00b

2) batchupload transaction hash - 
0xbf5d13a5aae562b443f413d4e7992a8fa032df3e416bdd13eb35037b61378e29

3) claim transaction hash - 
0x822b77ade190c08f6703901868ba55cfb6144c7ce96fd0b23ccfe326b5a45c30

4) address replacement hash -
0x4423f6df76c894dad2eaa12dc9e40d68258f6cf6dfbfdee8ea82a808f36562ca

5) blacklisting transaction hash - 
0x2b22681394c97b32589d470f6f789d227762ca91c5e7d9f57375b97e165c6e02

6) unblacklist (remove blacklist) transaction hash -
0x27f16cbe3a925322a452e2d2325c200fa83133ef34a11d1892e188e4ac0a17d3

7) authorise wallets transaction hash -
0x997885625f05db606790aa20c896780a4cd6a691e85f8d50a86d90e40fc9b5a3

8) closing campaign transaction hash - 
check from the following address: 0xbBD32a1fd5c95E4Db0e7a568b88BaC5D1564Fc6d
After closing the campaign the owner/deployer's token balance increased.

9) proposing new ownership transaction hash -
0xe43f070df1f9c89dedf8edb0148d828894b88ed39e1e8faea04ca418471c6ed9

10) accept new ownership transaction hash -
0x7c8208aaaad707f0c03e1484604a795bcfabd7f657cb5178629316eea8f051d7

# Future Work:

1) Enhance smart contract comments using Natspec specification - https://docs.soliditylang.org/en/latest/natspec-format. (some comments already adhere to this)

2) Static Analysis - Run Slither on the smart contracts to identify: Overflow, Underflow, and Reentrancy vulnerabilities

3) Formal Verification - Run Certora on the smart contract to formal verify certain function. This would prove that there is no execution that violates an invariant that we define.