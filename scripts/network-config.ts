// Network configuration for USDT addresses and deployment settings
export const NETWORK_CONFIG = {
  // Ethereum networks
  mainnet: {
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    name: "Ethereum Mainnet",
  },
  sepolia: {
    usdt: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06", // Example testnet USDT
    name: "Sepolia Testnet",
  },
  
  // Binance Smart Chain
  bsc: {
    usdt: "0x55d398326f99059fF775485246999027B3197955", // BSC-USD (USDT on BSC)
    name: "Binance Smart Chain",
  },
  bscTestnet: {
    usdt: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd", // BSC testnet USDT
    name: "BSC Testnet",
  },
  
  // Polygon
  polygon: {
    usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT on Polygon
    name: "Polygon Mainnet",
  },
  mumbai: {
    usdt: "0xA02f6adc7926efeBBd59Fd43A84f4E0c0c91e832", // USDT on Mumbai testnet
    name: "Mumbai Testnet",
  },
  
  // Arbitrum
  arbitrum: {
    usdt: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT on Arbitrum
    name: "Arbitrum One",
  },
  arbitrumGoerli: {
    usdt: "0x618DC53E856b1A601119Ce08905f2AcE8e0C9dBF", // USDT on Arbitrum Goerli
    name: "Arbitrum Goerli",
  },
  
  // Optimism
  optimism: {
    usdt: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", // USDT on Optimism
    name: "Optimism",
  },
  
  // Avalanche
  avalanche: {
    usdt: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", // USDT on Avalanche
    name: "Avalanche C-Chain",
  },
  fuji: {
    usdt: "0x1d308089a2D1Ced3f1Ce36B1FcaF815b07217be3", // USDT on Fuji testnet
    name: "Avalanche Fuji Testnet",
  },
  
  // Local development
  localhost: {
    usdt: null, // Will use MockUSDT
    name: "Localhost",
  },
  hardhat: {
    usdt: null, // Will use MockUSDT
    name: "Hardhat Network",
  },
};

export function getUSDTAddress(networkName: string): string | null {
  const config = NETWORK_CONFIG[networkName as keyof typeof NETWORK_CONFIG];
  return config?.usdt || null;
}

export function getNetworkName(networkName: string): string {
  const config = NETWORK_CONFIG[networkName as keyof typeof NETWORK_CONFIG];
  return config?.name || networkName;
}

export function isLocalNetwork(networkName: string): boolean {
  return networkName === "localhost" || networkName === "hardhat";
}