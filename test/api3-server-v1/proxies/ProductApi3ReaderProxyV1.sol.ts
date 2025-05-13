import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import * as testUtils from '../../test-utils';

describe('ProductApi3ReaderProxyV1', function () {
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

    const api3ReaderProxyV1Factory = await ethers.getContractFactory('Api3ReaderProxyV1', roles.deployer);

    const dappId = 1;
    const dapiNameEthUsd = ethers.encodeBytes32String('ETH/USD');
    const api3ReaderProxyV1EthUsd = await api3ReaderProxyV1Factory.deploy(
      api3ServerV1OevExtension.getAddress(),
      dapiNameEthUsd,
      dappId
    );
    const dapiNameSolEth = ethers.encodeBytes32String('SOL/ETH');
    const api3ReaderProxyV1SolEth = await api3ReaderProxyV1Factory.deploy(
      api3ServerV1OevExtension.getAddress(),
      dapiNameSolEth,
      dappId
    );

    const productApi3ReaderProxyV1Factory = await ethers.getContractFactory('ProductApi3ReaderProxyV1', roles.deployer);

    const productApi3ReaderProxyV1SolUsd = await productApi3ReaderProxyV1Factory.deploy(
      api3ReaderProxyV1EthUsd.getAddress(),
      api3ReaderProxyV1SolEth.getAddress()
    );

    const productApi3ReaderProxyV1EthSol = await productApi3ReaderProxyV1Factory.deploy(
      api3ReaderProxyV1EthUsd.getAddress(),
      productApi3ReaderProxyV1SolUsd.getAddress()
    );

    const endpointIdEthUsd = testUtils.generateRandomBytes32();
    const templateParametersEthUsd = testUtils.generateRandomBytes();
    const templateIdEthUsd = ethers.keccak256(
      ethers.solidityPacked(['bytes32', 'bytes'], [endpointIdEthUsd, templateParametersEthUsd])
    );
    const beaconIdEthUsd = ethers.keccak256(
      ethers.solidityPacked(['address', 'bytes32'], [roles.airnode!.address, templateIdEthUsd])
    );
    await api3ServerV1.connect(roles.manager).setDapiName(dapiNameEthUsd, beaconIdEthUsd);

    const baseBeaconValueEthUsd = ethers.parseEther('1824.97');
    const baseBeaconTimestampEthUsd = await helpers.time.latest();
    const dataEthUsd = ethers.AbiCoder.defaultAbiCoder().encode(['int256'], [baseBeaconValueEthUsd]);
    const signatureEthUsd = await testUtils.signData(
      roles.airnode! as any,
      templateIdEthUsd,
      baseBeaconTimestampEthUsd,
      dataEthUsd
    );
    await api3ServerV1.updateBeaconWithSignedData(
      roles.airnode!.address,
      templateIdEthUsd,
      baseBeaconTimestampEthUsd,
      dataEthUsd,
      signatureEthUsd
    );

    const endpointIdSolEth = testUtils.generateRandomBytes32();
    const templateParametersSolEth = testUtils.generateRandomBytes();
    const templateIdSolEth = ethers.keccak256(
      ethers.solidityPacked(['bytes32', 'bytes'], [endpointIdSolEth, templateParametersSolEth])
    );
    const beaconIdSolEth = ethers.keccak256(
      ethers.solidityPacked(['address', 'bytes32'], [roles.airnode!.address, templateIdSolEth])
    );
    await api3ServerV1.connect(roles.manager).setDapiName(dapiNameSolEth, beaconIdSolEth);

    const baseBeaconValueSolEth = ethers.parseEther('0.08202');
    const baseBeaconTimestampSolEth = await helpers.time.latest();
    const dataSolEth = ethers.AbiCoder.defaultAbiCoder().encode(['int256'], [baseBeaconValueSolEth]);
    const signatureSolEth = await testUtils.signData(
      roles.airnode! as any,
      templateIdSolEth,
      baseBeaconTimestampSolEth,
      dataSolEth
    );
    await api3ServerV1.updateBeaconWithSignedData(
      roles.airnode!.address,
      templateIdSolEth,
      baseBeaconTimestampSolEth,
      dataSolEth,
      signatureSolEth
    );

    return {
      api3ReaderProxyV1EthUsd,
      api3ReaderProxyV1SolEth,
      api3ServerV1,
      productApi3ReaderProxyV1EthSol,
      productApi3ReaderProxyV1SolUsd,
      roles,
    };
  }

  describe('constructor', function () {
    context('proxy1 is not zero address', function () {
      context('proxy2 is not zero address', function () {
        context('proxy1 is not the same as proxy2', function () {
          it('constructs', async function () {
            const {
              productApi3ReaderProxyV1SolUsd,
              productApi3ReaderProxyV1EthSol,
              api3ReaderProxyV1EthUsd,
              api3ReaderProxyV1SolEth,
            } = await helpers.loadFixture(deploy);
            expect(await productApi3ReaderProxyV1SolUsd.proxy1()).to.equal(await api3ReaderProxyV1EthUsd.getAddress());
            expect(await productApi3ReaderProxyV1SolUsd.proxy2()).to.equal(await api3ReaderProxyV1SolEth.getAddress());
            expect(await productApi3ReaderProxyV1EthSol.proxy1()).to.equal(await api3ReaderProxyV1EthUsd.getAddress());
            expect(await productApi3ReaderProxyV1EthSol.proxy2()).to.equal(
              await productApi3ReaderProxyV1SolUsd.getAddress()
            );
          });
        });
        context('proxy1 is the same as proxy2', function () {
          it('reverts', async function () {
            const { api3ReaderProxyV1EthUsd, roles } = await helpers.loadFixture(deploy);
            const productApi3ReaderProxyV1Factory = await ethers.getContractFactory(
              'ProductApi3ReaderProxyV1',
              roles.deployer
            );
            await expect(
              productApi3ReaderProxyV1Factory.deploy(
                await api3ReaderProxyV1EthUsd.getAddress(),
                await api3ReaderProxyV1EthUsd.getAddress()
              )
            )
              .to.be.revertedWithCustomError(productApi3ReaderProxyV1Factory, 'SameProxyAddress')
              .withArgs();
          });
        });
      });
      context('proxy2 is zero address', function () {
        it('reverts', async function () {
          const { api3ReaderProxyV1EthUsd, roles } = await helpers.loadFixture(deploy);
          const productApi3ReaderProxyV1Factory = await ethers.getContractFactory(
            'ProductApi3ReaderProxyV1',
            roles.deployer
          );
          await expect(
            productApi3ReaderProxyV1Factory.deploy(await api3ReaderProxyV1EthUsd.getAddress(), ethers.ZeroAddress)
          )
            .to.be.revertedWithCustomError(productApi3ReaderProxyV1Factory, 'ZeroProxyAddress')
            .withArgs();
        });
      });
    });
    context('proxy1 is zero address', function () {
      it('reverts', async function () {
        const { api3ReaderProxyV1SolEth, roles } = await helpers.loadFixture(deploy);
        const productApi3ReaderProxyV1Factory = await ethers.getContractFactory(
          'ProductApi3ReaderProxyV1',
          roles.deployer
        );
        await expect(
          productApi3ReaderProxyV1Factory.deploy(ethers.ZeroAddress, await api3ReaderProxyV1SolEth.getAddress())
        )
          .to.be.revertedWithCustomError(productApi3ReaderProxyV1Factory, 'ZeroProxyAddress')
          .withArgs();
      });
    });
  });

  describe('read', function () {
    it('reads the product of the proxy rates', async function () {
      const { productApi3ReaderProxyV1SolUsd, api3ReaderProxyV1EthUsd, api3ReaderProxyV1SolEth } =
        await helpers.loadFixture(deploy);
      const [baseBeaconValueEthUsd] = await api3ReaderProxyV1EthUsd.read();
      const [baseBeaconValueSolEth] = await api3ReaderProxyV1SolEth.read();
      const dataFeed = await productApi3ReaderProxyV1SolUsd.read();
      expect(dataFeed.value).to.equal((baseBeaconValueEthUsd * baseBeaconValueSolEth) / 10n ** 18n);
      expect(dataFeed.timestamp).to.equal(await helpers.time.latest());
    });
  });

  describe('latestAnswer', function () {
    it('returns proxy value', async function () {
      const { productApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const [value] = await productApi3ReaderProxyV1SolUsd.read();
      expect(await productApi3ReaderProxyV1SolUsd.latestAnswer()).to.be.equal(value);
    });
  });

  describe('latestTimestamp', function () {
    it('returns proxy value', async function () {
      const { productApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const [, timestamp] = await productApi3ReaderProxyV1SolUsd.read();
      expect(await productApi3ReaderProxyV1SolUsd.latestTimestamp()).to.be.equal(timestamp);
    });
  });

  describe('latestRound', function () {
    it('reverts', async function () {
      const { productApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      await expect(productApi3ReaderProxyV1SolUsd.latestRound())
        .to.be.revertedWithCustomError(productApi3ReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getAnswer', function () {
    it('reverts', async function () {
      const { productApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(productApi3ReaderProxyV1SolUsd.getAnswer(blockNumber))
        .to.be.revertedWithCustomError(productApi3ReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getTimestamp', function () {
    it('reverts', async function () {
      const { productApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(productApi3ReaderProxyV1SolUsd.getTimestamp(blockNumber))
        .to.be.revertedWithCustomError(productApi3ReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('decimals', function () {
    it('returns 18', async function () {
      const { productApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      expect(await productApi3ReaderProxyV1SolUsd.decimals()).to.equal(18);
    });
  });

  describe('description', function () {
    it('returns empty string', async function () {
      const { productApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      expect(await productApi3ReaderProxyV1SolUsd.description()).to.equal('');
    });
  });

  describe('version', function () {
    it('returns 4914', async function () {
      const { productApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      expect(await productApi3ReaderProxyV1SolUsd.version()).to.equal(4914);
    });
  });

  describe('getRoundData', function () {
    it('reverts', async function () {
      const { productApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(productApi3ReaderProxyV1SolUsd.getRoundData(blockNumber))
        .to.be.revertedWithCustomError(productApi3ReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('latestRoundData', function () {
    it('returns approximated round data', async function () {
      const { productApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const [value, timestamp] = await productApi3ReaderProxyV1SolUsd.read();
      const [roundId, answer, startedAt, updatedAt, answeredInRound] =
        await productApi3ReaderProxyV1SolUsd.latestRoundData();
      expect(roundId).to.equal(0);
      expect(answer).to.equal(value);
      expect(startedAt).to.equal(timestamp);
      expect(updatedAt).to.equal(timestamp);
      expect(answeredInRound).to.equal(0);
    });
  });
});
