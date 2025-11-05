# Claim Drop Hardhat Project

This is a minimal Hardhat project (JavaScript) for developing a simple ClaimDrop smart contract.

Quick start

1. Install dependencies:

```powershell
cd "c:\Users\deepa\Downloads\Claim-Drop-Contract"
npm install
```

2. Compile:

```powershell
npx hardhat compile
```

3. Run tests:

```powershell
npx hardhat test
```

Files
- `contracts/ClaimDrop.sol` - simple contract where each address can claim once.
- `scripts/deploy.js` - deploy script (local network).
- `test/test-claimdrop.js` - JS test using Hardhat + Chai.
