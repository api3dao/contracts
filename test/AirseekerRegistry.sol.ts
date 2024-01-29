import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import type { AddressLike, BigNumberish, BytesLike, HDNodeWallet } from 'ethers';
import { ethers } from 'hardhat';

import type { AirseekerRegistry, Api3ServerV1 } from '../src/index';

export async function updateBeaconSet(
  api3ServerV1: Api3ServerV1,
  feedName: string,
  airnodes: HDNodeWallet[],
  timestamp: BigNumberish,
  value: BigNumberish
) {
  const encodedValue = ethers.AbiCoder.defaultAbiCoder().encode(['int224'], [value]);

  const beaconUpdateData = airnodes.map((airnode) => {
    const templateId = deriveTemplateId(`OIS title of Airnode with address ${airnode.address}`, feedName);
    return {
      airnode,
      templateId,
      beaconId: deriveBeaconId(airnode.address, templateId),
    };
  });
  for (const beaconUpdateDatum of beaconUpdateData) {
    await api3ServerV1.updateBeaconWithSignedData(
      beaconUpdateDatum.airnode.address,
      beaconUpdateDatum.templateId,
      timestamp,
      encodedValue,
      await beaconUpdateDatum.airnode.signMessage(
        ethers.toBeArray(
          ethers.solidityPackedKeccak256(
            ['bytes32', 'uint256', 'bytes'],
            [beaconUpdateDatum.templateId, timestamp, encodedValue]
          )
        )
      )
    );
  }
  const beaconIds = beaconUpdateData.map((beaconUpdateDatum) => beaconUpdateDatum.beaconId);
  await api3ServerV1.updateBeaconSetWithBeacons(beaconIds);
  return {
    templateIds: beaconUpdateData.map((beaconUpdateDatum) => beaconUpdateDatum.templateId),
    beaconIds,
    beaconSetId: deriveBeaconSetId(beaconIds),
  };
}

export async function readBeacons(api3ServerV1: Api3ServerV1, beaconIds: BytesLike[]) {
  const returndata = await api3ServerV1.multicall.staticCall(
    beaconIds.map((beaconId) => api3ServerV1.interface.encodeFunctionData('dataFeeds', [beaconId]))
  );
  return returndata
    .map((returndata) => ethers.AbiCoder.defaultAbiCoder().decode(['int224', 'uint32'], returndata))
    .map((decodedReturnData) => {
      return { value: decodedReturnData[0], timestamp: decodedReturnData[1] };
    });
}

export function encodeUpdateParameters(
  deviationThreshold: number,
  deviationReference: number,
  heartbeatInterval: number
) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'int224', 'uint256'],
    [deviationThreshold, deviationReference, heartbeatInterval]
  );
}

function deriveTemplateId(oisTitle: string, feedName: string) {
  const endpointId = ethers.solidityPackedKeccak256(['string', 'string'], [oisTitle, 'feed']);
  // Parameters encoded in Airnode ABI
  // https://docs.api3.org/reference/airnode/latest/specifications/airnode-abi.html
  return ethers.solidityPackedKeccak256(
    ['bytes32', 'bytes'],
    [
      endpointId,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'bytes32'],
        [ethers.encodeBytes32String('1b'), ethers.encodeBytes32String('name'), ethers.encodeBytes32String(feedName)]
      ),
    ]
  );
}

function deriveBeaconId(airnodeAddress: AddressLike, templateId: BytesLike) {
  return ethers.solidityPackedKeccak256(['address', 'bytes32'], [airnodeAddress, templateId]);
}

function deriveBeaconSetId(beaconIds: BytesLike[]) {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [beaconIds]));
}

async function registerBeaconSet(airseekerRegistry: AirseekerRegistry, feedName: string, airnodes: HDNodeWallet[]) {
  const beacons = airnodes
    .map((airnode) => {
      return {
        airnodeAddress: airnode.address,
        templateId: deriveTemplateId(`OIS title of Airnode with address ${airnode.address}`, feedName),
      };
    })
    .map((beacon) => {
      return { ...beacon, beaconId: deriveBeaconId(beacon.airnodeAddress, beacon.templateId) };
    });
  const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address[]', 'bytes32[]'],
    [beacons.map((beacon) => beacon.airnodeAddress), beacons.map((beacon) => beacon.templateId)]
  );
  await airseekerRegistry.registerDataFeed(dataFeedDetails);
  return dataFeedDetails;
}

