import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('AccessControlRegistryAdminned', function () {
  async function deploy() {
    const roleNames = ['deployer', 'randomPerson'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const adminRoleDescription = 'Admin role description';
    const accessControlRegistryAdminnedFactory = await ethers.getContractFactory(
      'AccessControlRegistryAdminned',
      roles.deployer
    );
    const accessControlRegistryAdminned = await accessControlRegistryAdminnedFactory.deploy(
      await accessControlRegistry.getAddress(),
      adminRoleDescription
    );
    return {
      roles,
      accessControlRegistry,
      adminRoleDescription,
      accessControlRegistryAdminned,
    };
  }

  describe('constructor', function () {
    context('AccessControlRegistry address is not zero', function () {
      context('Admin role description is not empty', function () {
        it('constructs', async function () {
          const { accessControlRegistry, adminRoleDescription, accessControlRegistryAdminned } =
            await helpers.loadFixture(deploy);
          expect(await accessControlRegistryAdminned.accessControlRegistry()).to.be.equal(
            await accessControlRegistry.getAddress()
          );
          expect(await accessControlRegistryAdminned.adminRoleDescription()).to.be.equal(adminRoleDescription);
        });
      });
      context('Admin role description is not empty', function () {
        it('reverts', async function () {
          const { roles, accessControlRegistry } = await helpers.loadFixture(deploy);
          const accessControlRegistryAdminnedFactory = await ethers.getContractFactory(
            'AccessControlRegistryAdminned',
            roles.deployer
          );
          await expect(
            accessControlRegistryAdminnedFactory.deploy(await accessControlRegistry.getAddress(), '')
          ).to.be.revertedWith('Admin role description empty');
        });
      });
    });
    context('AccessControlRegistry address is zero', function () {
      it('reverts', async function () {
        const { roles, adminRoleDescription } = await helpers.loadFixture(deploy);
        const accessControlRegistryAdminnedFactory = await ethers.getContractFactory(
          'AccessControlRegistryAdminned',
          roles.deployer
        );
        await expect(
          accessControlRegistryAdminnedFactory.deploy(ethers.ZeroAddress, adminRoleDescription)
        ).to.be.revertedWith('ACR address zero');
      });
    });
  });

  describe('multicall', function () {
    it('multicalls', async function () {
      const { accessControlRegistry, adminRoleDescription, accessControlRegistryAdminned } =
        await helpers.loadFixture(deploy);
      const data = [
        accessControlRegistryAdminned.interface.encodeFunctionData('accessControlRegistry' as any, [] as any),
        accessControlRegistryAdminned.interface.encodeFunctionData('adminRoleDescription' as any, [] as any),
      ];
      const returndata = await accessControlRegistryAdminned.multicall.staticCall(data);
      expect(returndata).to.deep.equal([
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [await accessControlRegistry.getAddress()]),
        ethers.AbiCoder.defaultAbiCoder().encode(['string'], [adminRoleDescription]),
      ]);
    });
  });

  describe('tryMulticall', function () {
    it('tries to multicall', async function () {
      const { accessControlRegistry, adminRoleDescription, accessControlRegistryAdminned } =
        await helpers.loadFixture(deploy);
      const data = [
        accessControlRegistryAdminned.interface.encodeFunctionData('accessControlRegistry' as any, [] as any),
        '0x',
        accessControlRegistryAdminned.interface.encodeFunctionData('adminRoleDescription' as any, [] as any),
      ];
      const { successes, returndata } = await accessControlRegistryAdminned.tryMulticall.staticCall(data);
      expect(successes).to.deep.equal([true, false, true]);
      expect(returndata).to.deep.equal([
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [await accessControlRegistry.getAddress()]),
        '0x',
        ethers.AbiCoder.defaultAbiCoder().encode(['string'], [adminRoleDescription]),
      ]);
    });
  });
});
