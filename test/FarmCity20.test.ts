import { deployments, ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

describe('FarmCity Basic Test', () => {
  let fCity: any;
  let instance: any;
  let admin: any;
  let adr1: any;
  let adr2: any;
  let usdc: Contract;

  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    admin = accounts[0];
    adr1 = accounts[1];
    adr2 = accounts[2];

    const ERC20Mock = await ethers.getContractFactory('USDCoin');
    usdc = await ERC20Mock.deploy(admin.address);

    fCity = await ethers.getContractFactory('FarmCity20');
    instance = await upgrades.deployProxy(fCity, [accounts[0].address, usdc.target], { kind: 'uups' });
    await instance.waitForDeployment();

    await usdc.transfer(adr1.address, ethers.parseUnits('5000', 'mwei'));
    await usdc.transfer(adr2.address, ethers.parseUnits('5000', 'mwei'));
  });

  describe('constructor', async () => {
    it('Check FarmCity basic setting, name symbol and totalSupply', async () => {
      const name = await instance.name();
      const symbol = await instance.symbol();
      const totalSupply = await instance.getTotalSupply();

      expect(name).to.equal('FarmCity');
      expect(symbol).to.equal('FCITY');
      expect(totalSupply).to.equal(40000);
    });
  });

  describe('purchaseFarm', function () {
    it('should allow purchase when sale is started', async function () {
      const startTime = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      await instance.setMintingStartTime(startTime);

      await usdc.connect(adr1).approve(instance.target, ethers.parseUnits('300', 'mwei'));

      await expect(instance.connect(adr1).purchaseFarm(1))
        .to.emit(instance, 'Transfer')
        .withArgs(ethers.ZeroAddress, adr1.address, 1);

      expect(await instance.ownerOf(1)).to.equal(adr1.address);
    });

    it('should revert purchase when sale is not started', async function () {
      await usdc.connect(adr1).approve(instance.target, ethers.parseUnits('300', 'mwei'));

      await expect(instance.connect(adr1).purchaseFarm(1)).to.be.revertedWithCustomError(
        instance,
        'SaleIsntStarted',
      );
    });
  });

  describe('batchPurchaseFarm', function () {
    it('should allow batch purchase when sale is started', async function () {
      const startTime = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      await instance.setMintingStartTime(startTime);

      await usdc.connect(adr1).approve(instance.target, ethers.parseUnits('600', 'mwei'));

      await expect(instance.connect(adr1).batchPurchaseFarm([2, 3]))
        .to.emit(instance, 'Transfer')
        .withArgs(ethers.ZeroAddress, adr1.address, 2)
        .and.to.emit(instance, 'Transfer')
        .withArgs(ethers.ZeroAddress, adr1.address, 3);

      const owner2 = await instance.ownerOf(2);
      const owner3 = await instance.ownerOf(3);
      expect(owner2).to.equal(adr1.address);
      expect(owner3).to.equal(adr1.address);
    });

    it('should revert batch purchase when sale is not started', async function () {
      await usdc.connect(adr1).approve(instance.target, ethers.parseUnits('600', 'mwei'));

      await expect(instance.connect(adr1).batchPurchaseFarm([2, 3])).to.be.revertedWithCustomError(
        instance,
        'SaleIsntStarted',
      );
    });
  });

  describe('adminBatchMint', function () {
    it('should allow admin to batch mint', async function () {
      await expect(instance.adminBatchMint([4, 5]))
        .to.emit(instance, 'Transfer')
        .withArgs(ethers.ZeroAddress, admin.address, 4)
        .and.to.emit(instance, 'Transfer')
        .withArgs(ethers.ZeroAddress, admin.address, 5);

      const owner4 = await instance.ownerOf(4);
      const owner5 = await instance.ownerOf(5);
      expect(owner4).to.equal(admin.address);
      expect(owner5).to.equal(admin.address);
    });

    it('should revert adminBatchMint when not owner', async function () {
      await expect(instance.connect(adr1).adminBatchMint([1])).to.be.revertedWithCustomError(instance, 'OwnableUnauthorizedAccount');
    });
  });

  describe('Withdraw', function () {
    it("Should allow withdraw by admin", async function () {
      const startTime = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      await instance.setMintingStartTime(startTime);

      await usdc.connect(adr1).approve(instance.target, ethers.parseUnits('300', 'mwei'));
      await instance.connect(adr1).purchaseFarm(1);

      const contractBalance = await usdc.balanceOf(instance.target);
      expect(contractBalance).to.equal(ethers.parseUnits('300', 'mwei'));

      const initialOwnerBalance = await usdc.balanceOf(admin.address);

      const tx = await instance.connect(admin).withdraw();
      await tx.wait();

      const finalOwnerBalance = await usdc.balanceOf(admin.address);
      const contractFinalBalance = await usdc.balanceOf(instance.target);

      expect(contractFinalBalance).to.equal(0);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance + contractBalance);
    });
  });
});
