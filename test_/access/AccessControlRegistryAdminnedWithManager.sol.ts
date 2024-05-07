import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('AccessControlRegistryAdminnedWithManager', function () {
  async function deploy() {
    const roleNames = ['deployer', 'manager'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const adminRoleDescription = 'Admin role description';
    const accessControlRegistryAdminnedWithManagerFactory = await ethers.getContractFactory(
      'AccessControlRegistryAdminnedWithManager',
      roles.deployer
    );
    const accessControlRegistryAdminnedWithManager = await accessControlRegistryAdminnedWithManagerFactory.deploy(
      await accessControlRegistry.getAddress(),
      adminRoleDescription,
      roles.manager!.address
    );
    return {
      roles,
      accessControlRegistry,
      adminRoleDescription,
      accessControlRegistryAdminnedWithManager,
    };
  }

  describe('constructor', function () {
    context('Manager address is not zero', function () {
      it('constructs', async function () {
        const { roles, adminRoleDescription, accessControlRegistryAdminnedWithManager } =
          await helpers.loadFixture(deploy);
        expect(await accessControlRegistryAdminnedWithManager.manager()).to.be.equal(roles.manager!.address);
        const managerRootRole = ethers.keccak256(ethers.solidityPacked(['address'], [roles.manager!.address]));
        const adminRoleDescriptionHash = ethers.keccak256(ethers.solidityPacked(['string'], [adminRoleDescription]));
        const adminRole = ethers.keccak256(
          ethers.solidityPacked(['bytes32', 'bytes32'], [managerRootRole, adminRoleDescriptionHash])
        );
        expect(await accessControlRegistryAdminnedWithManager.adminRole()).to.equal(adminRole);
      });
    });
    context('Manager address is zero', function () {
      it('reverts', async function () {
        const { roles, adminRoleDescription, accessControlRegistry } = await helpers.loadFixture(deploy);
        const accessControlRegistryAdminnedWithManagerFactory = await ethers.getContractFactory(
          'AccessControlRegistryAdminnedWithManager',
          roles.deployer
        );
        await expect(
          accessControlRegistryAdminnedWithManagerFactory.deploy(
            await accessControlRegistry.getAddress(),
            adminRoleDescription,
            ethers.ZeroAddress
          )
        ).to.be.revertedWith('Manager address zero');
      });
    });
  });
});
