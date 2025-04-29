import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import * as testUtils from '../../test-utils';
import { encodeData } from '../Api3ServerV1.sol';
import { payOevBid, signDataWithAlternateTemplateId } from '../Api3ServerV1OevExtension.sol';

// See Api3CrossRateReaderProxyV1Factory tests for the upgrade flow
describe('Api3CrossRateReaderProxyV1', function () {
  enum CalculationType {
    Divide1By2,
    Divide2By1,
    Multiply,
  }

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

    const api3CrossRateReaderProxyV1Factory = await ethers.getContractFactory(
      'Api3CrossRateReaderProxyV1',
      roles.deployer
    );

    const api3CrossRateReaderProxyV1SolUsd = await api3CrossRateReaderProxyV1Factory.deploy(
      api3ReaderProxyV1EthUsd.getAddress(),
      api3ReaderProxyV1SolEth.getAddress(),
      CalculationType.Multiply,
      ethers.encodeBytes32String('SOL/USD')
    );

    const api3CrossRateReaderProxyV1EthSol = await api3CrossRateReaderProxyV1Factory.deploy(
      api3ReaderProxyV1EthUsd.getAddress(),
      api3CrossRateReaderProxyV1SolUsd.getAddress(),
      CalculationType.Divide1By2,
      ethers.encodeBytes32String('ETH/SOL')
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

    const baseBeaconValueEthUsd = ethers.parseUnits('1824.97', 18);
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

    const baseBeaconValueSolEth = ethers.parseUnits('0.08202', 18);
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
      api3CrossRateReaderProxyV1SolUsd,
      api3CrossRateReaderProxyV1EthSol,
      api3ReaderProxyV1EthUsd,
      api3ReaderProxyV1SolEth,
      api3ServerV1,
      api3ServerV1OevExtension,
      api3ServerV1OevExtensionOevBidPayer,
      baseBeaconTimestampEthUsd,
      baseBeaconTimestampSolEth,
      baseBeaconValueEthUsd,
      baseBeaconValueSolEth,
      dapiNameEthUsd,
      dapiNameSolEth,
      dappId,
      roles,
      templateIdEthUsd,
      templateIdSolEth,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const {
        api3CrossRateReaderProxyV1SolUsd,
        api3CrossRateReaderProxyV1EthSol,
        api3ReaderProxyV1EthUsd,
        api3ReaderProxyV1SolEth,
      } = await helpers.loadFixture(deploy);
      expect(await api3CrossRateReaderProxyV1SolUsd.owner()).to.equal(ethers.ZeroAddress);
      expect(await api3CrossRateReaderProxyV1SolUsd.proxy1()).to.equal(await api3ReaderProxyV1EthUsd.getAddress());
      expect(await api3CrossRateReaderProxyV1SolUsd.proxy2()).to.equal(await api3ReaderProxyV1SolEth.getAddress());
      expect(await api3CrossRateReaderProxyV1SolUsd.calculationType()).to.equal(CalculationType.Multiply);
      expect(await api3CrossRateReaderProxyV1SolUsd.crossRateDapiName()).to.equal(
        ethers.encodeBytes32String('SOL/USD')
      );
      expect(await api3CrossRateReaderProxyV1EthSol.owner()).to.equal(ethers.ZeroAddress);
      expect(await api3CrossRateReaderProxyV1EthSol.proxy1()).to.equal(await api3ReaderProxyV1EthUsd.getAddress());
      expect(await api3CrossRateReaderProxyV1EthSol.proxy2()).to.equal(
        await api3CrossRateReaderProxyV1SolUsd.getAddress()
      );
      expect(await api3CrossRateReaderProxyV1EthSol.calculationType()).to.equal(CalculationType.Divide1By2);
      expect(await api3CrossRateReaderProxyV1EthSol.crossRateDapiName()).to.equal(
        ethers.encodeBytes32String('ETH/SOL')
      );
    });
  });

  describe('initialize', function () {
    it('reverts', async function () {
      const { roles, api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      await expect(api3CrossRateReaderProxyV1SolUsd.initialize(roles.owner!.address))
        .to.be.revertedWithCustomError(api3CrossRateReaderProxyV1SolUsd, 'InvalidInitialization')
        .withArgs();
    });
  });

  describe('read', function () {
    context('proxy calculation type is Multiply or underlying do not return zero', function () {
      it('reads cross rate feed', async function () {
        const {
          roles,
          api3ServerV1OevExtensionOevBidPayer,
          api3CrossRateReaderProxyV1SolUsd,
          dappId,
          baseBeaconValueEthUsd,
          baseBeaconTimestampEthUsd,
          templateIdSolEth,
          baseBeaconValueSolEth,
          baseBeaconTimestampSolEth,
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
        const dataFeed = await api3CrossRateReaderProxyV1SolUsd.read();
        expect(dataFeed.value).to.equal((baseBeaconValueEthUsd * oevBeaconValueSolEth) / 10n ** 18n);
        expect(dataFeed.timestamp).to.equal(baseBeaconTimestampEthUsd); // Returns the oldest timestamp
      });
    });
    context('proxy calculation type is Divide1By2 and underlying returns zero', function () {
      it('reverts', async function () {
        const {
          api3CrossRateReaderProxyV1SolUsd,
          api3CrossRateReaderProxyV1EthSol,
          api3ServerV1,
          roles,
          templateIdEthUsd,
        } = await helpers.loadFixture(deploy);

        const baseBeaconTimestampEthUsd = await helpers.time.latest();
        const dataEthUsd = ethers.AbiCoder.defaultAbiCoder().encode(['int256'], [0n]);
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

        await expect(api3CrossRateReaderProxyV1EthSol.read())
          .to.be.revertedWithCustomError(api3CrossRateReaderProxyV1EthSol, 'ProxyReturnedZero')
          .withArgs(await api3CrossRateReaderProxyV1SolUsd.getAddress());
      });
    });
  });

  describe('latestAnswer', function () {
    it('returns proxy value', async function () {
      const { api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const [value] = await api3CrossRateReaderProxyV1SolUsd.read();
      expect(await api3CrossRateReaderProxyV1SolUsd.latestAnswer()).to.be.equal(value);
    });
  });

  describe('latestTimestamp', function () {
    it('returns proxy value', async function () {
      const { api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const [, timestamp] = await api3CrossRateReaderProxyV1SolUsd.read();
      expect(await api3CrossRateReaderProxyV1SolUsd.latestTimestamp()).to.be.equal(timestamp);
    });
  });

  describe('latestRound', function () {
    it('reverts', async function () {
      const { api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      await expect(api3CrossRateReaderProxyV1SolUsd.latestRound())
        .to.be.revertedWithCustomError(api3CrossRateReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getAnswer', function () {
    it('reverts', async function () {
      const { api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(api3CrossRateReaderProxyV1SolUsd.getAnswer(blockNumber))
        .to.be.revertedWithCustomError(api3CrossRateReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('getTimestamp', function () {
    it('reverts', async function () {
      const { api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(api3CrossRateReaderProxyV1SolUsd.getTimestamp(blockNumber))
        .to.be.revertedWithCustomError(api3CrossRateReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('decimals', function () {
    it('returns 18', async function () {
      const { api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      expect(await api3CrossRateReaderProxyV1SolUsd.decimals()).to.equal(18);
    });
  });

  describe('description', function () {
    it('returns empty string', async function () {
      const { api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      expect(await api3CrossRateReaderProxyV1SolUsd.description()).to.equal('');
    });
  });

  describe('version', function () {
    it('returns 4913', async function () {
      const { api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      expect(await api3CrossRateReaderProxyV1SolUsd.version()).to.equal(4914);
    });
  });

  describe('getRoundData', function () {
    it('reverts', async function () {
      const { api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(api3CrossRateReaderProxyV1SolUsd.getRoundData(blockNumber))
        .to.be.revertedWithCustomError(api3CrossRateReaderProxyV1SolUsd, 'FunctionIsNotSupported')
        .withArgs();
    });
  });

  describe('latestRoundData', function () {
    it('returns approximated round data', async function () {
      const { api3CrossRateReaderProxyV1SolUsd } = await helpers.loadFixture(deploy);
      const [value, timestamp] = await api3CrossRateReaderProxyV1SolUsd.read();
      const [roundId, answer, startedAt, updatedAt, answeredInRound] =
        await api3CrossRateReaderProxyV1SolUsd.latestRoundData();
      expect(roundId).to.equal(0);
      expect(answer).to.equal(value);
      expect(startedAt).to.equal(timestamp);
      expect(updatedAt).to.equal(timestamp);
      expect(answeredInRound).to.equal(0);
    });
  });
});
