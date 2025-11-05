// Export as default for ES Module compatibility
const verifyContract = async (address, constructorArguments = [], hre) => {
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArguments,
    });
  } catch (error) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("Contract already verified!");
    } else {
      console.error("Error verifying contract:", error);
    }
  }
};

// Use module.exports for CommonJS
module.exports = verifyContract;