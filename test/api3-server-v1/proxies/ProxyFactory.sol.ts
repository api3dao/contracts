import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import {
  type DapiProxy,
  type DapiProxyWithOev,
  type DataFeedProxy,
  type DataFeedProxyWithOev,
  DapiProxy__factory,
  DapiProxyWithOev__factory,
  DataFeedProxy__factory,
  DataFeedProxyWithOev__factory,
} from '../../../src/index';
import * as testUtils from '../../test-utils';

describe('ProxyFactory', function () {
  async function deploy() {
    const roleNames = ['deployer', 'manager', 'dapiNameSetter', 'airnode', 'oevBeneficiary'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';
    const dapiName = ethers.encodeBytes32String('My dAPI');
    const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);

    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const api3ServerV1Factory = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
    const api3ServerV1 = await api3ServerV1Factory.deploy(
      await accessControlRegistry.getAddress(),
      api3ServerV1AdminRoleDescription,
      roles.manager!.address
    );
    const proxyFactoryFactory = await ethers.getContractFactory('ProxyFactory', roles.deployer);
    const proxyFactory = await proxyFactoryFactory.deploy(await api3ServerV1.getAddress());

    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    const templateId = ethers.keccak256(ethers.solidityPacked(['bytes32', 'bytes'], [endpointId, templateParameters]));
    const beaconId = ethers.keccak256(
      ethers.solidityPacked(['address', 'bytes32'], [roles.airnode!.address, templateId])
    );
    await api3ServerV1.connect(roles.manager).setDapiName(dapiName, beaconId);

    const beaconValue = 123;
    const beaconTimestamp = await helpers.time.latest();
    const data = ethers.AbiCoder.defaultAbiCoder().encode(['int256'], [beaconValue]);
    const signature = await testUtils.signData(roles.airnode!, templateId, beaconTimestamp, data);
    await api3ServerV1.updateBeaconWithSignedData(roles.airnode!.address, templateId, beaconTimestamp, data, signature);

    return {
      roles,
      api3ServerV1,
      proxyFactory,
      dapiName,
      dapiNameHash,
      beaconId,
      beaconValue,
      beaconTimestamp,
    };
  }

  describe('constructor', function () {
    context('Api3ServerV1 addres is not zero', function () {
      it('constructs', async function () {
        const { api3ServerV1, proxyFactory } = await helpers.loadFixture(deploy);
        expect(await proxyFactory.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
      });
    });
    context('Api3ServerV1 addres is zero', function () {
      it('reverts', async function () {
        const { roles } = await helpers.loadFixture(deploy);
        const proxyFactoryFactory = await ethers.getContractFactory('ProxyFactory', roles.deployer);
        await expect(proxyFactoryFactory.deploy(ethers.ZeroAddress)).to.be.revertedWith('Api3ServerV1 address zero');
      });
    });
  });

  describe('deployDataFeedProxy', function () {
    context('Data feed ID is not zero', function () {
      it('deploys data feed proxy', async function () {
        const { roles, api3ServerV1, proxyFactory, beaconId, beaconValue, beaconTimestamp } =
          await helpers.loadFixture(deploy);
        // Precompute the proxy address
        const initcode = ethers.solidityPacked(
          ['bytes', 'bytes'],
          [
            DataFeedProxy__factory.bytecode,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'bytes32'],
              [await api3ServerV1.getAddress(), beaconId]
            ),
          ]
        );
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = ethers.getCreate2Address(
          await proxyFactory.getAddress(),
          ethers.keccak256(metadata),
          ethers.keccak256(initcode)
        );

        // Can only deploy once
        await expect(proxyFactory.deployDataFeedProxy(beaconId, metadata))
          .to.emit(proxyFactory, 'DeployedDataFeedProxy')
          .withArgs(proxyAddress, beaconId, metadata);
        // Subsequent deployments will revert with no string
        await expect(proxyFactory.deployDataFeedProxy(beaconId, metadata)).to.be.reverted;

        // Confirm that the bytecode is the same
        const dataFeedProxyFactory = await ethers.getContractFactory('DataFeedProxy', roles.deployer);
        const eoaDeployedDataFeedProxy = await dataFeedProxyFactory.deploy(await api3ServerV1.getAddress(), beaconId);
        expect(await ethers.provider.getCode(proxyAddress)).to.equal(
          await ethers.provider.getCode(await eoaDeployedDataFeedProxy.getAddress())
        );

        // Test the deployed contract
        const dataFeedProxy = new ethers.Contract(
          proxyAddress,
          DataFeedProxy__factory.abi,
          ethers.provider
        ) as unknown as DataFeedProxy;
        expect(await dataFeedProxy.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
        expect(await dataFeedProxy.dataFeedId()).to.equal(beaconId);
        const beacon = await dataFeedProxy.read();
        expect(beacon.value).to.equal(beaconValue);
        expect(beacon.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(proxyFactory.deployDataFeedProxy(ethers.ZeroHash, metadata)).to.be.revertedWith(
          'Data feed ID zero'
        );
      });
    });
  });

  describe('deployDapiProxy', function () {
    context('dAPI name is not zero', function () {
      it('deploys dAPI proxy', async function () {
        const { roles, api3ServerV1, proxyFactory, dapiName, dapiNameHash, beaconValue, beaconTimestamp } =
          await helpers.loadFixture(deploy);
        // Precompute the proxy address
        const initcode = ethers.solidityPacked(
          ['bytes', 'bytes'],
          [
            DapiProxy__factory.bytecode,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'bytes32'],
              [await api3ServerV1.getAddress(), dapiNameHash]
            ),
          ]
        );
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = ethers.getCreate2Address(
          await proxyFactory.getAddress(),
          ethers.keccak256(metadata),
          ethers.keccak256(initcode)
        );

        // Can only deploy once
        await expect(proxyFactory.deployDapiProxy(dapiName, metadata))
          .to.emit(proxyFactory, 'DeployedDapiProxy')
          .withArgs(proxyAddress, dapiName, metadata);
        // Subsequent deployments will revert with no string
        await expect(proxyFactory.deployDapiProxy(dapiName, metadata)).to.be.reverted;

        // Confirm that the bytecode is the same
        const dapiProxyFactory = await ethers.getContractFactory('DapiProxy', roles.deployer);
        const eoaDeployedDapiProxy = await dapiProxyFactory.deploy(await api3ServerV1.getAddress(), dapiNameHash);
        expect(await ethers.provider.getCode(proxyAddress)).to.equal(
          await ethers.provider.getCode(await eoaDeployedDapiProxy.getAddress())
        );

        // Test the deployed contract
        const dapiProxy = new ethers.Contract(
          proxyAddress,
          DapiProxy__factory.abi,
          ethers.provider
        ) as unknown as DapiProxy;
        expect(await dapiProxy.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
        expect(await dapiProxy.dapiNameHash()).to.equal(ethers.solidityPackedKeccak256(['bytes32'], [dapiName]));
        const dapi = await dapiProxy.read();
        expect(dapi.value).to.equal(beaconValue);
        expect(dapi.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(proxyFactory.deployDapiProxy(ethers.ZeroHash, metadata)).to.be.revertedWith('dAPI name zero');
      });
    });
  });

  describe('deployDataFeedProxyWithOev', function () {
    context('Data feed ID is not zero', function () {
      context('OEV beneficiary is not zero', function () {
        it('deploys data feed proxy', async function () {
          const { roles, api3ServerV1, proxyFactory, beaconId, beaconValue, beaconTimestamp } =
            await helpers.loadFixture(deploy);
          // Precompute the proxy address
          const initcode = ethers.solidityPacked(
            ['bytes', 'bytes'],
            [
              DataFeedProxyWithOev__factory.bytecode,
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'bytes32', 'address'],
                [await api3ServerV1.getAddress(), beaconId, roles.oevBeneficiary!.address]
              ),
            ]
          );
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = ethers.getCreate2Address(
            await proxyFactory.getAddress(),
            ethers.keccak256(metadata),
            ethers.keccak256(initcode)
          );

          // Can only deploy once
          await expect(proxyFactory.deployDataFeedProxyWithOev(beaconId, roles.oevBeneficiary!.address, metadata))
            .to.emit(proxyFactory, 'DeployedDataFeedProxyWithOev')
            .withArgs(proxyAddress, beaconId, roles.oevBeneficiary!.address, metadata);
          // Subsequent deployments will revert with no string
          await expect(proxyFactory.deployDataFeedProxyWithOev(beaconId, roles.oevBeneficiary!.address, metadata)).to.be
            .reverted;

          // Confirm that the bytecode is the same
          const dataFeedProxyFactory = await ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
          const eoaDeployedDataFeedProxyWithOev = await dataFeedProxyFactory.deploy(
            await api3ServerV1.getAddress(),
            beaconId,
            roles.oevBeneficiary!.address
          );
          expect(await ethers.provider.getCode(proxyAddress)).to.equal(
            await ethers.provider.getCode(await eoaDeployedDataFeedProxyWithOev.getAddress())
          );

          // Test the deployed contract
          const dataFeedProxyWithOev = new ethers.Contract(
            proxyAddress,
            DataFeedProxyWithOev__factory.abi,
            ethers.provider
          ) as unknown as DataFeedProxyWithOev;
          expect(await dataFeedProxyWithOev.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
          expect(await dataFeedProxyWithOev.dataFeedId()).to.equal(beaconId);
          expect(await dataFeedProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary!.address);
          const beacon = await dataFeedProxyWithOev.read();
          expect(beacon.value).to.equal(beaconValue);
          expect(beacon.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('OEV beneficiary is zero', function () {
        it('reverts', async function () {
          const { proxyFactory, beaconId } = await helpers.loadFixture(deploy);
          const metadata = testUtils.generateRandomBytes();
          await expect(
            proxyFactory.deployDataFeedProxyWithOev(beaconId, ethers.ZeroAddress, metadata)
          ).to.be.revertedWith('OEV beneficiary zero');
        });
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { roles, proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(
          proxyFactory.deployDataFeedProxyWithOev(ethers.ZeroHash, roles.oevBeneficiary!.address, metadata)
        ).to.be.revertedWith('Data feed ID zero');
      });
    });
  });

  describe('deployDapiProxyWithOev', function () {
    context('Data feed ID is not zero', function () {
      context('OEV beneficiary is not zero', function () {
        it('deploys data feed proxy', async function () {
          const { roles, api3ServerV1, proxyFactory, dapiName, dapiNameHash, beaconValue, beaconTimestamp } =
            await helpers.loadFixture(deploy);
          // Precompute the proxy address
          const initcode = ethers.solidityPacked(
            ['bytes', 'bytes'],
            [
              DapiProxyWithOev__factory.bytecode,
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'bytes32', 'address'],
                [await api3ServerV1.getAddress(), dapiNameHash, roles.oevBeneficiary!.address]
              ),
            ]
          );
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = ethers.getCreate2Address(
            await proxyFactory.getAddress(),
            ethers.keccak256(metadata),
            ethers.keccak256(initcode)
          );

          // Can only deploy once
          await expect(proxyFactory.deployDapiProxyWithOev(dapiName, roles.oevBeneficiary!.address, metadata))
            .to.emit(proxyFactory, 'DeployedDapiProxyWithOev')
            .withArgs(proxyAddress, dapiName, roles.oevBeneficiary!.address, metadata);
          // Subsequent deployments will revert with no string
          await expect(proxyFactory.deployDapiProxyWithOev(dapiName, roles.oevBeneficiary!.address, metadata)).to.be
            .reverted;

          // Confirm that the bytecode is the same
          const dataFeedProxyFactory = await ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
          const eoaDeployedDapiProxyWithOev = await dataFeedProxyFactory.deploy(
            await api3ServerV1.getAddress(),
            dapiNameHash,
            roles.oevBeneficiary!.address
          );
          expect(await ethers.provider.getCode(proxyAddress)).to.equal(
            await ethers.provider.getCode(await eoaDeployedDapiProxyWithOev.getAddress())
          );

          // Test the deployed contract
          const dapiProxyWithOev = new ethers.Contract(
            proxyAddress,
            DapiProxyWithOev__factory.abi,
            ethers.provider
          ) as unknown as DapiProxyWithOev;
          expect(await dapiProxyWithOev.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
          expect(await dapiProxyWithOev.dapiNameHash()).to.equal(
            ethers.solidityPackedKeccak256(['bytes32'], [dapiName])
          );
          expect(await dapiProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary!.address);
          const dapi = await dapiProxyWithOev.read();
          expect(dapi.value).to.equal(beaconValue);
          expect(dapi.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('OEV beneficiary is zero', function () {
        it('reverts', async function () {
          const { proxyFactory, beaconId } = await helpers.loadFixture(deploy);
          const metadata = testUtils.generateRandomBytes();
          await expect(proxyFactory.deployDapiProxyWithOev(beaconId, ethers.ZeroAddress, metadata)).to.be.revertedWith(
            'OEV beneficiary zero'
          );
        });
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { roles, proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(
          proxyFactory.deployDapiProxyWithOev(ethers.ZeroHash, roles.oevBeneficiary!.address, metadata)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });

  describe('computeDataFeedProxyAddress', function () {
    context('Data feed ID is not zero', function () {
      it('computes data feed proxy address', async function () {
        const { api3ServerV1, proxyFactory, beaconId } = await helpers.loadFixture(deploy);
        // Precompute the proxy address
        const initcode = ethers.solidityPacked(
          ['bytes', 'bytes'],
          [
            DataFeedProxy__factory.bytecode,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'bytes32'],
              [await api3ServerV1.getAddress(), beaconId]
            ),
          ]
        );
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = ethers.getCreate2Address(
          await proxyFactory.getAddress(),
          ethers.keccak256(metadata),
          ethers.keccak256(initcode)
        );
        expect(await proxyFactory.computeDataFeedProxyAddress(beaconId, metadata)).to.be.equal(proxyAddress);
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(proxyFactory.computeDataFeedProxyAddress(ethers.ZeroHash, metadata)).to.be.revertedWith(
          'Data feed ID zero'
        );
      });
    });
  });

  describe('computeDapiProxyAddress', function () {
    context('dAPI name is not zero', function () {
      it('computes dAPI proxy address', async function () {
        const { api3ServerV1, proxyFactory, dapiName, dapiNameHash } = await helpers.loadFixture(deploy);
        // Precompute the proxy address
        const initcode = ethers.solidityPacked(
          ['bytes', 'bytes'],
          [
            DapiProxy__factory.bytecode,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'bytes32'],
              [await api3ServerV1.getAddress(), dapiNameHash]
            ),
          ]
        );
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = ethers.getCreate2Address(
          await proxyFactory.getAddress(),
          ethers.keccak256(metadata),
          ethers.keccak256(initcode)
        );
        expect(await proxyFactory.computeDapiProxyAddress(dapiName, metadata)).to.be.equal(proxyAddress);
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(proxyFactory.computeDapiProxyAddress(ethers.ZeroHash, metadata)).to.be.revertedWith(
          'dAPI name zero'
        );
      });
    });
  });

  describe('computeDataFeedProxyWithOevAddress', function () {
    context('Data feed ID is not zero', function () {
      context('OEV beneficiary is not zero', function () {
        it('computes data feed proxy address', async function () {
          const { roles, api3ServerV1, proxyFactory, beaconId } = await helpers.loadFixture(deploy);
          // Precompute the proxy address
          const initcode = ethers.solidityPacked(
            ['bytes', 'bytes'],
            [
              DataFeedProxyWithOev__factory.bytecode,
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'bytes32', 'address'],
                [await api3ServerV1.getAddress(), beaconId, roles.oevBeneficiary!.address]
              ),
            ]
          );
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = ethers.getCreate2Address(
            await proxyFactory.getAddress(),
            ethers.keccak256(metadata),
            ethers.keccak256(initcode)
          );
          expect(
            await proxyFactory.computeDataFeedProxyWithOevAddress(beaconId, roles.oevBeneficiary!.address, metadata)
          ).to.be.equal(proxyAddress);
        });
      });
      context('OEV beneficiary is zero', function () {
        it('reverts', async function () {
          const { proxyFactory, beaconId } = await helpers.loadFixture(deploy);
          const metadata = testUtils.generateRandomBytes();
          await expect(
            proxyFactory.computeDataFeedProxyWithOevAddress(beaconId, ethers.ZeroAddress, metadata)
          ).to.be.revertedWith('OEV beneficiary zero');
        });
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { roles, proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(
          proxyFactory.computeDataFeedProxyWithOevAddress(ethers.ZeroHash, roles.oevBeneficiary!.address, metadata)
        ).to.be.revertedWith('Data feed ID zero');
      });
    });
  });

  describe('computeDapiProxyWithOevAddress', function () {
    context('Data feed ID is not zero', function () {
      context('OEV beneficiary is not zero', function () {
        it('computes data feed proxy address', async function () {
          const { roles, api3ServerV1, proxyFactory, dapiName, dapiNameHash } = await helpers.loadFixture(deploy);
          // Precompute the proxy address
          const initcode = ethers.solidityPacked(
            ['bytes', 'bytes'],
            [
              DapiProxyWithOev__factory.bytecode,
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'bytes32', 'address'],
                [await api3ServerV1.getAddress(), dapiNameHash, roles.oevBeneficiary!.address]
              ),
            ]
          );
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = ethers.getCreate2Address(
            await proxyFactory.getAddress(),
            ethers.keccak256(metadata),
            ethers.keccak256(initcode)
          );
          expect(
            await proxyFactory.computeDapiProxyWithOevAddress(dapiName, roles.oevBeneficiary!.address, metadata)
          ).to.be.equal(proxyAddress);
        });
      });
      context('OEV beneficiary is zero', function () {
        it('reverts', async function () {
          const { proxyFactory, beaconId } = await helpers.loadFixture(deploy);
          const metadata = testUtils.generateRandomBytes();
          await expect(
            proxyFactory.computeDapiProxyWithOevAddress(beaconId, ethers.ZeroAddress, metadata)
          ).to.be.revertedWith('OEV beneficiary zero');
        });
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { roles, proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(
          proxyFactory.computeDapiProxyWithOevAddress(ethers.ZeroHash, roles.oevBeneficiary!.address, metadata)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });
});
