import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import type { AddressLike, BigNumberish, BytesLike, Interface, VoidSigner } from 'ethers';
import { ethers } from 'hardhat';

import { type DapiProxyWithOev, DapiProxyWithOev__factory } from '../../src/index';
import * as testUtils from '../test-utils';

interface Call {
  target: AddressLike;
  data: BytesLike;
}

async function getDapiTransmutationCalldata(
  preTransmutationCalls: Call[],
  postTransmutationCalls: Call[],
  api3ServerV1Address: AddressLike,
  api3ServerV1Interface: Interface,
  dapiName: BytesLike,
  value: BigNumberish,
  externalMulticallSimulatorInterface: Interface
) {
  // Generating a private key may be a bit too compute-intensive. We can hardcode a mock one instead.
  const MOCK_AIRNODE_PRIVATE_KEY = '0x0fbcf3c01c9bcde58a6efa722b8d9019043dfaf5cdf557693442732e24b9f5ab';
  const airnode = new ethers.BaseWallet(new ethers.SigningKey(MOCK_AIRNODE_PRIVATE_KEY));
  // We want to use a Beacon ID that no one else has used to avoid griefing. Randomly generating the
  // template ID would solve that.
  const templateId = testUtils.generateRandomBytes32();
  const timestamp = Math.floor(Date.now() / 1000);
  const data = ethers.AbiCoder.defaultAbiCoder().encode(['int256'], [value]);
  const signature = await testUtils.signData(airnode, templateId, timestamp, data);
  const beaconId = testUtils.deriveBeaconId(airnode.address, templateId);
  const transmutationCalls = [
    {
      target: api3ServerV1Address,
      data: api3ServerV1Interface.encodeFunctionData('setDapiName', [dapiName, beaconId]),
    },
    {
      target: api3ServerV1Address,
      data: api3ServerV1Interface.encodeFunctionData('updateBeaconWithSignedData', [
        airnode.address,
        templateId,
        timestamp,
        data,
        signature,
      ]),
    },
  ];
  return [...preTransmutationCalls, ...transmutationCalls, ...postTransmutationCalls].map((call) =>
    externalMulticallSimulatorInterface.encodeFunctionData('functionCall', [call.target, call.data])
  );
}

