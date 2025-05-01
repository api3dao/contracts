import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { CompositeApi3ReaderProxyV1__factory } from '../../../src/index';
import * as testUtils from '../../test-utils';

describe('CompositeApi3ReaderProxyV1Factory', function () {
  enum CalculationType {
    Divide,
    Multiply,
  }

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

    const CompositeApi3ReaderProxyV1Factory = await ethers.getContractFactory(
      'CompositeApi3ReaderProxyV1Factory',
      roles.deployer
    );
    const compositeApi3ReaderProxyV1Factory = await CompositeApi3ReaderProxyV1Factory.deploy();

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
      api3ReaderProxyV1EthUsd,
      api3ReaderProxyV1SolEth,
      baseBeaconValueEthUsd,
      baseBeaconValueSolEth,
      compositeApi3ReaderProxyV1Factory,
      metadata: '0x12345678',
      roles,
    };
  }

  describe('deployDataFeedProxy', function () {
    context('proxy1 is not zero', function () {
      context('proxy2 is not zero', function () {
        context('proxy1 and proxy2 are not same address', function () {
          it('deploys composite data feed proxy', async function () {
            const {
              baseBeaconValueEthUsd,
              baseBeaconValueSolEth,
              compositeApi3ReaderProxyV1Factory,
              api3ReaderProxyV1EthUsd,
              api3ReaderProxyV1SolEth,
              metadata,
              roles,
            } = await helpers.loadFixture(deploy);
            const proxy1 = await api3ReaderProxyV1EthUsd.getAddress();
            const proxy2 = await api3ReaderProxyV1SolEth.getAddress();
            const calculationType = CalculationType.Multiply;

            // Precompute the proxy address
            const proxyAddress = await compositeApi3ReaderProxyV1Factory.computeCompositeApi3ReaderProxyV1Address(
              proxy1,
              proxy2,
              CalculationType.Multiply,
              metadata
            );

            // Can only deploy once
            await expect(
              compositeApi3ReaderProxyV1Factory.deployCompositeApi3ReaderProxyV1(
                proxy1,
                proxy2,
                calculationType,
                metadata
              )
            )
              .to.emit(compositeApi3ReaderProxyV1Factory, 'DeployedCompositeApi3ReaderProxyV1')
              .withArgs(proxyAddress, proxy1, proxy2, calculationType, metadata);
            // Subsequent deployments will revert with no string
            await expect(
              compositeApi3ReaderProxyV1Factory.deployCompositeApi3ReaderProxyV1(
                proxy1,
                proxy2,
                calculationType,
                metadata
              )
            ).to.be.reverted;

            // Confirm that the bytecode is the same
            const CompositeApi3ReaderProxyV1 = await ethers.getContractFactory(
              'CompositeApi3ReaderProxyV1',
              roles.deployer
            );
            const eoaDeployedCompositeApi3ReaderProxyV1 = await CompositeApi3ReaderProxyV1.deploy(
              proxy1,
              proxy2,
              calculationType
            );
            expect(await ethers.provider.getCode(proxyAddress)).to.equal(
              await ethers.provider.getCode(await eoaDeployedCompositeApi3ReaderProxyV1.getAddress())
            );

            // Test the deployed contract
            const compositeApi3ReaderProxyV1 = CompositeApi3ReaderProxyV1__factory.connect(
              proxyAddress,
              roles.deployer
            );
            expect(await compositeApi3ReaderProxyV1.proxy1()).to.equal(proxy1);
            expect(await compositeApi3ReaderProxyV1.proxy2()).to.equal(proxy2);
            expect(await compositeApi3ReaderProxyV1.calculationType()).to.equal(calculationType);
            const compositeValue = await compositeApi3ReaderProxyV1.read();
            expect(compositeValue.value).to.equal((baseBeaconValueEthUsd * baseBeaconValueSolEth) / 10n ** 18n);
            expect(compositeValue.timestamp).to.equal(await helpers.time.latest());
          });
        });
        context('proxy1 and proxy2 are same address', function () {
          it('reverts', async function () {
            const { compositeApi3ReaderProxyV1Factory, api3ReaderProxyV1EthUsd, metadata } =
              await helpers.loadFixture(deploy);
            const proxy1 = await api3ReaderProxyV1EthUsd.getAddress();
            const proxy2 = proxy1;
            await expect(
              compositeApi3ReaderProxyV1Factory.computeCompositeApi3ReaderProxyV1Address(
                proxy1,
                proxy2,
                CalculationType.Multiply,
                metadata
              )
            ).to.be.revertedWith('proxies same address');
          });
        });
      });
      context('proxy2 is zero', function () {
        it('reverts', async function () {
          const { compositeApi3ReaderProxyV1Factory, api3ReaderProxyV1EthUsd } = await helpers.loadFixture(deploy);
          const metadata = testUtils.generateRandomBytes();
          await expect(
            compositeApi3ReaderProxyV1Factory.computeCompositeApi3ReaderProxyV1Address(
              await api3ReaderProxyV1EthUsd.getAddress(),
              ethers.ZeroAddress,
              CalculationType.Multiply,
              metadata
            )
          ).to.be.revertedWith('proxy2 address zero');
        });
      });
    });
    context('proxy1 is zero', function () {
      it('reverts', async function () {
        const { compositeApi3ReaderProxyV1Factory, api3ReaderProxyV1SolEth } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(
          compositeApi3ReaderProxyV1Factory.computeCompositeApi3ReaderProxyV1Address(
            ethers.ZeroAddress,
            await api3ReaderProxyV1SolEth.getAddress(),
            CalculationType.Multiply,
            metadata
          )
        ).to.be.revertedWith('proxy1 address zero');
      });
    });
  });

  describe('computeDataFeedProxyAddress', function () {
    context('proxy1 is not zero', function () {
      context('proxy2 is not zero', function () {
        context('proxy1 and proxy2 are not same address', function () {
          it('computes composite data feed proxy address', async function () {
            const { compositeApi3ReaderProxyV1Factory, api3ReaderProxyV1EthUsd, api3ReaderProxyV1SolEth, metadata } =
              await helpers.loadFixture(deploy);
            const proxy1 = await api3ReaderProxyV1EthUsd.getAddress();
            const proxy2 = await api3ReaderProxyV1SolEth.getAddress();
            // Precompute the proxy address
            const proxyAddress = ethers.getCreate2Address(
              await compositeApi3ReaderProxyV1Factory.getAddress(),
              ethers.keccak256(metadata),
              ethers.solidityPackedKeccak256(
                ['bytes', 'bytes'],
                [
                  CompositeApi3ReaderProxyV1__factory.bytecode,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'address', 'uint256'],
                    [proxy1, proxy2, CalculationType.Multiply]
                  ),
                ]
              )
            );
            expect(
              await compositeApi3ReaderProxyV1Factory.computeCompositeApi3ReaderProxyV1Address(
                proxy1,
                proxy2,
                CalculationType.Multiply,
                metadata
              )
            ).to.equal(proxyAddress);
          });
        });
        context('proxy1 and proxy2 are same address', function () {
          it('reverts', async function () {
            const { compositeApi3ReaderProxyV1Factory, api3ReaderProxyV1EthUsd, metadata } =
              await helpers.loadFixture(deploy);
            const proxy1 = await api3ReaderProxyV1EthUsd.getAddress();
            const proxy2 = proxy1;
            await expect(
              compositeApi3ReaderProxyV1Factory.computeCompositeApi3ReaderProxyV1Address(
                proxy1,
                proxy2,
                CalculationType.Multiply,
                metadata
              )
            ).to.be.revertedWith('proxies same address');
          });
        });
      });
      context('proxy2 is zero', function () {
        it('reverts', async function () {
          const { compositeApi3ReaderProxyV1Factory, api3ReaderProxyV1EthUsd } = await helpers.loadFixture(deploy);
          const metadata = testUtils.generateRandomBytes();
          await expect(
            compositeApi3ReaderProxyV1Factory.computeCompositeApi3ReaderProxyV1Address(
              await api3ReaderProxyV1EthUsd.getAddress(),
              ethers.ZeroAddress,
              CalculationType.Multiply,
              metadata
            )
          ).to.be.revertedWith('proxy2 address zero');
        });
      });
    });
    context('proxy1 is zero', function () {
      it('reverts', async function () {
        const { compositeApi3ReaderProxyV1Factory, api3ReaderProxyV1SolEth } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(
          compositeApi3ReaderProxyV1Factory.computeCompositeApi3ReaderProxyV1Address(
            ethers.ZeroAddress,
            await api3ReaderProxyV1SolEth.getAddress(),
            CalculationType.Multiply,
            metadata
          )
        ).to.be.revertedWith('proxy1 address zero');
      });
    });
  });
});
