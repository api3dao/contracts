import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Median', function () {
  async function deploy() {
    const roleNames = ['deployer'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const mockMedianFactory = await ethers.getContractFactory('MockMedian', roles.deployer);
    const median = await mockMedianFactory.deploy();
    return {
      median,
    };
  }

  describe('median', function () {
    context('Array length is 1-21', function () {
      it('computes median of randomly shuffled arrays', async function () {
        const { median } = await helpers.loadFixture(deploy);
        for (let arrayLength = 1; arrayLength <= 21; arrayLength++) {
          for (let iterationCount = 0; iterationCount <= 10; iterationCount++) {
            const array = Array.from(Array.from({ length: arrayLength }), (_, i) => i - Math.floor(arrayLength / 2));
            const shuffledArray = array
              .map((value) => ({ value, sort: Math.random() }))
              .sort((a, b) => a.sort - b.sort)
              .map(({ value }) => value);
            const computedMedian = await median.exposedMedian(shuffledArray);
            let actualMedian;
            if (arrayLength % 2 === 1) {
              actualMedian = array[Math.floor(arrayLength / 2)];
            } else {
              const median1 = array[arrayLength / 2 - 1]!;
              const median2 = array[arrayLength / 2]!;
              actualMedian = Math.floor(Math.abs(median1 + median2) / 2) * Math.sign(median1 + median2);
            }
            expect(computedMedian).to.equal(actualMedian);
          }
        }
      });
    });
  });

  describe('average', function () {
    context('x and y are largest positive numbers', function () {
      it('computes average without overflowing', async function () {
        const { median } = await helpers.loadFixture(deploy);
        const x = 2n ** 255n - 1n;
        const y = x;
        const computedAverage = await median.exposedAverage(x, y);
        const actualAverage = x;
        expect(computedAverage).to.equal(actualAverage);
      });
    });
    context('x and y are smallest negative numbers', function () {
      it('computes average without undeflowing', async function () {
        const { median } = await helpers.loadFixture(deploy);
        const x = -2n * 255n;
        const y = x;
        const computedAverage = await median.exposedAverage(x, y);
        const actualAverage = x;
        expect(computedAverage).to.equal(actualAverage);
      });
    });
    context('With various combinations of x and y', function () {
      it('computes average', async function () {
        const { median } = await helpers.loadFixture(deploy);
        for (let x = -2; x <= 2; x++) {
          for (let y = -2; y <= 2; y++) {
            const computedAverage = await median.exposedAverage(x, y);
            const actualAverage = Number.parseInt(((x + y) / 2).toString(), 10);
            expect(computedAverage).to.equal(actualAverage);
          }
        }
      });
    });
  });
});
