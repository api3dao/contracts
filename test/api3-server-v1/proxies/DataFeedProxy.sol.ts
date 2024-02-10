import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import * as testUtils from '../../test-utils';

describe('DataFeedProxy', function () {
  async function deploy() {
    const roleNames = ['deployer', 'manager', 'dapiNameSetter', 'airnode'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';

    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const api3ServerV1Factory = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
    const api3ServerV1 = await api3ServerV1Factory.deploy(
      await accessControlRegistry.getAddress(),
      api3ServerV1AdminRoleDescription,
      roles.manager!.address
    );

    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    const templateId = ethers.keccak256(ethers.solidityPacked(['bytes32', 'bytes'], [endpointId, templateParameters]));
    const beaconId = ethers.keccak256(
      ethers.solidityPacked(['address', 'bytes32'], [roles.airnode!.address, templateId])
    );

    const beaconValue = 123;
    const beaconTimestamp = await helpers.time.latest();
    const data = ethers.AbiCoder.defaultAbiCoder().encode(['int256'], [beaconValue]);
    const signature = await testUtils.signData(roles.airnode!, templateId, beaconTimestamp, data);
    await api3ServerV1.updateBeaconWithSignedData(roles.airnode!.address, templateId, beaconTimestamp, data, signature);

    const dataFeedProxyFactory = await ethers.getContractFactory('DataFeedProxy', roles.deployer);
    const dataFeedProxy = await dataFeedProxyFactory.deploy(await api3ServerV1.getAddress(), beaconId);

    return {
      roles,
      api3ServerV1,
      dataFeedProxy,
      beaconId,
      beaconValue,
      beaconTimestamp,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { api3ServerV1, dataFeedProxy, beaconId } = await helpers.loadFixture(deploy);
      expect(await dataFeedProxy.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
      expect(await dataFeedProxy.dataFeedId()).to.equal(beaconId);
    });
  });

  describe('read', function () {
    context('Data feed is initialized', function () {
      it('reads', async function () {
        const { dataFeedProxy, beaconValue, beaconTimestamp } = await helpers.loadFixture(deploy);
        const dataFeed = await dataFeedProxy.read();
        expect(dataFeed.value).to.equal(beaconValue);
        expect(dataFeed.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('Data feed is not initialized', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1 } = await helpers.loadFixture(deploy);
        const dataFeedProxyFactory = await ethers.getContractFactory('DataFeedProxy', roles.deployer);
        const dataFeedProxy = await dataFeedProxyFactory.deploy(
          await api3ServerV1.getAddress(),
          testUtils.generateRandomBytes32()
        );
        await expect(dataFeedProxy.read()).to.be.revertedWith('Data feed not initialized');
      });
    });
  });
});
