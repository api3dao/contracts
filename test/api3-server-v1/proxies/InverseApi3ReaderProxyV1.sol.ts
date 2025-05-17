import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('InverseApi3ReaderProxyV1', function () {
  async function deploy() {
    const roleNames = ['deployer', 'manager', 'airnode', 'auctioneer', 'searcher'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const decimals = 20;
    const answer = ethers.parseUnits('1824.97', decimals);
    const timestamp = await helpers.time.latest();

    const mockAggregatorV2V3Factory = await ethers.getContractFactory('MockAggregatorV2V3', roles.deployer);
    const feed = await mockAggregatorV2V3Factory.deploy(decimals, answer, timestamp);

    const normalizedApi3ReaderProxyV1Factory = await ethers.getContractFactory(
      'NormalizedApi3ReaderProxyV1',
      roles.deployer
    );
    const proxy = await normalizedApi3ReaderProxyV1Factory.deploy(await feed.getAddress());

    const inverseApi3ReaderProxyV1Factory = await ethers.getContractFactory('InverseApi3ReaderProxyV1', roles.deployer);
    const inverseApi3ReaderProxyV1 = await inverseApi3ReaderProxyV1Factory.deploy(await proxy.getAddress());

    return {
      proxy,
      inverseApi3ReaderProxyV1,
      roles,
    };
  }

  describe('constructor', function () {
    context('proxy is not zero address', function () {
      it('constructs', async function () {
        const { proxy, inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
        expect(await inverseApi3ReaderProxyV1.proxy()).to.equal(await proxy.getAddress());
      });
    });
    context('proxy is zero address', function () {
      it('reverts', async function () {
        const { roles } = await helpers.loadFixture(deploy);
        const inverseApi3ReaderProxyV1 = await ethers.getContractFactory('InverseApi3ReaderProxyV1', roles.deployer);
        await expect(inverseApi3ReaderProxyV1.deploy(ethers.ZeroAddress))
          .to.be.revertedWithCustomError(inverseApi3ReaderProxyV1, 'ZeroProxyAddress')
          .withArgs();
      });
    });
  });

  describe('read', function () {
    it('reads the inverse rate', async function () {
      const { proxy, inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const dataFeed = await inverseApi3ReaderProxyV1.read();

      const [value, timestamp] = await proxy.read();
      expect(dataFeed.value).to.equal(BigInt(1 * 10 ** 36) / value);
      expect(dataFeed.timestamp).to.equal(timestamp);
    });
  });

  describe('latestAnswer', function () {
    it('returns proxy value', async function () {
      const { inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const [value] = await inverseApi3ReaderProxyV1.read();
      expect(await inverseApi3ReaderProxyV1.latestAnswer()).to.be.equal(value);
    });
  });

  describe('latestTimestamp', function () {
    it('returns proxy value', async function () {
      const { inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const [, timestamp] = await inverseApi3ReaderProxyV1.read();
      expect(await inverseApi3ReaderProxyV1.latestTimestamp()).to.be.equal(timestamp);
    });
  });

  describe('latestRound', function () {
    it('reverts', async function () {
      const { inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      await expect(inverseApi3ReaderProxyV1.latestRound())
        .to.be.revertedWithCustomError(inverseApi3ReaderProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getAnswer', function () {
    it('reverts', async function () {
      const { inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(inverseApi3ReaderProxyV1.getAnswer(blockNumber))
        .to.be.revertedWithCustomError(inverseApi3ReaderProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getTimestamp', function () {
    it('reverts', async function () {
      const { inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(inverseApi3ReaderProxyV1.getTimestamp(blockNumber))
        .to.be.revertedWithCustomError(inverseApi3ReaderProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('decimals', function () {
    it('returns 18', async function () {
      const { inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      expect(await inverseApi3ReaderProxyV1.decimals()).to.equal(18);
    });
  });

  describe('description', function () {
    it('returns empty string', async function () {
      const { inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      expect(await inverseApi3ReaderProxyV1.description()).to.equal('');
    });
  });

  describe('version', function () {
    it('returns 4915', async function () {
      const { inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      expect(await inverseApi3ReaderProxyV1.version()).to.equal(4915);
    });
  });

  describe('getRoundData', function () {
    it('reverts', async function () {
      const { inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(inverseApi3ReaderProxyV1.getRoundData(blockNumber))
        .to.be.revertedWithCustomError(inverseApi3ReaderProxyV1, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('latestRoundData', function () {
    it('returns approximated round data', async function () {
      const { inverseApi3ReaderProxyV1 } = await helpers.loadFixture(deploy);
      const [value, timestamp] = await inverseApi3ReaderProxyV1.read();
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await inverseApi3ReaderProxyV1.latestRoundData();
      expect(roundId).to.equal(0);
      expect(answer).to.equal(value);
      expect(startedAt).to.equal(timestamp);
      expect(updatedAt).to.equal(timestamp);
      expect(answeredInRound).to.equal(0);
    });
  });
});
