import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hardhat from 'hardhat';

const { ethers } = hardhat;

describe('OwnableCallForwarder', function () {
  async function deploy() {
    const roleNames = ['deployer', 'owner', 'randomPerson'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const mockCallForwarderTargetFactory = await ethers.getContractFactory('MockCallForwarderTarget', roles.deployer);
    const ownableCallForwarderTarget = await mockCallForwarderTargetFactory.deploy();
    const ownableCallForwarderFactory = await ethers.getContractFactory('OwnableCallForwarder', roles.deployer);
    const ownableCallForwarder = await ownableCallForwarderFactory.deploy(roles.owner!.address);
    return {
      roles,
      ownableCallForwarder,
      ownableCallForwarderTarget,
    };
  }

  describe('constructor', function () {
    it('constructor', async function () {
      const { roles, ownableCallForwarder } = await helpers.loadFixture(deploy);
      expect(await ownableCallForwarder.owner()).to.equal(roles.owner!.address);
    });
  });

  describe('forwardCall', function () {
    context('Sender is the owner', function () {
      context('Target address belongs to a contract', function () {
        context('Target function exists', function () {
          context('Target function is payable', function () {
            context('Message value is zero', function () {
              context('Target function does not revert', function () {
                it('forwards call', async function () {
                  const { roles, ownableCallForwarder, ownableCallForwarderTarget } = await helpers.loadFixture(deploy);
                  const input1 = 'input1';
                  const input2 = 123;
                  const value = 0;
                  const calldata = ownableCallForwarderTarget.interface.encodeFunctionData('payableTargetFunction', [
                    input1,
                    input2,
                    value,
                  ]);
                  const returndata = await ownableCallForwarder
                    .connect(roles.owner)
                    .forwardCall.staticCall(ownableCallForwarderTarget.getAddress(), calldata, { value });
                  const expectedReturndata = ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes', 'bool'],
                    ['0x12345678', true]
                  );
                  expect(returndata).to.equal(expectedReturndata);
                  await ownableCallForwarder
                    .connect(roles.owner)
                    .forwardCall(ownableCallForwarderTarget.getAddress(), calldata, { value });
                  expect(await ownableCallForwarderTarget.storage1()).to.equal(input1);
                  expect(await ownableCallForwarderTarget.storage2()).to.equal(input2);
                  expect(await ethers.provider.getBalance(await ownableCallForwarderTarget.getAddress())).to.equal(
                    value
                  );
                });
              });
              context('Target function reverts', function () {
                it('reverts', async function () {
                  const { roles, ownableCallForwarder, ownableCallForwarderTarget } = await helpers.loadFixture(deploy);
                  const input1 = 'this will make the call revert';
                  const input2 = 123;
                  const value = 0;
                  const calldata = ownableCallForwarderTarget.interface.encodeFunctionData('payableTargetFunction', [
                    input1,
                    input2,
                    value,
                  ]);
                  await expect(
                    ownableCallForwarder
                      .connect(roles.owner)
                      .forwardCall(ownableCallForwarderTarget.getAddress(), calldata, { value })
                  ).to.be.revertedWith('Incorrect input');
                });
              });
            });
            context('Message value is not zero', function () {
              context('Target function does not revert', function () {
                it('forwards call', async function () {
                  const { roles, ownableCallForwarder, ownableCallForwarderTarget } = await helpers.loadFixture(deploy);
                  const input1 = 'input1';
                  const input2 = 123;
                  const value = 456;
                  const calldata = ownableCallForwarderTarget.interface.encodeFunctionData('payableTargetFunction', [
                    input1,
                    input2,
                    value,
                  ]);
                  const returndata = await ownableCallForwarder
                    .connect(roles.owner)
                    .forwardCall.staticCall(ownableCallForwarderTarget.getAddress(), calldata, { value });
                  const expectedReturndata = ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes', 'bool'],
                    ['0x12345678', true]
                  );
                  expect(returndata).to.equal(expectedReturndata);
                  await ownableCallForwarder
                    .connect(roles.owner)
                    .forwardCall(ownableCallForwarderTarget.getAddress(), calldata, { value });
                  expect(await ownableCallForwarderTarget.storage1()).to.equal(input1);
                  expect(await ownableCallForwarderTarget.storage2()).to.equal(input2);
                  expect(await ethers.provider.getBalance(await ownableCallForwarderTarget.getAddress())).to.equal(
                    value
                  );
                });
              });
              context('Target function reverts', function () {
                it('reverts', async function () {
                  const { roles, ownableCallForwarder, ownableCallForwarderTarget } = await helpers.loadFixture(deploy);
                  const input1 = 'this will make the call revert';
                  const input2 = 123;
                  const value = 456;
                  const calldata = ownableCallForwarderTarget.interface.encodeFunctionData('payableTargetFunction', [
                    input1,
                    input2,
                    value,
                  ]);
                  await expect(
                    ownableCallForwarder
                      .connect(roles.owner)
                      .forwardCall(ownableCallForwarderTarget.getAddress(), calldata, { value })
                  ).to.be.revertedWith('Incorrect input');
                });
              });
            });
          });
          context('Target function is not payable', function () {
            context('Message value is zero', function () {
              context('Target function does not revert', function () {
                it('forwards call', async function () {
                  const { roles, ownableCallForwarder, ownableCallForwarderTarget } = await helpers.loadFixture(deploy);
                  const input1 = 'input1';
                  const input2 = 123;
                  const calldata = ownableCallForwarderTarget.interface.encodeFunctionData('nonpayableTargetFunction', [
                    input1,
                    input2,
                  ]);
                  const returndata = await ownableCallForwarder
                    .connect(roles.owner)
                    .forwardCall.staticCall(ownableCallForwarderTarget.getAddress(), calldata);
                  const expectedReturndata = ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes', 'bool'],
                    ['0x12345678', true]
                  );
                  expect(returndata).to.equal(expectedReturndata);
                  await ownableCallForwarder
                    .connect(roles.owner)
                    .forwardCall(ownableCallForwarderTarget.getAddress(), calldata);
                  expect(await ownableCallForwarderTarget.storage1()).to.equal(input1);
                  expect(await ownableCallForwarderTarget.storage2()).to.equal(input2);
                });
              });
              context('Target function reverts', function () {
                it('reverts', async function () {
                  const { roles, ownableCallForwarder, ownableCallForwarderTarget } = await helpers.loadFixture(deploy);
                  const input1 = 'this will make the call revert';
                  const input2 = 123;
                  const calldata = ownableCallForwarderTarget.interface.encodeFunctionData('nonpayableTargetFunction', [
                    input1,
                    input2,
                  ]);
                  await expect(
                    ownableCallForwarder
                      .connect(roles.owner)
                      .forwardCall(ownableCallForwarderTarget.getAddress(), calldata)
                  ).to.be.revertedWith('Incorrect input');
                });
              });
            });
            context('Message value is not zero', function () {
              it('reverts', async function () {
                const { roles, ownableCallForwarder, ownableCallForwarderTarget } = await helpers.loadFixture(deploy);
                const input1 = 'input1';
                const input2 = 123;
                const value = 456;
                const calldata = ownableCallForwarderTarget.interface.encodeFunctionData('nonpayableTargetFunction', [
                  input1,
                  input2,
                ]);
                await expect(
                  ownableCallForwarder
                    .connect(roles.owner)
                    .forwardCall(ownableCallForwarderTarget.getAddress(), calldata, { value })
                ).to.be.revertedWith('Address: low-level call with value failed');
              });
            });
          });
        });
        context('Target function does not exist', function () {
          it('reverts', async function () {
            const { roles, ownableCallForwarder, ownableCallForwarderTarget } = await helpers.loadFixture(deploy);
            const nonexistentFunctionSelector = '0x12345678';
            await expect(
              ownableCallForwarder
                .connect(roles.owner)
                .forwardCall(ownableCallForwarderTarget.getAddress(), nonexistentFunctionSelector)
            ).to.be.revertedWith('Address: low-level call with value failed');
          });
        });
      });
      context('Target address does not belong to a contract', function () {
        it('reverts', async function () {
          const { roles, ownableCallForwarder } = await helpers.loadFixture(deploy);
          await expect(
            ownableCallForwarder.connect(roles.owner).forwardCall(ethers.ZeroAddress, '0x')
          ).to.be.revertedWith('Address: call to non-contract');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, ownableCallForwarder, ownableCallForwarderTarget } = await helpers.loadFixture(deploy);
        const input1 = 'input1';
        const input2 = 123;
        const calldata = ownableCallForwarderTarget.interface.encodeFunctionData('nonpayableTargetFunction', [
          input1,
          input2,
        ]);
        await expect(
          ownableCallForwarder
            .connect(roles.randomPerson)
            .forwardCall(ownableCallForwarderTarget.getAddress(), calldata)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });
});
