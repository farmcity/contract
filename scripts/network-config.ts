// Network configuration for USDT addresses and deployment settings
export const NETWORK_CONFIG = {
  // Ethereum networks
  mainnet: {
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    name: "Ethereum Mainnet",
  },

  // Binance Smart Chain
  bsc: {
    usdt: "0x55d398326f99059fF775485246999027B3197955", // BSC-USD (USDT on BSC)
    name: "Binance Smart Chain",
  },

  // Optimism
  optimism: {
    usdt: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", // USDT on Optimism
    name: "Optimism",
  },

  // Lisk
  lisk: {
    usdt: "0x05D032ac25d322df992303dCa074EE7392C117b9", // Placeholder, Lisk does not have USDT
    name: "Lisk Mainnet",
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