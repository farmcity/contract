import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Starting local deployment...\n");

  const [deployer, user] = await ethers.getSigners();
  
  console.log("📋 Deployment Info:");
  console.log("Deployer address:", deployer.address);
  console.log("User address:", user.address);
  console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("User balance:", ethers.formatEther(await ethers.provider.getBalance(user.address)), "ETH\n");

  console.log("⏳ Running hardhat-deploy...");
  
  // This will run all deployment scripts
  const { spawn } = require('child_process');
  const deployProcess = spawn('npx', ['hardhat', 'deploy', '--network', 'localhost'], {
    stdio: 'inherit',
    shell: true
  });

  deployProcess.on('close', (code: number) => {
    if (code === 0) {
      console.log("\n✅ Deployment completed successfully!");
      console.log("\n📄 Contract addresses can be found in deployments/localhost/");
      console.log("\n🔧 Available commands:");
      console.log("- npx hardhat deploy --network localhost");
      console.log("- npx hardhat deploy --tags MockUSDT --network localhost");
      console.log("- npx hardhat deploy --tags FarmCity --network localhost");
      console.log("- npx hardhat deploy --tags FarmCityStaking --network localhost");
    } else {
      console.error(`\n❌ Deployment failed with code ${code}`);
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });