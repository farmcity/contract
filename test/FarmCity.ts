import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { FarmCity } from "../typechain-types";

describe("FarmCity", function () {
  let farmCity: FarmCity;
  let usdt: any;
  let owner: Signer, user: Signer, other: Signer;
  let ownerAddr: string, userAddr: string, otherAddr: string;

  const initialMintPrice = ethers.parseUnits("300", 6); // 300 USDT (6 decimals)

  beforeEach(async function () {
    [owner, user, other] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    userAddr = await user.getAddress();
    otherAddr = await other.getAddress();

    // Deploy a mock USDT token (ERC20)
    const ERC20Mock = await ethers.getContractFactory("MockUSDT");
    usdt = await ERC20Mock.deploy();
    await usdt.mint(userAddr, ethers.parseUnits("10000", 6));

    // Deploy FarmCity as UUPS proxy
    const FarmCity = await ethers.getContractFactory("FarmCity");
    farmCity = await upgrades.deployProxy(FarmCity, [ownerAddr], { kind: "uups" });
    await farmCity.waitForDeployment();
  });

  it("should initialize with correct owner and mint price", async function () {
    expect(await farmCity.owner()).to.equal(ownerAddr);
    expect(await farmCity.mintPrice()).to.equal(initialMintPrice);
  });

  it("should initialize with default valid token IDs and max supplies", async function () {
    // Check that token IDs 1-4 are valid
    expect(await farmCity.isValidTokenId(1)).to.be.true;
    expect(await farmCity.isValidTokenId(2)).to.be.true;
    expect(await farmCity.isValidTokenId(3)).to.be.true;
    expect(await farmCity.isValidTokenId(4)).to.be.true;
    
    // Check max supplies
    expect(await farmCity.maxSupplyPerToken(1)).to.equal(1000);
    expect(await farmCity.maxSupplyPerToken(2)).to.equal(500);
    expect(await farmCity.maxSupplyPerToken(3)).to.equal(2000);
    expect(await farmCity.maxSupplyPerToken(4)).to.equal(1500);
    
    // Check that token ID 5 is not valid
    expect(await farmCity.isValidTokenId(5)).to.be.false;
  });

  it("should allow owner to set USDT token address", async function () {
    await expect(farmCity.connect(owner).setUSDTToken(usdt.target))
      .to.emit(farmCity, "USDTAddressUpdated").withArgs(usdt.target);
    expect(await farmCity.usdtToken()).to.equal(usdt.target);
  });

  it("should revert if non-owner tries to set USDT token", async function () {
    await expect(farmCity.connect(user).setUSDTToken(usdt.target)).to.be.revertedWithCustomError(farmCity, "OwnableUnauthorizedAccount");
  });

  it("should allow owner to set mint price", async function () {
    await expect(farmCity.connect(owner).setMintPrice(12345))
      .to.emit(farmCity, "MintPriceUpdated").withArgs(12345);
    expect(await farmCity.mintPrice()).to.equal(12345);
  });

  it("should revert if non-owner tries to set mint price", async function () {
    await expect(farmCity.connect(user).setMintPrice(1)).to.be.revertedWithCustomError(farmCity, "OwnableUnauthorizedAccount");
  });

  it("should allow owner to mint and mintBatch", async function () {
    await expect(farmCity.connect(owner).mint(userAddr, 1, 10, "0x"))
      .to.emit(farmCity, "TransferSingle");
    await expect(farmCity.connect(owner).mintBatch(userAddr, [2,3], [5,5], "0x"))
      .to.emit(farmCity, "TransferBatch");
  });

  it("should revert if non-owner tries to mint", async function () {
    await expect(farmCity.connect(user).mint(userAddr, 1, 1, "0x")).to.be.revertedWithCustomError(farmCity, "OwnableUnauthorizedAccount");
  });

  it("should allow owner to pause and unpause", async function () {
    await farmCity.connect(owner).pause();
    expect(await farmCity.paused()).to.be.true;
    await farmCity.connect(owner).unpause();
    expect(await farmCity.paused()).to.be.false;
  });

  it("should revert if non-owner tries to pause/unpause", async function () {
    await expect(farmCity.connect(user).pause()).to.be.revertedWithCustomError(farmCity, "OwnableUnauthorizedAccount");
    await farmCity.connect(owner).pause();
    await expect(farmCity.connect(user).unpause()).to.be.revertedWithCustomError(farmCity, "OwnableUnauthorizedAccount");
  });

  describe("mintPublic", function () {
    beforeEach(async function () {
      await farmCity.connect(owner).setUSDTToken(usdt.target);
      await farmCity.connect(owner).setMintPrice(initialMintPrice);
    });

    it("should revert if USDT token not set", async function () {
      const FarmCity = await ethers.getContractFactory("FarmCity");
      const farmCity2 = await upgrades.deployProxy(FarmCity, [ownerAddr], { kind: "uups" });
      await expect(farmCity2.connect(user).mintPublic(1, 1, "0x")).to.be.revertedWith("USDT token not set");
    });

    it("should revert if amount is zero", async function () {
      await expect(farmCity.connect(user).mintPublic(1, 0, "0x")).to.be.revertedWith("Amount must be greater than 0");
    });

    it("should revert if user has not approved enough USDT", async function () {
      await expect(farmCity.connect(user).mintPublic(1, 1, "0x")).to.be.revertedWithCustomError(usdt, "ERC20InsufficientAllowance");
    });

    it("should mint tokens and emit event when user pays USDT", async function () {
      await usdt.connect(user).approve(farmCity.target, initialMintPrice * 2n);
      await expect(farmCity.connect(user).mintPublic(1, 2, "0x"))
        .to.emit(farmCity, "TokensMinted").withArgs(userAddr, 1, 2, initialMintPrice * 2n);
      expect(await farmCity.balanceOf(userAddr, 1)).to.equal(2);
      expect(await usdt.balanceOf(farmCity.target)).to.equal(initialMintPrice * 2n);
    });

    it("should revert if contract is paused", async function () {
      await farmCity.connect(owner).pause();
      await usdt.connect(user).approve(farmCity.target, initialMintPrice);
      await expect(farmCity.connect(user).mintPublic(1, 1, "0x")).to.be.revertedWithCustomError(farmCity, "EnforcedPause");
    });
  });

  describe("withdrawUSDT", function () {
    beforeEach(async function () {
      await farmCity.connect(owner).setUSDTToken(usdt.target);
      await usdt.connect(user).approve(farmCity.target, initialMintPrice);
      await farmCity.connect(user).mintPublic(1, 1, "0x");
    });

    it("should allow owner to withdraw USDT", async function () {
      const before = await usdt.balanceOf(ownerAddr);
      await expect(farmCity.connect(owner).withdrawUSDT(ownerAddr, initialMintPrice))
        .to.not.be.reverted;
      expect(await usdt.balanceOf(ownerAddr)).to.equal(before + initialMintPrice);
    });

    it("should revert if non-owner tries to withdraw", async function () {
      await expect(farmCity.connect(user).withdrawUSDT(userAddr, initialMintPrice)).to.be.revertedWithCustomError(farmCity, "OwnableUnauthorizedAccount");
    });

    it("should revert if USDT token not set", async function () {
      const FarmCity = await ethers.getContractFactory("FarmCity");
      const farmCity2 = await upgrades.deployProxy(FarmCity, [ownerAddr], { kind: "uups" });
      await expect(farmCity2.connect(owner).withdrawUSDT(ownerAddr, 1)).to.be.revertedWith("USDT token not set");
    });

    it("should revert if recipient is zero address", async function () {
      await expect(farmCity.connect(owner).withdrawUSDT(ethers.ZeroAddress, 1)).to.be.revertedWith("Invalid recipient address");
    });
  });

  it("should allow owner to set URI", async function () {
    await expect(farmCity.connect(owner).setURI("ipfs://test/{id}.json")).to.not.be.reverted;
    expect(await farmCity.uri(1)).to.include("ipfs://test/");
  });

  describe("Token ID Management", function () {
    describe("addValidTokenId", function () {
      it("should allow owner to add new valid token ID", async function () {
        await expect(farmCity.connect(owner).addValidTokenId(5, 1000))
          .to.emit(farmCity, "TokenIdAdded").withArgs(5, 1000);
        
        expect(await farmCity.isValidTokenId(5)).to.be.true;
        expect(await farmCity.maxSupplyPerToken(5)).to.equal(1000);
      });

      it("should revert if non-owner tries to add token ID", async function () {
        await expect(farmCity.connect(user).addValidTokenId(5, 1000))
          .to.be.revertedWithCustomError(farmCity, "OwnableUnauthorizedAccount");
      });

      it("should revert if token ID already exists", async function () {
        await expect(farmCity.connect(owner).addValidTokenId(1, 1000))
          .to.be.revertedWithCustomError(farmCity, "TokenIdAlreadyExists").withArgs(1);
      });

      it("should revert if max supply is zero", async function () {
        await expect(farmCity.connect(owner).addValidTokenId(5, 0))
          .to.be.revertedWithCustomError(farmCity, "InvalidMaxSupply").withArgs(0);
      });
    });

    describe("removeValidTokenId", function () {
      it("should allow owner to remove valid token ID", async function () {
        await expect(farmCity.connect(owner).removeValidTokenId(1))
          .to.emit(farmCity, "TokenIdRemoved").withArgs(1);
        
        expect(await farmCity.isValidTokenId(1)).to.be.false;
        expect(await farmCity.maxSupplyPerToken(1)).to.equal(0);
      });

      it("should revert if non-owner tries to remove token ID", async function () {
        await expect(farmCity.connect(user).removeValidTokenId(1))
          .to.be.revertedWithCustomError(farmCity, "OwnableUnauthorizedAccount");
      });

      it("should revert if token ID does not exist", async function () {
        await expect(farmCity.connect(owner).removeValidTokenId(99))
          .to.be.revertedWithCustomError(farmCity, "InvalidTokenId").withArgs(99);
      });
    });

    describe("updateMaxSupply", function () {
      it("should allow owner to update max supply", async function () {
        await expect(farmCity.connect(owner).updateMaxSupply(1, 2000))
          .to.emit(farmCity, "MaxSupplyUpdated").withArgs(1, 2000);
        
        expect(await farmCity.maxSupplyPerToken(1)).to.equal(2000);
      });

      it("should revert if non-owner tries to update max supply", async function () {
        await expect(farmCity.connect(user).updateMaxSupply(1, 2000))
          .to.be.revertedWithCustomError(farmCity, "OwnableUnauthorizedAccount");
      });

      it("should revert if token ID does not exist", async function () {
        await expect(farmCity.connect(owner).updateMaxSupply(99, 2000))
          .to.be.revertedWithCustomError(farmCity, "InvalidTokenId").withArgs(99);
      });

      it("should revert if new max supply is zero", async function () {
        await expect(farmCity.connect(owner).updateMaxSupply(1, 0))
          .to.be.revertedWithCustomError(farmCity, "InvalidMaxSupply").withArgs(0);
      });

      it("should revert if new max supply is less than current supply", async function () {
        // First mint some tokens
        await farmCity.connect(owner).mint(userAddr, 1, 50, "0x");
        
        // Try to set max supply lower than current supply
        await expect(farmCity.connect(owner).updateMaxSupply(1, 30))
          .to.be.revertedWithCustomError(farmCity, "ExceedsMaxSupply").withArgs(1, 30, 50);
      });
    });

    describe("getAvailableSupply", function () {
      it("should return correct available supply", async function () {
        expect(await farmCity.getAvailableSupply(1)).to.equal(1000); // Initial max supply
        
        // Mint some tokens
        await farmCity.connect(owner).mint(userAddr, 1, 100, "0x");
        expect(await farmCity.getAvailableSupply(1)).to.equal(900);
      });

      it("should return 0 for invalid token ID", async function () {
        expect(await farmCity.getAvailableSupply(99)).to.equal(0);
      });

      it("should return 0 when max supply reached", async function () {
        // Mint up to max supply for token ID 2 (max 500)
        await farmCity.connect(owner).mint(userAddr, 2, 500, "0x");
        expect(await farmCity.getAvailableSupply(2)).to.equal(0);
      });
    });
  });

  describe("mintPublic with Token ID Validation", function () {
    beforeEach(async function () {
      await farmCity.connect(owner).setUSDTToken(usdt.target);
      await farmCity.connect(owner).setMintPrice(initialMintPrice);
    });

    it("should revert when trying to mint invalid token ID", async function () {
      await usdt.connect(user).approve(farmCity.target, initialMintPrice);
      await expect(farmCity.connect(user).mintPublic(99, 1, "0x"))
        .to.be.revertedWithCustomError(farmCity, "InvalidTokenId").withArgs(99);
    });

    it("should revert when trying to mint more than max supply", async function () {
      await usdt.connect(user).approve(farmCity.target, initialMintPrice * 1001n);
      
      // Try to mint 1001 tokens for token ID 1 (max 1000)
      await expect(farmCity.connect(user).mintPublic(1, 1001, "0x"))
        .to.be.revertedWithCustomError(farmCity, "ExceedsMaxSupply").withArgs(1, 1001, 1000);
    });

    it("should revert when trying to mint beyond remaining supply", async function () {
      // Ensure user has enough USDT
      await usdt.mint(userAddr, initialMintPrice * 1001n);
      
      // First mint 999 tokens
      await usdt.connect(user).approve(farmCity.target, initialMintPrice * 1000n);
      await farmCity.connect(user).mintPublic(1, 999, "0x");
      
      // Try to mint 2 more tokens (only 1 remaining)
      await usdt.connect(user).approve(farmCity.target, initialMintPrice * 2n);
      await expect(farmCity.connect(user).mintPublic(1, 2, "0x"))
        .to.be.revertedWithCustomError(farmCity, "ExceedsMaxSupply").withArgs(1, 2, 1);
    });

    it("should successfully mint up to max supply", async function () {
      // Ensure user has enough USDT
      await usdt.mint(userAddr, initialMintPrice * 500n);
      
      // Mint exactly the max supply for token ID 2 (500 tokens)
      await usdt.connect(user).approve(farmCity.target, initialMintPrice * 500n);
      
      await expect(farmCity.connect(user).mintPublic(2, 500, "0x"))
        .to.emit(farmCity, "TokensMinted").withArgs(userAddr, 2, 500, initialMintPrice * 500n);
      
      expect(await farmCity.balanceOf(userAddr, 2)).to.equal(500);
      expect(await farmCity["totalSupply(uint256)"](2)).to.equal(500);
      expect(await farmCity.getAvailableSupply(2)).to.equal(0);
    });

    it("should allow minting different token IDs with different max supplies", async function () {
      await usdt.connect(user).approve(farmCity.target, initialMintPrice * 3n);
      
      // Mint different amounts of different token IDs
      await farmCity.connect(user).mintPublic(1, 1, "0x"); // Golden Poultry Ranch
      await farmCity.connect(user).mintPublic(3, 1, "0x"); // Tropical Coconut Grove  
      await farmCity.connect(user).mintPublic(4, 1, "0x"); // Heritage Rice Paddies
      
      expect(await farmCity.balanceOf(userAddr, 1)).to.equal(1);
      expect(await farmCity.balanceOf(userAddr, 3)).to.equal(1);
      expect(await farmCity.balanceOf(userAddr, 4)).to.equal(1);
    });

    it("should prevent minting after token ID is removed", async function () {
      // Remove token ID 1
      await farmCity.connect(owner).removeValidTokenId(1);
      
      await usdt.connect(user).approve(farmCity.target, initialMintPrice);
      await expect(farmCity.connect(user).mintPublic(1, 1, "0x"))
        .to.be.revertedWithCustomError(farmCity, "InvalidTokenId").withArgs(1);
    });

    it("should allow minting after max supply is increased", async function () {
      // Ensure user has enough USDT
      await usdt.mint(userAddr, initialMintPrice * 1100n);
      
      // First, mint to near max supply
      await usdt.connect(user).approve(farmCity.target, initialMintPrice * 1000n);
      await farmCity.connect(user).mintPublic(1, 1000, "0x");
      
      // Verify we can't mint more
      await usdt.connect(user).approve(farmCity.target, initialMintPrice * 1n);
      await expect(farmCity.connect(user).mintPublic(1, 1, "0x"))
        .to.be.revertedWithCustomError(farmCity, "ExceedsMaxSupply");
      
      // Increase max supply
      await farmCity.connect(owner).updateMaxSupply(1, 1500);
      
      // Now we should be able to mint more
      await usdt.connect(user).approve(farmCity.target, initialMintPrice * 100n);
      await expect(farmCity.connect(user).mintPublic(1, 100, "0x"))
        .to.emit(farmCity, "TokensMinted");
      
      expect(await farmCity["totalSupply(uint256)"](1)).to.equal(1100);
    });
  });

  // Add more tests for burn, supply, etc. as needed
});