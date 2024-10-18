import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import type { BaseWallet, BigNumberish, BytesLike, HDNodeWallet } from 'ethers';
import { ethers } from 'hardhat';

import type { MockApi3ServerV1OevExtensionOevBidPayer } from '../../src/index';
import * as testUtils from '../test-utils';

import { encodeData, median, updateBeacon } from './Api3ServerV1.sol';

export async function signDataWithAlternateTemplateId(
  airnode: BaseWallet,
  templateId: BytesLike,
  timestamp: number,
  data: BytesLike
) {
  const signature = await airnode.signMessage(
    ethers.getBytes(
      ethers.solidityPackedKeccak256(['bytes32', 'uint256', 'bytes'], [ethers.keccak256(templateId), timestamp, data])
    )
  );
  return signature;
}

export async function payOevBid(
  roles: Record<string, HardhatEthersSigner>,
  api3ServerV1OevExtensionOevBidPayer: MockApi3ServerV1OevExtensionOevBidPayer,
  dappId: BigNumberish,
  signedDataTimestampCutoff: BigNumberish,
  bidAmount: BigNumberish
) {
  const { chainId } = await ethers.provider.getNetwork();
  const signature = await roles.auctioneer!.signMessage(
    ethers.getBytes(
      ethers.solidityPackedKeccak256(
        ['uint256', 'uint256', 'address', 'uint256', 'uint32'],
        [chainId, dappId, await api3ServerV1OevExtensionOevBidPayer.getAddress(), bidAmount, signedDataTimestampCutoff]
      )
    )
  );
  return api3ServerV1OevExtensionOevBidPayer
    .connect(roles.searcher)
    .payOevBid(dappId, bidAmount, signedDataTimestampCutoff, signature, '0x');
}

