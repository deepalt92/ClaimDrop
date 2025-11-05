
const fs = require("fs");
const path = require("path");

async function saveAddresses(addresses) {
  const addressesPath = path.join(__dirname, "../../", "addresses.json");

  
  // Load existing addresses or create new object
  let allAddresses = {};
  if (fs.existsSync(addressesPath)) {
    allAddresses = JSON.parse(fs.readFileSync(addressesPath));
  }

  // Update with new deployment
  allAddresses = {
    ...addresses
  };
   // Save updated addresses
  fs.writeFileSync(
    addressesPath,
    JSON.stringify(allAddresses, null, 2)
  );
  console.log(`Addresses saved to ${addressesPath}`);
}

module.exports = saveAddresses;
