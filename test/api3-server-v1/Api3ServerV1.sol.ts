import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import type { AddressLike, BigNumberish, BytesLike, HDNodeWallet } from 'ethers';
import { ethers } from 'hardhat';

import type { Api3ServerV1 } from '../../src/index';
import * as testUtils from '../test-utils';

describe('Api3ServerV1', function () {
  function encodeData(decodedData: BigNumberish) {
    return ethers.AbiCoder.defaultAbiCoder().encode(['int256'], [decodedData]);
  }

  function packOevUpdateSignature(airnodeAddress: AddressLike, templateId: BytesLike, signature: BytesLike) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32', 'bytes'],
      [airnodeAddress, templateId, signature]
    );
  }

  async function updateBeacon(
    roles: Record<string, HardhatEthersSigner>,
    api3ServerV1: Api3ServerV1,
    beacon: {
      airnode: HDNodeWallet;
      endpointId: BytesLike;
      templateParameters: BytesLike;
      templateId: BytesLike;
      requestParameters: BytesLike;
      beaconId: BytesLike;
    },
    decodedData: number,
    timestamp?: number
  ) {
    if (!timestamp) {
      timestamp = await helpers.time.latest();
    }
    const data = encodeData(decodedData);
    const signature = await testUtils.signData(beacon.airnode, beacon.templateId, timestamp, data);
    await api3ServerV1
      .connect(roles.randomPerson)
      .updateBeaconWithSignedData(beacon.airnode.address, beacon.templateId, timestamp, data, signature);
    return timestamp;
  }

  async function updateBeaconSet(
    roles: Record<string, HardhatEthersSigner>,
    api3ServerV1: Api3ServerV1,
    beacons: {
      airnode: HDNodeWallet;
      endpointId: BytesLike;
      templateParameters: BytesLike;
      templateId: BytesLike;
      requestParameters: BytesLike;
      beaconId: BytesLike;
    }[],
    decodedData: number,
    timestamp?: number
  ) {
    if (!timestamp) {
      timestamp = await helpers.time.latest();
    }
    const data = encodeData(decodedData);
    const signatures = await Promise.all(
      beacons.map(async (beacon) => {
        return testUtils.signData(beacon.airnode, beacon.templateId, timestamp!, data);
      })
    );
    const updateBeaconsCalldata = signatures.map((signature, index) => {
      const beacon = beacons[index];
      return api3ServerV1.interface.encodeFunctionData(
        'updateBeaconWithSignedData' as any,
        [beacon!.airnode.address, beacon!.templateId, timestamp, data, signature] as any
      );
    });
    const beaconIds = beacons.map((beacon) => {
      return beacon.beaconId;
    });
    const updateBeaconSetCalldata = [
      ...updateBeaconsCalldata,
      api3ServerV1.interface.encodeFunctionData('updateBeaconSetWithBeacons', [beaconIds]),
    ];
    await api3ServerV1.connect(roles.randomPerson).multicall(updateBeaconSetCalldata);
  }

  function median(array: number[]) {
    if (array.length === 0) {
      throw new Error('Attempted to calculate median of empty array');
    }
    array.sort((a, b) => {
      return a - b;
    });
    if (array.length % 2 === 1) {
      return array[Math.floor(array.length / 2)];
    } else {
      // We want negatives to round down to zero
      return Number.parseInt(((array[array.length / 2 - 1]! + array[array.length / 2]!) / 2).toString(), 10);
    }
  }

  async function deploy() {
    const roleNames = [
      'deployer',
      'manager',
      'dapiNameSetter',
      'sponsor',
      'updateRequester',
      'searcher',
      'oevBeneficiary',
      'mockOevProxy',
      'randomPerson',
    ];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';
    const dapiNameSetterRoleDescription = 'dAPI name setter';
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const api3ServerV1Factory = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
    const api3ServerV1 = await api3ServerV1Factory.deploy(
      await accessControlRegistry.getAddress(),
      api3ServerV1AdminRoleDescription,
      roles.manager!.address
    );

    const managerRootRole = testUtils.deriveRootRole(roles.manager!.address);
    const adminRole = testUtils.deriveRole(managerRootRole, api3ServerV1AdminRoleDescription);
    const dapiNameSetterRole = testUtils.deriveRole(adminRole, dapiNameSetterRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, api3ServerV1AdminRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, dapiNameSetterRoleDescription);
    await accessControlRegistry.connect(roles.manager).grantRole(dapiNameSetterRole, roles.dapiNameSetter!.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(dapiNameSetterRole, roles.manager!.address);
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

    const dataFeedProxyWithOevFactory = await ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
    const oevProxy = await dataFeedProxyWithOevFactory.deploy(
      await api3ServerV1.getAddress(),
      beacons[0]!.beaconId,
      roles.oevBeneficiary!.address
    );

    return {
      roles,
      accessControlRegistry,
      api3ServerV1,
      oevProxy,
      api3ServerV1AdminRoleDescription,
      dapiNameSetterRole,
      beacons,
      beaconSet,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { roles, accessControlRegistry, api3ServerV1, api3ServerV1AdminRoleDescription, dapiNameSetterRole } =
        await helpers.loadFixture(deploy);
      expect(await api3ServerV1.DAPI_NAME_SETTER_ROLE_DESCRIPTION()).to.equal('dAPI name setter');
      expect(await api3ServerV1.accessControlRegistry()).to.equal(await accessControlRegistry.getAddress());
      expect(await api3ServerV1.adminRoleDescription()).to.equal(api3ServerV1AdminRoleDescription);
      expect(await api3ServerV1.manager()).to.equal(roles.manager!.address);
      expect(await api3ServerV1.dapiNameSetterRole()).to.equal(dapiNameSetterRole);
    });
  });

  describe('updateBeaconSetWithBeacons', function () {
    context('Did not specify less than two Beacons', function () {
      context('Beacons update Beacon set timestamp', function () {
        it('updates Beacon set', async function () {
          const { roles, api3ServerV1, beacons, beaconSet } = await deploy();
          // Populate the Beacons
          const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
          const currentTimestamp = await helpers.time.latest();
          const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
          await Promise.all(
            beacons.map(async (beacon, index) => {
              await updateBeacon(roles, api3ServerV1, beacon, beaconValues[index]!, beaconTimestamps[index]);
            })
          );
          const beaconSetValue = median(beaconValues);
          const beaconSetTimestamp = median(beaconTimestamps);
          const beaconSetBefore = await api3ServerV1.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetBefore.value).to.equal(0);
          expect(beaconSetBefore.timestamp).to.equal(0);
          expect(
            await api3ServerV1.connect(roles.randomPerson).updateBeaconSetWithBeacons.staticCall(beaconSet.beaconIds)
          ).to.equal(beaconSet.beaconSetId);
          await expect(api3ServerV1.connect(roles.randomPerson).updateBeaconSetWithBeacons(beaconSet.beaconIds))
            .to.emit(api3ServerV1, 'UpdatedBeaconSetWithBeacons')
            .withArgs(beaconSet.beaconSetId, beaconSetValue, beaconSetTimestamp);
          const beaconSetAfter = await api3ServerV1.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetAfter.value).to.equal(beaconSetValue);
          expect(beaconSetAfter.timestamp).to.equal(beaconSetTimestamp);
        });
      });
      context('Beacons do not update Beacon set timestamp', function () {
        context('Beacons update Beacon set value', function () {
          it('updates Beacon set', async function () {
            const { roles, api3ServerV1, beacons, beaconSet } = await deploy();
            // Populate the Beacons
            const beaconValues = [100, 80, 120];
            const currentTimestamp = await helpers.time.latest();
            const beaconTimestamps = [currentTimestamp, currentTimestamp, currentTimestamp];
            await Promise.all(
              beacons.map(async (beacon, index) => {
                await updateBeacon(roles, api3ServerV1, beacon, beaconValues[index]!, beaconTimestamps[index]);
              })
            );
            const beaconIds = beacons.map((beacon) => {
              return beacon.beaconId;
            });
            await api3ServerV1.updateBeaconSetWithBeacons(beaconIds);
            await updateBeacon(roles, api3ServerV1, beacons[0]!, 110, currentTimestamp + 10);
            const beaconSetBefore = await api3ServerV1.dataFeeds(beaconSet.beaconSetId);
            expect(beaconSetBefore.value).to.equal(100);
            expect(beaconSetBefore.timestamp).to.equal(currentTimestamp);
            expect(
              await api3ServerV1.connect(roles.randomPerson).updateBeaconSetWithBeacons.staticCall(beaconSet.beaconIds)
            ).to.equal(beaconSet.beaconSetId);
            await expect(api3ServerV1.connect(roles.randomPerson).updateBeaconSetWithBeacons(beaconSet.beaconIds))
              .to.emit(api3ServerV1, 'UpdatedBeaconSetWithBeacons')
              .withArgs(beaconSet.beaconSetId, 110, currentTimestamp);
            const beaconSetAfter = await api3ServerV1.dataFeeds(beaconSet.beaconSetId);
            expect(beaconSetAfter.value).to.equal(110);
            expect(beaconSetAfter.timestamp).to.equal(currentTimestamp);
          });
        });
        context('Beacons do not update Beacon set value', function () {
          it('reverts', async function () {
            const { roles, api3ServerV1, beacons, beaconSet } = await deploy();
            // Update Beacon set with recent timestamp
            await updateBeaconSet(roles, api3ServerV1, beacons, 123);
            await expect(
              api3ServerV1.connect(roles.randomPerson).updateBeaconSetWithBeacons(beaconSet.beaconIds)
            ).to.be.revertedWith('Does not update Beacon set');
          });
        });
      });
    });
    context('Specified less than two Beacons', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1, beacons } = await deploy();
        await expect(
          api3ServerV1.connect(roles.randomPerson).updateBeaconSetWithBeacons([beacons[0]!.beaconId])
        ).to.be.revertedWith('Specified less than two Beacons');
        await expect(api3ServerV1.connect(roles.randomPerson).updateBeaconSetWithBeacons([])).to.be.revertedWith(
          'Specified less than two Beacons'
        );
      });
    });
  });

  describe('updateBeaconWithSignedData', function () {
    context('Timestamp is valid', function () {
      context('Signature is valid', function () {
        context('Fulfillment data length is correct', function () {
          context('Decoded fulfillment data can be typecasted into int224', function () {
            context('Updates timestamp', function () {
              it('updates Beacon with signed data', async function () {
                const { roles, api3ServerV1, beacons } = await deploy();
                const beacon = beacons[0]!;
                const beaconValue = Math.floor(Math.random() * 200 - 100);
                const beaconTimestamp = await helpers.time.latest();
                const signature = await testUtils.signData(
                  beacon.airnode,
                  beacon.templateId,
                  beaconTimestamp,
                  encodeData(beaconValue)
                );
                const beaconBefore = await api3ServerV1.dataFeeds(beacon.beaconId);
                expect(beaconBefore.value).to.equal(0);
                expect(beaconBefore.timestamp).to.equal(0);
                await expect(
                  api3ServerV1
                    .connect(roles.randomPerson)
                    .updateBeaconWithSignedData(
                      beacon.airnode.address,
                      beacon.templateId,
                      beaconTimestamp,
                      encodeData(beaconValue),
                      signature
                    )
                )
                  .to.emit(api3ServerV1, 'UpdatedBeaconWithSignedData')
                  .withArgs(beacon.beaconId, beaconValue, beaconTimestamp);
                const beaconAfter = await api3ServerV1.dataFeeds(beacon.beaconId);
                expect(beaconAfter.value).to.equal(beaconValue);
                expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
              });
            });
            context('Does not update timestamp', function () {
              it('reverts', async function () {
                const { roles, api3ServerV1, beacons } = await deploy();
                const beacon = beacons[0]!;
                const beaconValue = Math.floor(Math.random() * 200 - 100);
                const beaconTimestamp = await helpers.time.latest();
                const signature = await testUtils.signData(
                  beacon.airnode,
                  beacon.templateId,
                  beaconTimestamp,
                  encodeData(beaconValue)
                );
                await api3ServerV1
                  .connect(roles.randomPerson)
                  .updateBeaconWithSignedData(
                    beacon.airnode.address,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValue),
                    signature
                  );
                await expect(
                  api3ServerV1
                    .connect(roles.randomPerson)
                    .updateBeaconWithSignedData(
                      beacon.airnode.address,
                      beacon.templateId,
                      beaconTimestamp,
                      encodeData(beaconValue),
                      signature
                    )
                ).to.be.revertedWith('Does not update timestamp');
              });
            });
          });
          context('Decoded fulfillment data cannot be typecasted into int224', function () {
            it('reverts', async function () {
              const { roles, api3ServerV1, beacons } = await deploy();
              const beacon = beacons[0]!;
              const beaconValueWithOverflow = 2n ** 223n;
              const beaconTimestamp = await helpers.time.latest();
              const signatureWithOverflow = await testUtils.signData(
                beacon.airnode,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValueWithOverflow)
              );
              await expect(
                api3ServerV1
                  .connect(roles.randomPerson)
                  .updateBeaconWithSignedData(
                    beacon.airnode.address,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValueWithOverflow),
                    signatureWithOverflow
                  )
              ).to.be.revertedWith('Value typecasting error');
              const beaconValueWithUnderflow = (-2n) ** 223n - 1n;
              const signatureWithUnderflow = await testUtils.signData(
                beacon.airnode,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValueWithUnderflow)
              );
              await expect(
                api3ServerV1
                  .connect(roles.randomPerson)
                  .updateBeaconWithSignedData(
                    beacon.airnode.address,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValueWithUnderflow),
                    signatureWithUnderflow
                  )
              ).to.be.revertedWith('Value typecasting error');
            });
          });
        });
        context('Fulfillment data length is not correct', function () {
          it('reverts', async function () {
            const { roles, api3ServerV1, beacons } = await deploy();
            const beacon = beacons[0]!;
            const beaconValue = Math.floor(Math.random() * 200 - 100);
            const beaconTimestamp = await helpers.time.latest();
            const signature = await testUtils.signData(
              beacon.airnode,
              beacon.templateId,
              beaconTimestamp,
              `${encodeData(beaconValue)}00`
            );
            await expect(
              api3ServerV1
                .connect(roles.randomPerson)
                .updateBeaconWithSignedData(
                  beacon.airnode.address,
                  beacon.templateId,
                  beaconTimestamp,
                  `${encodeData(beaconValue)}00`,
                  signature
                )
            ).to.be.revertedWith('Data length not correct');
          });
        });
      });
      context('Signature is not valid', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1, beacons } = await deploy();
          const beacon = beacons[0]!;
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          await expect(
            api3ServerV1
              .connect(roles.randomPerson)
              .updateBeaconWithSignedData(
                beacon.airnode.address,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValue),
                '0x12345678'
              )
          ).to.be.revertedWith('ECDSA: invalid signature length');
        });
      });
    });
    context('Timestamp is more than 1 hour from the future', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1, beacons } = await deploy();
        const beacon = beacons[0]!;
        const beaconValue = Math.floor(Math.random() * 200 - 100);
        const nextTimestamp = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(nextTimestamp);
        const beaconTimestamp = nextTimestamp + 60 * 60 + 1;
        const signature = await testUtils.signData(
          beacon.airnode,
          beacon.templateId,
          beaconTimestamp,
          encodeData(beaconValue)
        );
        await expect(
          api3ServerV1
            .connect(roles.randomPerson)
            .updateBeaconWithSignedData(
              beacon.airnode.address,
              beacon.templateId,
              beaconTimestamp,
              encodeData(beaconValue),
              signature
            )
        ).to.be.revertedWith('Timestamp not valid');
      });
    });
    context('Timestamp is zero', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1, beacons } = await deploy();
        const beacon = beacons[0]!;
        const beaconValue = Math.floor(Math.random() * 200 - 100);
        const nextTimestamp = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(nextTimestamp);
        const beaconTimestamp = 0;
        const signature = await testUtils.signData(
          beacon.airnode,
          beacon.templateId,
          beaconTimestamp,
          encodeData(beaconValue)
        );
        await expect(
          api3ServerV1
            .connect(roles.randomPerson)
            .updateBeaconWithSignedData(
              beacon.airnode.address,
              beacon.templateId,
              beaconTimestamp,
              encodeData(beaconValue),
              signature
            )
        ).to.be.revertedWith('Does not update timestamp');
      });
    });
  });

  describe('updateOevProxyDataFeedWithSignedData', function () {
    context('Timestamp is valid', function () {
      context('Updates timestamp', function () {
        context('Fulfillment data length is correct', function () {
          context('Decoded fulfillment data can be typecasted into int224', function () {
            context('More than one Beacon is specified', function () {
              context('There are no invalid signatures', function () {
                context('There are enough signatures to constitute an absolute majority', function () {
                  context('Data in packed signatures is consistent with the data feed ID', function () {
                    it('updates OEV proxy Beacon set with signed data', async function () {
                      const { roles, api3ServerV1, oevProxy, beacons, beaconSet } = await deploy();
                      const oevUpdateValue = 105;
                      const currentTimestamp = await helpers.time.latest();
                      const oevUpdateTimestamp = currentTimestamp + 1;
                      const bidAmount = 10_000;
                      const updateId = testUtils.generateRandomBytes32();
                      // Randomly omit one of the signatures
                      const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                      const signatures = await Promise.all(
                        beacons.map(async (beacon, index) => {
                          if (index === omitSignatureAtIndex) {
                            return '0x';
                          } else {
                            return testUtils.signOevData(
                              api3ServerV1,
                              await oevProxy.getAddress(),
                              beaconSet.beaconSetId,
                              updateId,
                              oevUpdateTimestamp,
                              encodeData(oevUpdateValue),
                              roles.searcher!.address,
                              bidAmount,
                              beacon.airnode,
                              beacon.templateId
                            );
                          }
                        })
                      );
                      const packedOevUpdateSignatures = signatures.map((signature, index) => {
                        return packOevUpdateSignature(
                          beacons[index]!.airnode.address,
                          beacons[index]!.templateId,
                          signature
                        );
                      });
                      const beaconSetBefore = await api3ServerV1.dataFeeds(beaconSet.beaconSetId);
                      expect(beaconSetBefore.value).to.equal(0);
                      expect(beaconSetBefore.timestamp).to.equal(0);
                      const oevProxyBeaconSetBefore = await api3ServerV1.oevProxyToIdToDataFeed(
                        await oevProxy.getAddress(),
                        beaconSet.beaconSetId
                      );
                      expect(oevProxyBeaconSetBefore.value).to.equal(0);
                      expect(oevProxyBeaconSetBefore.timestamp).to.equal(0);
                      await expect(
                        api3ServerV1
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(
                            await oevProxy.getAddress(),
                            beaconSet.beaconSetId,
                            updateId,
                            oevUpdateTimestamp,
                            encodeData(oevUpdateValue),
                            packedOevUpdateSignatures,
                            { value: bidAmount }
                          )
                      )
                        .to.emit(api3ServerV1, 'UpdatedOevProxyBeaconSetWithSignedData')
                        .withArgs(
                          beaconSet.beaconSetId,
                          await oevProxy.getAddress(),
                          updateId,
                          oevUpdateValue,
                          oevUpdateTimestamp
                        );
                      const beaconSetAfter = await api3ServerV1.dataFeeds(beaconSet.beaconSetId);
                      expect(beaconSetAfter.value).to.equal(0);
                      expect(beaconSetAfter.timestamp).to.equal(0);
                      const oevProxyBeaconSetAfter = await api3ServerV1.oevProxyToIdToDataFeed(
                        await oevProxy.getAddress(),
                        beaconSet.beaconSetId
                      );
                      expect(oevProxyBeaconSetAfter.value).to.equal(oevUpdateValue);
                      expect(oevProxyBeaconSetAfter.timestamp).to.equal(oevUpdateTimestamp);
                    });
                  });
                  context('Data in packed signatures is not consistent with the data feed ID', function () {
                    it('reverts', async function () {
                      const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
                      const oevUpdateValue = 105;
                      const currentTimestamp = await helpers.time.latest();
                      const oevUpdateTimestamp = currentTimestamp + 1;
                      const bidAmount = 10_000;
                      const updateId = testUtils.generateRandomBytes32();
                      // Randomly omit one of the signatures
                      const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                      const spoofedDataFeedId = testUtils.generateRandomBytes32();
                      const signatures = await Promise.all(
                        beacons.map(async (beacon, index) => {
                          if (index === omitSignatureAtIndex) {
                            return '0x';
                          } else {
                            return testUtils.signOevData(
                              api3ServerV1,
                              await oevProxy.getAddress(),
                              spoofedDataFeedId,
                              updateId,
                              oevUpdateTimestamp,
                              encodeData(oevUpdateValue),
                              roles.searcher!.address,
                              bidAmount,
                              beacon.airnode,
                              beacon.templateId
                            );
                          }
                        })
                      );
                      const packedOevUpdateSignatures = signatures.map((signature, index) => {
                        return packOevUpdateSignature(
                          beacons[index]!.airnode.address,
                          beacons[index]!.templateId,
                          signature
                        );
                      });
                      await expect(
                        api3ServerV1
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(
                            await oevProxy.getAddress(),
                            spoofedDataFeedId,
                            updateId,
                            oevUpdateTimestamp,
                            encodeData(oevUpdateValue),
                            packedOevUpdateSignatures,
                            { value: bidAmount }
                          )
                      ).to.be.revertedWith('Beacon set ID mismatch');
                    });
                  });
                });
                context('There are not enough signatures to constitute an absolute majority', function () {
                  it('reverts', async function () {
                    const { roles, api3ServerV1, oevProxy, beacons, beaconSet } = await deploy();
                    const oevUpdateValue = 105;
                    const currentTimestamp = await helpers.time.latest();
                    const oevUpdateTimestamp = currentTimestamp + 1;
                    const bidAmount = 10_000;
                    const updateId = testUtils.generateRandomBytes32();
                    // Randomly omit two of the signatures
                    const includeSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                    const signatures = await Promise.all(
                      beacons.map(async (beacon, index) => {
                        if (index === includeSignatureAtIndex) {
                          return testUtils.signOevData(
                            api3ServerV1,
                            await oevProxy.getAddress(),
                            beaconSet.beaconSetId,
                            updateId,
                            oevUpdateTimestamp,
                            encodeData(oevUpdateValue),
                            roles.searcher!.address,
                            bidAmount,
                            beacon.airnode,
                            beacon.templateId
                          );
                        } else {
                          return '0x';
                        }
                      })
                    );
                    const packedOevUpdateSignatures = signatures.map((signature, index) => {
                      return packOevUpdateSignature(
                        beacons[index]!.airnode.address,
                        beacons[index]!.templateId,
                        signature
                      );
                    });
                    await expect(
                      api3ServerV1
                        .connect(roles.searcher)
                        .updateOevProxyDataFeedWithSignedData(
                          await oevProxy.getAddress(),
                          beaconSet.beaconSetId,
                          updateId,
                          oevUpdateTimestamp,
                          encodeData(oevUpdateValue),
                          packedOevUpdateSignatures,
                          { value: bidAmount }
                        )
                    ).to.be.revertedWith('Not enough signatures');
                  });
                });
              });
              context('There are invalid signatures', function () {
                it('reverts', async function () {
                  const { roles, api3ServerV1, oevProxy, beacons, beaconSet } = await deploy();
                  const oevUpdateValue = 105;
                  const currentTimestamp = await helpers.time.latest();
                  const oevUpdateTimestamp = currentTimestamp + 1;
                  const bidAmount = 10_000;
                  const updateId = testUtils.generateRandomBytes32();
                  // Randomly omit one of the signatures
                  const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                  const signatures = await Promise.all(
                    beacons.map((_, index) => {
                      if (index === omitSignatureAtIndex) {
                        return '0x';
                      } else {
                        return '0x123456';
                      }
                    })
                  );
                  const packedOevUpdateSignatures = signatures.map((signature, index) => {
                    return packOevUpdateSignature(
                      beacons[index]!.airnode.address,
                      beacons[index]!.templateId,
                      signature
                    );
                  });
                  await expect(
                    api3ServerV1
                      .connect(roles.searcher)
                      .updateOevProxyDataFeedWithSignedData(
                        await oevProxy.getAddress(),
                        beaconSet.beaconSetId,
                        updateId,
                        oevUpdateTimestamp,
                        encodeData(oevUpdateValue),
                        packedOevUpdateSignatures,
                        { value: bidAmount }
                      )
                  ).to.be.revertedWith('ECDSA: invalid signature length');
                });
              });
            });
            context('One Beacon is specified', function () {
              context('The signature is not invalid', function () {
                context('The signature is not omitted', function () {
                  context('Data in the packed signature is consistent with the data feed ID', function () {
                    it('updates OEV proxy Beacon with signed data', async function () {
                      const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
                      const beacon = beacons[0]!;
                      const oevUpdateValue = 105;
                      const currentTimestamp = await helpers.time.latest();
                      const oevUpdateTimestamp = currentTimestamp + 1;
                      const bidAmount = 10_000;
                      const updateId = testUtils.generateRandomBytes32();
                      const signature = await testUtils.signOevData(
                        api3ServerV1,
                        await oevProxy.getAddress(),
                        beacon.beaconId,
                        updateId,
                        oevUpdateTimestamp,
                        encodeData(oevUpdateValue),
                        roles.searcher!.address,
                        bidAmount,
                        beacon.airnode,
                        beacon.templateId
                      );
                      const packedOevUpdateSignature = packOevUpdateSignature(
                        beacon.airnode.address,
                        beacon.templateId,
                        signature
                      );
                      const beaconBefore = await api3ServerV1.dataFeeds(beacon.beaconId);
                      expect(beaconBefore.value).to.equal(0);
                      expect(beaconBefore.timestamp).to.equal(0);
                      const oevProxyBeaconBefore = await api3ServerV1.oevProxyToIdToDataFeed(
                        await oevProxy.getAddress(),
                        beacon.beaconId
                      );
                      expect(oevProxyBeaconBefore.value).to.equal(0);
                      expect(oevProxyBeaconBefore.timestamp).to.equal(0);
                      await expect(
                        api3ServerV1
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(
                            await oevProxy.getAddress(),
                            beacon.beaconId,
                            updateId,
                            oevUpdateTimestamp,
                            encodeData(oevUpdateValue),
                            [packedOevUpdateSignature],
                            { value: bidAmount }
                          )
                      )
                        .to.emit(api3ServerV1, 'UpdatedOevProxyBeaconWithSignedData')
                        .withArgs(
                          beacon.beaconId,
                          await oevProxy.getAddress(),
                          updateId,
                          oevUpdateValue,
                          oevUpdateTimestamp
                        );
                      const beaconAfter = await api3ServerV1.dataFeeds(beacon.beaconId);
                      expect(beaconAfter.value).to.equal(0);
                      expect(beaconAfter.timestamp).to.equal(0);
                      const oevProxyBeaconAfter = await api3ServerV1.oevProxyToIdToDataFeed(
                        await oevProxy.getAddress(),
                        beacon.beaconId
                      );
                      expect(oevProxyBeaconAfter.value).to.equal(oevUpdateValue);
                      expect(oevProxyBeaconAfter.timestamp).to.equal(oevUpdateTimestamp);
                    });
                  });
                  context('Data in the packed signature is not consistent with the data feed ID', function () {
                    it('reverts', async function () {
                      const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
                      const beacon = beacons[0]!;
                      const oevUpdateValue = 105;
                      const currentTimestamp = await helpers.time.latest();
                      const oevUpdateTimestamp = currentTimestamp + 1;
                      const bidAmount = 10_000;
                      const updateId = testUtils.generateRandomBytes32();
                      const spoofedDataFeedId = testUtils.generateRandomBytes32();
                      const signature = await testUtils.signOevData(
                        api3ServerV1,
                        await oevProxy.getAddress(),
                        spoofedDataFeedId,
                        updateId,
                        oevUpdateTimestamp,
                        encodeData(oevUpdateValue),
                        roles.searcher!.address,
                        bidAmount,
                        beacon.airnode,
                        beacon.templateId
                      );
                      const packedOevUpdateSignature = packOevUpdateSignature(
                        beacon.airnode.address,
                        beacon.templateId,
                        signature
                      );
                      const beaconBefore = await api3ServerV1.dataFeeds(beacon.beaconId);
                      expect(beaconBefore.value).to.equal(0);
                      expect(beaconBefore.timestamp).to.equal(0);
                      const oevProxyBeaconBefore = await api3ServerV1.oevProxyToIdToDataFeed(
                        await oevProxy.getAddress(),
                        beacon.beaconId
                      );
                      expect(oevProxyBeaconBefore.value).to.equal(0);
                      expect(oevProxyBeaconBefore.timestamp).to.equal(0);
                      await expect(
                        api3ServerV1
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(
                            await oevProxy.getAddress(),
                            spoofedDataFeedId,
                            updateId,
                            oevUpdateTimestamp,
                            encodeData(oevUpdateValue),
                            [packedOevUpdateSignature],
                            { value: bidAmount }
                          )
                      ).to.be.revertedWith('Beacon ID mismatch');
                    });
                  });
                });
                context('The signature is omitted', function () {
                  it('reverts', async function () {
                    const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
                    const beacon = beacons[0]!;
                    const oevUpdateValue = 105;
                    const currentTimestamp = await helpers.time.latest();
                    const oevUpdateTimestamp = currentTimestamp + 1;
                    const bidAmount = 10_000;
                    const updateId = testUtils.generateRandomBytes32();
                    const packedOevUpdateSignature = packOevUpdateSignature(
                      beacon.airnode.address,
                      beacon.templateId,
                      '0x'
                    );
                    await expect(
                      api3ServerV1
                        .connect(roles.searcher)
                        .updateOevProxyDataFeedWithSignedData(
                          await oevProxy.getAddress(),
                          beacon.beaconId,
                          updateId,
                          oevUpdateTimestamp,
                          encodeData(oevUpdateValue),
                          [packedOevUpdateSignature],
                          { value: bidAmount }
                        )
                    ).to.be.revertedWith('Missing signature');
                  });
                });
              });
              context('The signature is invalid', function () {
                it('reverts', async function () {
                  const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
                  const beacon = beacons[0]!;
                  const oevUpdateValue = 105;
                  const currentTimestamp = await helpers.time.latest();
                  const oevUpdateTimestamp = currentTimestamp + 1;
                  const bidAmount = 10_000;
                  const updateId = testUtils.generateRandomBytes32();
                  const packedOevUpdateSignature = packOevUpdateSignature(
                    beacon.airnode.address,
                    beacon.templateId,
                    '0x123456'
                  );
                  await expect(
                    api3ServerV1
                      .connect(roles.searcher)
                      .updateOevProxyDataFeedWithSignedData(
                        await oevProxy.getAddress(),
                        beacon.beaconId,
                        updateId,
                        oevUpdateTimestamp,
                        encodeData(oevUpdateValue),
                        [packedOevUpdateSignature],
                        { value: bidAmount }
                      )
                  ).to.be.revertedWith('ECDSA: invalid signature length');
                });
              });
            });
            context('No Beacon is specified', function () {
              it('reverts', async function () {
                const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
                const beacon = beacons[0]!;
                const oevUpdateValue = 105;
                const currentTimestamp = await helpers.time.latest();
                const oevUpdateTimestamp = currentTimestamp + 1;
                const bidAmount = 10_000;
                const updateId = testUtils.generateRandomBytes32();
                await expect(
                  api3ServerV1
                    .connect(roles.searcher)
                    .updateOevProxyDataFeedWithSignedData(
                      await oevProxy.getAddress(),
                      beacon.beaconId,
                      updateId,
                      oevUpdateTimestamp,
                      encodeData(oevUpdateValue),
                      [],
                      { value: bidAmount }
                    )
                ).to.be.revertedWith('Did not specify any Beacons');
              });
            });
          });
          context('Decoded fulfillment data cannot be typecasted into int224', function () {
            it('reverts', async function () {
              const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
              const beacon = beacons[0]!;
              const oevUpdateValueWithUnderflow = (-2n) ** 223n - 1n;
              const currentTimestamp = await helpers.time.latest();
              const oevUpdateTimestamp = currentTimestamp + 1;
              const bidAmount = 10_000;
              const updateId = testUtils.generateRandomBytes32();
              const signatureWithUnderflow = await testUtils.signOevData(
                api3ServerV1,
                await oevProxy.getAddress(),
                beacon.beaconId,
                updateId,
                oevUpdateTimestamp,
                encodeData(oevUpdateValueWithUnderflow),
                roles.searcher!.address,
                bidAmount,
                beacon.airnode,
                beacon.templateId
              );
              const packedOevUpdateSignatureWithUnderflow = packOevUpdateSignature(
                beacon.airnode.address,
                beacon.templateId,
                signatureWithUnderflow
              );
              await expect(
                api3ServerV1
                  .connect(roles.searcher)
                  .updateOevProxyDataFeedWithSignedData(
                    await oevProxy.getAddress(),
                    beacon.beaconId,
                    updateId,
                    oevUpdateTimestamp,
                    encodeData(oevUpdateValueWithUnderflow),
                    [packedOevUpdateSignatureWithUnderflow],
                    { value: bidAmount }
                  )
              ).to.be.revertedWith('Value typecasting error');
              const oevUpdateValueWithOverflow = 2n ** 223n;
              const signatureWithOverflow = await testUtils.signOevData(
                api3ServerV1,
                await oevProxy.getAddress(),
                beacon.beaconId,
                updateId,
                oevUpdateTimestamp,
                encodeData(oevUpdateValueWithOverflow),
                roles.searcher!.address,
                bidAmount,
                beacon.airnode,
                beacon.templateId
              );
              const packedOevUpdateSignatureWithOverflow = packOevUpdateSignature(
                beacon.airnode.address,
                beacon.templateId,
                signatureWithOverflow
              );
              await expect(
                api3ServerV1
                  .connect(roles.searcher)
                  .updateOevProxyDataFeedWithSignedData(
                    await oevProxy.getAddress(),
                    beacon.beaconId,
                    updateId,
                    oevUpdateTimestamp,
                    encodeData(oevUpdateValueWithOverflow),
                    [packedOevUpdateSignatureWithOverflow],
                    { value: bidAmount }
                  )
              ).to.be.revertedWith('Value typecasting error');
            });
          });
        });
        context('Fulfillment data length is not correct', function () {
          it('reverts', async function () {
            const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
            const beacon = beacons[0]!;
            const oevUpdateValue = 105;
            const currentTimestamp = await helpers.time.latest();
            const oevUpdateTimestamp = currentTimestamp + 1;
            const bidAmount = 10_000;
            const updateId = testUtils.generateRandomBytes32();
            const signature = await testUtils.signOevData(
              api3ServerV1,
              await oevProxy.getAddress(),
              beacon.beaconId,
              updateId,
              oevUpdateTimestamp,
              `${encodeData(oevUpdateValue)}00`,
              roles.searcher!.address,
              bidAmount,
              beacon.airnode,
              beacon.templateId
            );
            const packedOevUpdateSignature = packOevUpdateSignature(
              beacon.airnode.address,
              beacon.templateId,
              signature
            );
            await expect(
              api3ServerV1
                .connect(roles.searcher)
                .updateOevProxyDataFeedWithSignedData(
                  await oevProxy.getAddress(),
                  beacon.beaconId,
                  updateId,
                  oevUpdateTimestamp,
                  `${encodeData(oevUpdateValue)}00`,
                  [packedOevUpdateSignature],
                  { value: bidAmount }
                )
            ).to.be.revertedWith('Data length not correct');
          });
        });
      });
      context('Does not update timestamp', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
          const beacon = beacons[0]!;
          const oevUpdateValue = 105;
          const currentTimestamp = await helpers.time.latest();
          const oevUpdateTimestamp = currentTimestamp + 1;
          const bidAmount = 10_000;
          const updateId = testUtils.generateRandomBytes32();
          const signature = await testUtils.signOevData(
            api3ServerV1,
            await oevProxy.getAddress(),
            beacon.beaconId,
            updateId,
            oevUpdateTimestamp,
            encodeData(oevUpdateValue),
            roles.searcher!.address,
            bidAmount,
            beacon.airnode,
            beacon.templateId
          );
          const packedOevUpdateSignature = packOevUpdateSignature(beacon.airnode.address, beacon.templateId, signature);
          await api3ServerV1
            .connect(roles.searcher)
            .updateOevProxyDataFeedWithSignedData(
              await oevProxy.getAddress(),
              beacon.beaconId,
              updateId,
              oevUpdateTimestamp,
              encodeData(oevUpdateValue),
              [packedOevUpdateSignature],
              { value: bidAmount }
            );
          await expect(
            api3ServerV1
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(
                await oevProxy.getAddress(),
                beacon.beaconId,
                updateId,
                oevUpdateTimestamp,
                encodeData(oevUpdateValue),
                [packedOevUpdateSignature],
                { value: bidAmount }
              )
          ).to.be.revertedWith('Does not update timestamp');
        });
      });
    });
    context('Timestamp is more than 1 hour from the future', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
        const bidAmount = 10_000;
        const updateId = testUtils.generateRandomBytes32();
        const nextTimestamp = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(nextTimestamp);
        const beaconTimestampFromFuture = nextTimestamp + 60 * 60 + 1;
        await expect(
          api3ServerV1
            .connect(roles.searcher)
            .updateOevProxyDataFeedWithSignedData(
              await oevProxy.getAddress(),
              updateId,
              beacons[0]!.beaconId,
              beaconTimestampFromFuture,
              '0x',
              ['0x'],
              {
                value: bidAmount,
              }
            )
        ).to.be.revertedWith('Timestamp not valid');
      });
    });
    context('Timestamp is zero', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
        const bidAmount = 10_000;
        const updateId = testUtils.generateRandomBytes32();
        await expect(
          api3ServerV1
            .connect(roles.searcher)
            .updateOevProxyDataFeedWithSignedData(
              await oevProxy.getAddress(),
              updateId,
              beacons[0]!.beaconId,
              0,
              '0x',
              ['0x'],
              {
                value: bidAmount,
              }
            )
        ).to.be.revertedWith('Does not update timestamp');
      });
    });
  });

  describe('withdraw', function () {
    context('OEV proxy announces a beneficiary address', function () {
      context('OEV proxy announces a non-zero beneficiary address', function () {
        context('OEV proxy balance is not zero', function () {
          context('Beneficiary does not revert the transfer', function () {
            it('withdraws the OEV proxy balance to the respective beneficiary', async function () {
              const { roles, api3ServerV1, oevProxy, beacons } = await deploy();
              const beacon = beacons[0]!;
              const beaconValue = Math.floor(Math.random() * 200 - 100);
              const beaconTimestamp = await helpers.time.latest();
              const bidAmount = 10_000;
              const updateId = testUtils.generateRandomBytes32();
              const signature = await testUtils.signOevData(
                api3ServerV1,
                await oevProxy.getAddress(),
                beacon.beaconId,
                updateId,
                beaconTimestamp,
                encodeData(beaconValue),
                roles.searcher!.address,
                bidAmount,
                beacon.airnode,
                beacon.templateId
              );
              const packedOevUpdateSignature = packOevUpdateSignature(
                beacon.airnode.address,
                beacon.templateId,
                signature
              );
              await api3ServerV1
                .connect(roles.searcher)
                .updateOevProxyDataFeedWithSignedData(
                  await oevProxy.getAddress(),
                  beacon.beaconId,
                  updateId,
                  beaconTimestamp,
                  encodeData(beaconValue),
                  [packedOevUpdateSignature],
                  {
                    value: bidAmount,
                  }
                );
              const oevBeneficiaryBalanceBeforeWithdrawal = await ethers.provider.getBalance(
                roles.oevBeneficiary!.address
              );
              await expect(api3ServerV1.connect(roles.randomPerson).withdraw(await oevProxy.getAddress()))
                .to.emit(api3ServerV1, 'Withdrew')
                .withArgs(await oevProxy.getAddress(), roles.oevBeneficiary!.address, bidAmount);
              const oevBeneficiaryBalanceAfterWithdrawal = await ethers.provider.getBalance(
                roles.oevBeneficiary!.address
              );
              expect(oevBeneficiaryBalanceAfterWithdrawal - oevBeneficiaryBalanceBeforeWithdrawal).to.equal(bidAmount);
            });
          });
          context('Beneficiary reverts the transfer', function () {
            it('reverts', async function () {
              const { roles, api3ServerV1, beacons } = await deploy();
              const beacon = beacons[0]!;
              const dataFeedProxyWithOevFactory = await ethers.getContractFactory(
                'DataFeedProxyWithOev',
                roles.deployer
              );
              const oevProxyWithRevertingBeneficiary = await dataFeedProxyWithOevFactory.deploy(
                await api3ServerV1.getAddress(),
                beacon.beaconId,
                await api3ServerV1.getAddress()
              );
              const beaconValue = Math.floor(Math.random() * 200 - 100);
              const beaconTimestamp = await helpers.time.latest();
              const bidAmount = 10_000;
              const updateId = testUtils.generateRandomBytes32();
              const signature = await testUtils.signOevData(
                api3ServerV1,
                await oevProxyWithRevertingBeneficiary.getAddress(),
                beacon.beaconId,
                updateId,
                beaconTimestamp,
                encodeData(beaconValue),
                roles.searcher!.address,
                bidAmount,
                beacon.airnode,
                beacon.templateId
              );
              const packedOevUpdateSignature = packOevUpdateSignature(
                beacon.airnode.address,
                beacon.templateId,
                signature
              );
              await api3ServerV1
                .connect(roles.searcher)
                .updateOevProxyDataFeedWithSignedData(
                  await oevProxyWithRevertingBeneficiary.getAddress(),
                  beacon.beaconId,
                  updateId,
                  beaconTimestamp,
                  encodeData(beaconValue),
                  [packedOevUpdateSignature],
                  {
                    value: bidAmount,
                  }
                );
              await expect(
                api3ServerV1.connect(roles.randomPerson).withdraw(await oevProxyWithRevertingBeneficiary.getAddress())
              ).to.be.revertedWith('Withdrawal reverted');
            });
          });
        });
        context('OEV proxy balance is zero', function () {
          it('reverts', async function () {
            const { roles, api3ServerV1, oevProxy } = await deploy();
            await expect(
              api3ServerV1.connect(roles.randomPerson).withdraw(await oevProxy.getAddress())
            ).to.be.revertedWith('OEV proxy balance zero');
          });
        });
      });
      context('OEV proxy announces a zero beneficiary address', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1, beacons } = await deploy();
          const beacon = beacons[0]!;
          const dataFeedProxyWithOevFactory = await ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
          const oevProxyWithZeroBeneficiary = await dataFeedProxyWithOevFactory.deploy(
            await api3ServerV1.getAddress(),
            beacon.beaconId,
            ethers.ZeroAddress
          );
          await expect(
            api3ServerV1.connect(roles.randomPerson).withdraw(await oevProxyWithZeroBeneficiary.getAddress())
          ).to.be.revertedWith('Beneficiary address zero');
        });
      });
    });
    context('OEV proxy does not announce a beneficiary address', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1 } = await deploy();
        await expect(
          api3ServerV1.connect(roles.randomPerson).withdraw(roles.randomPerson!.address)
        ).to.be.revertedWithoutReason();
        await expect(
          api3ServerV1.connect(roles.randomPerson).withdraw(await api3ServerV1.getAddress())
        ).to.be.revertedWithoutReason();
      });
    });
  });

  describe('setDapiName', function () {
    context('dAPI name is not zero', function () {
      context('Data feed ID is not zero', function () {
        context('Sender is manager', function () {
          it('sets dAPI name', async function () {
            const { roles, api3ServerV1, beaconSet } = await deploy();
            const dapiName = ethers.encodeBytes32String('My dAPI');
            expect(await api3ServerV1.dapiNameToDataFeedId(dapiName)).to.equal(ethers.ZeroHash);
            await expect(api3ServerV1.connect(roles.manager).setDapiName(dapiName, beaconSet.beaconSetId))
              .to.emit(api3ServerV1, 'SetDapiName')
              .withArgs(beaconSet.beaconSetId, dapiName, roles.manager!.address);
            expect(await api3ServerV1.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is dAPI name setter', function () {
          it('sets dAPI name', async function () {
            const { roles, api3ServerV1, beaconSet } = await deploy();
            const dapiName = ethers.encodeBytes32String('My dAPI');
            expect(await api3ServerV1.dapiNameToDataFeedId(dapiName)).to.equal(ethers.ZeroHash);
            await expect(api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId))
              .to.emit(api3ServerV1, 'SetDapiName')
              .withArgs(beaconSet.beaconSetId, dapiName, roles.dapiNameSetter!.address);
            expect(await api3ServerV1.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is not dAPI name setter', function () {
          it('reverts', async function () {
            const { roles, api3ServerV1, beaconSet } = await deploy();
            const dapiName = ethers.encodeBytes32String('My dAPI');
            await expect(
              api3ServerV1.connect(roles.randomPerson).setDapiName(dapiName, beaconSet.beaconSetId)
            ).to.be.revertedWith('Sender cannot set dAPI name');
          });
        });
      });
      context('Data feed ID is zero', function () {
        context('Sender is manager', function () {
          it('sets dAPI name', async function () {
            const { roles, api3ServerV1, beaconSet } = await deploy();
            const dapiName = ethers.encodeBytes32String('My dAPI');
            await api3ServerV1.connect(roles.manager).setDapiName(dapiName, beaconSet.beaconSetId);
            await expect(api3ServerV1.connect(roles.manager).setDapiName(dapiName, ethers.ZeroHash))
              .to.emit(api3ServerV1, 'SetDapiName')
              .withArgs(ethers.ZeroHash, dapiName, roles.manager!.address);
            expect(await api3ServerV1.dapiNameToDataFeedId(dapiName)).to.equal(ethers.ZeroHash);
            // Check if we can still set the dAPI name
            await api3ServerV1.connect(roles.manager).setDapiName(dapiName, beaconSet.beaconSetId);
            expect(await api3ServerV1.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is dAPI name setter', function () {
          it('sets dAPI name', async function () {
            const { roles, api3ServerV1, beaconSet } = await deploy();
            const dapiName = ethers.encodeBytes32String('My dAPI');
            await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            await expect(api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, ethers.ZeroHash))
              .to.emit(api3ServerV1, 'SetDapiName')
              .withArgs(ethers.ZeroHash, dapiName, roles.dapiNameSetter!.address);
            expect(await api3ServerV1.dapiNameToDataFeedId(dapiName)).to.equal(ethers.ZeroHash);
            // Check if we can still set the dAPI name
            await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            expect(await api3ServerV1.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is not dAPI name setter', function () {
          it('reverts', async function () {
            const { roles, api3ServerV1, beaconSet } = await deploy();
            const dapiName = ethers.encodeBytes32String('My dAPI');
            await expect(
              api3ServerV1.connect(roles.randomPerson).setDapiName(dapiName, beaconSet.beaconSetId)
            ).to.be.revertedWith('Sender cannot set dAPI name');
          });
        });
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1, beaconSet } = await deploy();
        await expect(
          api3ServerV1.connect(roles.dapiNameSetter).setDapiName(ethers.ZeroHash, beaconSet.beaconSetId)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });

  describe('readDataFeedWithId', function () {
    context('Data feed is initialized', function () {
      it('reads data feed', async function () {
        const { roles, api3ServerV1, beacons } = await deploy();
        const beacon = beacons[0]!;
        const beaconValue = Math.floor(Math.random() * 200 - 100);
        const beaconTimestamp = await helpers.time.latest();
        await updateBeacon(roles, api3ServerV1, beacon, beaconValue, beaconTimestamp);
        const beaconAfter = await api3ServerV1.connect(roles.randomPerson).readDataFeedWithId(beacon.beaconId);
        expect(beaconAfter.value).to.equal(beaconValue);
        expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('Data feed is not initialized', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1, beacons } = await deploy();
        const beacon = beacons[0]!;
        await expect(api3ServerV1.connect(roles.randomPerson).readDataFeedWithId(beacon.beaconId)).to.be.revertedWith(
          'Data feed not initialized'
        );
      });
    });
  });

  describe('readDataFeedWithDapiNameHash', function () {
    context('dAPI name set to Beacon', function () {
      context('Data feed is initialized', function () {
        it('reads Beacon', async function () {
          const { roles, api3ServerV1, beacons } = await deploy();
          const beacon = beacons[0]!;
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          await updateBeacon(roles, api3ServerV1, beacon, beaconValue, beaconTimestamp);
          const dapiName = ethers.encodeBytes32String('My dAPI');
          const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
          await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
          const dapiAfter = await api3ServerV1.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash);
          expect(dapiAfter.value).to.be.equal(beaconValue);
          expect(dapiAfter.timestamp).to.be.equal(beaconTimestamp);
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1, beacons } = await deploy();
          const beacon = beacons[0]!;
          const dapiName = ethers.encodeBytes32String('My dAPI');
          const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
          await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
          await expect(
            api3ServerV1.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name set to Beacon set', function () {
      context('Data feed is initialized', function () {
        it('reads Beacon set', async function () {
          const { roles, api3ServerV1, beacons, beaconSet } = await deploy();
          const beaconSetValue = Math.floor(Math.random() * 200 - 100);
          const beaconSetTimestamp = await helpers.time.latest();
          await updateBeaconSet(roles, api3ServerV1, beacons, beaconSetValue, beaconSetTimestamp);
          const dapiName = ethers.encodeBytes32String('My dAPI');
          const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
          await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
          const dapiAfter = await api3ServerV1.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash);
          expect(dapiAfter.value).to.be.equal(beaconSetValue);
          expect(dapiAfter.timestamp).to.be.equal(beaconSetTimestamp);
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1, beaconSet } = await deploy();
          const dapiName = ethers.encodeBytes32String('My dAPI');
          const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
          await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
          await expect(
            api3ServerV1.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name not set', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1 } = await deploy();
        const dapiName = ethers.encodeBytes32String('My dAPI');
        const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
        await expect(
          api3ServerV1.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash)
        ).to.be.revertedWith('dAPI name not set');
      });
    });
  });

  describe('readDataFeedWithIdAsOevProxy', function () {
    context('Data feed is initialized', function () {
      context('OEV proxy data feed is more up to date', function () {
        it('reads OEV proxy data feed', async function () {
          const { roles, api3ServerV1, beacons } = await deploy();
          const beacon = beacons[0]!;
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          const bidAmount = 10_000;
          const updateId = testUtils.generateRandomBytes32();
          const signature = await testUtils.signOevData(
            api3ServerV1,
            roles.mockOevProxy!.address,
            beacon.beaconId,
            updateId,
            beaconTimestamp,
            encodeData(beaconValue),
            roles.searcher!.address,
            bidAmount,
            beacon.airnode,
            beacon.templateId
          );
          const packedOevUpdateSignature = packOevUpdateSignature(beacon.airnode.address, beacon.templateId, signature);
          await api3ServerV1
            .connect(roles.searcher)
            .updateOevProxyDataFeedWithSignedData(
              roles.mockOevProxy!.address,
              beacon.beaconId,
              updateId,
              beaconTimestamp,
              encodeData(beaconValue),
              [packedOevUpdateSignature],
              {
                value: bidAmount,
              }
            );
          const beaconAfter = await api3ServerV1
            .connect(roles.mockOevProxy)
            .readDataFeedWithIdAsOevProxy(beacon.beaconId);
          expect(beaconAfter.value).to.equal(beaconValue);
          expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('Base data feed is more up to date', function () {
        it('reads base data feed', async function () {
          const { roles, api3ServerV1, beacons } = await deploy();
          const beacon = beacons[0]!;
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          await updateBeacon(roles, api3ServerV1, beacon, beaconValue, beaconTimestamp);
          const beaconAfter = await api3ServerV1
            .connect(roles.mockOevProxy)
            .readDataFeedWithIdAsOevProxy(beacon.beaconId);
          expect(beaconAfter.value).to.equal(beaconValue);
          expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
        });
      });
    });
    context('Data feed is not initialized', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1, beacons } = await deploy();
        const beacon = beacons[0]!;
        await expect(
          api3ServerV1.connect(roles.mockOevProxy).readDataFeedWithIdAsOevProxy(beacon.beaconId)
        ).to.be.revertedWith('Data feed not initialized');
      });
    });
  });

  describe('readDataFeedWithDapiNameHashAsOevProxy', function () {
    context('dAPI name set to Beacon', function () {
      context('Data feed is initialized', function () {
        context('OEV proxy data feed is more up to date', function () {
          it('reads OEV proxy data feed', async function () {
            const { roles, api3ServerV1, beacons } = await deploy();
            const beacon = beacons[0]!;
            const beaconValue = Math.floor(Math.random() * 200 - 100);
            const beaconTimestamp = await helpers.time.latest();
            const bidAmount = 10_000;
            const updateId = testUtils.generateRandomBytes32();
            const signature = await testUtils.signOevData(
              api3ServerV1,
              roles.mockOevProxy!.address,
              beacon.beaconId,
              updateId,
              beaconTimestamp,
              encodeData(beaconValue),
              roles.searcher!.address,
              bidAmount,
              beacon.airnode,
              beacon.templateId
            );
            const packedOevUpdateSignature = packOevUpdateSignature(
              beacon.airnode.address,
              beacon.templateId,
              signature
            );
            await api3ServerV1
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(
                roles.mockOevProxy!.address,
                beacon.beaconId,
                updateId,
                beaconTimestamp,
                encodeData(beaconValue),
                [packedOevUpdateSignature],
                {
                  value: bidAmount,
                }
              );
            const dapiName = ethers.encodeBytes32String('My dAPI');
            const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
            await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
            const dapiAfter = await api3ServerV1
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(beaconValue);
            expect(dapiAfter.timestamp).to.equal(beaconTimestamp);
          });
        });
        context('Base data feed is more up to date', function () {
          it('reads base data feed', async function () {
            const { roles, api3ServerV1, beacons } = await deploy();
            const beacon = beacons[0]!;
            const beaconValue = Math.floor(Math.random() * 200 - 100);
            const beaconTimestamp = await helpers.time.latest();
            await updateBeacon(roles, api3ServerV1, beacon, beaconValue, beaconTimestamp);
            const dapiName = ethers.encodeBytes32String('My dAPI');
            const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
            await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
            const dapiAfter = await api3ServerV1
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(beaconValue);
            expect(dapiAfter.timestamp).to.equal(beaconTimestamp);
          });
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1, beacons } = await deploy();
          const beacon = beacons[0]!;
          const dapiName = ethers.encodeBytes32String('My dAPI');
          const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
          await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
          await expect(
            api3ServerV1.connect(roles.mockOevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name set to Beacon set', function () {
      context('Data feed is initialized', function () {
        context('OEV proxy data feed is more up to date', function () {
          it('reads OEV proxy data feed', async function () {
            const { roles, api3ServerV1, beacons, beaconSet } = await deploy();
            // Populate the Beacons
            const beaconValues = [100, 80, 120];
            const currentTimestamp = await helpers.time.latest();
            const beaconTimestamps = [currentTimestamp, currentTimestamp, currentTimestamp];
            await Promise.all(
              beacons.map(async (beacon, index) => {
                await updateBeacon(roles, api3ServerV1, beacon, beaconValues[index]!, beaconTimestamps[index]);
              })
            );
            const beaconIds = beacons.map((beacon) => {
              return beacon.beaconId;
            });
            await api3ServerV1.updateBeaconSetWithBeacons(beaconIds);

            const oevUpdateValue = 105;
            const oevUpdateTimestamp = currentTimestamp + 1;
            const bidAmount = 10_000;
            const updateId = testUtils.generateRandomBytes32();
            // Randomly omit one of the signatures
            const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
            const signatures = await Promise.all(
              beacons.map(async (beacon, index) => {
                if (index === omitSignatureAtIndex) {
                  return '0x';
                } else {
                  return testUtils.signOevData(
                    api3ServerV1,
                    roles.mockOevProxy!.address,
                    beaconSet.beaconSetId,
                    updateId,
                    oevUpdateTimestamp,
                    encodeData(oevUpdateValue),
                    roles.searcher!.address,
                    bidAmount,
                    beacon.airnode,
                    beacon.templateId
                  );
                }
              })
            );
            const packedOevUpdateSignatures = signatures.map((signature, index) => {
              return packOevUpdateSignature(beacons[index]!.airnode.address, beacons[index]!.templateId, signature);
            });
            await api3ServerV1
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(
                roles.mockOevProxy!.address,
                beaconSet.beaconSetId,
                updateId,
                oevUpdateTimestamp,
                encodeData(oevUpdateValue),
                packedOevUpdateSignatures,
                { value: bidAmount }
              );
            const dapiName = ethers.encodeBytes32String('My dAPI');
            const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
            await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            const dapiAfter = await api3ServerV1
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(oevUpdateValue);
            expect(dapiAfter.timestamp).to.equal(oevUpdateTimestamp);
          });
        });
        context('Base data feed is more up to date', function () {
          it('reads base data feed', async function () {
            const { roles, api3ServerV1, beacons, beaconSet } = await deploy();
            const currentTimestamp = await helpers.time.latest();
            const beaconSetValue = Math.floor(Math.random() * 200 - 100);
            const beaconSetTimestamp = Math.floor(currentTimestamp - Math.random() * 5 * 60);
            await updateBeaconSet(roles, api3ServerV1, beacons, beaconSetValue, beaconSetTimestamp);
            const dapiName = ethers.encodeBytes32String('My dAPI');
            const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
            await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            const dapiAfter = await api3ServerV1
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(beaconSetValue);
            expect(dapiAfter.timestamp).to.equal(beaconSetTimestamp);
          });
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, api3ServerV1, beaconSet } = await deploy();
          const dapiName = ethers.encodeBytes32String('My dAPI');
          const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
          await api3ServerV1.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
          await expect(
            api3ServerV1.connect(roles.mockOevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name not set', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1 } = await deploy();
        const dapiName = ethers.encodeBytes32String('My dAPI');
        const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [dapiName]);
        await expect(
          api3ServerV1.connect(roles.mockOevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash)
        ).to.be.revertedWith('dAPI name not set');
      });
    });
  });
});
