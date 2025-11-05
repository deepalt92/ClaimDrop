
const fs = require("fs");
const path = require("path");

async function readAddresses() {
  const addressesPath = path.join(__dirname, "../../", "addresses.json");

  // Load existing addresses or create new object
  let allAddresses = {};
  if (fs.existsSync(addressesPath)) {
    allAddresses = JSON.parse(fs.readFileSync(addressesPath));
  }

    return allAddresses;
}

module.exports = readAddresses;