describe('AirseekerRegistry', function () {
  const MAXIMUM_BEACON_COUNT_IN_SET = 21;
  const MAXIMUM_UPDATE_PARAMETERS_LENGTH = 1024;
  const MAXIMUM_SIGNED_API_URL_LENGTH = 256;

  async function deploy() {
    const roleNames = ['deployer', 'api3ServerV1Manager', 'owner', 'randomPerson'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});
    const airnodes: HDNodeWallet[] = Array.from({ length: 3 }).map(() => ethers.Wallet.createRandom());

    const AccessControlRegistry = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await AccessControlRegistry.deploy();

    const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';
    const Api3ServerV1 = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
    const api3ServerV1 = await Api3ServerV1.deploy(
      accessControlRegistry.getAddress(),
      api3ServerV1AdminRoleDescription,
      roles.api3ServerV1Manager!.address
    );
    const { beaconIds, beaconSetId: dataFeedId } = await updateBeaconSet(
      api3ServerV1,
      'ETH/USD',
      airnodes,
      await helpers.time.latest(),
      ethers.parseEther('2200')
    );
    const dapiName = ethers.encodeBytes32String('ETH/USD');
    await api3ServerV1.connect(roles.api3ServerV1Manager).setDapiName(dapiName, dataFeedId);

    const AirseekerRegistry = await ethers.getContractFactory('AirseekerRegistry', roles.deployer);
    const airseekerRegistry = await AirseekerRegistry.deploy(roles.owner!.address, api3ServerV1.getAddress());
    const signedApiUrls = airnodes.map((_, index) => `https://signed-api.airnode${index}.com`);
    for (const [ind, airnode] of airnodes.entries()) {
      await airseekerRegistry.connect(roles.owner).setSignedApiUrl(airnode.address, signedApiUrls[ind]!);
    }

    return {
      roles,
      airnodes,
      api3ServerV1,
      beaconIds,
      dataFeedId,
      dapiName,
      airseekerRegistry,
      signedApiUrls,
    };
  }

  describe('constructor', function () {
    context('Owner address is not zero', function () {
      context('Api3ServerV1 address is not zero', function () {
        it('constructs', async function () {
          const { roles, api3ServerV1, airseekerRegistry } = await helpers.loadFixture(deploy);
          expect(await airseekerRegistry.MAXIMUM_BEACON_COUNT_IN_SET()).to.equal(MAXIMUM_BEACON_COUNT_IN_SET);
          expect(await airseekerRegistry.MAXIMUM_UPDATE_PARAMETERS_LENGTH()).to.equal(MAXIMUM_UPDATE_PARAMETERS_LENGTH);
          expect(await airseekerRegistry.MAXIMUM_SIGNED_API_URL_LENGTH()).to.equal(MAXIMUM_SIGNED_API_URL_LENGTH);
          expect(await airseekerRegistry.owner()).to.equal(roles.owner!.address);
          expect(await airseekerRegistry.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
        });
      });
      context('Api3ServerV1 address is zero', function () {
        it('reverts', async function () {
          const { roles } = await helpers.loadFixture(deploy);
          const AirseekerRegistry = await ethers.getContractFactory('AirseekerRegistry', roles.deployer);
          await expect(AirseekerRegistry.deploy(roles.owner!.address, ethers.ZeroAddress)).to.be.revertedWith(
            'Api3ServerV1 address zero'
          );
        });
      });
    });
    context('Owner address is zero', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1 } = await helpers.loadFixture(deploy);
        const AirseekerRegistry = await ethers.getContractFactory('AirseekerRegistry', roles.deployer);
        await expect(AirseekerRegistry.deploy(ethers.ZeroAddress, api3ServerV1.getAddress())).to.be.revertedWith(
          'Owner address zero'
        );
      });
    });
  });

  describe('renounceOwnership', function () {
    it('reverts', async function () {
      const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
      await expect(airseekerRegistry.connect(roles.owner).renounceOwnership()).to.be.revertedWith(
        'Ownership cannot be renounced'
      );
    });
  });

  describe('transferOwnership', function () {
    it('reverts', async function () {
      const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
      await expect(
        airseekerRegistry.connect(roles.owner).transferOwnership(roles.randomPerson!.address)
      ).to.be.revertedWith('Ownership cannot be transferred');
    });
  });

  describe('setDataFeedIdToBeActivated', function () {
    context('Sender is the owner', function () {
      context('Data feed ID is not zero', function () {
        context('Data feed ID is not activated', function () {
          it('activates the data feed ID', async function () {
            const { roles, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
            expect(await airseekerRegistry.activeDataFeedCount()).to.equal(0);
            expect(await airseekerRegistry.activeDataFeedIdCount()).to.equal(0);
            await expect(airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(dataFeedId))
              .to.emit(airseekerRegistry, 'ActivatedDataFeedId')
              .withArgs(dataFeedId);
            expect(await airseekerRegistry.activeDataFeedCount()).to.equal(1);
            expect(await airseekerRegistry.activeDataFeedIdCount()).to.equal(1);
            const dataFeed = await airseekerRegistry.activeDataFeed(0);
            expect(dataFeed.dataFeedId).to.equal(dataFeedId);
          });
        });
        context('Data feed ID is already activated', function () {
          it('does nothing', async function () {
            const { roles, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
            await airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(dataFeedId);
            await expect(airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(dataFeedId)).to.not.emit(
              airseekerRegistry,
              'ActivatedDataFeedId'
            );
            expect(await airseekerRegistry.activeDataFeedCount()).to.equal(1);
            expect(await airseekerRegistry.activeDataFeedIdCount()).to.equal(1);
            const dataFeed = await airseekerRegistry.activeDataFeed(0);
            expect(dataFeed.dataFeedId).to.equal(dataFeedId);
          });
        });
      });
      context('Data feed ID is zero', function () {
        it('reverts', async function () {
          const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
          await expect(
            airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(ethers.ZeroHash)
          ).to.be.revertedWith('Data feed ID zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
        await expect(
          airseekerRegistry.connect(roles.randomPerson).setDataFeedIdToBeActivated(dataFeedId)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('setDapiNameToBeActivated', function () {
    context('Sender is the owner', function () {
      context('dAPI name is not zero', function () {
        context('dAPI name is not activated', function () {
          it('activates the dAPI name', async function () {
            const { roles, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
            expect(await airseekerRegistry.activeDataFeedCount()).to.equal(0);
            expect(await airseekerRegistry.activeDapiNameCount()).to.equal(0);
            await expect(airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName))
              .to.emit(airseekerRegistry, 'ActivatedDapiName')
              .withArgs(dapiName);
            expect(await airseekerRegistry.activeDataFeedCount()).to.equal(1);
            expect(await airseekerRegistry.activeDapiNameCount()).to.equal(1);
            const dataFeed = await airseekerRegistry.activeDataFeed(0);
            expect(dataFeed.dapiName).to.equal(dapiName);
          });
        });
        context('dAPI name is already activated', function () {
          it('does nothing', async function () {
            const { roles, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
            await airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName);
            await expect(airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName)).to.not.emit(
              airseekerRegistry,
              'ActivatedDapiName'
            );
            expect(await airseekerRegistry.activeDataFeedCount()).to.equal(1);
            expect(await airseekerRegistry.activeDapiNameCount()).to.equal(1);
            const dataFeed = await airseekerRegistry.activeDataFeed(0);
            expect(dataFeed.dapiName).to.equal(dapiName);
          });
        });
      });
      context('dAPI name is zero', function () {
        it('reverts', async function () {
          const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
          await expect(
            airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(ethers.ZeroHash)
          ).to.be.revertedWith('dAPI name zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
        await expect(
          airseekerRegistry.connect(roles.randomPerson).setDapiNameToBeActivated(dapiName)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('setDataFeedIdToBeDeactivated', function () {
    context('Sender is the owner', function () {
      context('Data feed ID is not zero', function () {
        context('Data feed ID is activated', function () {
          it('activates the data feed ID', async function () {
            const { roles, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
            await airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(dataFeedId);
            await expect(airseekerRegistry.connect(roles.owner).setDataFeedIdToBeDeactivated(dataFeedId))
              .to.emit(airseekerRegistry, 'DeactivatedDataFeedId')
              .withArgs(dataFeedId);
            expect(await airseekerRegistry.activeDataFeedCount()).to.equal(0);
            expect(await airseekerRegistry.activeDataFeedIdCount()).to.equal(0);
          });
        });
        context('Data feed ID is not activated', function () {
          it('does nothing', async function () {
            const { roles, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
            await expect(airseekerRegistry.connect(roles.owner).setDataFeedIdToBeDeactivated(dataFeedId)).to.not.emit(
              airseekerRegistry,
              'DeactivatedDataFeedId'
            );
            expect(await airseekerRegistry.activeDataFeedCount()).to.equal(0);
            expect(await airseekerRegistry.activeDataFeedIdCount()).to.equal(0);
          });
        });
      });
      context('Data feed ID is zero', function () {
        it('reverts', async function () {
          const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
          await expect(
            airseekerRegistry.connect(roles.owner).setDataFeedIdToBeDeactivated(ethers.ZeroHash)
          ).to.be.revertedWith('Data feed ID zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
        await expect(
          airseekerRegistry.connect(roles.randomPerson).setDataFeedIdToBeDeactivated(dataFeedId)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('setDapiNameToBeDeactivated', function () {
    context('Sender is the owner', function () {
      context('dAPI name is not zero', function () {
        context('dAPI name is activated', function () {
          it('activates the dAPI name', async function () {
            const { roles, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
            await airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName);
            await expect(airseekerRegistry.connect(roles.owner).setDapiNameToBeDeactivated(dapiName))
              .to.emit(airseekerRegistry, 'DeactivatedDapiName')
              .withArgs(dapiName);
            expect(await airseekerRegistry.activeDataFeedCount()).to.equal(0);
            expect(await airseekerRegistry.activeDapiNameCount()).to.equal(0);
          });
        });
        context('dAPI name is not activated', function () {
          it('does nothing', async function () {
            const { roles, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
            await expect(airseekerRegistry.connect(roles.owner).setDapiNameToBeDeactivated(dapiName)).to.not.emit(
              airseekerRegistry,
              'DeactivatedDataFeedId'
            );
            expect(await airseekerRegistry.activeDataFeedCount()).to.equal(0);
            expect(await airseekerRegistry.activeDapiNameCount()).to.equal(0);
          });
        });
      });
      context('dAPI name is zero', function () {
        it('reverts', async function () {
          const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
          await expect(
            airseekerRegistry.connect(roles.owner).setDapiNameToBeDeactivated(ethers.ZeroHash)
          ).to.be.revertedWith('dAPI name zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
        await expect(
          airseekerRegistry.connect(roles.randomPerson).setDapiNameToBeDeactivated(dapiName)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('setDataFeedIdUpdateParameters', function () {
    context('Sender is the owner', function () {
      context('Data feed ID is not zero', function () {
        context('Update parameters length does not exceed the maximum', function () {
          context('Values update update parameters', function () {
            context('Values have not been used before', function () {
              it('updates update parameters', async function () {
                const { roles, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
                const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
                expect(await airseekerRegistry.dataFeedIdToUpdateParameters(dataFeedId)).to.equal('0x');
                await expect(
                  airseekerRegistry.connect(roles.owner).setDataFeedIdUpdateParameters(dataFeedId, updateParameters)
                )
                  .to.emit(airseekerRegistry, 'UpdatedDataFeedIdUpdateParameters')
                  .withArgs(dataFeedId, updateParameters);
                expect(await airseekerRegistry.dataFeedIdToUpdateParameters(dataFeedId)).to.equal(updateParameters);
              });
            });
            context('Values have been used before', function () {
              it('updates update parameters', async function () {
                const { roles, dataFeedId, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
                const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
                await airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(dapiName, updateParameters);
                expect(await airseekerRegistry.dataFeedIdToUpdateParameters(dataFeedId)).to.equal('0x');
                await expect(
                  airseekerRegistry.connect(roles.owner).setDataFeedIdUpdateParameters(dataFeedId, updateParameters)
                )
                  .to.emit(airseekerRegistry, 'UpdatedDataFeedIdUpdateParameters')
                  .withArgs(dataFeedId, updateParameters);
                expect(await airseekerRegistry.dataFeedIdToUpdateParameters(dataFeedId)).to.equal(updateParameters);
              });
            });
          });
          context('Values do not update update parameters', function () {
            it('does nothing', async function () {
              const { roles, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
              const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
              await airseekerRegistry.connect(roles.owner).setDataFeedIdUpdateParameters(dataFeedId, updateParameters);
              await expect(
                airseekerRegistry.connect(roles.owner).setDataFeedIdUpdateParameters(dataFeedId, updateParameters)
              ).to.not.emit(airseekerRegistry, 'UpdatedDataFeedIdUpdateParameters');
              expect(await airseekerRegistry.dataFeedIdToUpdateParameters(dataFeedId)).to.equal(updateParameters);
            });
          });
        });
        context('Update parameters length exceeds the maximum', function () {
          it('reverts', async function () {
            const { roles, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
            const updateParameters = `0x${'0'.repeat((MAXIMUM_UPDATE_PARAMETERS_LENGTH + 1) * 2)}`;
            await expect(
              airseekerRegistry.connect(roles.owner).setDataFeedIdUpdateParameters(dataFeedId, updateParameters)
            ).to.be.revertedWith('Update parameters too long');
          });
        });
      });
      context('Data feed ID is zero', function () {
        it('reverts', async function () {
          const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
          const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
          await expect(
            airseekerRegistry.connect(roles.owner).setDataFeedIdUpdateParameters(ethers.ZeroHash, updateParameters)
          ).to.be.revertedWith('Data feed ID zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
        const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
        await expect(
          airseekerRegistry.connect(roles.randomPerson).setDataFeedIdUpdateParameters(dataFeedId, updateParameters)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('setDapiNameUpdateParameters', function () {
    context('Sender is the owner', function () {
      context('dAPI name is not zero', function () {
        context('Update parameters length does not exceed the maximum', function () {
          context('Values update update parameters', function () {
            context('Values have not been used before', function () {
              it('updates update parameters', async function () {
                const { roles, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
                const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
                expect(await airseekerRegistry.dapiNameToUpdateParameters(dapiName)).to.equal('0x');
                await expect(
                  airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(dapiName, updateParameters)
                )
                  .to.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters')
                  .withArgs(dapiName, updateParameters);
                expect(await airseekerRegistry.dapiNameToUpdateParameters(dapiName)).to.equal(updateParameters);
              });
            });
            context('Values have been used before', function () {
              it('updates update parameters', async function () {
                const { roles, dataFeedId, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
                const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
                await airseekerRegistry
                  .connect(roles.owner)
                  .setDataFeedIdUpdateParameters(dataFeedId, updateParameters);
                expect(await airseekerRegistry.dapiNameToUpdateParameters(dapiName)).to.equal('0x');
                await expect(
                  airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(dapiName, updateParameters)
                )
                  .to.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters')
                  .withArgs(dapiName, updateParameters);
                expect(await airseekerRegistry.dapiNameToUpdateParameters(dapiName)).to.equal(updateParameters);
              });
            });
          });
          context('Values do not update update parameters', function () {
            it('does nothing', async function () {
              const { roles, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
              const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
              await airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(dapiName, updateParameters);
              await expect(
                airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(dapiName, updateParameters)
              ).to.not.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters');
              expect(await airseekerRegistry.dapiNameToUpdateParameters(dapiName)).to.equal(updateParameters);
            });
          });
        });
        context('Update parameters length exceeds the maximum', function () {
          it('reverts', async function () {
            const { roles, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
            const updateParameters = `0x${'0'.repeat((MAXIMUM_UPDATE_PARAMETERS_LENGTH + 1) * 2)}`;
            await expect(
              airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(dapiName, updateParameters)
            ).to.be.revertedWith('Update parameters too long');
          });
        });
      });
      context('dAPI name is zero', function () {
        it('reverts', async function () {
          const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
          const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
          await expect(
            airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(ethers.ZeroHash, updateParameters)
          ).to.be.revertedWith('dAPI name zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
        const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
        await expect(
          airseekerRegistry.connect(roles.randomPerson).setDapiNameUpdateParameters(dapiName, updateParameters)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('setSignedApiUrl', function () {
    context('Sender is the owner', function () {
      context('Airnode address is not zero', function () {
        context('Signed API URL is not too long', function () {
          context('Value updates signed API URL', function () {
            it('updates signed API URL', async function () {
              const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
              const airnodeAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
              const signedApiUrl = 'https://signed-api.airnode.com';
              expect(await airseekerRegistry.airnodeToSignedApiUrl(airnodeAddress)).to.equal('');
              await expect(airseekerRegistry.connect(roles.owner).setSignedApiUrl(airnodeAddress, signedApiUrl))
                .to.emit(airseekerRegistry, 'UpdatedSignedApiUrl')
                .withArgs(airnodeAddress, signedApiUrl);
              expect(await airseekerRegistry.airnodeToSignedApiUrl(airnodeAddress)).to.equal(signedApiUrl);
            });
          });
          context('Value does not update signed API URL', function () {
            it('does nothing', async function () {
              const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
              const airnodeAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
              const signedApiUrl = 'https://signed-api.airnode.com';
              await airseekerRegistry.connect(roles.owner).setSignedApiUrl(airnodeAddress, signedApiUrl);
              await expect(
                airseekerRegistry.connect(roles.owner).setSignedApiUrl(airnodeAddress, signedApiUrl)
              ).to.not.emit(airseekerRegistry, 'UpdatedSignedApiUrl');
              expect(await airseekerRegistry.airnodeToSignedApiUrl(airnodeAddress)).to.equal(signedApiUrl);
            });
          });
        });
        context('Signed API URL is too long', function () {
          it('reverts', async function () {
            const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
            const airnodeAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
            const signedApiUrl = 'X'.repeat(MAXIMUM_SIGNED_API_URL_LENGTH + 1);
            await expect(
              airseekerRegistry.connect(roles.owner).setSignedApiUrl(airnodeAddress, signedApiUrl)
            ).to.be.revertedWith('Signed API URL too long');
          });
        });
      });
      context('Airnode address is zero', function () {
        it('reverts', async function () {
          const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
          const signedApiUrl = 'https://signed-api.airnode.com';
          await expect(
            airseekerRegistry.connect(roles.owner).setSignedApiUrl(ethers.ZeroAddress, signedApiUrl)
          ).to.be.revertedWith('Airnode address zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
        const airnodeAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
        const signedApiUrl = 'https://signed-api.airnode.com';
        await expect(
          airseekerRegistry.connect(roles.randomPerson).setSignedApiUrl(airnodeAddress, signedApiUrl)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('registerDataFeed', function () {
    context('Data feed details are long enough to specify a single Beacon', function () {
      context('Airnode address is not zero', function () {
        context('Data feed is not registered', function () {
          it('registers data feed', async function () {
            const { roles, airnodes, airseekerRegistry } = await helpers.loadFixture(deploy);
            const templateId = deriveTemplateId(`OIS title of Airnode with address ${airnodes[0]!.address}`, 'ETH/USD');
            const beaconId = deriveBeaconId(airnodes[0]!.address, templateId);
            const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'bytes32'],
              [airnodes[0]!.address, templateId]
            );
            expect(await airseekerRegistry.dataFeedIdToDetails(beaconId)).to.equal('0x');
            expect(await airseekerRegistry.dataFeedIsRegistered(beaconId)).to.equal(false);
            expect(
              await airseekerRegistry.connect(roles.randomPerson).registerDataFeed.staticCall(dataFeedDetails)
            ).to.equal(beaconId);
            await expect(airseekerRegistry.connect(roles.randomPerson).registerDataFeed(dataFeedDetails))
              .to.emit(airseekerRegistry, 'RegisteredDataFeed')
              .withArgs(beaconId, dataFeedDetails);
            expect(await airseekerRegistry.dataFeedIdToDetails(beaconId)).to.equal(dataFeedDetails);
            expect(await airseekerRegistry.dataFeedIsRegistered(beaconId)).to.equal(true);
          });
        });
        context('Data feed is already registered', function () {
          it('does nothing', async function () {
            const { roles, airnodes, airseekerRegistry } = await helpers.loadFixture(deploy);
            const templateId = deriveTemplateId(`OIS title of Airnode with address ${airnodes[0]!.address}`, 'ETH/USD');
            const beaconId = deriveBeaconId(airnodes[0]!.address, templateId);
            const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'bytes32'],
              [airnodes[0]!.address, templateId]
            );
            await airseekerRegistry.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
            expect(
              await airseekerRegistry.connect(roles.randomPerson).registerDataFeed.staticCall(dataFeedDetails)
            ).to.equal(beaconId);
            await expect(airseekerRegistry.connect(roles.randomPerson).registerDataFeed(dataFeedDetails)).to.not.emit(
              airseekerRegistry,
              'RegisteredDataFeed'
            );
            expect(await airseekerRegistry.dataFeedIdToDetails(beaconId)).to.equal(dataFeedDetails);
            expect(await airseekerRegistry.dataFeedIsRegistered(beaconId)).to.equal(true);
          });
        });
      });
      context('Airnode address is zero', function () {
        it('reverts', async function () {
          const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
          const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'bytes32'],
            [ethers.ZeroAddress, ethers.ZeroHash]
          );
          await expect(
            airseekerRegistry.connect(roles.randomPerson).registerDataFeed(dataFeedDetails)
          ).to.be.revertedWith('Airnode address zero');
        });
      });
    });
    context('Data feed details are at least long enough to specify a Beacon set composed of two Beacons', function () {
      context(
        'Data feed details length does not exceed specifications for a Beacon set composed of the maximum number of Beacons',
        function () {
          context('Data feed details data does not trail', function () {
            context('Data feed detail parameter lengths match', function () {
              context('None of the Airnode addresses is zero', function () {
                context('Data feed is not registered', function () {
                  it('registers data feed', async function () {
                    const { roles, airnodes, airseekerRegistry } = await helpers.loadFixture(deploy);
                    const beacons = airnodes
                      .map((airnode) => {
                        return {
                          airnodeAddress: airnode.address,
                          templateId: deriveTemplateId(
                            `OIS title of Airnode with address ${airnode.address}`,
                            'ETH/USD'
                          ),
                        };
                      })
                      .map((beacon) => {
                        return { ...beacon, beaconId: deriveBeaconId(beacon.airnodeAddress, beacon.templateId) };
                      });
                    const beaconSetId = deriveBeaconSetId(
                      beacons.reduce((acc: string[], beacon) => {
                        return [...acc, beacon.beaconId];
                      }, [])
                    );
                    const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
                      ['address[]', 'bytes32[]'],
                      [beacons.map((beacon) => beacon.airnodeAddress), beacons.map((beacon) => beacon.templateId)]
                    );
                    expect(await airseekerRegistry.dataFeedIdToDetails(beaconSetId)).to.equal('0x');
                    expect(await airseekerRegistry.dataFeedIsRegistered(beaconSetId)).to.equal(false);
                    expect(
                      await airseekerRegistry.connect(roles.randomPerson).registerDataFeed.staticCall(dataFeedDetails)
                    ).to.equal(beaconSetId);
                    await expect(airseekerRegistry.connect(roles.randomPerson).registerDataFeed(dataFeedDetails))
                      .to.emit(airseekerRegistry, 'RegisteredDataFeed')
                      .withArgs(beaconSetId, dataFeedDetails);
                    expect(await airseekerRegistry.dataFeedIdToDetails(beaconSetId)).to.equal(dataFeedDetails);
                    expect(await airseekerRegistry.dataFeedIsRegistered(beaconSetId)).to.equal(true);
                  });
                });
                context('Data feed is already registered', function () {
                  it('does nothing', async function () {
                    const { roles, airnodes, airseekerRegistry } = await helpers.loadFixture(deploy);
                    const beacons = airnodes
                      .map((airnode) => {
                        return {
                          airnodeAddress: airnode.address,
                          templateId: deriveTemplateId(
                            `OIS title of Airnode with address ${airnode.address}`,
                            'ETH/USD'
                          ),
                        };
                      })
                      .map((beacon) => {
                        return { ...beacon, beaconId: deriveBeaconId(beacon.airnodeAddress, beacon.templateId) };
                      });
                    const beaconSetId = deriveBeaconSetId(
                      beacons.reduce((acc: string[], beacon: any) => {
                        return [...acc, beacon.beaconId];
                      }, [])
                    );
                    const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
                      ['address[]', 'bytes32[]'],
                      [beacons.map((beacon) => beacon.airnodeAddress), beacons.map((beacon) => beacon.templateId)]
                    );
                    await airseekerRegistry.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
                    expect(
                      await airseekerRegistry.connect(roles.randomPerson).registerDataFeed.staticCall(dataFeedDetails)
                    ).to.equal(beaconSetId);
                    await expect(
                      airseekerRegistry.connect(roles.randomPerson).registerDataFeed(dataFeedDetails)
                    ).to.not.emit(airseekerRegistry, 'RegisteredDataFeed');
                    expect(await airseekerRegistry.dataFeedIdToDetails(beaconSetId)).to.equal(dataFeedDetails);
                    expect(await airseekerRegistry.dataFeedIsRegistered(beaconSetId)).to.equal(true);
                  });
                });
              });
              context('Some of the Airnode addresses are zero', function () {
                it('reverts', async function () {
                  const { roles, airnodes, airseekerRegistry } = await helpers.loadFixture(deploy);
                  const beacons = airnodes
                    .map((airnode) => {
                      return {
                        airnodeAddress: airnode.address,
                        templateId: deriveTemplateId(`OIS title of Airnode with address ${airnode.address}`, 'ETH/USD'),
                      };
                    })
                    .map((beacon) => {
                      return { ...beacon, beaconId: deriveBeaconId(beacon.airnodeAddress, beacon.templateId) };
                    });
                  const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address[]', 'bytes32[]'],
                    [
                      [ethers.ZeroAddress, ...beacons.map((beacon) => beacon.airnodeAddress)],
                      [ethers.ZeroHash, ...beacons.map((beacon) => beacon.templateId)],
                    ]
                  );
                  await expect(
                    airseekerRegistry.connect(roles.randomPerson).registerDataFeed(dataFeedDetails)
                  ).to.be.revertedWith('Airnode address zero');
                });
              });
            });
            context('Data feed detail parameter lengths do not match', function () {
              it('reverts', async function () {
                const { roles, airnodes, airseekerRegistry } = await helpers.loadFixture(deploy);
                const beacons = airnodes
                  .map((airnode) => {
                    return {
                      airnodeAddress: airnode.address,
                      templateId: deriveTemplateId(`OIS title of Airnode with address ${airnode.address}`, 'ETH/USD'),
                    };
                  })
                  .map((beacon) => {
                    return { ...beacon, beaconId: deriveBeaconId(beacon.airnodeAddress, beacon.templateId) };
                  });
                const dataFeedDetailsWithParameterLengthMismatch = ethers.AbiCoder.defaultAbiCoder().encode(
                  ['address[]', 'bytes32[]'],
                  [
                    beacons.map((beacon) => beacon.airnodeAddress),
                    [beacons[0]!.templateId, ...beacons.map((beacon) => beacon.templateId)],
                  ]
                );
                await expect(
                  airseekerRegistry
                    .connect(roles.randomPerson)
                    .registerDataFeed(dataFeedDetailsWithParameterLengthMismatch)
                ).to.be.revertedWith('Parameter length mismatch');
              });
            });
          });
          context('Data feed details data trail', function () {
            it('reverts', async function () {
              const { roles, airnodes, airseekerRegistry } = await helpers.loadFixture(deploy);
              const beacons = airnodes
                .map((airnode) => {
                  return {
                    airnodeAddress: airnode.address,
                    templateId: deriveTemplateId(`OIS title of Airnode with address ${airnode.address}`, 'ETH/USD'),
                  };
                })
                .map((beacon) => {
                  return { ...beacon, beaconId: deriveBeaconId(beacon.airnodeAddress, beacon.templateId) };
                });
              const dataFeedDetailsWithTrailingData = `${ethers.AbiCoder.defaultAbiCoder().encode(
                ['address[]', 'bytes32[]'],
                [beacons.map((beacon) => beacon.airnodeAddress), beacons.map((beacon) => beacon.templateId)]
              )}00`;
              await expect(
                airseekerRegistry.connect(roles.randomPerson).registerDataFeed(dataFeedDetailsWithTrailingData)
              ).to.be.revertedWith('Data feed details trail');
            });
          });
        }
      );
      context(
        'Data feed details length exceeds specifications for a Beacon set composed of the maximum number of Beacons',
        function () {
          it('reverts', async function () {
            const { roles, airseekerRegistry } = await helpers.loadFixture(deploy);
            const dataFeedDetailsExceedingMaximumLength = ethers.AbiCoder.defaultAbiCoder().encode(
              ['address[]', 'bytes32[]'],
              [
                Array.from({ length: MAXIMUM_BEACON_COUNT_IN_SET + 1 }).fill(ethers.ZeroAddress),
                Array.from({ length: MAXIMUM_BEACON_COUNT_IN_SET + 1 }).fill(ethers.ZeroHash),
              ]
            );
            await expect(
              airseekerRegistry.connect(roles.randomPerson).registerDataFeed(dataFeedDetailsExceedingMaximumLength)
            ).to.be.revertedWith('Data feed details too long');
          });
        }
      );
    });
    context(
      'Data feed details neither long enough to specify a single Beacon or at least long enough to specify a Beacon set composed of two Beacons',
      function () {
        it('reverts', async function () {
          const { roles, airnodes, airseekerRegistry } = await helpers.loadFixture(deploy);
          await expect(airseekerRegistry.connect(roles.randomPerson).registerDataFeed('0x')).to.be.revertedWith(
            'Data feed details too short'
          );
          const templateId = deriveTemplateId(`OIS title of Airnode with address ${airnodes[0]!.address}`, 'ETH/USD');
          const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'bytes32'],
            [airnodes[0]!.address, templateId]
          );
          await expect(
            airseekerRegistry.connect(roles.randomPerson).registerDataFeed(`${dataFeedDetails}00`)
          ).to.be.revertedWith('Data feed details too short');
        });
      }
    );
  });

  describe('activeDataFeed', function () {
    context('The index belongs to an active data feed ID', function () {
      context('Data feed ID update parameters have been set', function () {
        context('Data feed details have been set', function () {
          context('Data feed is a Beacon set', function () {
            it('returns data feed ID, details, reading, Beacon readings, update parameters and respective signed API URLs', async function () {
              const { roles, airnodes, api3ServerV1, beaconIds, dataFeedId, airseekerRegistry, signedApiUrls } =
                await helpers.loadFixture(deploy);
              await airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(dataFeedId);
              const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
              await airseekerRegistry.connect(roles.owner).setDataFeedIdUpdateParameters(dataFeedId, updateParameters);
              const dataFeedDetails = await registerBeaconSet(airseekerRegistry, 'ETH/USD', airnodes);
              const dataFeedReading = await api3ServerV1.dataFeeds(dataFeedId);
              const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
              const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
              expect(activeDataFeed.dataFeedId).to.equal(dataFeedId);
              expect(activeDataFeed.dapiName).to.equal(ethers.ZeroHash);
              expect(activeDataFeed.dataFeedDetails).to.equal(dataFeedDetails);
              expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
              expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
              expect(activeDataFeed.beaconValues).to.deep.equal(
                beaconReadings.map((beaconReading) => beaconReading.value)
              );
              expect(activeDataFeed.beaconTimestamps).to.deep.equal(
                beaconReadings.map((beaconReading) => beaconReading.timestamp)
              );
              expect(activeDataFeed.updateParameters).to.equal(updateParameters);
              expect(activeDataFeed.signedApiUrls).to.deep.equal(signedApiUrls);
            });
          });
          context('Data feed is a Beacon', function () {
            it('returns data feed ID, details, reading, Beacon reading, update parameters and the respective signed API URL', async function () {
              const { roles, airnodes, api3ServerV1, airseekerRegistry, signedApiUrls } =
                await helpers.loadFixture(deploy);
              const templateId = deriveTemplateId(
                `OIS title of Airnode with address ${airnodes[0]!.address}`,
                'ETH/USD'
              );
              const beaconId = deriveBeaconId(airnodes[0]!.address, templateId);
              const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'bytes32'],
                [airnodes[0]!.address, templateId]
              );
              await airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(beaconId);
              const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
              await airseekerRegistry.connect(roles.owner).setDataFeedIdUpdateParameters(beaconId, updateParameters);
              await airseekerRegistry.registerDataFeed(dataFeedDetails);
              const dataFeedReading = await api3ServerV1.dataFeeds(beaconId);
              const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
              expect(activeDataFeed.dataFeedId).to.equal(beaconId);
              expect(activeDataFeed.dapiName).to.equal(ethers.ZeroHash);
              expect(activeDataFeed.dataFeedDetails).to.equal(dataFeedDetails);
              expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
              expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
              expect(activeDataFeed.beaconValues).to.deep.equal([dataFeedReading.value]);
              expect(activeDataFeed.beaconTimestamps).to.deep.equal([dataFeedReading.timestamp]);
              expect(activeDataFeed.updateParameters).to.equal(updateParameters);
              expect(activeDataFeed.signedApiUrls).to.deep.equal([signedApiUrls[0]]);
            });
          });
        });
        context('Data feed details have not been set', function () {
          it('returns data feed ID, reading and update parameters', async function () {
            const { roles, api3ServerV1, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
            await airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(dataFeedId);
            const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
            await airseekerRegistry.connect(roles.owner).setDataFeedIdUpdateParameters(dataFeedId, updateParameters);
            const dataFeedReading = await api3ServerV1.dataFeeds(dataFeedId);
            const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
            expect(activeDataFeed.dataFeedId).to.equal(dataFeedId);
            expect(activeDataFeed.dapiName).to.equal(ethers.ZeroHash);
            expect(activeDataFeed.dataFeedDetails).to.equal('0x');
            expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
            expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
            expect(activeDataFeed.beaconValues).to.deep.equal([]);
            expect(activeDataFeed.beaconTimestamps).to.deep.equal([]);
            expect(activeDataFeed.updateParameters).to.equal(updateParameters);
            expect(activeDataFeed.signedApiUrls).to.deep.equal([]);
          });
        });
      });
      context('Data feed ID update parameters have not been set', function () {
        context('Data feed details have been set', function () {
          context('Data feed is a Beacon set', function () {
            it('returns data feed ID, details, reading, Beacon readings and respective signed API URLs', async function () {
              const { roles, airnodes, api3ServerV1, beaconIds, dataFeedId, airseekerRegistry, signedApiUrls } =
                await helpers.loadFixture(deploy);
              await airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(dataFeedId);
              const dataFeedDetails = await registerBeaconSet(airseekerRegistry, 'ETH/USD', airnodes);
              const dataFeedReading = await api3ServerV1.dataFeeds(dataFeedId);
              const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
              const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
              expect(activeDataFeed.dataFeedId).to.equal(dataFeedId);
              expect(activeDataFeed.dapiName).to.equal(ethers.ZeroHash);
              expect(activeDataFeed.dataFeedDetails).to.equal(dataFeedDetails);
              expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
              expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
              expect(activeDataFeed.beaconValues).to.deep.equal(
                beaconReadings.map((beaconReading) => beaconReading.value)
              );
              expect(activeDataFeed.beaconTimestamps).to.deep.equal(
                beaconReadings.map((beaconReading) => beaconReading.timestamp)
              );
              expect(activeDataFeed.updateParameters).to.equal('0x');
              expect(activeDataFeed.signedApiUrls).to.deep.equal(signedApiUrls);
            });
          });
          context('Data feed is a Beacon', function () {
            it('returns data feed ID, details, reading, Beacon reading and the respective signed API URL', async function () {
              const { roles, airnodes, api3ServerV1, airseekerRegistry, signedApiUrls } =
                await helpers.loadFixture(deploy);
              const templateId = deriveTemplateId(
                `OIS title of Airnode with address ${airnodes[0]!.address}`,
                'ETH/USD'
              );
              const beaconId = deriveBeaconId(airnodes[0]!.address, templateId);
              const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'bytes32'],
                [airnodes[0]!.address, templateId]
              );
              await airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(beaconId);
              await airseekerRegistry.registerDataFeed(dataFeedDetails);
              const dataFeedReading = await api3ServerV1.dataFeeds(beaconId);
              const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
              expect(activeDataFeed.dataFeedId).to.equal(beaconId);
              expect(activeDataFeed.dapiName).to.equal(ethers.ZeroHash);
              expect(activeDataFeed.dataFeedDetails).to.equal(dataFeedDetails);
              expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
              expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
              expect(activeDataFeed.beaconValues).to.deep.equal([dataFeedReading.value]);
              expect(activeDataFeed.beaconTimestamps).to.deep.equal([dataFeedReading.timestamp]);
              expect(activeDataFeed.updateParameters).to.equal('0x');
              expect(activeDataFeed.signedApiUrls).to.deep.equal([signedApiUrls[0]]);
            });
          });
        });
        context('Data feed details have not been set', function () {
          it('returns data feed ID and reading', async function () {
            const { roles, api3ServerV1, dataFeedId, airseekerRegistry } = await helpers.loadFixture(deploy);
            await airseekerRegistry.connect(roles.owner).setDataFeedIdToBeActivated(dataFeedId);
            const dataFeedReading = await api3ServerV1.dataFeeds(dataFeedId);
            const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
            expect(activeDataFeed.dataFeedId).to.equal(dataFeedId);
            expect(activeDataFeed.dapiName).to.equal(ethers.ZeroHash);
            expect(activeDataFeed.dataFeedDetails).to.equal('0x');
            expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
            expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
            expect(activeDataFeed.beaconValues).to.deep.equal([]);
            expect(activeDataFeed.beaconTimestamps).to.deep.equal([]);
            expect(activeDataFeed.updateParameters).to.equal('0x');
            expect(activeDataFeed.signedApiUrls).to.deep.equal([]);
          });
        });
      });
    });
    context('The index belongs to an active dAPI name', function () {
      context('dAPI name has been set at Api3ServerV1', function () {
        context('dAPI name update parameters have been set', function () {
          context('Data feed details have been set', function () {
            context('Data feed is a Beacon set', function () {
              it('returns data feed ID, dAPI name, details, reading, Beacon readings, update parameters and respective signed API URLs', async function () {
                const {
                  roles,
                  airnodes,
                  api3ServerV1,
                  beaconIds,
                  dataFeedId,
                  dapiName,
                  airseekerRegistry,
                  signedApiUrls,
                } = await helpers.loadFixture(deploy);
                await airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName);
                const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
                await airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(dapiName, updateParameters);
                const dataFeedDetails = await registerBeaconSet(airseekerRegistry, 'ETH/USD', airnodes);
                const dataFeedReading = await api3ServerV1.dataFeeds(dataFeedId);
                const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
                const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
                expect(activeDataFeed.dataFeedId).to.equal(dataFeedId);
                expect(activeDataFeed.dapiName).to.equal(dapiName);
                expect(activeDataFeed.dataFeedDetails).to.equal(dataFeedDetails);
                expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
                expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
                expect(activeDataFeed.beaconValues).to.deep.equal(
                  beaconReadings.map((beaconReading) => beaconReading.value)
                );
                expect(activeDataFeed.beaconTimestamps).to.deep.equal(
                  beaconReadings.map((beaconReading) => beaconReading.timestamp)
                );
                expect(activeDataFeed.updateParameters).to.equal(updateParameters);
                expect(activeDataFeed.signedApiUrls).to.deep.equal(signedApiUrls);
              });
            });
            context('Data feed is a Beacon', function () {
              it('returns data feed ID, dAPI name, details, reading, Beacon reading, update parameters and the respective signed API URL', async function () {
                const { roles, airnodes, api3ServerV1, dapiName, airseekerRegistry, signedApiUrls } =
                  await helpers.loadFixture(deploy);
                const templateId = deriveTemplateId(
                  `OIS title of Airnode with address ${airnodes[0]!.address}`,
                  'ETH/USD'
                );
                const beaconId = deriveBeaconId(airnodes[0]!.address, templateId);
                const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
                  ['address', 'bytes32'],
                  [airnodes[0]!.address, templateId]
                );
                await api3ServerV1.connect(roles.api3ServerV1Manager).setDapiName(dapiName, beaconId);
                await airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName);
                const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
                await airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(dapiName, updateParameters);
                await airseekerRegistry.connect(roles.owner).registerDataFeed(dataFeedDetails);
                const dataFeedReading = await api3ServerV1.dataFeeds(beaconId);
                const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
                expect(activeDataFeed.dataFeedId).to.equal(beaconId);
                expect(activeDataFeed.dapiName).to.equal(dapiName);
                expect(activeDataFeed.dataFeedDetails).to.equal(dataFeedDetails);
                expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
                expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
                expect(activeDataFeed.beaconValues).to.deep.equal([dataFeedReading.value]);
                expect(activeDataFeed.beaconTimestamps).to.deep.equal([dataFeedReading.timestamp]);
                expect(activeDataFeed.updateParameters).to.equal(updateParameters);
                expect(activeDataFeed.signedApiUrls).to.deep.equal([signedApiUrls[0]]);
              });
            });
          });
          context('Data feed details have not been set', function () {
            it('returns data feed ID, dAPI name, reading and update parameters', async function () {
              const { roles, api3ServerV1, dataFeedId, dapiName, airseekerRegistry } =
                await helpers.loadFixture(deploy);
              await airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName);
              const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
              await airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(dapiName, updateParameters);
              const dataFeedReading = await api3ServerV1.dataFeeds(dataFeedId);
              const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
              expect(activeDataFeed.dataFeedId).to.equal(dataFeedId);
              expect(activeDataFeed.dapiName).to.equal(dapiName);
              expect(activeDataFeed.dataFeedDetails).to.equal('0x');
              expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
              expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
              expect(activeDataFeed.beaconValues).to.deep.equal([]);
              expect(activeDataFeed.beaconTimestamps).to.deep.equal([]);
              expect(activeDataFeed.updateParameters).to.equal(updateParameters);
              expect(activeDataFeed.signedApiUrls).to.deep.equal([]);
            });
          });
        });
        context('dAPI name update parameters have not been set', function () {
          context('Data feed details have been set', function () {
            context('Data feed is a Beacon set', function () {
              it('returns data feed ID, dAPI name, details, reading, Beacon readings and respective signed API URLs', async function () {
                const {
                  roles,
                  airnodes,
                  api3ServerV1,
                  beaconIds,
                  dataFeedId,
                  dapiName,
                  airseekerRegistry,
                  signedApiUrls,
                } = await helpers.loadFixture(deploy);
                await airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName);
                const dataFeedDetails = await registerBeaconSet(airseekerRegistry, 'ETH/USD', airnodes);
                const dataFeedReading = await api3ServerV1.dataFeeds(dataFeedId);
                const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
                const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
                expect(activeDataFeed.dataFeedId).to.equal(dataFeedId);
                expect(activeDataFeed.dapiName).to.equal(dapiName);
                expect(activeDataFeed.dataFeedDetails).to.equal(dataFeedDetails);
                expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
                expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
                expect(activeDataFeed.beaconValues).to.deep.equal(
                  beaconReadings.map((beaconReading) => beaconReading.value)
                );
                expect(activeDataFeed.beaconTimestamps).to.deep.equal(
                  beaconReadings.map((beaconReading) => beaconReading.timestamp)
                );
                expect(activeDataFeed.updateParameters).to.equal('0x');
                expect(activeDataFeed.signedApiUrls).to.deep.equal(signedApiUrls);
              });
            });
            context('Data feed is a Beacon', function () {
              it('returns data feed ID, dAPI name, details, reading, Beacon reading and the respective signed API URL', async function () {
                const { roles, airnodes, api3ServerV1, dataFeedId, dapiName, airseekerRegistry, signedApiUrls } =
                  await helpers.loadFixture(deploy);
                const templateId = deriveTemplateId(
                  `OIS title of Airnode with address ${airnodes[0]!.address}`,
                  'ETH/USD'
                );
                const beaconId = deriveBeaconId(airnodes[0]!.address, templateId);
                const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
                  ['address', 'bytes32'],
                  [airnodes[0]!.address, templateId]
                );
                await api3ServerV1.connect(roles.api3ServerV1Manager).setDapiName(dapiName, beaconId);
                await airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName);
                await airseekerRegistry.connect(roles.owner).registerDataFeed(dataFeedDetails);
                const dataFeedReading = await api3ServerV1.dataFeeds(dataFeedId);
                const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
                expect(activeDataFeed.dataFeedId).to.equal(beaconId);
                expect(activeDataFeed.dapiName).to.equal(dapiName);
                expect(activeDataFeed.dataFeedDetails).to.equal(dataFeedDetails);
                expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
                expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
                expect(activeDataFeed.beaconValues).to.deep.equal([dataFeedReading.value]);
                expect(activeDataFeed.beaconTimestamps).to.deep.equal([dataFeedReading.timestamp]);
                expect(activeDataFeed.updateParameters).to.equal('0x');
                expect(activeDataFeed.signedApiUrls).to.deep.equal([signedApiUrls[0]]);
              });
            });
          });
          context('Data feed details have not been set', function () {
            it('returns data feed ID, dAPI name, details, reading and respective signed API URLs', async function () {
              const { roles, api3ServerV1, dataFeedId, dapiName, airseekerRegistry } =
                await helpers.loadFixture(deploy);
              await airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName);
              const dataFeedReading = await api3ServerV1.dataFeeds(dataFeedId);
              const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
              expect(activeDataFeed.dataFeedId).to.equal(dataFeedId);
              expect(activeDataFeed.dapiName).to.equal(dapiName);
              expect(activeDataFeed.dataFeedDetails).to.equal('0x');
              expect(activeDataFeed.dataFeedValue).to.equal(dataFeedReading.value);
              expect(activeDataFeed.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
              expect(activeDataFeed.beaconValues).to.deep.equal([]);
              expect(activeDataFeed.beaconTimestamps).to.deep.equal([]);
              expect(activeDataFeed.updateParameters).to.equal('0x');
              expect(activeDataFeed.signedApiUrls).to.deep.equal([]);
            });
          });
        });
      });
      context('dAPI name has not been set at Api3ServerV1', function () {
        context('dAPI name update parameters have been set', function () {
          it('returns dAPI name and update parameters', async function () {
            const { roles, api3ServerV1, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
            await api3ServerV1.connect(roles.api3ServerV1Manager).setDapiName(dapiName, ethers.ZeroHash);
            await airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName);
            const updateParameters = encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60);
            await airseekerRegistry.connect(roles.owner).setDapiNameUpdateParameters(dapiName, updateParameters);
            const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
            expect(activeDataFeed.dataFeedId).to.equal(ethers.ZeroHash);
            expect(activeDataFeed.dapiName).to.equal(dapiName);
            expect(activeDataFeed.dataFeedDetails).to.equal('0x');
            expect(activeDataFeed.dataFeedValue).to.equal(0);
            expect(activeDataFeed.dataFeedTimestamp).to.equal(0);
            expect(activeDataFeed.beaconValues).to.deep.equal([]);
            expect(activeDataFeed.beaconTimestamps).to.deep.equal([]);
            expect(activeDataFeed.updateParameters).to.equal(updateParameters);
            expect(activeDataFeed.signedApiUrls).to.deep.equal([]);
          });
        });
        context('dAPI name update parameters have not been set', function () {
          it('returns dAPI name', async function () {
            const { roles, api3ServerV1, dapiName, airseekerRegistry } = await helpers.loadFixture(deploy);
            await api3ServerV1.connect(roles.api3ServerV1Manager).setDapiName(dapiName, ethers.ZeroHash);
            await airseekerRegistry.connect(roles.owner).setDapiNameToBeActivated(dapiName);
            const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
            expect(activeDataFeed.dataFeedId).to.equal(ethers.ZeroHash);
            expect(activeDataFeed.dapiName).to.equal(dapiName);
            expect(activeDataFeed.dataFeedDetails).to.equal('0x');
            expect(activeDataFeed.dataFeedValue).to.equal(0);
            expect(activeDataFeed.dataFeedTimestamp).to.equal(0);
            expect(activeDataFeed.beaconValues).to.deep.equal([]);
            expect(activeDataFeed.beaconTimestamps).to.deep.equal([]);
            expect(activeDataFeed.updateParameters).to.equal('0x');
            expect(activeDataFeed.signedApiUrls).to.deep.equal([]);
          });
        });
      });
    });
    context('The index does not belong to an active data feed ID or dAPI name', function () {
      it('returns nothing', async function () {
        const { airseekerRegistry } = await helpers.loadFixture(deploy);
        const activeDataFeed = await airseekerRegistry.activeDataFeed(0);
        expect(activeDataFeed.dataFeedId).to.equal(ethers.ZeroHash);
        expect(activeDataFeed.dapiName).to.equal(ethers.ZeroHash);
        expect(activeDataFeed.dataFeedDetails).to.equal('0x');
        expect(activeDataFeed.dataFeedValue).to.equal(0);
        expect(activeDataFeed.dataFeedTimestamp).to.equal(0);
        expect(activeDataFeed.beaconValues).to.deep.equal([]);
        expect(activeDataFeed.beaconTimestamps).to.deep.equal([]);
        expect(activeDataFeed.updateParameters).to.equal('0x');
        expect(activeDataFeed.signedApiUrls).to.deep.equal([]);
      });
    });
  });
});

module.exports = {
  updateBeaconSet,
  readBeacons,
  encodeUpdateParameters,
};
