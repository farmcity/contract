import hre from "hardhat";

const { deployments, getNamedAccounts } = hre;

(async () => {
  const { deployer } = await getNamedAccounts();
  // let fc = await deployments.get('FarmCity20');

  deployments.execute("FarmCity20", { from: deployer }, "setMintingStartTime", Math.floor(Date.now() / 1000) - 100)


  // console.log({namedAccounts: await getNamedAccounts()});



})();