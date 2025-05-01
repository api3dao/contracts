import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import * as testUtils from '../../test-utils';
import { encodeData } from '../Api3ServerV1.sol';
import { payOevBid, signDataWithAlternateTemplateId } from '../Api3ServerV1OevExtension.sol';

describe('CompositeApi3ReaderProxyV1', function () {
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
    const auctioneerRoleDescription = 'Auctioneer';
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, api3ServerV1OevExtensionAdminRoleDescription);
    const auctioneerRole = testUtils.deriveRole(adminRole, auctioneerRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, auctioneerRoleDescription);
    await accessControlRegistry.connect(roles.manager).grantRole(auctioneerRole, roles.auctioneer!.address);

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

    const compositeApi3ReaderProxyV1Factory = await ethers.getContractFactory(
      'CompositeApi3ReaderProxyV1',
      roles.deployer
    );

    const decimals = 8n;
    const compositeApi3ReaderProxyV1SolUsd = await compositeApi3ReaderProxyV1Factory.deploy(
      api3ReaderProxyV1EthUsd.getAddress(),
      api3ReaderProxyV1SolEth.getAddress(),
      decimals
    );

    const compositeApi3ReaderProxyV1EthSol = await compositeApi3ReaderProxyV1Factory.deploy(
      api3ReaderProxyV1EthUsd.getAddress(),
      compositeApi3ReaderProxyV1SolUsd.getAddress(),
      decimals
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
      api3ServerV1OevExtension,
      api3ServerV1OevExtensionOevBidPayer,
      baseBeaconTimestampEthUsd,
      baseBeaconTimestampSolEth,
      baseBeaconValueEthUsd,
      baseBeaconValueSolEth,
      compositeApi3ReaderProxyV1EthSol,
      compositeApi3ReaderProxyV1SolUsd,
      dapiNameEthUsd,
      dapiNameSolEth,
      dappId,
      decimals,
      roles,
      templateIdEthUsd,
      templateIdSolEth,
    };
  }

  describe('constructor', function () {
    context('proxy1 is not zero address', function () {
      context('proxy2 is not zero address', function () {
        context('proxy1 is not the same as proxy2', function () {
          it('constructs', async function () {
            const {
              compositeApi3ReaderProxyV1SolUsd,
              compositeApi3ReaderProxyV1EthSol,
              api3ReaderProxyV1EthUsd,
              api3ReaderProxyV1SolEth,
            } = await helpers.loadFixture(deploy);
            expect(await compositeApi3ReaderProxyV1SolUsd.proxy1()).to.equal(
              await api3ReaderProxyV1EthUsd.getAddress()
            );
            expect(await compositeApi3ReaderProxyV1SolUsd.proxy2()).to.equal(
              await api3ReaderProxyV1SolEth.getAddress()
            );
            expect(await compositeApi3ReaderProxyV1EthSol.proxy1()).to.equal(
              await api3ReaderProxyV1EthUsd.getAddress()
            );
            expect(await compositeApi3ReaderProxyV1EthSol.proxy2()).to.equal(
              await compositeApi3ReaderProxyV1SolUsd.getAddress()
            );
          });
        });
        context('proxy1 is the same as proxy2', function () {
          it('reverts', async function () {
            const { api3ReaderProxyV1EthUsd, decimals, roles } = await helpers.loadFixture(deploy);
            const compositeApi3ReaderProxyV1Factory = await ethers.getContractFactory(
              'CompositeApi3ReaderProxyV1',
              roles.deployer
            );
            await expect(
              compositeApi3ReaderProxyV1Factory.deploy(
                await api3ReaderProxyV1EthUsd.getAddress(),
                await api3ReaderProxyV1EthUsd.getAddress(),
                decimals
              )
            )
              .to.be.revertedWithCustomError(compositeApi3ReaderProxyV1Factory, 'SameProxyAddress')
              .withArgs();
          });
        });
      });
      context('proxy2 is zero address', function () {
        it('reverts', async function () {
          const { api3ReaderProxyV1EthUsd, decimals, roles } = await helpers.loadFixture(deploy);
          const compositeApi3ReaderProxyV1Factory = await ethers.getContractFactory(
            'CompositeApi3ReaderProxyV1',
            roles.deployer
          );
          await expect(
            compositeApi3ReaderProxyV1Factory.deploy(
              await api3ReaderProxyV1EthUsd.getAddress(),
              ethers.ZeroAddress,
              decimals
            )
          )
            .to.be.revertedWithCustomError(compositeApi3ReaderProxyV1Factory, 'ZeroProxyAddress')
            .withArgs();
        });
      });
    });
    context('proxy1 is zero address', function () {
      it('reverts', async function () {
        const { api3ReaderProxyV1SolEth, decimals, roles } = await helpers.loadFixture(deploy);
        const compositeApi3ReaderProxyV1Factory = await ethers.getContractFactory(
          'CompositeApi3ReaderProxyV1',
          roles.deployer
        );
        await expect(
          compositeApi3ReaderProxyV1Factory.deploy(
            ethers.ZeroAddress,
            await api3ReaderProxyV1SolEth.getAddress(),
            decimals
          )
        )
          .to.be.revertedWithCustomError(compositeApi3ReaderProxyV1Factory, 'ZeroProxyAddress')
          .withArgs();
      });
    });
  });

  describe('read', function () {
    it('reads composite rate feed', async function () {
      const {
        roles,
        api3ServerV1OevExtensionOevBidPayer,
        compositeApi3ReaderProxyV1SolUsd,
        dappId,
        decimals,
        baseBeaconTimestampSolEth,
        baseBeaconValueEthUsd,
        baseBeaconValueSolEth,
        templateIdSolEth,
      } = await helpers.loadFixture(deploy);
      const oevBeaconValueSolEth = (baseBeaconValueSolEth * 101n) / 100n; // 1% increase
      const oevBeaconTimestampSolEth = baseBeaconTimestampSolEth + 1;
      const signedDataTimestampCutoff = oevBeaconTimestampSolEth + 10;
      await helpers.time.setNextBlockTimestamp(oevBeaconTimestampSolEth + 1);
      await payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, dappId, signedDataTimestampCutoff, 1);
      const signature = await signDataWithAlternateTemplateId(
        roles.airnode as any,
        templateIdSolEth,
        oevBeaconTimestampSolEth,
        encodeData(oevBeaconValueSolEth)
      );
      const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
        [
          roles.airnode!.address,
          templateIdSolEth,
          oevBeaconTimestampSolEth,
          encodeData(oevBeaconValueSolEth),
          signature,
        ]
      );
      await helpers.time.setNextBlockTimestamp(oevBeaconTimestampSolEth + 2);
      await api3ServerV1OevExtensionOevBidPayer.connect(roles.searcher).updateDappOevDataFeed(dappId, [signedData]);
      const dataFeed = await compositeApi3ReaderProxyV1SolUsd.read();
      expect(dataFeed.value).to.equal(
        (((baseBeaconValueEthUsd * 10n ** decimals) / 10n ** 18n) *
          ((oevBeaconValueSolEth * 10n ** decimals) / 10n ** 18n)) /
          10n ** decimals
      );
      expect(dataFeed.timestamp).to.equal(await helpers.time.latest());
    });
  });

  describe('latestAnswer', function () {
    it('returns proxy value', async function () {
      const { compositeApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const [value] = await compositeApi3ReaderProxyV1SolUsd.read();
      expect(await compositeApi3ReaderProxyV1SolUsd.latestAnswer()).to.be.equal(value);
    });
  });

  describe('latestTimestamp', function () {
    it('returns proxy value', async function () {
      const { compositeApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const [, timestamp] = await compositeApi3ReaderProxyV1SolUsd.read();
      expect(await compositeApi3ReaderProxyV1SolUsd.latestTimestamp()).to.be.equal(timestamp);
    });
  });

  describe('latestRound', function () {
    it('reverts', async function () {
      const { compositeApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      await expect(compositeApi3ReaderProxyV1SolUsd.latestRound())
        .to.be.revertedWithCustomError(compositeApi3ReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getAnswer', function () {
    it('reverts', async function () {
      const { compositeApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(compositeApi3ReaderProxyV1SolUsd.getAnswer(blockNumber))
        .to.be.revertedWithCustomError(compositeApi3ReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getTimestamp', function () {
    it('reverts', async function () {
      const { compositeApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(compositeApi3ReaderProxyV1SolUsd.getTimestamp(blockNumber))
        .to.be.revertedWithCustomError(compositeApi3ReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('decimals', function () {
    it('returns 18', async function () {
      const { compositeApi3ReaderProxyV1SolUsd, decimals } = await helpers.loadFixture(deploy);
      expect(await compositeApi3ReaderProxyV1SolUsd.decimals()).to.equal(decimals);
    });
  });

  describe('description', function () {
    it('returns empty string', async function () {
      const { compositeApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      expect(await compositeApi3ReaderProxyV1SolUsd.description()).to.equal('');
    });
  });

  describe('version', function () {
    it('returns 4913', async function () {
      const { compositeApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      expect(await compositeApi3ReaderProxyV1SolUsd.version()).to.equal(4914);
    });
  });

  describe('getRoundData', function () {
    it('reverts', async function () {
      const { compositeApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(compositeApi3ReaderProxyV1SolUsd.getRoundData(blockNumber))
        .to.be.revertedWithCustomError(compositeApi3ReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('latestRoundData', function () {
    it('returns approximated round data', async function () {
      const { compositeApi3ReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const [value, timestamp] = await compositeApi3ReaderProxyV1SolUsd.read();
      const [roundId, answer, startedAt, updatedAt, answeredInRound] =
        await compositeApi3ReaderProxyV1SolUsd.latestRoundData();
      expect(roundId).to.equal(0);
      expect(answer).to.equal(value);
      expect(startedAt).to.equal(timestamp);
      expect(updatedAt).to.equal(timestamp);
      expect(answeredInRound).to.equal(0);
    });
  });
});
