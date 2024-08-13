import "@typechain/hardhat";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-chai-matchers"
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-ethers";
import "hardhat-deploy";
// import { HardhatUserConfig } from "hardhat/config";

require('dotenv').config();

const config = {
  solidity: "0.8.20",
  namedAccounts: {
    deployer: {
      default: 0
    }
  },
  networks: {
    // hardhat: {
    //   gas: 2100000,
    //   gasPrice: 8000000000,
    // }
    "lisk-sepolia": {
      url: 'https://rpc.sepolia-api.lisk.com',
      accounts: [process.env.WALLET_KEY as string],
      gasPrice: 1300000,
    }
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v6',
    alwaysGenerateOverloads: false, // should overloads with full signatures like deposit(uint256) be generated always, even if there are no overloads?
    externalArtifacts: ['externalArtifacts/*.json'], // optional array of glob patterns with external artifacts to process (for example external libs from node_modules)
    dontOverrideCompile: false // defaults to false
  }
};

export default config;
