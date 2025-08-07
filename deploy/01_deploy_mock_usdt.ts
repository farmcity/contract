import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer, user } = await getNamedAccounts();

  console.log("Deploying MockUSDT with deployer:", deployer);

  const mockUSDT = await deploy("MockUSDT", {
    from: deployer,
    args: [], // MockUSDT constructor takes no arguments
    log: true,
    autoMine: true,
  });

  console.log("MockUSDT deployed at:", mockUSDT.address);

  // Mint some USDT tokens to the user account for testing
  if (mockUSDT.newlyDeployed) {
    const MockUSDT = await hre.ethers.getContractAt("MockUSDT", mockUSDT.address);
    
    // Mint 100,000 USDT (6 decimals) to user
    const mintAmount = hre.ethers.parseUnits("100000", 6);
    await MockUSDT.mint(user, mintAmount);
    
    console.log(`Minted ${hre.ethers.formatUnits(mintAmount, 6)} USDT to user:`, user);
  }
};

func.tags = ["MockUSDT", "token"];
func.dependencies = [];

export default func;