import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getUSDTAddress, getNetworkName, isLocalNetwork } from "../scripts/network-config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, upgrades } = hre;
  const { save } = deployments;

  const { deployer, owner } = await getNamedAccounts();
  const networkName = hre.network.name;

  console.log(`Deploying FarmCity to ${getNetworkName(networkName)}`);
  console.log("Deployer:", deployer);
  console.log("Initial owner:", owner);

  // Deploy FarmCity as UUPS proxy
  const FarmCity = await hre.ethers.getContractFactory("FarmCity");
  const farmCity = await upgrades.deployProxy(
    FarmCity,
    [owner], // initialOwner
    {
      kind: "uups",
      initializer: "initialize",
    }
  );

  await farmCity.waitForDeployment();
  const farmCityAddress = await farmCity.getAddress();

  console.log("FarmCity proxy deployed at:", farmCityAddress);

  // Save the deployment info for hardhat-deploy
  const artifact = await deployments.getExtendedArtifact("FarmCity");
  await save("FarmCity", {
    address: farmCityAddress,
    ...artifact,
  });

  // Set USDT token address
  const farmCityContract = await hre.ethers.getContractAt("FarmCity", farmCityAddress);
  
  if (isLocalNetwork(networkName)) {
    // For local networks, try to use MockUSDT
    try {
      const mockUSDT = await deployments.get("MockUSDT");
      console.log("Setting USDT token address to MockUSDT:", mockUSDT.address);
      await farmCityContract.setUSDTToken(mockUSDT.address);
      console.log("MockUSDT address set successfully");
    } catch (error) {
      console.log("MockUSDT not found, skipping USDT token setup");
    }
  } else {
    // For live networks, use real USDT
    const usdtAddress = getUSDTAddress(networkName);
    if (usdtAddress) {
      console.log("Setting USDT token address to:", usdtAddress);
      await farmCityContract.setUSDTToken(usdtAddress);
      console.log("USDT token address set successfully");
    } else {
      console.log(`Warning: No USDT address configured for network ${networkName}`);
    }
  }
};

func.tags = ["FarmCity", "main"];
// func.dependencies = ["MockUSDT"];

export default func;