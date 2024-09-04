import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Api3ReaderProxyV1__factory, ERC1967Proxy__factory } from '../../../src/index';
import * as testUtils from '../../test-utils';

describe('Api3ReaderProxyV1Factory', function () {
  async function deploy() {
    const roleNames = ['deployer', 'manager', 'owner', 'airnode', 'auctioneer', 'updater'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();

    const api3ServerV1Factory = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
    const api3ServerV1 = await api3ServerV1Factory.deploy(
      accessControlRegistry.getAddress(),
      'Api3ServerV1 admin',
      roles.manager!.address
    );

    const api3ServerV1OevExtensionAdminRoleDescription = 'Api3ServerV1OevExtension admin';
    const auctioneerRoleDescription = 'Auctioneer';
    const api3ServerV1OevExtensionFactory = await ethers.getContractFactory('Api3ServerV1OevExtension', roles.deployer);
    const api3ServerV1OevExtension = await api3ServerV1OevExtensionFactory.deploy(
      accessControlRegistry.getAddress(),
      api3ServerV1OevExtensionAdminRoleDescription,
      roles.manager!.address,
      api3ServerV1.getAddress()
    );

    const managerRootRole = testUtils.deriveRootRole(roles.manager!.address);
    const adminRole = testUtils.deriveRole(managerRootRole, api3ServerV1OevExtensionAdminRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, api3ServerV1OevExtensionAdminRoleDescription);
    const auctioneerRole = testUtils.deriveRole(adminRole, auctioneerRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, auctioneerRoleDescription);
    await accessControlRegistry.connect(roles.manager).grantRole(auctioneerRole, roles.auctioneer!.address);

    const api3ReaderProxyV1FactoryFactory = await ethers.getContractFactory('Api3ReaderProxyV1Factory', roles.deployer);
    const api3ReaderProxyV1Factory = await api3ReaderProxyV1FactoryFactory.deploy(
      roles.owner!.address,
      api3ServerV1OevExtension.getAddress()
    );

    const dapiName = ethers.encodeBytes32String('My dAPI');
    const dappId = 1;

    return {
      roles,
      api3ServerV1OevExtension,
      api3ReaderProxyV1Factory,
      dapiName,
      dappId,
    };
  }

  describe('constructor', function () {
    context('Api3ServerV1OevExtension address is not zero', function () {
      it('constructs', async function () {
        const { roles, api3ServerV1OevExtension, api3ReaderProxyV1Factory } = await helpers.loadFixture(deploy);
        expect(await api3ReaderProxyV1Factory.owner()).to.equal(roles.owner!.address);
        expect(await api3ReaderProxyV1Factory.api3ServerV1OevExtension()).to.equal(
          await api3ServerV1OevExtension.getAddress()
        );
      });
    });
    context('Api3ServerV1OevExtension address is zero', function () {
      it('reverts', async function () {
        const { roles } = await helpers.loadFixture(deploy);
        const api3ReaderProxyV1FactoryFactory = await ethers.getContractFactory(
          'Api3ReaderProxyV1Factory',
          roles.deployer
        );
        await expect(
          api3ReaderProxyV1FactoryFactory.deploy(roles.owner!.address, ethers.ZeroAddress)
        ).to.be.revertedWith('Api3ServerV1OevExtension address zero');
      });
    });
  });

  describe('deployApi3ReaderProxyV1', function () {
    context('dAPI name is not zero', function () {
      context('dApp ID is not zero', function () {
        context('Api3ReaderProxyV1 has not been deployed', function () {
          it('deploys Api3ReaderProxyV1', async function () {
            const { roles, api3ServerV1OevExtension, api3ReaderProxyV1Factory, dapiName, dappId } =
              await helpers.loadFixture(deploy);
            const implementationAddress = ethers.getCreate2Address(
              await api3ReaderProxyV1Factory.getAddress(),
              ethers.ZeroHash,
              ethers.solidityPackedKeccak256(
                ['bytes', 'bytes'],
                [
                  Api3ReaderProxyV1__factory.bytecode,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'address', 'bytes32', 'uint256'],
                    [roles.owner?.address, await api3ServerV1OevExtension.getAddress(), dapiName, dappId]
                  ),
                ]
              )
            );
            const proxyAddress = ethers.getCreate2Address(
              await api3ReaderProxyV1Factory.getAddress(),
              ethers.ZeroHash,
              ethers.solidityPackedKeccak256(
                ['bytes', 'bytes'],
                [
                  ERC1967Proxy__factory.bytecode,
                  ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes'], [implementationAddress, '0x']),
                ]
              )
            );
            await expect(api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(dapiName, dappId))
              .to.emit(api3ReaderProxyV1Factory, 'DeployedApi3ReaderProxyV1')
              .withArgs(proxyAddress, dapiName, dappId);
            expect(
              await ethers.provider.getStorage(
                proxyAddress,
                BigInt('0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')
              )
            ).to.equal(ethers.zeroPadValue(implementationAddress, 32));
          });
        });
        context('Api3ReaderProxyV1 has already been deployed', function () {
          it('reverts', async function () {
            const { api3ReaderProxyV1Factory, dapiName, dappId } = await helpers.loadFixture(deploy);
            await api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(dapiName, dappId);
            await expect(
              api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(dapiName, dappId)
            ).to.be.revertedWithoutReason();
          });
        });
      });
      context('dApp ID is zero', function () {
        it('reverts', async function () {
          const { api3ReaderProxyV1Factory, dapiName } = await helpers.loadFixture(deploy);
          await expect(api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(dapiName, 0)).to.be.revertedWith(
            'dApp ID zero'
          );
        });
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { api3ReaderProxyV1Factory, dappId } = await helpers.loadFixture(deploy);
        await expect(api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(ethers.ZeroHash, dappId)).to.be.revertedWith(
          'dAPI name zero'
        );
      });
    });
  });

  describe('computeApi3ReaderProxyV1Address', function () {
    context('dAPI name is not zero', function () {
      context('dApp ID is not zero', function () {
        it('computes Api3ReaderProxyV1 address', async function () {
          const { roles, api3ServerV1OevExtension, api3ReaderProxyV1Factory, dapiName, dappId } =
            await helpers.loadFixture(deploy);
          const implementationAddress = ethers.getCreate2Address(
            await api3ReaderProxyV1Factory.getAddress(),
            ethers.ZeroHash,
            ethers.solidityPackedKeccak256(
              ['bytes', 'bytes'],
              [
                Api3ReaderProxyV1__factory.bytecode,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['address', 'address', 'bytes32', 'uint256'],
                  [roles.owner?.address, await api3ServerV1OevExtension.getAddress(), dapiName, dappId]
                ),
              ]
            )
          );
          const proxyAddress = ethers.getCreate2Address(
            await api3ReaderProxyV1Factory.getAddress(),
            ethers.ZeroHash,
            ethers.solidityPackedKeccak256(
              ['bytes', 'bytes'],
              [
                ERC1967Proxy__factory.bytecode,
                ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes'], [implementationAddress, '0x']),
              ]
            )
          );
          expect(await api3ReaderProxyV1Factory.computeApi3ReaderProxyV1Address(dapiName, dappId)).to.equal(
            proxyAddress
          );
        });
      });
      context('dApp ID is zero', function () {
        it('reverts', async function () {
          const { api3ReaderProxyV1Factory, dapiName } = await helpers.loadFixture(deploy);
          await expect(api3ReaderProxyV1Factory.computeApi3ReaderProxyV1Address(dapiName, 0)).to.be.revertedWith(
            'dApp ID zero'
          );
        });
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { api3ReaderProxyV1Factory, dappId } = await helpers.loadFixture(deploy);
        await expect(
          api3ReaderProxyV1Factory.computeApi3ReaderProxyV1Address(ethers.ZeroHash, dappId)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });
});
