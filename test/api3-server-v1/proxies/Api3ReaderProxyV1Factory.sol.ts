import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Api3ReaderProxyV1__factory, ERC1967Proxy__factory } from '../../../src/index';
import type { Api3ReaderProxyV1 } from '../../../src/index';
import * as testUtils from '../../test-utils';

describe('Api3ReaderProxyV1Factory', function () {
  async function deploy() {
    const roleNames = ['deployer', 'manager', 'owner', 'airnode', 'auctioneer', 'updater', 'randomPerson'];
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
    const metadata = '0x12345678';

    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    const templateId = ethers.keccak256(ethers.solidityPacked(['bytes32', 'bytes'], [endpointId, templateParameters]));
    const beaconId = ethers.keccak256(
      ethers.solidityPacked(['address', 'bytes32'], [roles.airnode!.address, templateId])
    );
    await api3ServerV1.connect(roles.manager).setDapiName(dapiName, beaconId);

    const baseBeaconValue = 123;
    const baseBeaconTimestamp = await helpers.time.latest();
    const data = ethers.AbiCoder.defaultAbiCoder().encode(['int256'], [baseBeaconValue]);
    const signature = await testUtils.signData(roles.airnode! as any, templateId, baseBeaconTimestamp, data);
    await api3ServerV1.updateBeaconWithSignedData(
      roles.airnode!.address,
      templateId,
      baseBeaconTimestamp,
      data,
      signature
    );

    return {
      accessControlRegistry,
      api3ReaderProxyV1Factory,
      api3ServerV1OevExtension,
      baseBeaconTimestamp,
      baseBeaconValue,
      beaconId,
      dapiName,
      dappId,
      metadata,
      roles,
      templateId,
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
            const { api3ServerV1OevExtension, api3ReaderProxyV1Factory, dapiName, dappId, metadata } =
              await helpers.loadFixture(deploy);
            const implementationAddress = ethers.getCreate2Address(
              await api3ReaderProxyV1Factory.getAddress(),
              ethers.keccak256(metadata),
              ethers.solidityPackedKeccak256(
                ['bytes', 'bytes'],
                [
                  Api3ReaderProxyV1__factory.bytecode,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'bytes32', 'uint256'],
                    [await api3ServerV1OevExtension.getAddress(), dapiName, dappId]
                  ),
                ]
              )
            );
            const proxyAddress = ethers.getCreate2Address(
              await api3ReaderProxyV1Factory.getAddress(),
              ethers.keccak256(metadata),
              ethers.solidityPackedKeccak256(
                ['bytes', 'bytes'],
                [
                  ERC1967Proxy__factory.bytecode,
                  ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes'], [implementationAddress, '0x']),
                ]
              )
            );
            await expect(api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(dapiName, dappId, metadata))
              .to.emit(api3ReaderProxyV1Factory, 'DeployedApi3ReaderProxyV1')
              .withArgs(proxyAddress, dapiName, dappId, metadata);
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
            const { api3ReaderProxyV1Factory, dapiName, dappId, metadata } = await helpers.loadFixture(deploy);
            await api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(dapiName, dappId, metadata);
            await expect(
              api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(dapiName, dappId, metadata)
            ).to.be.revertedWithoutReason();
          });
        });
      });
      context('dApp ID is zero', function () {
        it('reverts', async function () {
          const { api3ReaderProxyV1Factory, dapiName, metadata } = await helpers.loadFixture(deploy);
          await expect(api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(dapiName, 0, metadata)).to.be.revertedWith(
            'dApp ID zero'
          );
        });
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { api3ReaderProxyV1Factory, dappId, metadata } = await helpers.loadFixture(deploy);
        await expect(
          api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(ethers.ZeroHash, dappId, metadata)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });

  describe('computeApi3ReaderProxyV1Address', function () {
    context('dAPI name is not zero', function () {
      context('dApp ID is not zero', function () {
        it('computes Api3ReaderProxyV1 address', async function () {
          const { api3ServerV1OevExtension, api3ReaderProxyV1Factory, dapiName, dappId, metadata } =
            await helpers.loadFixture(deploy);
          const implementationAddress = ethers.getCreate2Address(
            await api3ReaderProxyV1Factory.getAddress(),
            ethers.keccak256(metadata),
            ethers.solidityPackedKeccak256(
              ['bytes', 'bytes'],
              [
                Api3ReaderProxyV1__factory.bytecode,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['address', 'bytes32', 'uint256'],
                  [await api3ServerV1OevExtension.getAddress(), dapiName, dappId]
                ),
              ]
            )
          );
          const proxyAddress = ethers.getCreate2Address(
            await api3ReaderProxyV1Factory.getAddress(),
            ethers.keccak256(metadata),
            ethers.solidityPackedKeccak256(
              ['bytes', 'bytes'],
              [
                ERC1967Proxy__factory.bytecode,
                ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes'], [implementationAddress, '0x']),
              ]
            )
          );
          expect(await api3ReaderProxyV1Factory.computeApi3ReaderProxyV1Address(dapiName, dappId, metadata)).to.equal(
            proxyAddress
          );
        });
      });
      context('dApp ID is zero', function () {
        it('reverts', async function () {
          const { api3ReaderProxyV1Factory, dapiName, metadata } = await helpers.loadFixture(deploy);
          await expect(
            api3ReaderProxyV1Factory.computeApi3ReaderProxyV1Address(dapiName, 0, metadata)
          ).to.be.revertedWith('dApp ID zero');
        });
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { api3ReaderProxyV1Factory, dappId, metadata } = await helpers.loadFixture(deploy);
        await expect(
          api3ReaderProxyV1Factory.computeApi3ReaderProxyV1Address(ethers.ZeroHash, dappId, metadata)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });

  describe('Api3ReaderProxyV1 upgrade flow', function () {
    it('works as intended', async function () {
      const {
        roles,
        accessControlRegistry,
        api3ServerV1OevExtension,
        api3ReaderProxyV1Factory,
        dapiName,
        dappId,
        metadata,
        templateId,
        beaconId,
        baseBeaconValue,
        baseBeaconTimestamp,
      } = await helpers.loadFixture(deploy);

      // Deploy a proxy with Api3ReaderProxyV1 implementation
      await api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(dapiName, dappId, metadata);
      const implementationAddress = ethers.getCreate2Address(
        await api3ReaderProxyV1Factory.getAddress(),
        ethers.keccak256(metadata),
        ethers.solidityPackedKeccak256(
          ['bytes', 'bytes'],
          [
            Api3ReaderProxyV1__factory.bytecode,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'bytes32', 'uint256'],
              [await api3ServerV1OevExtension.getAddress(), dapiName, dappId]
            ),
          ]
        )
      );
      const proxyAddress = ethers.getCreate2Address(
        await api3ReaderProxyV1Factory.getAddress(),
        ethers.keccak256(metadata),
        ethers.solidityPackedKeccak256(
          ['bytes', 'bytes'],
          [
            ERC1967Proxy__factory.bytecode,
            ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes'], [implementationAddress, '0x']),
          ]
        )
      );
      const api3ReaderProxy: Api3ReaderProxyV1 = new ethers.Contract(
        proxyAddress,
        Api3ReaderProxyV1__factory.abi,
        ethers.provider
      ) as any;
      const dataFeedInitial = await api3ReaderProxy.read();
      expect(dataFeedInitial.value).to.be.equal(baseBeaconValue);
      expect(dataFeedInitial.timestamp).to.be.equal(baseBeaconTimestamp);

      // Prepare an alternative Api3ServerV1
      const api3ServerV1Factory = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
      const altApi3ServerV1 = await api3ServerV1Factory.deploy(
        accessControlRegistry.getAddress(),
        'Api3ServerV1 admin',
        roles.manager!.address
      );
      const altBaseBeaconValue = 465;
      const altBaseBeaconTimestamp = await helpers.time.latest();
      const data = ethers.AbiCoder.defaultAbiCoder().encode(['int256'], [altBaseBeaconValue]);
      const signature = await testUtils.signData(roles.airnode! as any, templateId, altBaseBeaconTimestamp, data);
      await altApi3ServerV1.updateBeaconWithSignedData(
        roles.airnode!.address,
        templateId,
        altBaseBeaconTimestamp,
        data,
        signature
      );
      await altApi3ServerV1.connect(roles.manager).setDapiName(dapiName, beaconId);

      // Deploy MockApi3ReaderProxyV2 implementation that points to the alternative Api3ServerV1
      const mockApi3ReaderProxyV2Factory = await ethers.getContractFactory('MockApi3ReaderProxyV2', roles.deployer);
      const mockApi3ReaderProxyV2 = await mockApi3ReaderProxyV2Factory.deploy(altApi3ServerV1.getAddress(), dapiName);

      // Random people cannot upgrade...
      await expect(
        api3ReaderProxy.connect(roles.randomPerson).upgradeToAndCall(mockApi3ReaderProxyV2.getAddress(), '0x')
      )
        .to.be.revertedWithCustomError(api3ReaderProxy, 'OwnableUnauthorizedAccount')
        .withArgs(roles.randomPerson!.address);

      // ...but the owner can
      await expect(api3ReaderProxy.connect(roles.owner).upgradeToAndCall(mockApi3ReaderProxyV2.getAddress(), '0x'))
        .to.emit(api3ReaderProxy, 'Upgraded')
        .withArgs(await mockApi3ReaderProxyV2.getAddress());

      // We can continue using the Api3ReaderProxyV1 interface here
      const dataFeedAfterUpgrade = await api3ReaderProxy.read();
      expect(dataFeedAfterUpgrade.value).to.be.equal(altBaseBeaconValue);
      expect(dataFeedAfterUpgrade.timestamp).to.be.equal(altBaseBeaconTimestamp);

      // Try rolling it back...
      await expect(api3ReaderProxy.connect(roles.owner).upgradeToAndCall(implementationAddress, '0x'))
        .to.emit(api3ReaderProxy, 'Upgraded')
        .withArgs(implementationAddress);

      // ...and it should read the original values
      const dataFeedAfterRollback = await api3ReaderProxy.read();
      expect(dataFeedAfterRollback.value).to.be.equal(baseBeaconValue);
      expect(dataFeedAfterRollback.timestamp).to.be.equal(baseBeaconTimestamp);

      // Transfer ownership and let someone else upgrade
      await api3ReaderProxy.connect(roles.owner).transferOwnership(roles.randomPerson!.address);

      await expect(
        api3ReaderProxy.connect(roles.randomPerson).upgradeToAndCall(mockApi3ReaderProxyV2.getAddress(), '0x')
      )
        .to.emit(api3ReaderProxy, 'Upgraded')
        .withArgs(await mockApi3ReaderProxyV2.getAddress());

      const dataFeedAfterUpgradeByNewOwner = await api3ReaderProxy.read();
      expect(dataFeedAfterUpgradeByNewOwner.value).to.be.equal(altBaseBeaconValue);
      expect(dataFeedAfterUpgradeByNewOwner.timestamp).to.be.equal(altBaseBeaconTimestamp);
    });
  });
});