describe('ExternalMulticallSimulator', function () {
  async function deploy() {
    const roleNames = ['deployer', 'randomPerson'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner | VoidSigner> = {
      ...roleNames.reduce((acc, roleName, index) => {
        return { ...acc, [roleName]: accounts[index] };
      }, {}),
      addressZero: new ethers.VoidSigner(ethers.ZeroAddress, ethers.provider),
    };

    const ExternalMulticallSimulatorFactory = await ethers.getContractFactory(
      'ExternalMulticallSimulator',
      roles.deployer
    );
    const externalMulticallSimulator = await ExternalMulticallSimulatorFactory.deploy();
    const MockMulticallTargetFactory = await ethers.getContractFactory('MockMulticallTarget', roles.deployer);
    const mockMulticallTarget = await MockMulticallTargetFactory.deploy();

    return {
      roles,
      externalMulticallSimulator,
      externalMulticallSimulatorInterface: ExternalMulticallSimulatorFactory.interface,
      mockMulticallTarget,
      mockMulticallTargetInterface: MockMulticallTargetFactory.interface,
    };
  }

  async function deployDapiTransmuter() {
    const deployment = await deploy();
    const { roles, externalMulticallSimulator } = deployment;

    const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';
    const dapiNameSetterRoleDescription = 'dAPI name setter';
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const api3ServerV1Factory = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
    const api3ServerV1 = await api3ServerV1Factory.deploy(
      await accessControlRegistry.getAddress(),
      api3ServerV1AdminRoleDescription,
      roles.deployer!.address
    );
    const proxyFactoryFactory = await ethers.getContractFactory('ProxyFactory', roles.deployer);
    const proxyFactory = await proxyFactoryFactory.deploy(await api3ServerV1.getAddress());

    const ethUsdDapiName = ethers.encodeBytes32String('ETH/USD');
    await proxyFactory.deployDapiProxyWithOev(ethUsdDapiName, roles.deployer!.address, '0x');
    const ethUsdDapiProxyWithOev = new ethers.Contract(
      await proxyFactory.computeDapiProxyWithOevAddress(ethUsdDapiName, roles.deployer!.address, '0x'),
      DapiProxyWithOev__factory.abi,
      ethers.provider
    ) as unknown as DapiProxyWithOev;

    const managerRootRole = testUtils.deriveRootRole(roles.deployer!.address);
    const adminRole = testUtils.deriveRole(managerRootRole, api3ServerV1AdminRoleDescription);
    const dapiNameSetterRole = testUtils.deriveRole(adminRole, dapiNameSetterRoleDescription);
    await accessControlRegistry
      .connect(roles.deployer)
      .initializeRoleAndGrantToSender(managerRootRole, api3ServerV1AdminRoleDescription);
    await accessControlRegistry
      .connect(roles.deployer)
      .initializeRoleAndGrantToSender(adminRole, dapiNameSetterRoleDescription);
    await accessControlRegistry
      .connect(roles.deployer)
      .grantRole(dapiNameSetterRole, externalMulticallSimulator.getAddress());

    return {
      ...deployment,
      api3ServerV1,
      api3ServerV1Interface: api3ServerV1Factory.interface,
      ethUsdDapiName,
      ethUsdDapiProxyWithOev,
    };
  }

  // It is not possible to test functionCall() via eth_sendTransaction,
  // so we will only test the eth_call cases
  describe('functionCall via eth_call', function () {
    context('Sender is address-zero', function () {
      context('Gas price is zero', function () {
        context('Target account is a contract', function () {
          context('Function call does not revert', function () {
            it('returns returndata', async function () {
              const { roles, externalMulticallSimulator, mockMulticallTarget, mockMulticallTargetInterface } =
                await helpers.loadFixture(deploy);
              const returndata = await externalMulticallSimulator
                .connect(roles.addressZero)
                .functionCall.staticCall(
                  mockMulticallTarget.getAddress(),
                  mockMulticallTargetInterface.encodeFunctionData('convertsPositiveArgumentToNegative', [1])
                );
              expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata)[0]).to.equal(-1);
            });
          });
          context('Function call reverts with a string', function () {
            it('reverts by bubbling up the revert string', async function () {
              const { roles, externalMulticallSimulator, mockMulticallTarget, mockMulticallTargetInterface } =
                await helpers.loadFixture(deploy);
              await expect(
                externalMulticallSimulator
                  .connect(roles.addressZero)
                  .functionCall.staticCall(
                    mockMulticallTarget.getAddress(),
                    mockMulticallTargetInterface.encodeFunctionData('alwaysRevertsWithString', [1, -1])
                  )
              ).to.be.revertedWith('Reverted with string');
            });
          });
          context('Function call reverts with a custom error', function () {
            it('reverts by bubbling up the custom error', async function () {
              const { roles, externalMulticallSimulator, mockMulticallTarget, mockMulticallTargetInterface } =
                await helpers.loadFixture(deploy);
              await expect(
                externalMulticallSimulator
                  .connect(roles.addressZero)
                  .functionCall.staticCall(
                    mockMulticallTarget.getAddress(),
                    mockMulticallTargetInterface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1])
                  )
              ).to.be.revertedWithCustomError(mockMulticallTarget, 'MyError');
            });
          });
          context('Function call reverts with no data', function () {
            it('reverts by bubbling up no revert data', async function () {
              const { roles, externalMulticallSimulator, mockMulticallTarget, mockMulticallTargetInterface } =
                await helpers.loadFixture(deploy);
              await expect(
                externalMulticallSimulator
                  .connect(roles.addressZero)
                  .functionCall.staticCall(
                    mockMulticallTarget.getAddress(),
                    mockMulticallTargetInterface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1])
                  )
              ).to.be.revertedWith('Address: low-level call failed');
            });
          });
        });
        context('Target account is not a contract', function () {
          it('reverts', async function () {
            const { roles, externalMulticallSimulator } = await helpers.loadFixture(deploy);
            await expect(
              externalMulticallSimulator
                .connect(roles.addressZero)
                .functionCall.staticCall(roles.deployer!.address, '0x')
            ).to.be.revertedWith('Address: call to non-contract');
          });
        });
      });
      context('Gas price is not zero', function () {
        it('reverts', async function () {
          const { roles, externalMulticallSimulator, mockMulticallTarget, mockMulticallTargetInterface } =
            await helpers.loadFixture(deploy);
          await expect(
            externalMulticallSimulator
              .connect(roles.addressZero)
              .functionCall.staticCall(
                mockMulticallTarget.getAddress(),
                mockMulticallTargetInterface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                { gasPrice: 1 }
              )
          ).to.be.revertedWith('Tx gas price not zero');
        });
      });
    });
    context('Sender is not address-zero', function () {
      it('reverts', async function () {
        const { roles, externalMulticallSimulator, mockMulticallTarget, mockMulticallTargetInterface } =
          await helpers.loadFixture(deploy);
        await expect(
          externalMulticallSimulator
            .connect(roles.randomPerson)
            .functionCall.staticCall(
              mockMulticallTarget.getAddress(),
              mockMulticallTargetInterface.encodeFunctionData('convertsPositiveArgumentToNegative', [1])
            )
        ).to.be.revertedWith('Sender address not zero');
      });
    });
  });

  // Demonstrating that it's possible to call this contract with eth_sendTransaction,
  // though it's not possible to use this to make external calls
  describe('multicall via eth_sendTransaction', function () {
    context('There is no call to be made', function () {
      it('does not revert', async function () {
        const { roles, externalMulticallSimulator } = await helpers.loadFixture(deploy);
        await expect(externalMulticallSimulator.connect(roles.randomPerson).multicall([])).to.not.be.reverted;
      });
    });
    context('The calls only include multicall()s with no calls to be made', function () {
      it('does not revert', async function () {
        const { roles, externalMulticallSimulator, externalMulticallSimulatorInterface } =
          await helpers.loadFixture(deploy);
        await expect(
          externalMulticallSimulator
            .connect(roles.randomPerson)
            .multicall([externalMulticallSimulatorInterface.encodeFunctionData('multicall', [[]])])
        ).to.not.be.reverted;
      });
    });
    context('The calls only include tryMulticall()s', function () {
      it('does not revert', async function () {
        const { roles, externalMulticallSimulator, externalMulticallSimulatorInterface } =
          await helpers.loadFixture(deploy);
        await expect(
          externalMulticallSimulator
            .connect(roles.randomPerson)
            .multicall([externalMulticallSimulatorInterface.encodeFunctionData('tryMulticall', [['0x12345678']])])
        ).to.not.be.reverted;
      });
    });
    context('The calls include a functionCall()', function () {
      it('reverts', async function () {
        const {
          roles,
          externalMulticallSimulator,
          externalMulticallSimulatorInterface,
          mockMulticallTarget,
          mockMulticallTargetInterface,
        } = await helpers.loadFixture(deploy);
        await expect(
          externalMulticallSimulator
            .connect(roles.randomPerson)
            .multicall([
              externalMulticallSimulatorInterface.encodeFunctionData('functionCall', [
                await mockMulticallTarget.getAddress(),
                mockMulticallTargetInterface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              ]),
            ])
        ).to.be.revertedWith('Sender address not zero');
      });
    });
  });

  describe('tryMulticall via eth_sendTransaction', function () {
    it('does not revert', async function () {
      const {
        roles,
        externalMulticallSimulator,
        externalMulticallSimulatorInterface,
        mockMulticallTarget,
        mockMulticallTargetInterface,
      } = await helpers.loadFixture(deploy);
      await expect(
        externalMulticallSimulator
          .connect(roles.randomPerson)
          .tryMulticall([
            externalMulticallSimulatorInterface.encodeFunctionData('functionCall', [
              await mockMulticallTarget.getAddress(),
              mockMulticallTargetInterface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            ]),
          ])
      ).to.not.be.reverted;
      expect(await mockMulticallTarget.argumentHistory()).to.deep.equal([]);
    });
  });

  // We won't test multicall() and tryMulticall() via eth_call, as they are expected to
  // behave normally

  // DapiTransmuter is an ExternalMulticallSimulator contract that is given the dAPI name setter role.
  // OEV searchers can use a DapiTransmuter to simulate multicalls that update dAPIs and make arbitrary calls.
  describe('DapiTransmuter', function () {
    it('transmuted dAPI value', async function () {
      const {
        roles,
        externalMulticallSimulator,
        externalMulticallSimulatorInterface,
        api3ServerV1,
        api3ServerV1Interface,
        ethUsdDapiName,
        ethUsdDapiProxyWithOev,
      } = await deployDapiTransmuter();
      const preTransmutationCalls: Call[] = [];
      const postTransmutationCalls = [
        {
          target: await ethUsdDapiProxyWithOev.getAddress(),
          data: ethUsdDapiProxyWithOev.interface.encodeFunctionData('read'),
        },
      ];
      const transmutationValue = 123_456;
      const dapiTransmutationCalldata = await getDapiTransmutationCalldata(
        preTransmutationCalls,
        postTransmutationCalls,
        await api3ServerV1.getAddress(),
        api3ServerV1Interface,
        ethUsdDapiName,
        transmutationValue,
        externalMulticallSimulatorInterface
      );
      const returndata = await externalMulticallSimulator
        .connect(roles.addressZero)
        .multicall.staticCall(dapiTransmutationCalldata);
      // Note that the decoding below is a bit tricky. From the array, the user picks
      // the item whose returndata they want to read, decode that as a `bytes` type,
      // then decode the result of that with the types of the returndata of the function
      // they called.
      const readReturndata = returndata.at(-1);
      const [decodedFunctionCallReturndata] = externalMulticallSimulator.interface.decodeFunctionResult(
        'functionCall',
        readReturndata!
      );
      const [transmutedValue] = ethUsdDapiProxyWithOev.interface.decodeFunctionResult(
        'read',
        decodedFunctionCallReturndata
      );
      expect(transmutedValue).to.equal(transmutationValue);
    });
  });
});
