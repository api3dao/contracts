import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import * as testUtils from '../../test-utils';

describe('DapiProxyWithOev', function () {
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
    const dapiProxyWithOevFactory = await ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
    const dapiProxyWithOev = await dapiProxyWithOevFactory.deploy(
      await api3ServerV1.getAddress(),
      dapiNameHash,
      roles.oevBeneficiary!.address
    );

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
      dapiProxyWithOev,
      dapiNameHash,
      beaconValue,
      beaconTimestamp,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { roles, api3ServerV1, dapiProxyWithOev, dapiNameHash } = await helpers.loadFixture(deploy);
      expect(await dapiProxyWithOev.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
      expect(await dapiProxyWithOev.dapiNameHash()).to.equal(dapiNameHash);
      expect(await dapiProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary!.address);
    });
  });

  describe('read', function () {
    context('dAPI name is set', function () {
      context('Data feed is initialized', function () {
        it('reads', async function () {
          const { dapiProxyWithOev, beaconValue, beaconTimestamp } = await helpers.loadFixture(deploy);
          const dataFeed = await dapiProxyWithOev.read();
          expect(dataFeed.value).to.equal(beaconValue);
          expect(dataFeed.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1 } = await helpers.loadFixture(deploy);
          const uninitializedDapiName = ethers.encodeBytes32String('My uninitialized dAPI');
          const uninitializedDapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [uninitializedDapiName]);
          await api3ServerV1
            .connect(roles.manager)
            .setDapiName(uninitializedDapiName, testUtils.generateRandomBytes32());
          const dapiProxyWithOevFactory = await ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
          const dapiProxyWithOev = await dapiProxyWithOevFactory.deploy(
            await api3ServerV1.getAddress(),
            uninitializedDapiNameHash,
            roles.oevBeneficiary!.address
          );
          await expect(dapiProxyWithOev.read()).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name is not set', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1 } = await helpers.loadFixture(deploy);
        const unsetDapiName = ethers.encodeBytes32String('My unset dAPI');
        const unsetDapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [unsetDapiName]);
        const dapiProxyWithOevFactory = await ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
        const dapiProxyWithOev = await dapiProxyWithOevFactory.deploy(
          await api3ServerV1.getAddress(),
          unsetDapiNameHash,
          roles.oevBeneficiary!.address
        );
        await expect(dapiProxyWithOev.read()).to.be.revertedWith('dAPI name not set');
      });
    });
  });
});
