import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import * as testUtils from '../../../test-utils';
// import { encodeData } from '../../Api3ServerV1.sol';
// import { payOevBid, signDataWithAlternateTemplateId } from '../../Api3ServerV1OevExtension.sol';

describe('ScaledApi3FeedProxyV1', function () {
  async function deploy() {
    const roleNames = ['deployer', 'manager', 'airnode', 'auctioneer', 'searcher'];
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
    const api3ServerV1OevExtensionFactory = await ethers.getContractFactory('Api3ServerV1OevExtension', roles.deployer);
    const api3ServerV1OevExtension = await api3ServerV1OevExtensionFactory.deploy(
      accessControlRegistry.getAddress(),
      api3ServerV1OevExtensionAdminRoleDescription,
      roles.manager!.address,
      api3ServerV1.getAddress()
    );

    const dapiName = ethers.encodeBytes32String('ETH/USD');
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

    const baseBeaconValue = ethers.parseEther('1824.97');
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

    const decimals = 8;
    const scaledApi3FeedProxyV1Factory = await ethers.getContractFactory('ScaledApi3FeedProxyV1', roles.deployer);
    const scaledApi3FeedProxyV1 = await scaledApi3FeedProxyV1Factory.deploy(
      await api3ReaderProxyV1.getAddress(),
      decimals
    );

    return {
      decimals,
      api3ReaderProxyV1,
      scaledApi3FeedProxyV1,
      roles,
    };
  }

  function scale(value: bigint, decimals: number) {
    return decimals === 18
      ? value
      : decimals > 18
        ? value * BigInt(10 ** (decimals - 18))
        : value / BigInt(10 ** (18 - decimals));
  }

  describe('constructor', function () {
    context('proxy is not zero address', function () {
      context('targetDecimals is not invalid', function () {
        it('constructs', async function () {
          const { decimals, api3ReaderProxyV1, scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
          expect(await scaledApi3FeedProxyV1.proxy()).to.equal(await api3ReaderProxyV1.getAddress());
          expect(await scaledApi3FeedProxyV1.targetDecimals()).to.equal(decimals);
        });
      });
      context('targetDecimals is invalid', function () {
        it('reverts', async function () {
          const { api3ReaderProxyV1, roles } = await helpers.loadFixture(deploy);
          const scaledApi3FeedProxyV1 = await ethers.getContractFactory('ScaledApi3FeedProxyV1', roles.deployer);
          await expect(scaledApi3FeedProxyV1.deploy(await api3ReaderProxyV1.getAddress(), 0))
            .to.be.revertedWithCustomError(scaledApi3FeedProxyV1, 'InvalidDecimals')
            .withArgs();
          await expect(scaledApi3FeedProxyV1.deploy(await api3ReaderProxyV1.getAddress(), 37))
            .to.be.revertedWithCustomError(scaledApi3FeedProxyV1, 'InvalidDecimals')
            .withArgs();
        });
      });
    });
    context('proxy is zero address', function () {
      it('reverts', async function () {
        const { decimals, roles } = await helpers.loadFixture(deploy);
        const scaledApi3FeedProxyV1 = await ethers.getContractFactory('ScaledApi3FeedProxyV1', roles.deployer);
        await expect(scaledApi3FeedProxyV1.deploy(ethers.ZeroAddress, decimals))
          .to.be.revertedWithCustomError(scaledApi3FeedProxyV1, 'ZeroProxyAddress')
          .withArgs();
      });
    });
  });

  describe('latestAnswer', function () {
    it('returns proxy value', async function () {
      const { decimals, api3ReaderProxyV1, scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
      const [value] = await api3ReaderProxyV1.read();
      expect(await scaledApi3FeedProxyV1.latestAnswer()).to.be.equal(scale(value, decimals));
    });
  });

  describe('latestTimestamp', function () {
    it('returns proxy value', async function () {
      const { api3ReaderProxyV1, scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
      const [, timestamp] = await api3ReaderProxyV1.read();
      expect(await scaledApi3FeedProxyV1.latestTimestamp()).to.be.equal(timestamp);
    });
  });

  describe('latestRound', function () {
    it('reverts', async function () {
      const { scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
      await expect(scaledApi3FeedProxyV1.latestRound())
        .to.be.revertedWithCustomError(scaledApi3FeedProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getAnswer', function () {
    it('reverts', async function () {
      const { scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(scaledApi3FeedProxyV1.getAnswer(blockNumber))
        .to.be.revertedWithCustomError(scaledApi3FeedProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getTimestamp', function () {
    it('reverts', async function () {
      const { scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(scaledApi3FeedProxyV1.getTimestamp(blockNumber))
        .to.be.revertedWithCustomError(scaledApi3FeedProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('decimals', function () {
    it('returns 18', async function () {
      const { decimals, scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
      expect(await scaledApi3FeedProxyV1.decimals()).to.equal(decimals);
    });
  });

  describe('description', function () {
    it('returns empty string', async function () {
      const { scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
      expect(await scaledApi3FeedProxyV1.description()).to.equal('');
    });
  });

  describe('version', function () {
    it('returns 4917', async function () {
      const { scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
      expect(await scaledApi3FeedProxyV1.version()).to.equal(4917);
    });
  });

  describe('getRoundData', function () {
    it('reverts', async function () {
      const { scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(scaledApi3FeedProxyV1.getRoundData(blockNumber))
        .to.be.revertedWithCustomError(scaledApi3FeedProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('latestRoundData', function () {
    it('returns approximated round data', async function () {
      const { decimals, api3ReaderProxyV1, scaledApi3FeedProxyV1 } = await helpers.loadFixture(deploy);
      const [value, timestamp] = await api3ReaderProxyV1.read();
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await scaledApi3FeedProxyV1.latestRoundData();
      expect(roundId).to.equal(0);
      expect(answer).to.equal(scale(value, decimals));
      expect(startedAt).to.equal(timestamp);
      expect(updatedAt).to.equal(timestamp);
      expect(answeredInRound).to.equal(0);
    });
  });
});
