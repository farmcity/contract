
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const deployFarmcity: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {

  const { deployments, getNamedAccounts } = hre;

  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("Start ERC721 Deployment...");
  const USDC = "0x5a49052d11c9413985ad7e83b3ec2a3e1547c0be"; // lisk-sepolia

  const farmCity = await deploy("FarmCity20", {
    from: deployer,
    args: [],
    log: true,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        methodName: 'initialize',
        args: [deployer, USDC], // add usdc contract
      }
    },
  });

  log(`FarmCity deployed on: ${farmCity.address}`)

}

export default deployFarmcity;

export const tags = ['farm'];