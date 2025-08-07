import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Signer } from "ethers";

describe("FarmCityStaking", function () {
  let farmCity: any;
  let mockUSDT: any;
  let staking: any;
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let ownerAddress: string;
  let user1Address: string;
  let user2Address: string;
  
  const tokenId = 1n;
  const amount = 100n; // 100 tokens
  const rewardAmount = 1000000000n; // 1000 USDT (6 decimals)
  const rewardDuration = 7n * 24n * 60n * 60n; // 7 days in seconds

  beforeEach(async function () {
    // Get signers
    [owner, user1, user2] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();

    // Deploy MockUSDT
    const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
    mockUSDT = await MockUSDTFactory.deploy();

    // Deploy FarmCity
    const FarmCityFactory = await ethers.getContractFactory("FarmCity");
    farmCity = await upgrades.deployProxy(FarmCityFactory, [ownerAddress], {
      initializer: "initialize",
      kind: "uups",
    });

    // Deploy FarmCityStaking
    const FarmCityStakingFactory = await ethers.getContractFactory("FarmCityStaking");
    staking = await upgrades.deployProxy(
      FarmCityStakingFactory,
      [await farmCity.getAddress(), await mockUSDT.getAddress(), ownerAddress],
      {
        initializer: "initialize",
        kind: "uups",
      }
    );

    // Mint tokens to users
    await farmCity.mint(user1Address, tokenId, amount, "0x");
    await farmCity.mint(user2Address, tokenId, amount, "0x");

    // Mint USDT to owner for rewards
    await mockUSDT.mint(ownerAddress, rewardAmount * 10n);

    // Approve staking contract to transfer tokens
    await farmCity.connect(user1).setApprovalForAll(await staking.getAddress(), true);
    await farmCity.connect(user2).setApprovalForAll(await staking.getAddress(), true);
    await mockUSDT.approve(await staking.getAddress(), ethers.MaxUint256);
  });

  describe("Initialization", function () {
    it("Should initialize with correct values", async function () {
      expect(await staking.farmToken()).to.equal(await farmCity.getAddress());
      expect(await staking.rewardToken()).to.equal(await mockUSDT.getAddress());
      expect(await staking.owner()).to.equal(ownerAddress);
    });
  });

  describe("Staking", function () {
    it("Should allow users to stake tokens", async function () {
      await staking.connect(user1).stake(tokenId, amount);
      
      expect(await staking.getStakedAmount(user1Address, tokenId)).to.equal(amount);
      expect(await staking.getTotalStaked(tokenId)).to.equal(amount);
      expect(await farmCity.balanceOf(await staking.getAddress(), tokenId)).to.equal(amount);
    });

    it("Should not allow staking zero amount", async function () {
      await expect(staking.connect(user1).stake(tokenId, 0))
        .to.be.revertedWith("FarmCityStaking: cannot stake 0");
    });

    it("Should allow multiple users to stake", async function () {
      await staking.connect(user1).stake(tokenId, amount / 2n);
      await staking.connect(user2).stake(tokenId, amount / 2n);
      
      expect(await staking.getStakedAmount(user1Address, tokenId)).to.equal(amount / 2n);
      expect(await staking.getStakedAmount(user2Address, tokenId)).to.equal(amount / 2n);
      expect(await staking.getTotalStaked(tokenId)).to.equal(amount);
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(tokenId, amount);
    });

    it("Should allow users to unstake tokens", async function () {
      await staking.connect(user1).unstake(tokenId, amount);
      
      expect(await staking.getStakedAmount(user1Address, tokenId)).to.equal(0);
      expect(await staking.getTotalStaked(tokenId)).to.equal(0);
      expect(await farmCity.balanceOf(user1Address, tokenId)).to.equal(amount);
    });

    it("Should not allow unstaking more than staked", async function () {
      await expect(staking.connect(user1).unstake(tokenId, amount + 1n))
        .to.be.revertedWith("FarmCityStaking: unstake amount exceeds balance");
    });

    it("Should not allow unstaking zero amount", async function () {
      await expect(staking.connect(user1).unstake(tokenId, 0))
        .to.be.revertedWith("FarmCityStaking: cannot unstake 0");
    });
  });

  describe("Rewards", function () {
    beforeEach(async function () {
      // User1 stakes tokens
      await staking.connect(user1).stake(tokenId, amount);
      
      // Add rewards
      await staking.addReward(tokenId, rewardAmount);
    });

    it("Should add rewards correctly", async function () {
      expect(await staking.getRewardRate(tokenId)).to.equal(rewardAmount / rewardDuration);
      expect(await staking.getRewardFinishTime(tokenId)).to.be.gt(await time.latest());
    });

    it("Should calculate earned rewards correctly", async function () {
      // Advance time by 1 day
      await time.increase(24 * 60 * 60);
      
      const expectedReward = rewardAmount / 7n; // 1/7 of total rewards (for 1 day)
      const earnedReward = await staking.earned(user1Address, tokenId);
      
      // Allow for small rounding differences
      expect(earnedReward).to.be.closeTo(expectedReward, ethers.parseUnits("1", 4));
    });

    it("Should allow claiming rewards", async function () {
      // Advance time by 1 day
      await time.increase(24 * 60 * 60);
      
      const beforeBalance = await mockUSDT.balanceOf(user1Address);
      await staking.connect(user1).claimReward(tokenId);
      const afterBalance = await mockUSDT.balanceOf(user1Address);
      
      // User should have received rewards
      expect(afterBalance).to.be.gt(beforeBalance);
      
      // Rewards should be reset
      expect(await staking.earned(user1Address, tokenId)).to.equal(0);
    });

    it("Should handle multiple stakers correctly", async function () {
      // User2 stakes tokens
      await staking.connect(user2).stake(tokenId, amount);
      
      // Advance time by 1 day
      await time.increase(24 * 60 * 60);
      
      // Both users should have earned approximately the same amount
      const earned1 = await staking.earned(user1Address, tokenId);
      const earned2 = await staking.earned(user2Address, tokenId);
      
      // Allow for small rounding differences
      expect(earned1).to.be.closeTo(earned2, ethers.parseUnits("1", 4));
    });

    it("Should handle late staking correctly", async function () {
      // Advance time by 3.5 days (half the reward period)
      await time.increase(3.5 * 24 * 60 * 60);
      
      // User2 stakes tokens halfway through
      await staking.connect(user2).stake(tokenId, amount);
      
      // Advance time to the end of the reward period
      await time.increase(3.5 * 24 * 60 * 60);
      
      // User1 should have earned more than User2
      const earned1 = await staking.earned(user1Address, tokenId);
      const earned2 = await staking.earned(user2Address, tokenId);
      
      expect(earned1).to.be.gt(earned2);
      
      // User1 should have earned approximately 75% of rewards (100% for first half, 50% for second half)
      // User2 should have earned approximately 25% of rewards (0% for first half, 50% for second half)
      expect(earned1).to.be.closeTo(rewardAmount * 3n / 4n, 10000000n);
      expect(earned2).to.be.closeTo(rewardAmount / 4n, 10000000n);
    });
  });

  describe("Admin Functions", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(tokenId, amount);
    });

    it("Should allow owner to set reward duration", async function () {
      const newDuration = 14 * 24 * 60 * 60; // 14 days
      
      // Add rewards first to set initial duration
      await staking.addReward(tokenId, rewardAmount);
      
      // Fast forward to end of reward period
      await time.increase(Number(rewardDuration) + 1);
      
      // Set new duration
      await staking.setRewardDuration(tokenId, BigInt(newDuration));
      
      // Add new rewards
      await staking.addReward(tokenId, rewardAmount);
      
      // Check new finish time
      const finishTime = await staking.getRewardFinishTime(tokenId);
      const currentTime = await time.latest();
      
      expect(finishTime).to.be.closeTo(currentTime + newDuration, 10); // Allow for small timing differences
    });

    it("Should allow owner to pause and unpause", async function () {
      await staking.pause();
      
      // Staking should be paused
      await expect(staking.connect(user2).stake(tokenId, amount))
        .to.be.revertedWith("Pausable: paused");
      
      await staking.unpause();
      
      // Staking should work again
      await staking.connect(user2).stake(tokenId, amount);
      expect(await staking.getStakedAmount(user2Address, tokenId)).to.equal(amount);
    });

    it("Should allow owner to recover ERC20 tokens", async function () {
      // Mint some tokens to the staking contract
      const testAmount = ethers.parseUnits("100", 6);
      await mockUSDT.mint(await staking.getAddress(), testAmount);
      
      // Add rewards to make sure we can't recover reward tokens
      await staking.addReward(tokenId, rewardAmount);
      
      // Try to recover reward tokens (should fail)
      await expect(staking.recoverERC20(await mockUSDT.getAddress(), testAmount))
        .to.be.revertedWith("FarmCityStaking: cannot recover reward token");
      
      // Deploy another token and recover it
      const MockToken = await ethers.getContractFactory("MockUSDT");
      const anotherToken = await MockToken.deploy();
      await anotherToken.mint(await staking.getAddress(), testAmount);
      
      await staking.recoverERC20(await anotherToken.getAddress(), testAmount);
      expect(await anotherToken.balanceOf(ownerAddress)).to.equal(testAmount);
    });
  });

  describe("Exit Function", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(tokenId, amount);
      await staking.addReward(tokenId, rewardAmount);
      await time.increase(24 * 60 * 60); // Advance 1 day
    });

    it("Should allow users to exit (unstake and claim rewards)", async function () {
      const beforeBalance = await mockUSDT.balanceOf(user1Address);
      await staking.connect(user1).exit(tokenId);
      const afterBalance = await mockUSDT.balanceOf(user1Address);
      
      // User should have received rewards
      expect(afterBalance).to.be.gt(beforeBalance);
      
      // User should have unstaked all tokens
      expect(await staking.getStakedAmount(user1Address, tokenId)).to.equal(0);
      expect(await farmCity.balanceOf(user1Address, tokenId)).to.equal(amount);
    });
  });

  describe("Upgradability", function () {
    it("Should allow owner to upgrade the contract", async function () {
      // Deploy a new implementation
      const FarmCityStakingV2 = await ethers.getContractFactory("FarmCityStaking");
      const stakingV2 = await upgrades.upgradeProxy(await staking.getAddress(), FarmCityStakingV2);
      
      // Check that the state is preserved
      const upgradedContract = stakingV2 as any;
      expect(await upgradedContract.farmToken()).to.equal(await farmCity.getAddress());
      expect(await upgradedContract.rewardToken()).to.equal(await mockUSDT.getAddress());
      expect(await upgradedContract.owner()).to.equal(ownerAddress);
    });

    it("Should not allow non-owner to upgrade the contract", async function () {
      const FarmCityStakingV2 = await ethers.getContractFactory("FarmCityStaking", user1);
      
      await expect(
        upgrades.upgradeProxy(await staking.getAddress(), FarmCityStakingV2)
      ).to.be.reverted;
    });
  });
});