import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hardhat from 'hardhat';

const { ethers } = hardhat;

const COMP_ADDRESS = '0xc00e94Cb662C3520282E6f5717214004A7f26888';

async function deploy() {
  const roleNames = ['deployer', 'owner', 'user', 'otherUser', 'delegateeA', 'delegateeB'] as const;
  const accounts = await ethers.getSigners();
  const roles = roleNames.reduce(
    (acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    },
    {} as Record<(typeof roleNames)[number], HardhatEthersSigner>
  );

  const mockCompFactory = await ethers.getContractFactory('MockComp', roles.deployer);
  const mockCompImplementation = await mockCompFactory.deploy(roles.deployer.address);
  const runtimeCode = await ethers.provider.getCode(await mockCompImplementation.getAddress());
  await ethers.provider.send('hardhat_setCode', [COMP_ADDRESS, runtimeCode]);

  const mockComp = await ethers.getContractAt('MockComp', COMP_ADDRESS, roles.deployer);

  const humpyCompFactory = await ethers.getContractFactory('HumpyComp', roles.deployer);
  const humpyComp = await humpyCompFactory.deploy(roles.owner.address, roles.delegateeA.address);

  const mintedAmount = ethers.parseEther('100');
  await mockComp.mint(roles.user.address, mintedAmount);

  return { roles, mockComp, humpyComp, mintedAmount, humpyCompFactory };
}

