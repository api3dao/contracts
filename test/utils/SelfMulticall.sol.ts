import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hardhat from 'hardhat';

import * as testUtils from '../test-utils';

const { ethers } = hardhat;

describe('SelfMulticall', function () {
  async function deploy() {
    const roleNames = ['deployer'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const MockSelfMulticallFactory = await ethers.getContractFactory('MockSelfMulticall', roles.deployer);
    const selfMulticall = await MockSelfMulticallFactory.deploy();
    return {
      selfMulticall,
    };
  }

  describe('multicall', function () {
    context('None of the calls reverts', function () {
      it('multicall does not revert', async function () {
        const { selfMulticall } = await helpers.loadFixture(deploy);
        const data = [
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        const returndata = await selfMulticall.multicall.staticCall(data);
        expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[0]!)[0]).to.equal(-1);
        expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[1]!)[0]).to.equal(-2);
        expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[2]!)[0]).to.equal(-3);
        await expect(selfMulticall.multicall(data)).to.not.be.reverted;
        expect(await selfMulticall.argumentHistory()).to.deep.equal([1, 2, 3]);
      });
    });

    context('One of the calls reverts', function () {
      context('Call reverts with string', function () {
        it('multicall reverts by bubbling up the revert string', async function () {
          const { selfMulticall } = await helpers.loadFixture(deploy);
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(selfMulticall.multicall(data)).to.be.revertedWith('Reverted with string');
        });
      });
      context('Call reverts with custom error', function () {
        it('multicall reverts by bubbling up the custom error', async function () {
          const { selfMulticall } = await helpers.loadFixture(deploy);
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(selfMulticall.multicall(data)).to.be.revertedWithCustomError(selfMulticall, 'MyError');
        });
      });
      context('Call reverts with no data', function () {
        it('multicall reverts with no data', async function () {
          const { selfMulticall } = await helpers.loadFixture(deploy);
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(selfMulticall.multicall(data)).to.be.revertedWith('Multicall: No revert string');
        });
      });
    });
  });

  describe('tryMulticall', function () {
    context('None of the calls reverts', function () {
      it('multicall does not revert', async function () {
        const { selfMulticall } = await helpers.loadFixture(deploy);
        const data = [
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        const { successes, returndata } = await selfMulticall.tryMulticall.staticCall(data);
        expect(successes).to.deep.equal([true, true, true]);
        expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[0]!)[0]).to.equal(-1);
        expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[1]!)[0]).to.equal(-2);
        expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[2]!)[0]).to.equal(-3);
        await expect(selfMulticall.tryMulticall(data)).to.not.be.reverted;
        expect(await selfMulticall.argumentHistory()).to.deep.equal([1, 2, 3]);
      });
    });
    context('One of the calls reverts', function () {
      context('Call reverts with string', function () {
        it('multicall does not revert', async function () {
          const { selfMulticall } = await helpers.loadFixture(deploy);
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          const { successes, returndata } = await selfMulticall.tryMulticall.staticCall(data);
          expect(successes).to.deep.equal([true, false, true]);
          expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[0]!)[0]).to.equal(-1);
          expect(testUtils.decodeRevertString(returndata[1]!)).to.equal('Reverted with string');
          expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[2]!)[0]).to.equal(-3);
          await expect(selfMulticall.tryMulticall(data)).to.not.be.reverted;
          expect(await selfMulticall.argumentHistory()).to.deep.equal([1, 3]);
        });
      });
      context('Call reverts with custom error', function () {
        it('multicall does not revert', async function () {
          const { selfMulticall } = await helpers.loadFixture(deploy);
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          const { successes, returndata } = await selfMulticall.tryMulticall.staticCall(data);
          expect(successes).to.deep.equal([true, false, true]);
          expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[0]!)[0]).to.equal(-1);
          expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[2]!)[0]).to.equal(-3);
          await expect(selfMulticall.tryMulticall(data)).to.not.be.reverted;
          expect(await selfMulticall.argumentHistory()).to.deep.equal([1, 3]);
        });
      });
      context('Call reverts with no data', function () {
        it('multicall does not revert', async function () {
          const { selfMulticall } = await helpers.loadFixture(deploy);
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          const { successes, returndata } = await selfMulticall.tryMulticall.staticCall(data);
          expect(successes).to.deep.equal([true, false, true]);
          expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[0]!)[0]).to.equal(-1);
          expect(returndata[1]).to.equal('0x');
          expect(ethers.AbiCoder.defaultAbiCoder().decode(['int256'], returndata[2]!)[0]).to.equal(-3);
          await expect(selfMulticall.tryMulticall(data)).to.not.be.reverted;
          expect(await selfMulticall.argumentHistory()).to.deep.equal([1, 3]);
        });
      });
    });
  });
});
