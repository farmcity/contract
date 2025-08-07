import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getUSDTAddress, getNetworkName, isLocalNetwork } from "../scripts/network-config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, upgrades } = hre;
  const { save } = deployments;

  const { deployer, owner } = await getNamedAccounts();
  const networkName = hre.network.name;

  console.log(`Deploying FarmCityStaking to ${getNetworkName(networkName)}`);
  console.log("Deployer:", deployer);
  console.log("Initial owner:", owner);

  // Get FarmCity address
  const farmCity = await deployments.get("FarmCity");
  console.log("FarmCity address:", farmCity.address);

  // Get USDT address based on network
  let usdtAddress: string;
  
  if (isLocalNetwork(networkName)) {
    // For local networks, use MockUSDT
    const mockUSDT = await deployments.get("MockUSDT");
    usdtAddress = mockUSDT.address;
    console.log("MockUSDT address:", usdtAddress);
  } else {
    // For live networks, use real USDT
    const configuredUSDT = getUSDTAddress(networkName);
    if (!configuredUSDT) {
      throw new Error(`No USDT address configured for network ${networkName}`);
    }
    usdtAddress = configuredUSDT;
    console.log("USDT address:", usdtAddress);
  }

  // Deploy FarmCityStaking as UUPS proxy
  const FarmCityStaking = await hre.ethers.getContractFactory("FarmCityStaking");
  const farmCityStaking = await upgrades.deployProxy(
    FarmCityStaking,
    [
      farmCity.address, // _farmToken
      usdtAddress,     // _rewardToken (USDT)
      owner,           // initialOwner
    ],
    {
      kind: "uups",
      initializer: "initialize",
    }
  );

  await farmCityStaking.waitForDeployment();
  const farmCityStakingAddress = await farmCityStaking.getAddress();

  console.log("FarmCityStaking proxy deployed at:", farmCityStakingAddress);

  // Save the deployment info for hardhat-deploy
  const artifact = await deployments.getExtendedArtifact("FarmCityStaking");
  await save("FarmCityStaking", {
    address: farmCityStakingAddress,
    ...artifact,
  });

  console.log(`FarmCityStaking deployment to ${getNetworkName(networkName)} completed successfully`);
};

func.tags = ["FarmCityStaking", "main"];
// func.dependencies = ["FarmCity", "MockUSDT"];

export default func;