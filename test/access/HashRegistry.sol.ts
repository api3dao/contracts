import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import type { BytesLike, HDNodeWallet } from 'ethers';
import { ethers } from 'hardhat';

export async function signHash(
  signers: HDNodeWallet[],
  hashType: BytesLike,
  hash: BytesLike,
  timestamp: number
): Promise<BytesLike[]> {
  return Promise.all(
    signers.map(async (signer) =>
      signer.signMessage(
        ethers.toBeArray(ethers.solidityPackedKeccak256(['bytes32', 'bytes32', 'uint256'], [hashType, hash, timestamp]))
      )
    )
  );
}

describe('HashRegistry', function () {
  const SIGNATURE_DELEGATION_HASH_TYPE = ethers.solidityPackedKeccak256(
    ['string'],
    ['HashRegistry signature delegation']
  );

  async function signDelegation(
    signers: HDNodeWallet[],
    delegates: HDNodeWallet[],
    endTimestamp: number
  ): Promise<BytesLike[]> {
    return Promise.all(
      signers.map(async (signer, index) =>
        signer.signMessage(
          ethers.toBeArray(
            ethers.solidityPackedKeccak256(
              ['bytes32', 'address', 'uint256'],
              [SIGNATURE_DELEGATION_HASH_TYPE, delegates[index]!.address, endTimestamp]
            )
          )
        )
      )
    );
  }

  async function deploy() {
    const hashTypeA = ethers.solidityPackedKeccak256(['string'], ['Hash type A']);
    const hashTypeB = ethers.solidityPackedKeccak256(['string'], ['Hash type B']);

    const roleNames = ['deployer', 'owner', 'randomPerson'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});
    const sortedHashTypeASigners = Array.from({ length: 3 })
      .map(() => ethers.Wallet.createRandom())
      .sort((a, b) => (BigInt(a.address) > BigInt(b.address) ? 1 : -1));
    const sortedHashTypeBSigners = Array.from({ length: 2 })
      .map(() => ethers.Wallet.createRandom())
      .sort((a, b) => (BigInt(a.address) > BigInt(b.address) ? 1 : -1));
    const delegates = Array.from({ length: sortedHashTypeASigners.length }).map(() => ethers.Wallet.createRandom());

    const HashRegistry = await ethers.getContractFactory('HashRegistry', roles.deployer);
    const hashRegistry = await HashRegistry.deploy(roles.owner!.address);

    return {
      hashTypeA,
      hashTypeB,
      roles,
      sortedHashTypeASigners,
      sortedHashTypeBSigners,
      delegates,
      hashRegistry,
    };
  }

  async function deployAndSetSigners() {
    const deployment = await deploy();

    await deployment.hashRegistry.connect(deployment.roles.owner).setSigners(
      deployment.hashTypeA,
      deployment.sortedHashTypeASigners.map((signer) => signer.address)
    );
    await deployment.hashRegistry.connect(deployment.roles.owner).setSigners(
      deployment.hashTypeB,
      deployment.sortedHashTypeBSigners.map((signer) => signer.address)
    );
    return deployment;
  }

  describe('constructor', function () {
    context('Owner address is not zero', function () {
      it('constructs', async function () {
        const { roles, hashRegistry } = await helpers.loadFixture(deploy);
        expect(await hashRegistry.owner()).to.equal(roles.owner!.address);
        expect(await hashRegistry.signatureDelegationHashType()).to.equal(SIGNATURE_DELEGATION_HASH_TYPE);
      });
    });
    context('Owner address is zero', function () {
      it('reverts', async function () {
        const { roles } = await helpers.loadFixture(deploy);
        const HashRegistry = await ethers.getContractFactory('HashRegistry', roles.deployer);
        await expect(HashRegistry.deploy(ethers.ZeroAddress)).to.be.revertedWith('Owner address zero');
      });
    });
  });

  describe('renounceOwnership', function () {
    it('renounces ownership', async function () {
      const { roles, hashRegistry } = await helpers.loadFixture(deploy);
      await hashRegistry.connect(roles.owner).renounceOwnership();
      expect(await hashRegistry.owner()).to.equal(ethers.ZeroAddress);
    });
  });

  describe('transferOwnership', function () {
    it('transfers ownership', async function () {
      const { roles, hashRegistry } = await helpers.loadFixture(deploy);
      await hashRegistry.connect(roles.owner).transferOwnership(roles.randomPerson!.address);
      expect(await hashRegistry.owner()).to.equal(roles.randomPerson!.address);
    });
  });

  describe('setSigners', function () {
    context('Sender is the owner', function () {
      context('Hash type is not zero', function () {
        context('Signers are not empty', function () {
          context('First signer address is not zero', function () {
            context('Signer addresses are in ascending order', function () {
              it('sets signers', async function () {
                const { hashTypeA, roles, sortedHashTypeASigners, hashRegistry } = await helpers.loadFixture(deploy);
                expect(await hashRegistry.hashTypeToSignersHash(hashTypeA)).to.equal(ethers.ZeroHash);
                await expect(
                  hashRegistry.connect(roles.owner).setSigners(
                    hashTypeA,
                    sortedHashTypeASigners.map((signer) => signer.address)
                  )
                )
                  .to.emit(hashRegistry, 'SetSigners')
                  .withArgs(
                    hashTypeA,
                    sortedHashTypeASigners.map((signer) => signer.address)
                  );
                expect(await hashRegistry.hashTypeToSignersHash(hashTypeA)).to.equal(
                  ethers.solidityPackedKeccak256(
                    ['address[]'],
                    [sortedHashTypeASigners.map((signer) => signer.address)]
                  )
                );
              });
            });
            context('Signer addresses are not in ascending order', function () {
              it('reverts', async function () {
                const { hashTypeA, roles, sortedHashTypeASigners, hashRegistry } = await helpers.loadFixture(deploy);
                const unsortedHashTypeASigners = [...sortedHashTypeASigners.slice(1), sortedHashTypeASigners[0]];
                await expect(
                  hashRegistry.connect(roles.owner).setSigners(
                    hashTypeA,
                    unsortedHashTypeASigners.map((signer) => signer!.address)
                  )
                ).to.be.revertedWith('Signers not in ascending order');
                const duplicatedHashTypeASigners = [sortedHashTypeASigners[1], ...sortedHashTypeASigners.slice(1)];
                await expect(
                  hashRegistry.connect(roles.owner).setSigners(
                    hashTypeA,
                    duplicatedHashTypeASigners.map((signer) => signer!.address)
                  )
                ).to.be.revertedWith('Signers not in ascending order');
              });
            });
          });
          context('First signer address is zero', function () {
            it('reverts', async function () {
              const { hashTypeA, roles, sortedHashTypeASigners, hashRegistry } = await helpers.loadFixture(deploy);
              const hashTypeASignersStartingWithZeroAddress = [
                { address: ethers.ZeroAddress },
                ...sortedHashTypeASigners.slice(1),
              ];
              await expect(
                hashRegistry.connect(roles.owner).setSigners(
                  hashTypeA,
                  hashTypeASignersStartingWithZeroAddress.map((signer) => signer.address)
                )
              ).to.be.revertedWith('First signer address zero');
            });
          });
        });
        context('Signers are empty', function () {
          it('reverts', async function () {
            const { hashTypeA, roles, hashRegistry } = await helpers.loadFixture(deploy);
            await expect(hashRegistry.connect(roles.owner).setSigners(hashTypeA, [])).to.be.revertedWith(
              'Signers empty'
            );
          });
        });
      });
      context('Hash type is zero', function () {
        it('reverts', async function () {
          const { roles, sortedHashTypeASigners, hashRegistry } = await helpers.loadFixture(deploy);
          await expect(
            hashRegistry.connect(roles.owner).setSigners(
              ethers.ZeroHash,
              sortedHashTypeASigners.map((signer) => signer.address)
            )
          ).to.be.revertedWith('Hash type zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { hashTypeA, roles, sortedHashTypeASigners, hashRegistry } = await helpers.loadFixture(deploy);
        await expect(
          hashRegistry.connect(roles.randomPerson).setSigners(
            hashTypeA,
            sortedHashTypeASigners.map((signer) => signer.address)
          )
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('setHash', function () {
    context('Sender is the owner', function () {
      it('sets hash', async function () {
        const { hashTypeA, roles, hashRegistry } = await helpers.loadFixture(deployAndSetSigners);
        const hash = ethers.hexlify(ethers.randomBytes(32));
        const hashBefore = await hashRegistry.hashes(hashTypeA);
        expect(hashBefore.value).to.equal(ethers.ZeroHash);
        expect(hashBefore.timestamp).to.equal(0);
        expect(await hashRegistry.getHashValue(hashTypeA)).to.equal(ethers.ZeroHash);
        const timestamp = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(timestamp);
        await expect(hashRegistry.connect(roles.owner).setHash(hashTypeA, hash))
          .to.emit(hashRegistry, 'SetHash')
          .withArgs(hashTypeA, hash, timestamp);
        const hashAfter = await hashRegistry.hashes(hashTypeA);
        expect(hashAfter.value).to.equal(hash);
        expect(hashAfter.timestamp).to.equal(timestamp);
        expect(await hashRegistry.getHashValue(hashTypeA)).to.equal(hash);
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { hashTypeA, roles, hashRegistry } = await helpers.loadFixture(deployAndSetSigners);
        const hash = ethers.hexlify(ethers.randomBytes(32));
        await expect(hashRegistry.connect(roles.randomPerson).setHash(hashTypeA, hash)).to.be.revertedWith(
          'Ownable: caller is not the owner'
        );
      });
    });
  });

  describe('registerHash', function () {
    context('Hash value is not zero', function () {
      context('Timestamp is not from the future', function () {
        context('Timestamp is more recent than the previous one', function () {
          context('Signers are set for the hash type', function () {
            context('No delegation signature is used', function () {
              context('All signatures match', function () {
                it('registers hash', async function () {
                  const { hashTypeA, roles, sortedHashTypeASigners, hashRegistry } =
                    await helpers.loadFixture(deployAndSetSigners);
                  const hash = ethers.hexlify(ethers.randomBytes(32));
                  const timestamp = await helpers.time.latest();
                  const signatures = await signHash(sortedHashTypeASigners, hashTypeA, hash, timestamp);
                  const hashBefore = await hashRegistry.hashes(hashTypeA);
                  expect(hashBefore.value).to.equal(ethers.ZeroHash);
                  expect(hashBefore.timestamp).to.equal(0);
                  expect(await hashRegistry.getHashValue(hashTypeA)).to.equal(ethers.ZeroHash);
                  await expect(
                    hashRegistry.connect(roles.randomPerson).registerHash(hashTypeA, hash, timestamp, signatures)
                  )
                    .to.emit(hashRegistry, 'RegisteredHash')
                    .withArgs(hashTypeA, hash, timestamp);
                  const hashAfter = await hashRegistry.hashes(hashTypeA);
                  expect(hashAfter.value).to.equal(hash);
                  expect(hashAfter.timestamp).to.equal(timestamp);
                  expect(await hashRegistry.getHashValue(hashTypeA)).to.equal(hash);
                });
              });
              context('Not all signatures match', function () {
                it('reverts', async function () {
                  const { hashTypeA, roles, sortedHashTypeBSigners, hashRegistry } =
                    await helpers.loadFixture(deployAndSetSigners);
                  const hash = ethers.hexlify(ethers.randomBytes(32));
                  const timestamp = await helpers.time.latest();
                  // Sign with the wrong signers
                  const signatures = await signHash(sortedHashTypeBSigners, hashTypeA, hash, timestamp);
                  await expect(
                    hashRegistry.connect(roles.randomPerson).registerHash(hashTypeA, hash, timestamp, signatures)
                  ).to.be.revertedWith('Signature mismatch');
                });
              });
            });
            context('Delegation signatures are used', function () {
              context('All signatures have a valid length', function () {
                context('None of the delegation signatures have expired', function () {
                  context('All delegate hash signatures are valid', function () {
                    context('All delegation signatures are valid', function () {
                      it('registers hash', async function () {
                        const { hashTypeA, roles, sortedHashTypeASigners, delegates, hashRegistry } =
                          await helpers.loadFixture(deployAndSetSigners);
                        const hash = ethers.hexlify(ethers.randomBytes(32));
                        const timestamp = await helpers.time.latest();
                        const delegationEndTimestamp = timestamp + 60 * 60;
                        const signatures = await signHash(sortedHashTypeASigners, hashTypeA, hash, timestamp);
                        const delegationSignatures = await signDelegation(
                          sortedHashTypeASigners,
                          delegates,
                          delegationEndTimestamp
                        );
                        const delegateSignatures = await signHash(delegates, hashTypeA, hash, timestamp);
                        const hashBefore = await hashRegistry.hashes(hashTypeA);
                        expect(hashBefore.value).to.equal(ethers.ZeroHash);
                        expect(hashBefore.timestamp).to.equal(0);
                        expect(await hashRegistry.getHashValue(hashTypeA)).to.equal(ethers.ZeroHash);
                        await expect(
                          hashRegistry
                            .connect(roles.randomPerson)
                            .registerHash(hashTypeA, hash, timestamp, [
                              ethers.AbiCoder.defaultAbiCoder().encode(
                                ['uint256', 'bytes', 'bytes'],
                                [delegationEndTimestamp, delegationSignatures[0], delegateSignatures[0]]
                              ),
                              signatures[1]!,
                              ethers.AbiCoder.defaultAbiCoder().encode(
                                ['uint256', 'bytes', 'bytes'],
                                [delegationEndTimestamp, delegationSignatures[2], delegateSignatures[2]]
                              ),
                            ])
                        )
                          .to.emit(hashRegistry, 'RegisteredHash')
                          .withArgs(hashTypeA, hash, timestamp);
                        const hashAfter = await hashRegistry.hashes(hashTypeA);
                        expect(hashAfter.value).to.equal(hash);
                        expect(hashAfter.timestamp).to.equal(timestamp);
                        expect(await hashRegistry.getHashValue(hashTypeA)).to.equal(hash);
                      });
                    });
                    context('Not all delegation signatures are valid', function () {
                      it('reverts', async function () {
                        const { hashTypeA, roles, sortedHashTypeASigners, delegates, hashRegistry } =
                          await helpers.loadFixture(deployAndSetSigners);
                        const hash = ethers.hexlify(ethers.randomBytes(32));
                        const timestamp = await helpers.time.latest();
                        const delegationEndTimestamp = timestamp + 60 * 60;
                        const signatures = await signHash(sortedHashTypeASigners, hashTypeA, hash, timestamp);
                        const delegationSignatures = await signDelegation(
                          sortedHashTypeASigners,
                          delegates,
                          delegationEndTimestamp
                        );
                        const delegateSignatures = await signHash(delegates, hashTypeA, hash, timestamp);
                        await expect(
                          hashRegistry
                            .connect(roles.randomPerson)
                            .registerHash(hashTypeA, hash, timestamp, [
                              ethers.AbiCoder.defaultAbiCoder().encode(
                                ['uint256', 'bytes', 'bytes'],
                                [delegationEndTimestamp, delegationSignatures[0], delegateSignatures[0]]
                              ),
                              signatures[1]!,
                              ethers.AbiCoder.defaultAbiCoder().encode(
                                ['uint256', 'bytes', 'bytes'],
                                [delegationEndTimestamp, delegationSignatures[1], delegateSignatures[2]]
                              ),
                            ])
                        ).to.be.revertedWith('Signature mismatch');
                      });
                    });
                  });
                  context('Not all delegate hash signatures are valid', function () {
                    it('reverts', async function () {
                      const { hashTypeA, roles, sortedHashTypeASigners, delegates, hashRegistry } =
                        await helpers.loadFixture(deployAndSetSigners);
                      const hash = ethers.hexlify(ethers.randomBytes(32));
                      const timestamp = await helpers.time.latest();
                      const delegationEndTimestamp = timestamp + 60 * 60;
                      const signatures = await signHash(sortedHashTypeASigners, hashTypeA, hash, timestamp);
                      const delegationSignatures = await signDelegation(
                        sortedHashTypeASigners,
                        delegates,
                        delegationEndTimestamp
                      );
                      const delegateSignatures = await signHash(delegates, hashTypeA, hash, timestamp);
                      await expect(
                        hashRegistry
                          .connect(roles.randomPerson)
                          .registerHash(hashTypeA, hash, timestamp, [
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['uint256', 'bytes', 'bytes'],
                              [delegationEndTimestamp, delegationSignatures[0], delegateSignatures[0]]
                            ),
                            signatures[1]!,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['uint256', 'bytes', 'bytes'],
                              [delegationEndTimestamp, delegationSignatures[2], delegateSignatures[1]]
                            ),
                          ])
                      ).to.be.revertedWith('Signature mismatch');
                    });
                  });
                });
                context('Some of the delegation signatures have expired', function () {
                  it('reverts', async function () {
                    const { hashTypeA, roles, sortedHashTypeASigners, delegates, hashRegistry } =
                      await helpers.loadFixture(deployAndSetSigners);
                    const hash = ethers.hexlify(ethers.randomBytes(32));
                    const timestamp = await helpers.time.latest();
                    const delegationEndTimestamp = timestamp + 60 * 60;
                    const signatures = await signHash(sortedHashTypeASigners, hashTypeA, hash, timestamp);
                    const delegationSignatures = await signDelegation(
                      sortedHashTypeASigners,
                      delegates,
                      delegationEndTimestamp
                    );
                    const expiredDelegationSignatures = await signDelegation(
                      sortedHashTypeASigners,
                      delegates,
                      timestamp
                    );
                    const delegateSignatures = await signHash(delegates, hashTypeA, hash, timestamp);
                    await expect(
                      hashRegistry
                        .connect(roles.randomPerson)
                        .registerHash(hashTypeA, hash, timestamp, [
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['uint256', 'bytes', 'bytes'],
                            [delegationEndTimestamp, delegationSignatures[0], delegateSignatures[0]]
                          ),
                          signatures[1]!,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['uint256', 'bytes', 'bytes'],
                            [timestamp, expiredDelegationSignatures[2], delegateSignatures[2]]
                          ),
                        ])
                    ).to.be.revertedWith('Delegation ended');
                  });
                });
              });
              context('Not all signatures have a valid length', function () {
                it('reverts', async function () {
                  const { hashTypeA, roles, sortedHashTypeASigners, delegates, hashRegistry } =
                    await helpers.loadFixture(deployAndSetSigners);
                  const hash = ethers.hexlify(ethers.randomBytes(32));
                  const timestamp = await helpers.time.latest();
                  const delegationEndTimestamp = timestamp + 60 * 60;
                  const signatures = await signHash(sortedHashTypeASigners, hashTypeA, hash, timestamp);
                  const delegationSignatures = await signDelegation(
                    sortedHashTypeASigners,
                    delegates,
                    delegationEndTimestamp
                  );
                  const delegateSignatures = await signHash(delegates, hashTypeA, hash, timestamp);
                  await expect(
                    hashRegistry
                      .connect(roles.randomPerson)
                      .registerHash(hashTypeA, hash, timestamp, [
                        ethers.AbiCoder.defaultAbiCoder().encode(
                          ['uint256', 'bytes', 'bytes'],
                          [delegationEndTimestamp, delegationSignatures[0], delegateSignatures[0]]
                        ),
                        signatures[1]!,
                        '0x',
                      ])
                  ).to.be.revertedWith('Invalid signature length');
                });
              });
            });
          });
          context('Signers are not set for the hash type', function () {
            it('reverts', async function () {
              const { hashTypeA, roles, sortedHashTypeASigners, hashRegistry } = await helpers.loadFixture(deploy);
              const hash = ethers.hexlify(ethers.randomBytes(32));
              const timestamp = await helpers.time.latest();
              const signatures = await signHash(sortedHashTypeASigners, hashTypeA, hash, timestamp);
              await expect(
                hashRegistry.connect(roles.randomPerson).registerHash(hashTypeA, hash, timestamp, signatures)
              ).to.be.revertedWith('Signers not set');
            });
          });
        });
        context('Timestamp is not more recent than the previous one', function () {
          it('reverts', async function () {
            const { hashTypeA, roles, sortedHashTypeASigners, hashRegistry } =
              await helpers.loadFixture(deployAndSetSigners);
            const hash = ethers.hexlify(ethers.randomBytes(32));
            const timestamp = await helpers.time.latest();
            const signatures = await signHash(sortedHashTypeASigners, hashTypeA, hash, timestamp);
            await hashRegistry.connect(roles.randomPerson).registerHash(hashTypeA, hash, timestamp, signatures);
            await expect(
              hashRegistry.connect(roles.randomPerson).registerHash(hashTypeA, hash, timestamp, signatures)
            ).to.be.revertedWith('Hash timestamp not more recent');
          });
        });
      });
      context('Timestamp is from the future', function () {
        it('reverts', async function () {
          const { hashTypeA, roles, sortedHashTypeASigners, hashRegistry } =
            await helpers.loadFixture(deployAndSetSigners);
          const hash = ethers.hexlify(ethers.randomBytes(32));
          const timestamp = (await helpers.time.latest()) + 3600;
          const signatures = await signHash(sortedHashTypeASigners, hashTypeA, hash, timestamp);
          await expect(
            hashRegistry.connect(roles.randomPerson).registerHash(hashTypeA, hash, timestamp, signatures)
          ).to.be.revertedWith('Hash timestamp from future');
        });
      });
    });
    context('Hash value is not zero', function () {
      it('reverts', async function () {
        const { hashTypeA, roles, sortedHashTypeASigners, hashRegistry } =
          await helpers.loadFixture(deployAndSetSigners);
        const hash = ethers.hexlify(ethers.randomBytes(32));
        const timestamp = await helpers.time.latest();
        const signatures = await signHash(sortedHashTypeASigners, hashTypeA, hash, timestamp);
        await expect(
          hashRegistry.connect(roles.randomPerson).registerHash(hashTypeA, ethers.ZeroHash, timestamp, signatures)
        ).to.be.revertedWith('Hash value zero');
      });
    });
  });
});