describe('Api3ServerV1OevExtension', function () {
  async function deploy() {
    const roleNames = ['deployer', 'manager', 'withdrawer', 'auctioneer', 'searcher', 'randomPerson'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const api3ServerV1Factory = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
    const api3ServerV1 = await api3ServerV1Factory.deploy(
      await accessControlRegistry.getAddress(),
      api3ServerV1AdminRoleDescription,
      roles.manager!.address
    );

    const api3ServerV1OevExtensionAdminRoleDescription = 'Api3ServerV1OevExtension admin';
    const withdrawerRoleDescription = 'Withdrawer';
    const auctioneerRoleDescription = 'Auctioneer';
    const api3ServerV1OevExtensionFactory = await ethers.getContractFactory('Api3ServerV1OevExtension', roles.deployer);
    const api3ServerV1OevExtension = await api3ServerV1OevExtensionFactory.deploy(
      await accessControlRegistry.getAddress(),
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
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, api3ServerV1OevExtensionAdminRoleDescription);
    const withdrawerRole = testUtils.deriveRole(adminRole, withdrawerRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, withdrawerRoleDescription);
    await accessControlRegistry.connect(roles.manager).grantRole(withdrawerRole, roles.withdrawer!.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(withdrawerRole, roles.manager!.address);
    const auctioneerRole = testUtils.deriveRole(adminRole, auctioneerRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, auctioneerRoleDescription);
    await accessControlRegistry.connect(roles.manager).grantRole(auctioneerRole, roles.auctioneer!.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(auctioneerRole, roles.manager!.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(adminRole, roles.manager!.address);

    // Specify Beacons
    const beacons: {
      airnode: HDNodeWallet;
      endpointId: BytesLike;
      templateParameters: BytesLike;
      templateId: BytesLike;
      requestParameters: BytesLike;
      beaconId: BytesLike;
    }[] = [];
    for (let i = 0; i < 3; i++) {
      // Each Beacon is associated to one Airnode
      const { airnodeMnemonic } = testUtils.generateRandomAirnodeWallet();
      // Using the same sponsor for brevity
      const airnode = ethers.Wallet.fromPhrase(airnodeMnemonic);
      // Each Beacon has unique parameters
      const endpointId = testUtils.generateRandomBytes32();
      const templateParameters = testUtils.generateRandomBytes();
      const templateId = ethers.solidityPackedKeccak256(['bytes32', 'bytes'], [endpointId, templateParameters]);
      const requestParameters = testUtils.generateRandomBytes();
      const beaconId = ethers.keccak256(ethers.solidityPacked(['address', 'bytes32'], [airnode.address, templateId]));
      beacons.push({
        airnode,
        endpointId,
        templateParameters,
        templateId,
        requestParameters,
        beaconId,
      });
    }
    const beaconIds = beacons.map((beacon) => {
      return beacon.beaconId;
    });
    const beaconSetId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [beaconIds]));
    const beaconSet = {
      beaconIds,
      beaconSetId,
    };

    return {
      accessControlRegistry,
      api3ServerV1,
      api3ServerV1OevExtension,
      api3ServerV1OevExtensionAdminRoleDescription,
      api3ServerV1OevExtensionOevBidPayer,
      auctioneerRole,
      beaconSet,
      beacons,
      roles,
      withdrawerRole,
    };
  }

  describe('constructor', function () {
    context('Api3ServerV1 address is not zero', function () {
      it('constructs', async function () {
        const {
          roles,
          accessControlRegistry,
          api3ServerV1OevExtension,
          api3ServerV1OevExtensionAdminRoleDescription,
          withdrawerRole,
          auctioneerRole,
        } = await helpers.loadFixture(deploy);
        expect(await api3ServerV1OevExtension.WITHDRAWER_ROLE_DESCRIPTION()).to.equal('Withdrawer');
        expect(await api3ServerV1OevExtension.AUCTIONEER_ROLE_DESCRIPTION()).to.equal('Auctioneer');
        expect(await api3ServerV1OevExtension.accessControlRegistry()).to.equal(
          await accessControlRegistry.getAddress()
        );
        expect(await api3ServerV1OevExtension.adminRoleDescription()).to.equal(
          api3ServerV1OevExtensionAdminRoleDescription
        );
        expect(await api3ServerV1OevExtension.manager()).to.equal(roles.manager!.address);
        expect(await api3ServerV1OevExtension.withdrawerRole()).to.equal(withdrawerRole);
        expect(await api3ServerV1OevExtension.auctioneerRole()).to.equal(auctioneerRole);
      });
    });
    context('Api3ServerV1 address is zero', function () {
      it('reverts', async function () {
        const { roles, accessControlRegistry, api3ServerV1OevExtensionAdminRoleDescription } =
          await helpers.loadFixture(deploy);
        const api3ServerV1OevExtensionFactory = await ethers.getContractFactory(
          'Api3ServerV1OevExtension',
          roles.deployer
        );
        await expect(
          api3ServerV1OevExtensionFactory.deploy(
            accessControlRegistry.getAddress(),
            api3ServerV1OevExtensionAdminRoleDescription,
            roles.manager!.address,
            ethers.ZeroAddress
          )
        ).to.be.revertedWith('Api3ServerV1 address zero');
      });
    });
  });

  describe('withdraw', function () {
    context('Is not a re-entered from an OEV bid payment callback', function () {
      context('Recipient is not zero address', function () {
        context('Amount is not zero', function () {
          context('Sender is the manager', function () {
            context('Withdrawal is successful', function () {
              it('withdraws', async function () {
                const { roles, api3ServerV1OevExtension, api3ServerV1OevExtensionOevBidPayer } =
                  await helpers.loadFixture(deploy);
                const amount = ethers.parseEther('1');
                const nextTimestamp = (await helpers.time.latest()) + 1;
                await helpers.time.setNextBlockTimestamp(nextTimestamp);
                await payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, 1, nextTimestamp + 1, amount);
                const recipientBalanceBefore = await ethers.provider.getBalance(roles.randomPerson!.address);
                await expect(
                  api3ServerV1OevExtension.connect(roles.manager).withdraw(roles.randomPerson!.address, amount)
                )
                  .to.emit(api3ServerV1OevExtension, 'Withdrew')
                  .withArgs(roles.randomPerson!.address, amount, roles.manager!.address);
                const recipientBalanceAfter = await ethers.provider.getBalance(roles.randomPerson!.address);
                expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(amount);
              });
            });
            context('Withdrawal is not successful', function () {
              it('reverts', async function () {
                const { roles, api3ServerV1OevExtension } = await helpers.loadFixture(deploy);
                const amount = ethers.parseEther('1');
                await expect(
                  api3ServerV1OevExtension.connect(roles.manager).withdraw(roles.randomPerson!.address, amount)
                ).to.be.revertedWith('Withdrawal reverted');
              });
            });
          });
          context('Sender is a withdrawer', function () {
            context('Withdrawal is successful', function () {
              it('withdraws', async function () {
                const { roles, api3ServerV1OevExtension, api3ServerV1OevExtensionOevBidPayer } =
                  await helpers.loadFixture(deploy);
                const amount = ethers.parseEther('1');
                const nextTimestamp = (await helpers.time.latest()) + 1;
                await helpers.time.setNextBlockTimestamp(nextTimestamp);
                await payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, 1, nextTimestamp + 1, amount);
                const recipientBalanceBefore = await ethers.provider.getBalance(roles.randomPerson!.address);
                await expect(
                  api3ServerV1OevExtension.connect(roles.withdrawer).withdraw(roles.randomPerson!.address, amount)
                )
                  .to.emit(api3ServerV1OevExtension, 'Withdrew')
                  .withArgs(roles.randomPerson!.address, amount, roles.withdrawer!.address);
                const recipientBalanceAfter = await ethers.provider.getBalance(roles.randomPerson!.address);
                expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(amount);
              });
            });
            context('Withdrawal is not successful', function () {
              it('reverts', async function () {
                const { roles, api3ServerV1OevExtension } = await helpers.loadFixture(deploy);
                const amount = ethers.parseEther('1');
                await expect(
                  api3ServerV1OevExtension.connect(roles.withdrawer).withdraw(roles.randomPerson!.address, amount)
                ).to.be.revertedWith('Withdrawal reverted');
              });
            });
          });
          context('Sender is not the manager or a sender', function () {
            it('reverts', async function () {
              const { roles, api3ServerV1OevExtension } = await helpers.loadFixture(deploy);
              const amount = ethers.parseEther('1');
              await expect(
                api3ServerV1OevExtension.connect(roles.randomPerson).withdraw(roles.randomPerson!.address, amount)
              ).to.be.revertedWith('Sender cannot withdraw');
            });
          });
        });
        context('Amount is zero', function () {
          it('reverts', async function () {
            const { roles, api3ServerV1OevExtension } = await helpers.loadFixture(deploy);
            await expect(
              api3ServerV1OevExtension.connect(roles.manager).withdraw(roles.randomPerson!.address, 0)
            ).to.be.revertedWith('Amount zero');
          });
        });
      });
      context('Recipient is zero address', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1OevExtension } = await helpers.loadFixture(deploy);
          const amount = ethers.parseEther('1');
          await expect(
            api3ServerV1OevExtension.connect(roles.manager).withdraw(ethers.ZeroAddress, amount)
          ).to.be.revertedWith('Recipient address zero');
        });
      });
    });
    context('Is re-entered from an OEV bid payment callback', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1OevExtension, api3ServerV1OevExtensionOevBidPayer } =
          await helpers.loadFixture(deploy);
        const dappId = 1;
        const nextTimestamp = (await helpers.time.latest()) + 1;
        const signedDataTimestampCutoff = nextTimestamp + 1;
        await helpers.time.setNextBlockTimestamp(nextTimestamp);
        const bidAmount = ethers.parseEther('1');
        const { chainId } = await ethers.provider.getNetwork();
        const signature = await roles.auctioneer!.signMessage(
          ethers.getBytes(
            ethers.solidityPackedKeccak256(
              ['uint256', 'uint256', 'address', 'uint256', 'uint32'],
              [
                chainId,
                dappId,
                await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                bidAmount,
                signedDataTimestampCutoff,
              ]
            )
          )
        );
        const data = api3ServerV1OevExtension.interface.encodeFunctionData('withdraw', [
          roles.randomPerson!.address,
          bidAmount,
        ]);
        await expect(
          api3ServerV1OevExtensionOevBidPayer
            .connect(roles.searcher)
            .payOevBid(dappId, bidAmount, signedDataTimestampCutoff, signature, data)
        ).to.be.revertedWith('ReentrancyGuard: reentrant call');
      });
    });
  });

  describe('payOevBid', function () {
    context('Is not a re-entered from an OEV bid payment callback', function () {
      context('dApp ID is not zero', function () {
        context('Timestamp is not zero', function () {
          context('Timestamp is not too far from the future', function () {
            context('Signature is valid', function () {
              context('Last paid bid timestamp cut-off is more recent than the current one', function () {
                context('OEV bid payment callback does not fail', function () {
                  context('OEV bid payment is not short', function () {
                    it('pays OEV bid', async function () {
                      const { roles, api3ServerV1OevExtension, api3ServerV1OevExtensionOevBidPayer } =
                        await helpers.loadFixture(deploy);
                      const dappId = 1;
                      const nextTimestamp = (await helpers.time.latest()) + 1;
                      const signedDataTimestampCutoff = nextTimestamp + 1;
                      await helpers.time.setNextBlockTimestamp(nextTimestamp);
                      const bidAmount = ethers.parseEther('1');
                      await expect(
                        payOevBid(
                          roles,
                          api3ServerV1OevExtensionOevBidPayer,
                          dappId,
                          signedDataTimestampCutoff,
                          bidAmount
                        )
                      )
                        .to.emit(api3ServerV1OevExtension, 'PaidOevBid')
                        .withArgs(
                          dappId,
                          await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                          bidAmount,
                          signedDataTimestampCutoff,
                          roles.auctioneer!.address
                        );
                      expect(await ethers.provider.getBalance(api3ServerV1OevExtension.getAddress())).to.equal(
                        bidAmount
                      );
                      const lastPaidBid = await api3ServerV1OevExtension.dappIdToLastPaidBid(dappId);
                      expect(lastPaidBid.updater).to.equal(await api3ServerV1OevExtensionOevBidPayer.getAddress());
                      expect(lastPaidBid.signedDataTimestampCutoff).to.equal(signedDataTimestampCutoff);
                    });
                  });
                  context('OEV bid payment is short', function () {
                    it('reverts', async function () {
                      const { roles, api3ServerV1OevExtensionOevBidPayer } = await helpers.loadFixture(deploy);
                      const dappId = 1;
                      const nextTimestamp = (await helpers.time.latest()) + 1;
                      const signedDataTimestampCutoff = nextTimestamp + 1;
                      await helpers.time.setNextBlockTimestamp(nextTimestamp);
                      const bidAmount = ethers.parseEther('1');
                      const { chainId } = await ethers.provider.getNetwork();
                      const signature = await roles.auctioneer!.signMessage(
                        ethers.getBytes(
                          ethers.solidityPackedKeccak256(
                            ['uint256', 'uint256', 'address', 'uint256', 'uint32'],
                            [
                              chainId,
                              dappId,
                              await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                              bidAmount,
                              signedDataTimestampCutoff,
                            ]
                          )
                        )
                      );
                      await expect(
                        api3ServerV1OevExtensionOevBidPayer
                          .connect(roles.searcher)
                          .payOevBid(dappId, bidAmount, signedDataTimestampCutoff, signature, '0x5678')
                      ).to.be.revertedWith('OEV bid payment amount short');
                    });
                  });
                });
                context('OEV bid payment callback fails', function () {
                  it('reverts', async function () {
                    const { roles, api3ServerV1OevExtensionOevBidPayer } = await helpers.loadFixture(deploy);
                    const dappId = 1;
                    const nextTimestamp = (await helpers.time.latest()) + 1;
                    const signedDataTimestampCutoff = nextTimestamp + 1;
                    await helpers.time.setNextBlockTimestamp(nextTimestamp);
                    const bidAmount = ethers.parseEther('1');
                    const { chainId } = await ethers.provider.getNetwork();
                    const signature = await roles.auctioneer!.signMessage(
                      ethers.getBytes(
                        ethers.solidityPackedKeccak256(
                          ['uint256', 'uint256', 'address', 'uint256', 'uint32'],
                          [
                            chainId,
                            dappId,
                            await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                            bidAmount,
                            signedDataTimestampCutoff,
                          ]
                        )
                      )
                    );
                    await expect(
                      api3ServerV1OevExtensionOevBidPayer
                        .connect(roles.searcher)
                        .payOevBid(dappId, bidAmount, signedDataTimestampCutoff, signature, '0x1234')
                    ).to.be.revertedWith('OEV bid payment callback failed');
                  });
                });
              });
              context('Last paid bid timestamp cut-off is not more recent than the current one', function () {
                it('reverts', async function () {
                  const { roles, api3ServerV1OevExtensionOevBidPayer } = await helpers.loadFixture(deploy);
                  const dappId = 1;
                  const nextTimestamp = (await helpers.time.latest()) + 1;
                  const signedDataTimestampCutoff = nextTimestamp + 2;
                  await helpers.time.setNextBlockTimestamp(nextTimestamp);
                  const bidAmount = ethers.parseEther('1');
                  await payOevBid(
                    roles,
                    api3ServerV1OevExtensionOevBidPayer,
                    dappId,
                    signedDataTimestampCutoff,
                    bidAmount
                  );
                  await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
                  await expect(
                    payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, dappId, signedDataTimestampCutoff, bidAmount)
                  ).to.be.revertedWith('Cut-off not more recent');
                });
              });
            });
            context('Signature is not valid', function () {
              it('reverts', async function () {
                const { roles, api3ServerV1OevExtensionOevBidPayer } = await helpers.loadFixture(deploy);
                const dappId = 1;
                const nextTimestamp = (await helpers.time.latest()) + 1;
                const signedDataTimestampCutoff = nextTimestamp + 1;
                await helpers.time.setNextBlockTimestamp(nextTimestamp);
                const bidAmount = ethers.parseEther('1');
                const { chainId } = await ethers.provider.getNetwork();
                const signatureByRandomPerson = await roles.randomPerson!.signMessage(
                  ethers.getBytes(
                    ethers.solidityPackedKeccak256(
                      ['uint256', 'uint256', 'address', 'uint256', 'uint32'],
                      [
                        chainId,
                        dappId,
                        await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                        bidAmount,
                        signedDataTimestampCutoff,
                      ]
                    )
                  )
                );
                await expect(
                  api3ServerV1OevExtensionOevBidPayer
                    .connect(roles.searcher)
                    .payOevBid(dappId, bidAmount, signedDataTimestampCutoff, signatureByRandomPerson, '0x')
                ).to.be.revertedWith('Signature mismatch');
              });
            });
          });
          context('Timestamp is too far from the future', function () {
            it('reverts', async function () {
              const { roles, api3ServerV1OevExtensionOevBidPayer } = await helpers.loadFixture(deploy);
              const dappId = 1;
              const nextTimestamp = (await helpers.time.latest()) + 1;
              const signedDataTimestampCutoff = nextTimestamp + 60 * 60;
              await helpers.time.setNextBlockTimestamp(nextTimestamp);
              const bidAmount = ethers.parseEther('1');
              await expect(
                payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, dappId, signedDataTimestampCutoff, bidAmount)
              ).to.be.revertedWith('Cut-off too far in the future');
            });
          });
        });
        context('Timestamp is zero', function () {
          it('reverts', async function () {
            const { roles, api3ServerV1OevExtensionOevBidPayer } = await helpers.loadFixture(deploy);
            const dappId = 1;
            const bidAmount = ethers.parseEther('1');
            await expect(
              payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, dappId, 0, bidAmount)
            ).to.be.revertedWith('Cut-off zero');
          });
        });
      });
      context('dApp ID is zero', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1OevExtensionOevBidPayer } = await helpers.loadFixture(deploy);
          const nextTimestamp = (await helpers.time.latest()) + 1;
          const signedDataTimestampCutoff = nextTimestamp + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          const bidAmount = ethers.parseEther('1');
          await expect(
            payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, 0, signedDataTimestampCutoff, bidAmount)
          ).to.be.revertedWith('dApp ID zero');
        });
      });
    });
    context('Is re-entered from an OEV bid payment callback', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1OevExtension, api3ServerV1OevExtensionOevBidPayer } =
          await helpers.loadFixture(deploy);
        const dappId = 1;
        const nextTimestamp = (await helpers.time.latest()) + 1;
        const signedDataTimestampCutoff = nextTimestamp + 1;
        await helpers.time.setNextBlockTimestamp(nextTimestamp);
        const bidAmount = ethers.parseEther('1');
        const { chainId } = await ethers.provider.getNetwork();
        const signature = await roles.auctioneer!.signMessage(
          ethers.getBytes(
            ethers.solidityPackedKeccak256(
              ['uint256', 'uint256', 'address', 'uint256', 'uint32'],
              [
                chainId,
                dappId,
                await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                bidAmount,
                signedDataTimestampCutoff,
              ]
            )
          )
        );
        const data = api3ServerV1OevExtension.interface.encodeFunctionData('payOevBid', [
          dappId,
          bidAmount,
          signedDataTimestampCutoff,
          signature,
          '0x',
        ]);
        await expect(
          api3ServerV1OevExtensionOevBidPayer
            .connect(roles.searcher)
            .payOevBid(dappId, bidAmount, signedDataTimestampCutoff, signature, data)
        ).to.be.revertedWith('ReentrancyGuard: reentrant call');
      });
    });
  });

  describe('updateDappOevDataFeed', function () {
    context('Sender is the last bid payer for the dApp', function () {
      context('Signed data is not empty', function () {
        context('Signed data has a single item', function () {
          context('Signature is valid', function () {
            context('Timestamp is smaller than or equal to the cut-off', function () {
              context('Timestamp updates', function () {
                it('updates dApp OEV data feed', async function () {
                  const { roles, api3ServerV1OevExtension, api3ServerV1OevExtensionOevBidPayer, beacons } =
                    await helpers.loadFixture(deploy);
                  const dappId = 1;
                  const nextTimestamp = (await helpers.time.latest()) + 1;
                  const signedDataTimestampCutoff = nextTimestamp + 2;
                  await helpers.time.setNextBlockTimestamp(nextTimestamp);
                  const bidAmount = ethers.parseEther('1');
                  await payOevBid(
                    roles,
                    api3ServerV1OevExtensionOevBidPayer,
                    dappId,
                    signedDataTimestampCutoff,
                    bidAmount
                  );
                  const beacon = beacons[0]!;
                  const beaconValue = Math.floor(Math.random() * 200 - 100);
                  const beaconTimestamp = signedDataTimestampCutoff - 1;
                  const signature = await signDataWithAlternateTemplateId(
                    beacon.airnode,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValue)
                  );
                  const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                    [beacon.airnode.address, beacon.templateId, beaconTimestamp, encodeData(beaconValue), signature]
                  );
                  await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
                  await expect(
                    api3ServerV1OevExtensionOevBidPayer
                      .connect(roles.searcher)
                      .updateDappOevDataFeed(dappId, [signedData])
                  )
                    .to.emit(api3ServerV1OevExtension, 'UpdatedDappOevDataFeed')
                    .withArgs(
                      dappId,
                      await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                      beacon.beaconId,
                      beaconValue,
                      beaconTimestamp
                    );
                  const oevDataFeed = await api3ServerV1OevExtension.oevDataFeed(dappId, beacon.beaconId);
                  expect(oevDataFeed.value).to.equal(beaconValue);
                  expect(oevDataFeed.timestamp).to.equal(beaconTimestamp);
                });
              });
              context('Timestamp does not update', function () {
                it('reverts', async function () {
                  const { roles, api3ServerV1OevExtensionOevBidPayer, beacons } = await helpers.loadFixture(deploy);
                  const dappId = 1;
                  const nextTimestamp = (await helpers.time.latest()) + 1;
                  const signedDataTimestampCutoff = nextTimestamp + 3;
                  await helpers.time.setNextBlockTimestamp(nextTimestamp);
                  const bidAmount = ethers.parseEther('1');
                  await payOevBid(
                    roles,
                    api3ServerV1OevExtensionOevBidPayer,
                    dappId,
                    signedDataTimestampCutoff,
                    bidAmount
                  );
                  const beacon = beacons[0]!;
                  const beaconValue = Math.floor(Math.random() * 200 - 100);
                  const beaconTimestamp = signedDataTimestampCutoff - 1;
                  const signature = await signDataWithAlternateTemplateId(
                    beacon.airnode,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValue)
                  );
                  const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                    [beacon.airnode.address, beacon.templateId, beaconTimestamp, encodeData(beaconValue), signature]
                  );
                  await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
                  await api3ServerV1OevExtensionOevBidPayer
                    .connect(roles.searcher)
                    .updateDappOevDataFeed(dappId, [signedData]);
                  await helpers.time.setNextBlockTimestamp(nextTimestamp + 2);
                  await expect(
                    api3ServerV1OevExtensionOevBidPayer
                      .connect(roles.searcher)
                      .updateDappOevDataFeed(dappId, [signedData])
                  ).to.be.revertedWith('Does not update timestamp');
                });
              });
            });
            context('Timestamp is larger than the cut-off', function () {
              it('reverts', async function () {
                const { roles, api3ServerV1OevExtensionOevBidPayer, beacons } = await helpers.loadFixture(deploy);
                const dappId = 1;
                const nextTimestamp = (await helpers.time.latest()) + 1;
                const signedDataTimestampCutoff = nextTimestamp + 2;
                await helpers.time.setNextBlockTimestamp(nextTimestamp);
                const bidAmount = ethers.parseEther('1');
                await payOevBid(
                  roles,
                  api3ServerV1OevExtensionOevBidPayer,
                  dappId,
                  signedDataTimestampCutoff,
                  bidAmount
                );
                const beacon = beacons[0]!;
                const beaconValue = Math.floor(Math.random() * 200 - 100);
                const beaconTimestamp = signedDataTimestampCutoff + 1;
                const signature = await signDataWithAlternateTemplateId(
                  beacon.airnode,
                  beacon.templateId,
                  beaconTimestamp,
                  encodeData(beaconValue)
                );
                const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
                  ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                  [beacon.airnode.address, beacon.templateId, beaconTimestamp, encodeData(beaconValue), signature]
                );
                await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
                await expect(
                  api3ServerV1OevExtensionOevBidPayer
                    .connect(roles.searcher)
                    .updateDappOevDataFeed(dappId, [signedData])
                ).to.be.revertedWith('Timestamp exceeds cut-off');
              });
            });
          });
          context('Signature is not valid', function () {
            it('reverts', async function () {
              const { roles, api3ServerV1OevExtensionOevBidPayer, beacons } = await helpers.loadFixture(deploy);
              const dappId = 1;
              const nextTimestamp = (await helpers.time.latest()) + 1;
              const signedDataTimestampCutoff = nextTimestamp + 2;
              await helpers.time.setNextBlockTimestamp(nextTimestamp);
              const bidAmount = ethers.parseEther('1');
              await payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, dappId, signedDataTimestampCutoff, bidAmount);
              const beacon = beacons[0]!;
              const beaconValue = Math.floor(Math.random() * 200 - 100);
              const beaconTimestamp = signedDataTimestampCutoff - 1;
              const signature = await testUtils.signData(
                beacon.airnode,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValue)
              );
              const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                [beacon.airnode.address, beacon.templateId, beaconTimestamp, encodeData(beaconValue), signature]
              );
              await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
              await expect(
                api3ServerV1OevExtensionOevBidPayer.connect(roles.searcher).updateDappOevDataFeed(dappId, [signedData])
              ).to.be.revertedWith('Signature mismatch');
            });
          });
        });
        context('Signed data has multiple items', function () {
          context('No signature has been omitted', function () {
            context('All signatures are valid', function () {
              context('All timestamps are smaller than or equal to the cut-off', function () {
                context('All timestamps update', function () {
                  context('All timestamps are larger than the base counterparts', function () {
                    context('Updates OEV Beacon set timestamp', function () {
                      it('updates dApp OEV data feed', async function () {
                        const {
                          roles,
                          api3ServerV1OevExtension,
                          api3ServerV1OevExtensionOevBidPayer,
                          beacons,
                          beaconSet,
                        } = await helpers.loadFixture(deploy);
                        const dappId = 1;
                        const nextTimestamp = (await helpers.time.latest()) + 1;
                        const signedDataTimestampCutoff = nextTimestamp + 2;
                        await helpers.time.setNextBlockTimestamp(nextTimestamp);
                        const bidAmount = ethers.parseEther('1');
                        await payOevBid(
                          roles,
                          api3ServerV1OevExtensionOevBidPayer,
                          dappId,
                          signedDataTimestampCutoff,
                          bidAmount
                        );
                        const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                        const beaconTimestamps = beacons.map(() =>
                          Math.floor(signedDataTimestampCutoff - Math.random() * 5 * 60)
                        );
                        const beaconSetValue = median(beaconValues);
                        const beaconSetTimestamp = median(beaconTimestamps);
                        const signedData = await Promise.all(
                          beacons.map(async (beacon, ind) => {
                            const signature = await signDataWithAlternateTemplateId(
                              beacon.airnode,
                              beacon.templateId,
                              beaconTimestamps[ind]!,
                              encodeData(beaconValues[ind]!)
                            );
                            return ethers.AbiCoder.defaultAbiCoder().encode(
                              ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                              [
                                beacon.airnode.address,
                                beacon.templateId,
                                beaconTimestamps[ind]!,
                                encodeData(beaconValues[ind]!),
                                signature,
                              ]
                            );
                          })
                        );
                        await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
                        await expect(
                          api3ServerV1OevExtensionOevBidPayer
                            .connect(roles.searcher)
                            .updateDappOevDataFeed(dappId, signedData)
                        )
                          .to.emit(api3ServerV1OevExtension, 'UpdatedDappOevDataFeed')
                          .withArgs(
                            dappId,
                            await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                            beaconSet.beaconSetId,
                            beaconSetValue,
                            beaconSetTimestamp
                          );
                        const oevDataFeed = await api3ServerV1OevExtension.oevDataFeed(dappId, beaconSet.beaconSetId);
                        expect(oevDataFeed.value).to.equal(beaconSetValue);
                        expect(oevDataFeed.timestamp).to.equal(beaconSetTimestamp);
                        for (const [ind, beacon] of beacons.entries()) {
                          const oevBeacon = await api3ServerV1OevExtension.oevDataFeed(dappId, beacon.beaconId);
                          expect(oevBeacon.value).to.equal(beaconValues[ind]);
                          expect(oevBeacon.timestamp).to.equal(beaconTimestamps[ind]);
                        }
                      });
                    });
                    context('Does not update OEV Beacon set timestamp', function () {
                      context('Updates OEV Beacon set value', function () {
                        it('updates dApp OEV data feed', async function () {
                          // As a note, this is under the "no signatures omitted" context, yet it omits signatures
                          // to be able to change the Beacon set value without changing its timestamp. This nesting
                          // feels tidier, albeit factually incorrect.
                          const {
                            roles,
                            api3ServerV1OevExtension,
                            api3ServerV1OevExtensionOevBidPayer,
                            beacons,
                            beaconSet,
                          } = await helpers.loadFixture(deploy);
                          const dappId = 1;
                          const nextTimestamp = (await helpers.time.latest()) + 1;
                          const signedDataTimestampCutoff = nextTimestamp + 3;
                          await helpers.time.setNextBlockTimestamp(nextTimestamp);
                          const bidAmount = ethers.parseEther('1');
                          await payOevBid(
                            roles,
                            api3ServerV1OevExtensionOevBidPayer,
                            dappId,
                            signedDataTimestampCutoff,
                            bidAmount
                          );
                          const beaconValues = [2, 1, 3];
                          const beaconTimestamps = [
                            signedDataTimestampCutoff - 2,
                            signedDataTimestampCutoff - 2,
                            signedDataTimestampCutoff - 2,
                          ];
                          const signedData = await Promise.all(
                            beacons.map(async (beacon, ind) => {
                              const signature = await signDataWithAlternateTemplateId(
                                beacon.airnode,
                                beacon.templateId,
                                beaconTimestamps[ind]!,
                                encodeData(beaconValues[ind]!)
                              );
                              return ethers.AbiCoder.defaultAbiCoder().encode(
                                ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                                [
                                  beacon.airnode.address,
                                  beacon.templateId,
                                  beaconTimestamps[ind]!,
                                  encodeData(beaconValues[ind]!),
                                  signature,
                                ]
                              );
                            })
                          );
                          await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
                          await api3ServerV1OevExtensionOevBidPayer
                            .connect(roles.searcher)
                            .updateDappOevDataFeed(dappId, signedData);
                          await helpers.time.setNextBlockTimestamp(nextTimestamp + 2);
                          beaconValues[0] = 3;
                          beaconTimestamps[0] = signedDataTimestampCutoff - 1;
                          const beaconSetValue = 3;
                          const beaconSetTimestamp = signedDataTimestampCutoff - 2;
                          const signedDataThatUpdatedBeaconSetValueButNotTimestamp = await Promise.all(
                            beacons.map(async (beacon, ind) => {
                              if (ind === 0) {
                                const signature = await signDataWithAlternateTemplateId(
                                  beacon.airnode,
                                  beacon.templateId,
                                  beaconTimestamps[ind]!,
                                  encodeData(beaconValues[ind]!)
                                );
                                return ethers.AbiCoder.defaultAbiCoder().encode(
                                  ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                                  [
                                    beacon.airnode.address,
                                    beacon.templateId,
                                    beaconTimestamps[ind]!,
                                    encodeData(beaconValues[ind]!),
                                    signature,
                                  ]
                                );
                              } else {
                                return ethers.AbiCoder.defaultAbiCoder().encode(
                                  ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                                  [beacon.airnode.address, beacon.templateId, beaconTimestamps[ind]!, '0x', '0x']
                                );
                              }
                            })
                          );
                          await expect(
                            api3ServerV1OevExtensionOevBidPayer
                              .connect(roles.searcher)
                              .updateDappOevDataFeed(dappId, signedDataThatUpdatedBeaconSetValueButNotTimestamp)
                          )
                            .to.emit(api3ServerV1OevExtension, 'UpdatedDappOevDataFeed')
                            .withArgs(
                              dappId,
                              await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                              beaconSet.beaconSetId,
                              beaconSetValue,
                              beaconSetTimestamp
                            );
                          const oevDataFeed = await api3ServerV1OevExtension.oevDataFeed(dappId, beaconSet.beaconSetId);
                          expect(oevDataFeed.value).to.equal(beaconSetValue);
                          expect(oevDataFeed.timestamp).to.equal(beaconSetTimestamp);
                          for (const [ind, beacon] of beacons.entries()) {
                            const oevBeacon = await api3ServerV1OevExtension.oevDataFeed(dappId, beacon.beaconId);
                            expect(oevBeacon.value).to.equal(beaconValues[ind]);
                            expect(oevBeacon.timestamp).to.equal(beaconTimestamps[ind]);
                          }
                        });
                      });
                      context('Does not update OEV Beacon set value', function () {
                        it('reverts', async function () {
                          const { roles, api3ServerV1OevExtensionOevBidPayer, beacons } =
                            await helpers.loadFixture(deploy);
                          const dappId = 1;
                          const nextTimestamp = (await helpers.time.latest()) + 1;
                          const signedDataTimestampCutoff = nextTimestamp + 3;
                          await helpers.time.setNextBlockTimestamp(nextTimestamp);
                          const bidAmount = ethers.parseEther('1');
                          await payOevBid(
                            roles,
                            api3ServerV1OevExtensionOevBidPayer,
                            dappId,
                            signedDataTimestampCutoff,
                            bidAmount
                          );
                          const beaconValues = [2, 1, 3];
                          const beaconTimestamps = [
                            signedDataTimestampCutoff - 2,
                            signedDataTimestampCutoff - 2,
                            signedDataTimestampCutoff - 2,
                          ];
                          const signedData = await Promise.all(
                            beacons.map(async (beacon, ind) => {
                              const signature = await signDataWithAlternateTemplateId(
                                beacon.airnode,
                                beacon.templateId,
                                beaconTimestamps[ind]!,
                                encodeData(beaconValues[ind]!)
                              );
                              return ethers.AbiCoder.defaultAbiCoder().encode(
                                ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                                [
                                  beacon.airnode.address,
                                  beacon.templateId,
                                  beaconTimestamps[ind]!,
                                  encodeData(beaconValues[ind]!),
                                  signature,
                                ]
                              );
                            })
                          );
                          await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
                          await api3ServerV1OevExtensionOevBidPayer
                            .connect(roles.searcher)
                            .updateDappOevDataFeed(dappId, signedData);
                          await helpers.time.setNextBlockTimestamp(nextTimestamp + 2);
                          beaconValues[0] = 2;
                          beaconTimestamps[0] = signedDataTimestampCutoff - 1;
                          const signedDataThatUpdatedBeaconSetValueButNotTimestamp = await Promise.all(
                            beacons.map(async (beacon, ind) => {
                              if (ind === 0) {
                                const signature = await signDataWithAlternateTemplateId(
                                  beacon.airnode,
                                  beacon.templateId,
                                  beaconTimestamps[ind]!,
                                  encodeData(beaconValues[ind]!)
                                );
                                return ethers.AbiCoder.defaultAbiCoder().encode(
                                  ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                                  [
                                    beacon.airnode.address,
                                    beacon.templateId,
                                    beaconTimestamps[ind]!,
                                    encodeData(beaconValues[ind]!),
                                    signature,
                                  ]
                                );
                              } else {
                                return ethers.AbiCoder.defaultAbiCoder().encode(
                                  ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                                  [beacon.airnode.address, beacon.templateId, beaconTimestamps[ind]!, '0x', '0x']
                                );
                              }
                            })
                          );
                          await expect(
                            api3ServerV1OevExtensionOevBidPayer
                              .connect(roles.searcher)
                              .updateDappOevDataFeed(dappId, signedDataThatUpdatedBeaconSetValueButNotTimestamp)
                          ).to.be.revertedWith('Does not update Beacon set');
                        });
                      });
                    });
                  });
                  context('Not all timestamps are larger than the base counterparts', function () {
                    it('updates dApp OEV data feed by using base Beacon values as necessary', async function () {
                      const {
                        roles,
                        api3ServerV1,
                        api3ServerV1OevExtension,
                        api3ServerV1OevExtensionOevBidPayer,
                        beacons,
                        beaconSet,
                      } = await helpers.loadFixture(deploy);
                      const dappId = 1;
                      const nextTimestamp = (await helpers.time.latest()) + 1;
                      const signedDataTimestampCutoff = nextTimestamp + 2 + beacons.length;
                      await helpers.time.setNextBlockTimestamp(nextTimestamp);
                      const bidAmount = ethers.parseEther('1');
                      await payOevBid(
                        roles,
                        api3ServerV1OevExtensionOevBidPayer,
                        dappId,
                        signedDataTimestampCutoff,
                        bidAmount
                      );
                      const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                      const beaconTimestamps = beacons.map(() =>
                        Math.floor(signedDataTimestampCutoff - Math.random() * 5 * 60)
                      );
                      // Populate base Beacons
                      const baseBeaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                      const baseBeaconTimestamps = beaconTimestamps.map((beaconTimestamp) =>
                        Math.random() > 0.5 ? beaconTimestamp + 1 : beaconTimestamp - 1
                      );
                      for (const [ind, beacon] of beacons.entries()) {
                        await helpers.time.setNextBlockTimestamp(nextTimestamp + ind + 1);
                        await updateBeacon(
                          roles,
                          api3ServerV1,
                          beacon,
                          baseBeaconValues[ind]!,
                          baseBeaconTimestamps[ind]!
                        );
                      }
                      const aggregatedBeaconValues = beaconTimestamps.map((beaconTimestamp, ind) =>
                        baseBeaconTimestamps[ind]! > beaconTimestamp ? baseBeaconValues[ind]! : beaconValues[ind]!
                      );
                      const aggregatedBeaconTimestamps = beaconTimestamps.map((beaconTimestamp, ind) =>
                        baseBeaconTimestamps[ind]! > beaconTimestamp ? baseBeaconTimestamps[ind]! : beaconTimestamp
                      );
                      const beaconSetValue = median(structuredClone(aggregatedBeaconValues));
                      const beaconSetTimestamp = median(structuredClone(aggregatedBeaconTimestamps));
                      const signedData = await Promise.all(
                        beacons.map(async (beacon, ind) => {
                          const signature = await signDataWithAlternateTemplateId(
                            beacon.airnode,
                            beacon.templateId,
                            beaconTimestamps[ind]!,
                            encodeData(beaconValues[ind]!)
                          );
                          return ethers.AbiCoder.defaultAbiCoder().encode(
                            ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                            [
                              beacon.airnode.address,
                              beacon.templateId,
                              beaconTimestamps[ind]!,
                              encodeData(beaconValues[ind]!),
                              signature,
                            ]
                          );
                        })
                      );
                      await helpers.time.setNextBlockTimestamp(nextTimestamp + 1 + beacons.length);
                      await expect(
                        api3ServerV1OevExtensionOevBidPayer
                          .connect(roles.searcher)
                          .updateDappOevDataFeed(dappId, signedData)
                      )
                        .to.emit(api3ServerV1OevExtension, 'UpdatedDappOevDataFeed')
                        .withArgs(
                          dappId,
                          await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                          beaconSet.beaconSetId,
                          beaconSetValue,
                          beaconSetTimestamp
                        );
                      const oevDataFeed = await api3ServerV1OevExtension.oevDataFeed(dappId, beaconSet.beaconSetId);
                      expect(oevDataFeed.value).to.equal(beaconSetValue);
                      expect(oevDataFeed.timestamp).to.equal(beaconSetTimestamp);
                      for (const [ind, beacon] of beacons.entries()) {
                        const oevBeacon = await api3ServerV1OevExtension.oevDataFeed(dappId, beacon.beaconId);
                        expect(oevBeacon.value).to.equal(aggregatedBeaconValues[ind]);
                        expect(oevBeacon.timestamp).to.equal(aggregatedBeaconTimestamps[ind]);
                      }
                    });
                  });
                });
                context('Not all timestamps update', function () {
                  it('reverts', async function () {
                    const { roles, api3ServerV1OevExtensionOevBidPayer, beacons } = await helpers.loadFixture(deploy);
                    const dappId = 1;
                    const nextTimestamp = (await helpers.time.latest()) + 1;
                    const signedDataTimestampCutoff = nextTimestamp + 3;
                    await helpers.time.setNextBlockTimestamp(nextTimestamp);
                    const bidAmount = ethers.parseEther('1');
                    await payOevBid(
                      roles,
                      api3ServerV1OevExtensionOevBidPayer,
                      dappId,
                      signedDataTimestampCutoff,
                      bidAmount
                    );
                    const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                    const beaconTimestamps = beacons.map(() =>
                      Math.floor(signedDataTimestampCutoff - Math.random() * 5 * 60)
                    );
                    const signedData = await Promise.all(
                      beacons.map(async (beacon, ind) => {
                        const signature = await signDataWithAlternateTemplateId(
                          beacon.airnode,
                          beacon.templateId,
                          beaconTimestamps[ind]!,
                          encodeData(beaconValues[ind]!)
                        );
                        return ethers.AbiCoder.defaultAbiCoder().encode(
                          ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                          [
                            beacon.airnode.address,
                            beacon.templateId,
                            beaconTimestamps[ind]!,
                            encodeData(beaconValues[ind]!),
                            signature,
                          ]
                        );
                      })
                    );
                    await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
                    await api3ServerV1OevExtensionOevBidPayer
                      .connect(roles.searcher)
                      .updateDappOevDataFeed(dappId, [signedData[Math.floor(Math.random() * beacons.length)]!]);
                    await helpers.time.setNextBlockTimestamp(nextTimestamp + 2);
                    await expect(
                      api3ServerV1OevExtensionOevBidPayer
                        .connect(roles.searcher)
                        .updateDappOevDataFeed(dappId, signedData)
                    ).to.be.revertedWith('Does not update timestamp');
                  });
                });
              });
              context('Some timestamps are larger than the cut-off', function () {
                it('reverts', async function () {
                  const { roles, api3ServerV1OevExtensionOevBidPayer, beacons } = await helpers.loadFixture(deploy);
                  const dappId = 1;
                  const nextTimestamp = (await helpers.time.latest()) + 1;
                  const signedDataTimestampCutoff = nextTimestamp + 2;
                  await helpers.time.setNextBlockTimestamp(nextTimestamp);
                  const bidAmount = ethers.parseEther('1');
                  await payOevBid(
                    roles,
                    api3ServerV1OevExtensionOevBidPayer,
                    dappId,
                    signedDataTimestampCutoff,
                    bidAmount
                  );
                  const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                  const beaconTimestamps = beacons.map(() =>
                    Math.floor(signedDataTimestampCutoff - Math.random() * 5 * 60)
                  );
                  beaconTimestamps[Math.floor(Math.random() * beacons.length)] = signedDataTimestampCutoff + 1;
                  const signedData = await Promise.all(
                    beacons.map(async (beacon, ind) => {
                      const signature = await signDataWithAlternateTemplateId(
                        beacon.airnode,
                        beacon.templateId,
                        beaconTimestamps[ind]!,
                        encodeData(beaconValues[ind]!)
                      );
                      return ethers.AbiCoder.defaultAbiCoder().encode(
                        ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                        [
                          beacon.airnode.address,
                          beacon.templateId,
                          beaconTimestamps[ind]!,
                          encodeData(beaconValues[ind]!),
                          signature,
                        ]
                      );
                    })
                  );
                  await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
                  await expect(
                    api3ServerV1OevExtensionOevBidPayer
                      .connect(roles.searcher)
                      .updateDappOevDataFeed(dappId, signedData)
                  ).to.be.revertedWith('Timestamp exceeds cut-off');
                });
              });
            });
            context('Not all signatures are valid', function () {
              it('reverts', async function () {
                const { roles, api3ServerV1OevExtensionOevBidPayer, beacons } = await helpers.loadFixture(deploy);
                const dappId = 1;
                const nextTimestamp = (await helpers.time.latest()) + 1;
                const signedDataTimestampCutoff = nextTimestamp + 2;
                await helpers.time.setNextBlockTimestamp(nextTimestamp);
                const bidAmount = ethers.parseEther('1');
                await payOevBid(
                  roles,
                  api3ServerV1OevExtensionOevBidPayer,
                  dappId,
                  signedDataTimestampCutoff,
                  bidAmount
                );
                const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                const beaconTimestamps = beacons.map(() =>
                  Math.floor(signedDataTimestampCutoff - Math.random() * 5 * 60)
                );
                const indWithInvalidSignature = Math.floor(Math.random() * beacons.length);
                const signedData = await Promise.all(
                  beacons.map(async (beacon, ind) => {
                    const signature =
                      ind === indWithInvalidSignature
                        ? await testUtils.signData(
                            beacon.airnode,
                            beacon.templateId,
                            beaconTimestamps[ind]!,
                            encodeData(beaconValues[ind]!)
                          )
                        : await signDataWithAlternateTemplateId(
                            beacon.airnode,
                            beacon.templateId,
                            beaconTimestamps[ind]!,
                            encodeData(beaconValues[ind]!)
                          );
                    return ethers.AbiCoder.defaultAbiCoder().encode(
                      ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                      [
                        beacon.airnode.address,
                        beacon.templateId,
                        beaconTimestamps[ind]!,
                        encodeData(beaconValues[ind]!),
                        signature,
                      ]
                    );
                  })
                );
                await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
                await expect(
                  api3ServerV1OevExtensionOevBidPayer.connect(roles.searcher).updateDappOevDataFeed(dappId, signedData)
                ).to.be.revertedWith('Signature mismatch');
              });
            });
          });
          context('Some signatures have been omitted', function () {
            it('updates dApp OEV data feed', async function () {
              const {
                roles,
                api3ServerV1,
                api3ServerV1OevExtension,
                api3ServerV1OevExtensionOevBidPayer,
                beacons,
                beaconSet,
              } = await helpers.loadFixture(deploy);
              const dappId = 1;
              const nextTimestamp = (await helpers.time.latest()) + 1;
              const signedDataTimestampCutoff = nextTimestamp + 2 + beacons.length;
              await helpers.time.setNextBlockTimestamp(nextTimestamp);
              const bidAmount = ethers.parseEther('1');
              await payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, dappId, signedDataTimestampCutoff, bidAmount);
              const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
              const beaconTimestamps = beacons.map(() =>
                Math.floor(signedDataTimestampCutoff - Math.random() * 5 * 60)
              );
              // Populate base Beacons
              const baseBeaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
              const baseBeaconTimestamps = beaconTimestamps.map((beaconTimestamp) =>
                Math.random() > 0.5 ? beaconTimestamp + 1 : beaconTimestamp - 1
              );
              const indOfBeaconWithOmittedSignature = Math.floor(Math.random() * beacons.length);
              beaconValues[indOfBeaconWithOmittedSignature] = 0;
              beaconTimestamps[indOfBeaconWithOmittedSignature] = 0;
              for (const [ind, beacon] of beacons.entries()) {
                await helpers.time.setNextBlockTimestamp(nextTimestamp + ind + 1);
                await updateBeacon(roles, api3ServerV1, beacon, baseBeaconValues[ind]!, baseBeaconTimestamps[ind]!);
              }
              const aggregatedBeaconValues = beaconTimestamps.map((beaconTimestamp, ind) =>
                baseBeaconTimestamps[ind]! > beaconTimestamp ? baseBeaconValues[ind]! : beaconValues[ind]!
              );
              const aggregatedBeaconTimestamps = beaconTimestamps.map((beaconTimestamp, ind) =>
                baseBeaconTimestamps[ind]! > beaconTimestamp ? baseBeaconTimestamps[ind]! : beaconTimestamp
              );
              const beaconSetValue = median(structuredClone(aggregatedBeaconValues));
              const beaconSetTimestamp = median(structuredClone(aggregatedBeaconTimestamps));
              const signedData = await Promise.all(
                beacons.map(async (beacon, ind) => {
                  if (ind === indOfBeaconWithOmittedSignature) {
                    return ethers.AbiCoder.defaultAbiCoder().encode(
                      ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                      [beacon.airnode.address, beacon.templateId, beaconTimestamps[ind]!, '0x', '0x']
                    );
                  } else {
                    const signature = await signDataWithAlternateTemplateId(
                      beacon.airnode,
                      beacon.templateId,
                      beaconTimestamps[ind]!,
                      encodeData(beaconValues[ind]!)
                    );
                    return ethers.AbiCoder.defaultAbiCoder().encode(
                      ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                      [
                        beacon.airnode.address,
                        beacon.templateId,
                        beaconTimestamps[ind]!,
                        encodeData(beaconValues[ind]!),
                        signature,
                      ]
                    );
                  }
                })
              );
              await helpers.time.setNextBlockTimestamp(nextTimestamp + 1 + beacons.length);
              await expect(
                api3ServerV1OevExtensionOevBidPayer.connect(roles.searcher).updateDappOevDataFeed(dappId, signedData)
              )
                .to.emit(api3ServerV1OevExtension, 'UpdatedDappOevDataFeed')
                .withArgs(
                  dappId,
                  await api3ServerV1OevExtensionOevBidPayer.getAddress(),
                  beaconSet.beaconSetId,
                  beaconSetValue,
                  beaconSetTimestamp
                );
              const oevDataFeed = await api3ServerV1OevExtension.oevDataFeed(dappId, beaconSet.beaconSetId);
              expect(oevDataFeed.value).to.equal(beaconSetValue);
              expect(oevDataFeed.timestamp).to.equal(beaconSetTimestamp);
              for (const [ind, beacon] of beacons.entries()) {
                const oevBeacon = await api3ServerV1OevExtension.oevDataFeed(dappId, beacon.beaconId);
                expect(oevBeacon.value).to.equal(aggregatedBeaconValues[ind]);
                expect(oevBeacon.timestamp).to.equal(aggregatedBeaconTimestamps[ind]);
              }
            });
          });
        });
      });
      context('Signed data is empty', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1OevExtensionOevBidPayer } = await helpers.loadFixture(deploy);
          const dappId = 1;
          const nextTimestamp = (await helpers.time.latest()) + 1;
          const signedDataTimestampCutoff = nextTimestamp + 2;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          const bidAmount = ethers.parseEther('1');
          await payOevBid(roles, api3ServerV1OevExtensionOevBidPayer, dappId, signedDataTimestampCutoff, bidAmount);
          await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
          await expect(
            api3ServerV1OevExtensionOevBidPayer.connect(roles.searcher).updateDappOevDataFeed(dappId, [])
          ).to.be.revertedWith('Signed data empty');
        });
      });
    });
    context('Sender is not the last bid payer for the dApp', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1OevExtensionOevBidPayer, beacons } = await helpers.loadFixture(deploy);
        const dappId = 1;
        const nextTimestamp = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(nextTimestamp);
        const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
        const beaconTimestamps = beacons.map(() => Math.floor(nextTimestamp - Math.random() * 5 * 60));
        const signedData = await Promise.all(
          beacons.map(async (beacon, ind) => {
            const signature = await signDataWithAlternateTemplateId(
              beacon.airnode,
              beacon.templateId,
              beaconTimestamps[ind]!,
              encodeData(beaconValues[ind]!)
            );
            return ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
              [
                beacon.airnode.address,
                beacon.templateId,
                beaconTimestamps[ind]!,
                encodeData(beaconValues[ind]!),
                signature,
              ]
            );
          })
        );
        await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
        await expect(
          api3ServerV1OevExtensionOevBidPayer.connect(roles.searcher).updateDappOevDataFeed(dappId, signedData)
        ).to.be.revertedWith('Sender not last bid updater');
      });
    });
  });

  describe('simulateDappOevDataFeedUpdate', function () {
    context('Sender impersonates zero address', function () {
      context('Sender static-calls', function () {
        it('simulates dApp OEV data feed update', async function () {
          const { api3ServerV1OevExtension, beacons } = await helpers.loadFixture(deploy);
          const dappId = 1;
          const nextTimestamp = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          const beacon = beacons[0]!;
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = nextTimestamp;
          const signature = await signDataWithAlternateTemplateId(
            beacon.airnode,
            beacon.templateId,
            beaconTimestamp,
            encodeData(beaconValue)
          );
          const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
            [beacon.airnode.address, beacon.templateId, beaconTimestamp, encodeData(beaconValue), signature]
          );
          const voidSigner = new ethers.VoidSigner(ethers.ZeroAddress, ethers.provider);
          const returndata = await api3ServerV1OevExtension
            .connect(voidSigner)
            .multicall.staticCall([
              api3ServerV1OevExtension.interface.encodeFunctionData('simulateDappOevDataFeedUpdate', [
                dappId,
                [signedData],
              ]),
              api3ServerV1OevExtension.interface.encodeFunctionData('oevDataFeed', [dappId, beacon.beaconId]),
            ]);
          expect(
            api3ServerV1OevExtension.interface.decodeFunctionResult('simulateDappOevDataFeedUpdate', returndata[0]!)
          ).to.deep.equal([beacon.beaconId, beaconValue, beaconTimestamp]);
          expect(api3ServerV1OevExtension.interface.decodeFunctionResult('oevDataFeed', returndata[1]!)).to.deep.equal([
            beaconValue,
            beaconTimestamp,
          ]);
        });
      });
    });
    context('Sender does not impersonate zero address', function () {
      context('Sender static-calls', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1OevExtension, beacons } = await helpers.loadFixture(deploy);
          const dappId = 1;
          const nextTimestamp = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          const beacon = beacons[0]!;
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = nextTimestamp;
          const signature = await signDataWithAlternateTemplateId(
            beacon.airnode,
            beacon.templateId,
            beaconTimestamp,
            encodeData(beaconValue)
          );
          const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
            [beacon.airnode.address, beacon.templateId, beaconTimestamp, encodeData(beaconValue), signature]
          );
          await expect(
            api3ServerV1OevExtension
              .connect(roles.randomPerson)
              .simulateDappOevDataFeedUpdate.staticCall(dappId, [signedData])
          ).to.be.revertedWith('Sender address not zero');
        });
      });
      context('Sender calls', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1OevExtension, beacons } = await helpers.loadFixture(deploy);
          const dappId = 1;
          const nextTimestamp = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          const beacon = beacons[0]!;
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = nextTimestamp;
          const signature = await signDataWithAlternateTemplateId(
            beacon.airnode,
            beacon.templateId,
            beaconTimestamp,
            encodeData(beaconValue)
          );
          const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
            [beacon.airnode.address, beacon.templateId, beaconTimestamp, encodeData(beaconValue), signature]
          );
          await expect(
            api3ServerV1OevExtension.connect(roles.randomPerson).simulateDappOevDataFeedUpdate(dappId, [signedData])
          ).to.be.revertedWith('Sender address not zero');
        });
      });
    });
  });

  describe('simulateExternalCall', function () {
    context('Sender impersonates zero address', function () {
      context('Sender static-calls', function () {
        it('simulates external call', async function () {
          const { api3ServerV1, api3ServerV1OevExtension, beacons } = await helpers.loadFixture(deploy);
          const beacon = beacons[0]!;
          const nextTimestamp = (await helpers.time.latest()) + 1;
          const baseBeaconValue = Math.floor(Math.random() * 200 - 100);
          const baseBeaconTimestamp = nextTimestamp;
          const updateBeaconCalldata = api3ServerV1.interface.encodeFunctionData('updateBeaconWithSignedData', [
            beacon.airnode.address,
            beacon.templateId,
            baseBeaconTimestamp,
            encodeData(baseBeaconValue),
            await testUtils.signData(
              beacon.airnode,
              beacon.templateId,
              baseBeaconTimestamp,
              encodeData(baseBeaconValue)
            ),
          ]);
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          const dappId = 1;
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = nextTimestamp + 1;
          const signature = await signDataWithAlternateTemplateId(
            beacon.airnode,
            beacon.templateId,
            beaconTimestamp,
            encodeData(beaconValue)
          );
          const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
            [beacon.airnode.address, beacon.templateId, beaconTimestamp, encodeData(beaconValue), signature]
          );
          const voidSigner = new ethers.VoidSigner(ethers.ZeroAddress, ethers.provider);
          const returndata = await api3ServerV1OevExtension
            .connect(voidSigner)
            .multicall.staticCall([
              api3ServerV1OevExtension.interface.encodeFunctionData('simulateDappOevDataFeedUpdate', [
                dappId,
                [signedData],
              ]),
              api3ServerV1OevExtension.interface.encodeFunctionData('simulateExternalCall', [
                await api3ServerV1.getAddress(),
                updateBeaconCalldata,
              ]),
              api3ServerV1OevExtension.interface.encodeFunctionData('simulateExternalCall', [
                await api3ServerV1.getAddress(),
                api3ServerV1.interface.encodeFunctionData('dataFeeds', [beacon.beaconId]),
              ]),
            ]);
          expect(
            api3ServerV1OevExtension.interface.decodeFunctionResult('simulateDappOevDataFeedUpdate', returndata[0]!)
          ).to.deep.equal([beacon.beaconId, beaconValue, beaconTimestamp]);
          expect(
            api3ServerV1.interface.decodeFunctionResult(
              'updateBeaconWithSignedData',
              api3ServerV1OevExtension.interface.decodeFunctionResult('simulateExternalCall', returndata[1]!)[0]
            )
          ).to.deep.equal([beacon.beaconId]);
          expect(
            api3ServerV1.interface.decodeFunctionResult(
              'dataFeeds',
              api3ServerV1OevExtension.interface.decodeFunctionResult('simulateExternalCall', returndata[2]!)[0]
            )
          ).to.deep.equal([baseBeaconValue, baseBeaconTimestamp]);
        });
      });
    });
    context('Sender does not impersonate zero address', function () {
      context('Sender static-calls', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1, api3ServerV1OevExtension, beacons } = await helpers.loadFixture(deploy);
          const beacon = beacons[0]!;
          await expect(
            api3ServerV1OevExtension
              .connect(roles.randomPerson)
              .simulateExternalCall.staticCall(
                api3ServerV1.getAddress(),
                api3ServerV1.interface.encodeFunctionData('dataFeeds', [beacon.beaconId])
              )
          ).to.be.revertedWith('Sender address not zero');
        });
      });
      context('Sender calls', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1, api3ServerV1OevExtension, beacons } = await helpers.loadFixture(deploy);
          const beacon = beacons[0]!;
          await expect(
            api3ServerV1OevExtension
              .connect(roles.randomPerson)
              .simulateExternalCall(
                api3ServerV1.getAddress(),
                api3ServerV1.interface.encodeFunctionData('dataFeeds', [beacon.beaconId])
              )
          ).to.be.revertedWith('Sender address not zero');
        });
      });
    });
  });

  describe('intended OEV bid payment flow', function () {
    it('works', async function () {
      // The intended OEV bid payment flow is for `updateDappOevDataFeed()` to
      // be called back in `payOevBid()` callback.
      const { roles, api3ServerV1OevExtension, api3ServerV1OevExtensionOevBidPayer, beacons } =
        await helpers.loadFixture(deploy);
      const dappId = 1;
      const nextTimestamp = (await helpers.time.latest()) + 1;
      const signedDataTimestampCutoff = nextTimestamp + 1;
      await helpers.time.setNextBlockTimestamp(nextTimestamp);
      const bidAmount = ethers.parseEther('1');
      const { chainId } = await ethers.provider.getNetwork();
      const signature = await roles.auctioneer!.signMessage(
        ethers.getBytes(
          ethers.solidityPackedKeccak256(
            ['uint256', 'uint256', 'address', 'uint256', 'uint32'],
            [
              chainId,
              dappId,
              await api3ServerV1OevExtensionOevBidPayer.getAddress(),
              bidAmount,
              signedDataTimestampCutoff,
            ]
          )
        )
      );
      const beacon = beacons[0]!;
      const beaconValue = Math.floor(Math.random() * 200 - 100);
      const beaconTimestamp = signedDataTimestampCutoff - 1;
      const signedData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
        [
          beacon.airnode.address,
          beacon.templateId,
          beaconTimestamp,
          encodeData(beaconValue),
          await signDataWithAlternateTemplateId(
            beacon.airnode,
            beacon.templateId,
            beaconTimestamp,
            encodeData(beaconValue)
          ),
        ]
      );
      await helpers.time.setNextBlockTimestamp(nextTimestamp + 1);
      const data = api3ServerV1OevExtension.interface.encodeFunctionData('updateDappOevDataFeed', [
        dappId,
        [signedData],
      ]);
      await expect(
        api3ServerV1OevExtensionOevBidPayer
          .connect(roles.searcher)
          .payOevBid(dappId, bidAmount, signedDataTimestampCutoff, signature, data)
      )
        .to.emit(api3ServerV1OevExtension, 'UpdatedDappOevDataFeed')
        .withArgs(
          dappId,
          await api3ServerV1OevExtensionOevBidPayer.getAddress(),
          beacon.beaconId,
          beaconValue,
          beaconTimestamp
        );
      const oevDataFeed = await api3ServerV1OevExtension.oevDataFeed(dappId, beacon.beaconId);
      expect(oevDataFeed.value).to.equal(beaconValue);
      expect(oevDataFeed.timestamp).to.equal(beaconTimestamp);
    });
  });
});
