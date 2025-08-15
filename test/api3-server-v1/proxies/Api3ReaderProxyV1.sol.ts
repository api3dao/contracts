import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hardhat from 'hardhat';

import * as testUtils from '../../test-utils';
import { encodeData } from '../Api3ServerV1.sol';
import { payOevBid, signDataWithAlternateTemplateId } from '../Api3ServerV1OevExtension.sol';

const { ethers } = hardhat;

// See Api3ReaderProxyV1Factory tests for the upgrade flow
describe('Api3ReaderProxyV1', function () {
  async function deploy() {
    const roleNames = ['deployer', 'manager', 'owner', 'airnode', 'auctioneer', 'searcher'];
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

    const api3ServerV1OevExtensionOevBidPayerFactory = await ethers.getContractFactory(
      'MockApi3ServerV1OevExtensionOevBidPayer',
      roles.deployer
    );
    const api3ServerV1OevExtensionOevBidPayer = await api3ServerV1OevExtensionOevBidPayerFactory.deploy(
      roles.searcher!.address,
      api3ServerV1OevExtension.getAddress()
    );
    await roles.searcher!.sendTransaction({
      to: api3ServerV1OevExtensionOevBidPayer.getAddress(),
      value: ethers.parseEther('10'),
    });

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

    const dapiName = ethers.encodeBytes32String('My dAPI');
    const dappId = 1;

    const api3ReaderProxyV1Factory = await ethers.getContractFactory('Api3ReaderProxyV1', roles.deployer);
    const api3ReaderProxyV1 = await api3ReaderProxyV1Factory.deploy(
      api3ServerV1OevExtension.getAddress(),
      dapiName,
      dappId
    );

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
      api3ReaderProxyV1,
      api3ServerV1,
      api3ServerV1OevExtension,
      api3ServerV1OevExtensionOevBidPayer,
      baseBeaconTimestamp,
      baseBeaconValue,
      dapiName,
      dappId,
      roles,
      templateId,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { api3ServerV1, api3ServerV1OevExtension, api3ReaderProxyV1, dapiName, dappId } =
        await helpers.loadFixture(deploy);
      expect(await api3ReaderProxyV1.owner()).to.equal(ethers.ZeroAddress);
      expect(await api3ReaderProxyV1.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
      expect(await api3ReaderProxyV1.api3ServerV1OevExtension()).to.equal(await api3ServerV1OevExtension.getAddress());
      expect(await api3ReaderProxyV1.dapiName()).to.equal(dapiName);
      expect(await api3ReaderProxyV1.dappId()).to.equal(dappId);
    });
  });

  describe('initialize', function () {
    it('reverts', async function () {
      const { roles, api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      await expect(api3ReaderProxyV1.initialize(roles.owner!.address))
        .to.be.revertedWithCustomError(api3ReaderProxyV1, 'InvalidInitialization')
        .withArgs();
    });
  });

  describe('read', function () {
    context('dAPI name is set', function () {
      context('At least one of base and OEV feeds has been initialized', function () {
        context('OEV feed timestamp is larger', function () {
          it('reads OEV feed', async function () {
            const {
              roles,
              api3ServerV1OevExtensionOevBidPayer,
              api3ReaderProxyV1,
              dappId,
              templateId,
              baseBeaconValue,
              baseBeaconTimestamp,
            } = await helpers.loadFixture(deploy);
            const oevBeaconValue = baseBeaconValue * 2;
            const oevBeaconTimestamp = baseBeaconTimestamp + 1;
            const signedDataTimestampCutoff = oevBeaconTimestamp + 10;
            await helpers.time.setNextBlockTimestamp(oevBeaconTimestamp + 1);
            await payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, dappId, signedDataTimestampCutoff, 1);
            const signature = await signDataWithAlternateTemplateId(
              roles.airnode as any,
              templateId,
              oevBeaconTimestamp,
              encodeData(oevBeaconValue)
            );
            const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
              [roles.airnode!.address, templateId, oevBeaconTimestamp, encodeData(oevBeaconValue), signature]
            );
            await helpers.time.setNextBlockTimestamp(oevBeaconTimestamp + 2);
            await api3ServerV1OevExtensionOevBidPayer
              .connect(roles.searcher)
              .updateDappOevDataFeed(dappId, [signedData]);
            const dataFeed = await api3ReaderProxyV1.read();
            expect(dataFeed.value).to.equal(oevBeaconValue);
            expect(dataFeed.timestamp).to.equal(oevBeaconTimestamp);
          });
        });
        context('OEV feed timestamp is not larger', function () {
          it('reads base feed', async function () {
            const { api3ReaderProxyV1, baseBeaconValue, baseBeaconTimestamp } = await helpers.loadFixture(deploy);
            const dataFeed = await api3ReaderProxyV1.read();
            expect(dataFeed.value).to.equal(baseBeaconValue);
            expect(dataFeed.timestamp).to.equal(baseBeaconTimestamp);
          });
        });
      });
      context('Both the base and OEV feeds have not been initialized', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1, api3ReaderProxyV1, dapiName } = await helpers.loadFixture(deploy);
          await api3ServerV1.connect(roles.manager).setDapiName(dapiName, testUtils.generateRandomBytes32());
          await expect(api3ReaderProxyV1.read())
            .to.be.revertedWithCustomError(api3ReaderProxyV1, 'DataFeedIsNotInitialized')
            .withArgs();
        });
      });
    });
    context('dAPI name is not set', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1, api3ReaderProxyV1, dapiName } = await helpers.loadFixture(deploy);
        await api3ServerV1.connect(roles.manager).setDapiName(dapiName, ethers.ZeroHash);
        await expect(api3ReaderProxyV1.read())
          .to.be.revertedWithCustomError(api3ReaderProxyV1, 'DapiNameIsNotSet')
          .withArgs();
      });
    });
  });

  describe('latestAnswer', function () {
    it('returns proxy value', async function () {
      const { api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const [value] = await api3ReaderProxyV1.read();
      expect(await api3ReaderProxyV1.latestAnswer()).to.be.equal(value);
    });
  });

  describe('latestTimestamp', function () {
    it('returns proxy value', async function () {
      const { api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const [, timestamp] = await api3ReaderProxyV1.read();
      expect(await api3ReaderProxyV1.latestTimestamp()).to.be.equal(timestamp);
    });
  });

  describe('latestRound', function () {
    it('reverts', async function () {
      const { api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      await expect(api3ReaderProxyV1.latestRound())
        .to.be.revertedWithCustomError(api3ReaderProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getAnswer', function () {
    it('reverts', async function () {
      const { api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(api3ReaderProxyV1.getAnswer(blockNumber))
        .to.be.revertedWithCustomError(api3ReaderProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getTimestamp', function () {
    it('reverts', async function () {
      const { api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(api3ReaderProxyV1.getTimestamp(blockNumber))
        .to.be.revertedWithCustomError(api3ReaderProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('decimals', function () {
    it('returns 18', async function () {
      const { api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      expect(await api3ReaderProxyV1.decimals()).to.equal(18);
    });
  });

  describe('description', function () {
    it('returns empty string', async function () {
      const { api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      expect(await api3ReaderProxyV1.description()).to.equal('');
    });
  });

  describe('version', function () {
    it('returns 4913', async function () {
      const { api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      expect(await api3ReaderProxyV1.version()).to.equal(4913);
    });
  });

  describe('getRoundData', function () {
    it('reverts', async function () {
      const { api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(api3ReaderProxyV1.getRoundData(blockNumber))
        .to.be.revertedWithCustomError(api3ReaderProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('latestRoundData', function () {
    it('returns approximated round data', async function () {
      const { api3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const [value, timestamp] = await api3ReaderProxyV1.read();
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await api3ReaderProxyV1.latestRoundData();
      expect(roundId).to.equal(0);
      expect(answer).to.equal(value);
      expect(startedAt).to.equal(timestamp);
      expect(updatedAt).to.equal(timestamp);
      expect(answeredInRound).to.equal(0);
    });
  });
});
