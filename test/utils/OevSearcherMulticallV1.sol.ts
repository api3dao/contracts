import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import type { AddressLike } from 'ethers';
import { ethers } from 'hardhat';

describe('OevSearcherMulticallV1', function () {
  async function deploy() {
    const roleNames = ['deployer', 'owner', 'targetAccount', 'randomPerson'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const OevSearcherMulticallV1Factory = await ethers.getContractFactory('OevSearcherMulticallV1', roles.deployer);
    const oevSearcherMulticallV1 = await OevSearcherMulticallV1Factory.deploy();
    await oevSearcherMulticallV1.connect(roles.deployer).transferOwnership(roles.owner!.address);
    const MockMulticallTargetFactory = await ethers.getContractFactory('MockMulticallTarget', roles.deployer);
    const multicallTargets = [
      await MockMulticallTargetFactory.deploy(),
      await MockMulticallTargetFactory.deploy(),
      roles.targetAccount,
    ];
    return {
      roles,
      oevSearcherMulticallV1,
      MockMulticallTargetFactory,
      multicallTargets,
    };
  }

  describe('externalMulticallWithValue', function () {
    context('Sender is the owner', function () {
      context('Parameter lengths match', function () {
        context('Balance is sufficient', function () {
          context('None of the calls reverts', function () {
            context('There is a single target account', function () {
              it('multicalls target account with value', async function () {
                const { oevSearcherMulticallV1, MockMulticallTargetFactory, multicallTargets, roles } =
                  await helpers.loadFixture(deploy);
                const multicallTarget = multicallTargets[0]!;
                const targets = Array.from({ length: 3 }).fill(await multicallTarget.getAddress()) as AddressLike[];
                const data = [
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                ];
                const values = [100, 200, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                const returndata = await oevSearcherMulticallV1
                  .connect(roles.owner)
                  .externalMulticallWithValue.staticCall(targets, data, values, {
                    value: totalValue,
                  });
                expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[0]!)[0]).to.equal(-1);
                expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[1]!)[0]).to.equal(-2);
                expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[2]!)[0]).to.equal(-3);
                await expect(
                  oevSearcherMulticallV1
                    .connect(roles.owner)
                    .externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.not.be.reverted;
                expect(await (multicallTarget as any).argumentHistory()).to.deep.equal([1, 2, 3]);
                expect(await ethers.provider.getBalance(await multicallTarget.getAddress())).to.equal(totalValue);
              });
            });
            context('There are multiple target accounts', function () {
              it('multicalls target accounts with value', async function () {
                const { oevSearcherMulticallV1, MockMulticallTargetFactory, multicallTargets, roles } =
                  await helpers.loadFixture(deploy);
                const targets = multicallTargets.map(async (multicallTarget) => multicallTarget!.getAddress());
                const data = [
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
                  '0x12345678',
                ];
                const values = [100, 200, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                const returndata = await oevSearcherMulticallV1
                  .connect(roles.owner)
                  .externalMulticallWithValue.staticCall(targets, data, values, {
                    value: totalValue,
                  });
                expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[0]!)[0]).to.equal(-1);
                expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[1]!)[0]).to.equal(-2);
                expect(returndata[2]).to.equal('0x');
                const multicallTarget2Balance = await ethers.provider.getBalance(
                  await multicallTargets[2]!.getAddress()
                );
                await expect(
                  oevSearcherMulticallV1
                    .connect(roles.owner)
                    .externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.not.be.reverted;
                expect(await (multicallTargets[0] as any).argumentHistory()).to.deep.equal([1]);
                expect(await (multicallTargets[1] as any).argumentHistory()).to.deep.equal([2]);
                expect(await ethers.provider.getBalance(await multicallTargets[0]!.getAddress())).to.equal(100);
                expect(await ethers.provider.getBalance(await multicallTargets[1]!.getAddress())).to.equal(200);
                expect(
                  (await ethers.provider.getBalance(await multicallTargets[2]!.getAddress())) - multicallTarget2Balance
                ).to.equal(300);
              });
            });
          });
          context('One of the calls reverts', function () {
            context('Call reverts with string', function () {
              it('multicall reverts by bubbling up the revert string', async function () {
                const { oevSearcherMulticallV1, MockMulticallTargetFactory, multicallTargets, roles } =
                  await helpers.loadFixture(deploy);
                const multicallTarget = multicallTargets[0]!;
                const targets = Array.from({ length: 3 }).fill(await multicallTarget.getAddress()) as AddressLike[];
                const data = [
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  MockMulticallTargetFactory.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                ];
                const values = [100, 0, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                await expect(
                  oevSearcherMulticallV1
                    .connect(roles.owner)
                    .externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.be.revertedWith('Reverted with string');
              });
            });
            context('Call reverts with custom error', function () {
              it('multicall reverts by bubbling up the custom error', async function () {
                const { oevSearcherMulticallV1, MockMulticallTargetFactory, multicallTargets, roles } =
                  await helpers.loadFixture(deploy);
                const multicallTarget = multicallTargets[0]!;
                const targets = Array.from({ length: 3 }).fill(await multicallTarget.getAddress()) as AddressLike[];
                const data = [
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  MockMulticallTargetFactory.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                ];
                const values = [100, 0, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                await expect(
                  oevSearcherMulticallV1
                    .connect(roles.owner)
                    .externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.be.revertedWithCustomError(multicallTarget as any, 'MyError');
              });
            });
            context('Call reverts with no data', function () {
              it('multicall reverts with no data', async function () {
                const { oevSearcherMulticallV1, MockMulticallTargetFactory, multicallTargets, roles } =
                  await helpers.loadFixture(deploy);
                const multicallTarget = multicallTargets[0]!;
                const targets = Array.from({ length: 3 }).fill(await multicallTarget.getAddress()) as AddressLike[];
                const data = [
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  MockMulticallTargetFactory.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
                  MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                ];
                const values = [100, 200, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                await expect(
                  oevSearcherMulticallV1
                    .connect(roles.owner)
                    .externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.be.revertedWith('Multicall: No revert string');
              });
            });
          });
        });
        context('Balance is not sufficient', function () {
          it('multicall reverts', async function () {
            const { oevSearcherMulticallV1, MockMulticallTargetFactory, multicallTargets, roles } =
              await helpers.loadFixture(deploy);
            const multicallTarget = multicallTargets[0]!;
            const targets = Array.from({ length: 3 }).fill(await multicallTarget.getAddress()) as AddressLike[];
            const data = [
              MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
              MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
            ];
            const values = [100, 200, 300];
            await expect(
              oevSearcherMulticallV1
                .connect(roles.owner)
                .externalMulticallWithValue(targets, data, values, { value: values[0]! })
            ).to.be.revertedWith('Multicall: Insufficient balance');
          });
        });
      });
      context('Parameter lengths do not match', function () {
        it('multicall reverts', async function () {
          const { oevSearcherMulticallV1, MockMulticallTargetFactory, multicallTargets, roles } =
            await helpers.loadFixture(deploy);
          const multicallTarget = multicallTargets[0]!;
          const targets = Array.from({ length: 3 }).fill(await multicallTarget.getAddress()) as AddressLike[];
          const data = [
            MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          const values = [100, 200, 300];
          const totalValue = values.reduce((a, b) => a + b, 0);
          await expect(
            oevSearcherMulticallV1
              .connect(roles.owner)
              .externalMulticallWithValue(targets, data, values, { value: totalValue })
          ).to.be.revertedWith('Parameter length mismatch');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { oevSearcherMulticallV1, MockMulticallTargetFactory, multicallTargets, roles } =
          await helpers.loadFixture(deploy);
        const multicallTarget = multicallTargets[0]!;
        const targets = Array.from({ length: 3 }).fill(await multicallTarget.getAddress()) as AddressLike[];
        const data = [
          MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
          MockMulticallTargetFactory.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        const values = [100, 200, 300];
        const totalValue = values.reduce((a, b) => a + b, 0);
        await expect(
          oevSearcherMulticallV1
            .connect(roles.randomPerson)
            .externalMulticallWithValue(targets, data, values, { value: totalValue })
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('renounceOwnership', function () {
    it('renounces ownership', async function () {
      const { roles, oevSearcherMulticallV1 } = await helpers.loadFixture(deploy);
      await oevSearcherMulticallV1.connect(roles.owner).renounceOwnership();
      expect(await oevSearcherMulticallV1.owner()).to.equal(ethers.ZeroAddress);
    });
  });

  describe('transferOwnership', function () {
    it('transfers ownership', async function () {
      const { roles, oevSearcherMulticallV1 } = await helpers.loadFixture(deploy);
      await oevSearcherMulticallV1.connect(roles.owner).transferOwnership(roles.randomPerson!.address);
      expect(await oevSearcherMulticallV1.owner()).to.equal(roles.randomPerson!.address);
    });
  });
});