describe('HumpyComp', function () {
  describe('constructor', function () {
    it('sets owner, metadata, underlying and initial delegation', async function () {
      const { roles, humpyComp, mockComp } = await helpers.loadFixture(deploy);

      expect(await humpyComp.owner()).to.equal(roles.owner.address);
      expect(await humpyComp.decimals()).to.equal(18);
      expect(await humpyComp.underlying()).to.equal(COMP_ADDRESS);
      expect(await humpyComp.delegatee()).to.equal(roles.delegateeA.address);
      expect(await mockComp.delegates(await humpyComp.getAddress())).to.equal(roles.delegateeA.address);
    });

    it('reverts if owner is zero', async function () {
      const { roles, humpyCompFactory } = await helpers.loadFixture(deploy);
      await expect(humpyCompFactory.deploy(ethers.ZeroAddress, roles.delegateeA.address))
        .to.be.revertedWithCustomError(humpyCompFactory, 'OwnableInvalidOwner')
        .withArgs(ethers.ZeroAddress);
    });
  });

  describe('deposit/withdraw helpers', function () {
    it('deposit wraps 1:1', async function () {
      const { roles, humpyComp, mockComp, mintedAmount } = await helpers.loadFixture(deploy);
      const amount = ethers.parseEther('25');

      await mockComp.connect(roles.user).approve(await humpyComp.getAddress(), amount);
      await expect(humpyComp.connect(roles.user).deposit(amount))
        .to.emit(humpyComp, 'Transfer')
        .withArgs(ethers.ZeroAddress, roles.user.address, amount);

      expect(await humpyComp.balanceOf(roles.user.address)).to.equal(amount);
      expect(await mockComp.balanceOf(await humpyComp.getAddress())).to.equal(amount);
      expect(await mockComp.balanceOf(roles.user.address)).to.equal(mintedAmount - amount);
    });

    it('withdraw unwraps 1:1', async function () {
      const { roles, humpyComp, mockComp, mintedAmount } = await helpers.loadFixture(deploy);
      const amount = ethers.parseEther('30');

      await mockComp.connect(roles.user).approve(await humpyComp.getAddress(), amount);
      await humpyComp.connect(roles.user).deposit(amount);

      expect(await humpyComp.balanceOf(roles.user.address)).to.equal(amount);
      expect(await mockComp.balanceOf(roles.user.address)).to.equal(mintedAmount - amount);

      await expect(humpyComp.connect(roles.user).withdraw(amount))
        .to.emit(humpyComp, 'Transfer')
        .withArgs(roles.user.address, ethers.ZeroAddress, amount);

      expect(await humpyComp.balanceOf(roles.user.address)).to.equal(0);
      expect(await mockComp.balanceOf(await humpyComp.getAddress())).to.equal(0);
      expect(await mockComp.balanceOf(roles.user.address)).to.equal(mintedAmount);
    });

    it('reverts deposit when allowance is insufficient', async function () {
      const { roles, humpyComp } = await helpers.loadFixture(deploy);
      await expect(humpyComp.connect(roles.user).deposit(1)).to.be.reverted;
    });

    it('reverts withdraw when wrapped balance is insufficient', async function () {
      const { roles, humpyComp } = await helpers.loadFixture(deploy);
      await expect(humpyComp.connect(roles.user).withdraw(1)).to.be.reverted;
    });
  });

  describe('erc20Wrapper inherited paths', function () {
    it('depositFor mints to receiver and withdrawTo sends underlying to receiver', async function () {
      const { roles, humpyComp, mockComp, mintedAmount } = await helpers.loadFixture(deploy);
      const amount = ethers.parseEther('10');

      await mockComp.connect(roles.user).approve(await humpyComp.getAddress(), amount);
      await humpyComp.connect(roles.user).depositFor(roles.otherUser.address, amount);
      expect(await humpyComp.balanceOf(roles.otherUser.address)).to.equal(amount);
      expect(await mockComp.balanceOf(roles.user.address)).to.equal(mintedAmount - amount);

      await humpyComp.connect(roles.otherUser).withdrawTo(roles.user.address, amount);
      expect(await humpyComp.balanceOf(roles.otherUser.address)).to.equal(0);
      expect(await mockComp.balanceOf(roles.user.address)).to.equal(mintedAmount);
    });

    it('reverts depositFor when receiver is wrapper itself', async function () {
      const { roles, humpyComp, mockComp } = await helpers.loadFixture(deploy);
      const amount = ethers.parseEther('1');
      await mockComp.connect(roles.user).approve(await humpyComp.getAddress(), amount);

      await expect(humpyComp.connect(roles.user).depositFor(await humpyComp.getAddress(), amount))
        .to.be.revertedWithCustomError(humpyComp, 'ERC20InvalidReceiver')
        .withArgs(await humpyComp.getAddress());
    });

    it('reverts withdrawTo when receiver is wrapper itself', async function () {
      const { roles, humpyComp, mockComp } = await helpers.loadFixture(deploy);
      const amount = ethers.parseEther('5');
      await mockComp.connect(roles.user).approve(await humpyComp.getAddress(), amount);
      await humpyComp.connect(roles.user).deposit(amount);

      await expect(humpyComp.connect(roles.user).withdrawTo(await humpyComp.getAddress(), amount))
        .to.be.revertedWithCustomError(humpyComp, 'ERC20InvalidReceiver')
        .withArgs(await humpyComp.getAddress());
    });
  });

  describe('delegation', function () {
    it('owner can update delegatee', async function () {
      const { roles, humpyComp, mockComp } = await helpers.loadFixture(deploy);

      await humpyComp.connect(roles.owner).setDelegatee(roles.delegateeB.address);
      expect(await mockComp.delegates(await humpyComp.getAddress())).to.equal(roles.delegateeB.address);
      expect(await humpyComp.delegatee()).to.equal(roles.delegateeB.address);
    });

    it('non-owner cannot update delegatee', async function () {
      const { roles, humpyComp } = await helpers.loadFixture(deploy);

      await expect(humpyComp.connect(roles.user).setDelegatee(roles.delegateeB.address))
        .to.be.revertedWithCustomError(humpyComp, 'OwnableUnauthorizedAccount')
        .withArgs(roles.user.address);
    });

    it('keeps delegation on wrapper address across wrap and unwrap lifecycle', async function () {
      const { roles, humpyComp, mockComp } = await helpers.loadFixture(deploy);
      const amount = ethers.parseEther('40');

      await mockComp.connect(roles.user).approve(await humpyComp.getAddress(), amount);
      await humpyComp.connect(roles.user).deposit(amount);

      expect(await mockComp.balanceOf(await humpyComp.getAddress())).to.equal(amount);
      expect(await mockComp.getCurrentVotes(roles.delegateeA.address)).to.equal(amount);
      expect(await mockComp.delegates(await humpyComp.getAddress())).to.equal(roles.delegateeA.address);

      await humpyComp.connect(roles.owner).setDelegatee(roles.delegateeB.address);
      expect(await mockComp.delegates(await humpyComp.getAddress())).to.equal(roles.delegateeB.address);

      await humpyComp.connect(roles.user).withdraw(amount);

      expect(await mockComp.balanceOf(await humpyComp.getAddress())).to.equal(0);
      expect(await mockComp.delegates(await humpyComp.getAddress())).to.equal(roles.delegateeB.address);
      expect(await humpyComp.delegatee()).to.equal(roles.delegateeB.address);
      expect(await mockComp.getCurrentVotes(roles.delegateeA.address)).to.equal(0);
      expect(await mockComp.getCurrentVotes(roles.delegateeB.address)).to.equal(0);
    });

    it('changing delegatee updates votes correctly', async function () {
      const { roles, humpyComp, mockComp } = await helpers.loadFixture(deploy);
      const amount = ethers.parseEther('40');

      await mockComp.connect(roles.user).approve(await humpyComp.getAddress(), amount);
      await humpyComp.connect(roles.user).deposit(amount);

      expect(await mockComp.balanceOf(await humpyComp.getAddress())).to.equal(amount);
      expect(await mockComp.getCurrentVotes(roles.delegateeA.address)).to.equal(amount);
      expect(await mockComp.delegates(await humpyComp.getAddress())).to.equal(roles.delegateeA.address);

      await humpyComp.connect(roles.owner).setDelegatee(roles.delegateeB.address);

      expect(await mockComp.delegates(await humpyComp.getAddress())).to.equal(roles.delegateeB.address);
      expect(await humpyComp.delegatee()).to.equal(roles.delegateeB.address);
      expect(await mockComp.getCurrentVotes(roles.delegateeA.address)).to.equal(0);
      expect(await mockComp.getCurrentVotes(roles.delegateeB.address)).to.equal(amount);
    });
  });

  describe('Ownable2Step', function () {
    it('transfers ownership in two steps and new owner can set delegatee', async function () {
      const { roles, humpyComp, mockComp } = await helpers.loadFixture(deploy);

      await humpyComp.connect(roles.owner).transferOwnership(roles.otherUser.address);
      expect(await humpyComp.pendingOwner()).to.equal(roles.otherUser.address);
      expect(await humpyComp.owner()).to.equal(roles.owner.address);

      await humpyComp.connect(roles.otherUser).acceptOwnership();
      expect(await humpyComp.owner()).to.equal(roles.otherUser.address);

      await humpyComp.connect(roles.otherUser).setDelegatee(roles.delegateeB.address);
      expect(await mockComp.delegates(await humpyComp.getAddress())).to.equal(roles.delegateeB.address);
    });

    it('rejects acceptOwnership from non-pending owner', async function () {
      const { roles, humpyComp } = await helpers.loadFixture(deploy);

      await humpyComp.connect(roles.owner).transferOwnership(roles.otherUser.address);
      await expect(humpyComp.connect(roles.user).acceptOwnership())
        .to.be.revertedWithCustomError(humpyComp, 'OwnableUnauthorizedAccount')
        .withArgs(roles.user.address);
    });
  });
});
