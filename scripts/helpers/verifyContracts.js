async function verifyContract(address, constructorArguments = []) {
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
}