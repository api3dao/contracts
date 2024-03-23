import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import type { MockSort } from '../../../src/index';

describe('Sort', function () {
  // Adapted from https://stackoverflow.com/a/37580979/14558682
  async function testSortWithAllPermutations(sort: MockSort, arrayLength: number) {
    const array = Array.from(Array.from({ length: arrayLength }), (_, i) => i - Math.floor(arrayLength / 2));
    const c = Array.from({ length: array.length }).fill(0) as number[];
    let i = 1;
    while (i < array.length) {
      if (c[i]! < i) {
        const k = i % 2 && c[i]!;
        const p = array[i]!;
        array[i] = array[k]!;
        array[k] = p;
        ++c[i];
        i = 1;
        const permutation = structuredClone(array);
        const sortedArray = await sort.exposedSort(permutation);
        expect(sortedArray).to.deep.equal(
          permutation.sort(function (a, b) {
            return a - b;
          })
        );
      } else {
        c[i] = 0;
        ++i;
      }
    }
  }

  async function deploy() {
    const roleNames = ['deployer'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const mockSortFactory = await ethers.getContractFactory('MockSort', roles.deployer);
    const sort = await mockSortFactory.deploy();
    return {
      sort,
    };
  }

  describe('sort', function () {
    context('Array length is 1-9', function () {
      it('sorts all permutations of the array', async function () {
        const { sort } = await helpers.loadFixture(deploy);
        for (let arrayLength = 1; arrayLength <= 9; arrayLength++) {
          // eslint-disable-next-line no-console
          console.log(`Testing with array length ${arrayLength}`);
          await testSortWithAllPermutations(sort, arrayLength);
        }
      });
    });
    context('Array length is larger than 9', function () {
      it('reverts', async function () {
        const { sort } = await helpers.loadFixture(deploy);
        await expect(sort.exposedSort(Array.from({ length: 10 }).fill(0) as any)).to.be.reverted;
        await expect(sort.exposedSort(Array.from({ length: 11 }).fill(0) as any)).to.be.reverted;
        await expect(sort.exposedSort(Array.from({ length: 12 }).fill(0) as any)).to.be.reverted;
      });
    });
  });
});
