import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import type { AddressLike, BigNumberish, BytesLike, HDNodeWallet } from 'ethers';
import { artifacts, ethers } from 'hardhat';

import type { Api3Market } from '../src/index';

import { updateBeaconSet, readBeacons, encodeUpdateParameters } from './AirseekerRegistry.sol';
import { signHash } from './HashRegistry.sol';

describe('Api3Market', function () {
  const MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH = 5;
  const DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE = ethers.solidityPackedKeccak256(
    ['string'],
    ['dAPI management Merkle root']
  );
  const DAPI_PRICING_MERKLE_ROOT_HASH_TYPE = ethers.solidityPackedKeccak256(['string'], ['dAPI pricing Merkle root']);
  const SIGNED_API_URL_MERKLE_ROOT_HASH_TYPE = ethers.solidityPackedKeccak256(
    ['string'],
    ['Signed API URL Merkle root']
  );
  const SIGNATURE_DELEGATION_HASH_TYPE = ethers.solidityPackedKeccak256(
    ['string'],
    ['Api3Market signature delegation']
  );
  const MAXIMUM_DAPI_UPDATE_AGE = 24 * 60 * 60;

  async function computeRequiredPaymentAmount(
    api3Market: Api3Market,
    dapiName: BytesLike,
    updateParameters: BytesLike,
    duration: number,
    price: BigNumberish,
    sponsorWalletAddress: AddressLike
  ): Promise<BigNumberish> {
    const expectedSponsorWalletBalanceAfterSubscriptionIsAdded =
      await api3Market.computeExpectedSponsorWalletBalanceAfterSubscriptionIsAdded(
        dapiName,
        updateParameters,
        duration,
        price
      );
    const sponsorWalletBalance = await ethers.provider.getBalance(sponsorWalletAddress);
    return expectedSponsorWalletBalanceAfterSubscriptionIsAdded > sponsorWalletBalance
      ? expectedSponsorWalletBalanceAfterSubscriptionIsAdded - sponsorWalletBalance
      : 0;
  }

  function computeSubscriptionId(dapiName: BytesLike, updateParameters: BytesLike) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [dapiName, ethers.keccak256(updateParameters)]);
  }

  async function deploy() {
    const roleNames = ['deployer', 'api3ServerV1Manager', 'owner', 'randomPerson'];
    const accounts = await ethers.getSigners();
    const roles: Record<string, HardhatEthersSigner> = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});
    const airnodes: HDNodeWallet[] = Array.from({ length: 3 }).map(() => ethers.Wallet.createRandom());
    const sortedDapiManagementMerkleRootSigners = Array.from({ length: 5 })
      .map(() => ethers.Wallet.createRandom())
      .sort((a, b) => (BigInt(a.address) > BigInt(b.address) ? 1 : -1));
    const sortedDapiPricingMerkleRootSigners = Array.from({ length: 4 })
      .map(() => ethers.Wallet.createRandom())
      .sort((a, b) => (BigInt(a.address) > BigInt(b.address) ? 1 : -1));
    const sortedSignedApiUrlMerkleRootSigners = Array.from({ length: 3 })
      .map(() => ethers.Wallet.createRandom())
      .sort((a, b) => (BigInt(a.address) > BigInt(b.address) ? 1 : -1));
    const sponsorWalletAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));

    const AccessControlRegistry = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await AccessControlRegistry.deploy();

    const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';
    const Api3ServerV1 = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
    const api3ServerV1 = await Api3ServerV1.deploy(
      accessControlRegistry.getAddress(),
      api3ServerV1AdminRoleDescription,
      roles.api3ServerV1Manager!.address
    );

    const {
      templateIds,
      beaconIds,
      beaconSetId: dataFeedId,
    } = await updateBeaconSet(
      api3ServerV1,
      'ETH/USD',
      airnodes,
      await helpers.time.latest(),
      ethers.parseEther('2200')
    );
    const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address[]', 'bytes32[]'],
      [airnodes.map((airnode) => airnode.address), templateIds]
    );
    const dapiName = ethers.encodeBytes32String('ETH/USD');

    const ProxyFactory = await ethers.getContractFactory('ProxyFactory', roles.deployer);
    const proxyFactory = await ProxyFactory.deploy(api3ServerV1.getAddress());

    const Api3Market = await ethers.getContractFactory('Api3Market', roles.deployer);
    const api3Market = await Api3Market.deploy(roles.owner!.address, proxyFactory.getAddress());

    await api3Market.connect(roles.owner).setSigners(
      DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE,
      sortedDapiManagementMerkleRootSigners.map(
        (sortedDapiManagementMerkleRootSigner) => sortedDapiManagementMerkleRootSigner.address
      )
    );
    await api3Market.connect(roles.owner).setSigners(
      DAPI_PRICING_MERKLE_ROOT_HASH_TYPE,
      sortedDapiPricingMerkleRootSigners.map(
        (sortedDapiPricingMerkleRootSigner) => sortedDapiPricingMerkleRootSigner.address
      )
    );
    await api3Market.connect(roles.owner).setSigners(
      SIGNED_API_URL_MERKLE_ROOT_HASH_TYPE,
      sortedSignedApiUrlMerkleRootSigners.map(
        (sortedSignedApiUrlMerkleRootSigner) => sortedSignedApiUrlMerkleRootSigner.address
      )
    );

    await accessControlRegistry
      .connect(roles.api3ServerV1Manager)
      .initializeRoleAndGrantToSender(
        ethers.solidityPackedKeccak256(['address'], [roles.api3ServerV1Manager!.address]),
        api3ServerV1AdminRoleDescription
      );
    await accessControlRegistry
      .connect(roles.api3ServerV1Manager)
      .initializeRoleAndGrantToSender(await api3ServerV1.adminRole(), 'dAPI name setter');
    await accessControlRegistry
      .connect(roles.api3ServerV1Manager)
      .grantRole(await api3ServerV1.dapiNameSetterRole(), api3Market.getAddress());

    const AirseekerRegistry = await artifacts.readArtifact('AirseekerRegistry');
    const airseekerRegistry: any = await ethers.getContractAt(
      AirseekerRegistry.abi,
      await api3Market.airseekerRegistry(),
      roles.deployer
    );

    const MockContractWithNoDefaultPayable = await ethers.getContractFactory(
      'MockContractWithNoDefaultPayable',
      roles.deployer
    );
    const mockContractWithNoDefaultPayable = await MockContractWithNoDefaultPayable.deploy();

    const dapiCount = 150;
    const chainCount = 20;
    const updateParametersVarietyCount = 4;
    const apiProviderCount = 15;

    const hashTimestamp = await helpers.time.latest();
    // Normally, a dAPI management Merkle tree should have a single leaf per
    // dAPI name. We are adding multiple below for test purposes.
    const dapiManagementMerkleLeaves: Record<
      string,
      {
        values: { dapiName: BytesLike; dataFeedId: BytesLike; sponsorWalletAddress: AddressLike };
        proof?: BytesLike[];
      }
    > = {
      ethUsd: {
        values: {
          dapiName,
          dataFeedId,
          sponsorWalletAddress,
        },
      },
      ethUsdWithNoDefaultPayableSponsorWallet: {
        values: {
          dapiName,
          dataFeedId,
          sponsorWalletAddress: await mockContractWithNoDefaultPayable.getAddress(),
        },
      },
      ethUsdWithZeroDataFeedId: {
        values: {
          dapiName,
          dataFeedId: ethers.ZeroHash,
          sponsorWalletAddress,
        },
      },
      ethUsdWithZeroSponsorWalletAddress: {
        values: {
          dapiName,
          dataFeedId,
          sponsorWalletAddress: ethers.ZeroAddress,
        },
      },
      ethUsdWithZeroDataFeedIdAndSponsorWalletAddress: {
        values: {
          dapiName,
          dataFeedId: ethers.ZeroHash,
          sponsorWalletAddress: ethers.ZeroAddress,
        },
      },
      ethUsdWithASingleBeacon: {
        values: {
          dapiName,
          dataFeedId: beaconIds[0]!,
          sponsorWalletAddress,
        },
      },
    };

    const dapiManagementMerkleTree = StandardMerkleTree.of(
      [
        ...Array.from({ length: dapiCount * chainCount * updateParametersVarietyCount }).map(() => [
          ethers.hexlify(ethers.randomBytes(32)),
          ethers.hexlify(ethers.randomBytes(32)),
          ethers.getAddress(ethers.hexlify(ethers.randomBytes(20))),
        ]),
        ...Object.values(dapiManagementMerkleLeaves).map((dapiManagementMerkleLeaf) => [
          dapiManagementMerkleLeaf.values.dapiName,
          dapiManagementMerkleLeaf.values.dataFeedId,
          dapiManagementMerkleLeaf.values.sponsorWalletAddress,
        ]),
      ]
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value),
      ['bytes32', 'bytes32', 'address']
    );
    Object.keys(dapiManagementMerkleLeaves).map((dapiManagementMerkleLeafKey) => {
      dapiManagementMerkleLeaves[dapiManagementMerkleLeafKey]!.proof = dapiManagementMerkleTree.getProof([
        dapiManagementMerkleLeaves[dapiManagementMerkleLeafKey]!.values.dapiName,
        dapiManagementMerkleLeaves[dapiManagementMerkleLeafKey]!.values.dataFeedId,
        dapiManagementMerkleLeaves[dapiManagementMerkleLeafKey]!.values.sponsorWalletAddress,
      ]);
    });
    const dapiManagementMerkleRoot = dapiManagementMerkleTree.root;
    await api3Market.registerHash(
      DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE,
      dapiManagementMerkleTree.root,
      hashTimestamp,
      await signHash(
        sortedDapiManagementMerkleRootSigners,
        DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE,
        dapiManagementMerkleTree.root,
        hashTimestamp
      )
    );

    // Normally, a dAPI pricing Merkle tree should not have entries with
    // incomparable update parameters. We are adding such entries below for
    // test purposes.
    const dapiPricingMerkleLeaves: Record<
      string,
      {
        values: {
          dapiName: BytesLike;
          chainId: BigNumberish;
          updateParameters: BytesLike;
          duration: number;
          price: BigNumberish;
        };
        proof?: string[];
      }
    > = {
      onePercentDeviationThresholdForOneMonth: {
        values: {
          dapiName,
          chainId: '31337',
          updateParameters: encodeUpdateParameters(1_000_000, 0, 24 * 60 * 60),
          duration: 30 * 24 * 60 * 60,
          price: ethers.parseEther('1'),
        },
      },
      twoPercentDeviationThresholdForTwoMonths: {
        values: {
          dapiName,
          chainId: '31337',
          updateParameters: encodeUpdateParameters(2 * 1_000_000, 0, 24 * 60 * 60),
          duration: 2 * 30 * 24 * 60 * 60,
          price: ethers.parseEther('0.9'),
        },
      },
      threePercentDeviationThresholdForThreeMonths: {
        values: {
          dapiName,
          chainId: '31337',
          updateParameters: encodeUpdateParameters(3 * 1_000_000, 0, 24 * 60 * 60),
          duration: 3 * 30 * 24 * 60 * 60,
          price: ethers.parseEther('0.8'),
        },
      },
      fourPercentDeviationThresholdForFourMonths: {
        values: {
          dapiName,
          chainId: '31337',
          updateParameters: encodeUpdateParameters(4 * 1_000_000, 0, 24 * 60 * 60),
          duration: 4 * 30 * 24 * 60 * 60,
          price: ethers.parseEther('0.7'),
        },
      },
      fivePercentDeviationThresholdForFiveMonths: {
        values: {
          dapiName,
          chainId: '31337',
          updateParameters: encodeUpdateParameters(5 * 1_000_000, 0, 24 * 60 * 60),
          duration: 5 * 30 * 24 * 60 * 60,
          price: ethers.parseEther('0.6'),
        },
      },
      sixPercentDeviationThresholdForSixMonths: {
        values: {
          dapiName,
          chainId: '31337',
          updateParameters: encodeUpdateParameters(6 * 1_000_000, 0, 24 * 60 * 60),
          duration: 6 * 30 * 24 * 60 * 60,
          price: ethers.parseEther('0.5'),
        },
      },
      sixPercentDeviationThresholdForOneMonth: {
        values: {
          dapiName,
          chainId: '31337',
          updateParameters: encodeUpdateParameters(6 * 1_000_000, 0, 24 * 60 * 60),
          duration: 30 * 24 * 60 * 60,
          price: ethers.parseEther('0.1'),
        },
      },
      sixPercentDeviationThresholdForSixMonthsWithNonZeroDeviationReference: {
        values: {
          dapiName,
          chainId: '31337',
          updateParameters: encodeUpdateParameters(6 * 1_000_000, -100, 24 * 60 * 60),
          duration: 6 * 30 * 24 * 60 * 60,
          price: ethers.parseEther('1'),
        },
      },
      sixPercentDeviationThresholdForSixMonthsWithHourlyHeartbeatInterval: {
        values: {
          dapiName,
          chainId: '31337',
          updateParameters: encodeUpdateParameters(6 * 1_000_000, 0, 60 * 60),
          duration: 6 * 30 * 24 * 60 * 60,
          price: ethers.parseEther('1'),
        },
      },
    };
    const dapiPricingMerkleTree = StandardMerkleTree.of(
      [
        ...Array.from({ length: dapiCount * chainCount * updateParametersVarietyCount }).map(() => [
          ethers.hexlify(ethers.randomBytes(32)),
          Math.floor(Math.random() * 1000),
          ethers.hexlify(ethers.randomBytes(96)),
          Math.floor(Math.random() * 1000),
          Math.floor(Math.random() * 1000),
        ]),
        ...Object.values(dapiPricingMerkleLeaves).map((dapiPricingMerkleLeaf) => [
          dapiPricingMerkleLeaf.values.dapiName,
          dapiPricingMerkleLeaf.values.chainId,
          dapiPricingMerkleLeaf.values.updateParameters,
          dapiPricingMerkleLeaf.values.duration,
          dapiPricingMerkleLeaf.values.price,
        ]),
      ]
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value),
      ['bytes32', 'uint32', 'bytes', 'uint256', 'uint256']
    );
    Object.keys(dapiPricingMerkleLeaves).map((dapiPricingMerkleLeafKey) => {
      dapiPricingMerkleLeaves[dapiPricingMerkleLeafKey]!.proof = dapiPricingMerkleTree.getProof([
        dapiPricingMerkleLeaves[dapiPricingMerkleLeafKey]!.values.dapiName,
        dapiPricingMerkleLeaves[dapiPricingMerkleLeafKey]!.values.chainId,
        dapiPricingMerkleLeaves[dapiPricingMerkleLeafKey]!.values.updateParameters,
        dapiPricingMerkleLeaves[dapiPricingMerkleLeafKey]!.values.duration,
        dapiPricingMerkleLeaves[dapiPricingMerkleLeafKey]!.values.price,
      ]);
    });
    const dapiPricingMerkleRoot = dapiPricingMerkleTree.root;
    await api3Market.registerHash(
      DAPI_PRICING_MERKLE_ROOT_HASH_TYPE,
      dapiPricingMerkleTree.root,
      hashTimestamp,
      await signHash(
        sortedDapiPricingMerkleRootSigners,
        DAPI_PRICING_MERKLE_ROOT_HASH_TYPE,
        dapiPricingMerkleTree.root,
        hashTimestamp
      )
    );

    const signedApiUrlMerkleLeaves: Record<
      string,
      {
        values: { airnodeAddress: string; signedApiUrl: string };
        proof?: string[];
      }
    > = airnodes.reduce((acc, airnode) => {
      return {
        ...acc,
        [airnode.address]: {
          values: {
            airnodeAddress: airnode.address,
            signedApiUrl: `https://signed-api.airnode.com/${airnode.address}`,
          },
        },
      };
    }, {});
    const signedApiUrlMerkleTree = StandardMerkleTree.of(
      [
        ...Array.from({ length: apiProviderCount }).map(() => [
          ethers.getAddress(ethers.hexlify(ethers.randomBytes(20))),
          ethers.hexlify(ethers.randomBytes(256)),
        ]),
        ...Object.values(signedApiUrlMerkleLeaves).map((signedApiUrlMerkleLeaf) => [
          signedApiUrlMerkleLeaf.values.airnodeAddress,
          signedApiUrlMerkleLeaf.values.signedApiUrl,
        ]),
      ]
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value),
      ['address', 'string']
    );
    Object.keys(signedApiUrlMerkleLeaves).map((signedApiUrlMerkleLeafKey) => {
      signedApiUrlMerkleLeaves[signedApiUrlMerkleLeafKey]!.proof = signedApiUrlMerkleTree.getProof([
        signedApiUrlMerkleLeaves[signedApiUrlMerkleLeafKey]!.values.airnodeAddress,
        signedApiUrlMerkleLeaves[signedApiUrlMerkleLeafKey]!.values.signedApiUrl,
      ]);
    });
    const signedApiUrlMerkleRoot = signedApiUrlMerkleTree.root;
    await api3Market.registerHash(
      SIGNED_API_URL_MERKLE_ROOT_HASH_TYPE,
      signedApiUrlMerkleTree.root,
      hashTimestamp,
      await signHash(
        sortedSignedApiUrlMerkleRootSigners,
        SIGNED_API_URL_MERKLE_ROOT_HASH_TYPE,
        signedApiUrlMerkleTree.root,
        hashTimestamp
      )
    );

    return {
      accessControlRegistry,
      airnodes,
      airseekerRegistry,
      api3Market,
      api3ServerV1,
      beaconIds,
      dapiManagementMerkleLeaves,
      dapiManagementMerkleRoot,
      dapiName,
      dapiPricingMerkleLeaves,
      dapiPricingMerkleRoot,
      dataFeedDetails,
      dataFeedId,
      mockContractWithNoDefaultPayable,
      proxyFactory,
      roles,
      signedApiUrlMerkleLeaves,
      signedApiUrlMerkleRoot,
      templateIds,
    };
  }

  describe('constructor', function () {
    context('ProxyFactory address belongs to a contract with the expected interface', function () {
      it('constructs', async function () {
        const { roles, api3ServerV1, proxyFactory, api3Market, airseekerRegistry } = await helpers.loadFixture(deploy);
        expect(await api3Market.MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH()).to.equal(MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH);
        expect(await api3Market.DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE()).to.equal(
          DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE
        );
        expect(await api3Market.DAPI_PRICING_MERKLE_ROOT_HASH_TYPE()).to.equal(DAPI_PRICING_MERKLE_ROOT_HASH_TYPE);
        expect(await api3Market.SIGNED_API_URL_MERKLE_ROOT_HASH_TYPE()).to.equal(SIGNED_API_URL_MERKLE_ROOT_HASH_TYPE);
        expect(await api3Market.MAXIMUM_DAPI_UPDATE_AGE()).to.equal(MAXIMUM_DAPI_UPDATE_AGE);
        expect(await api3Market.signatureDelegationHashType()).to.equal(SIGNATURE_DELEGATION_HASH_TYPE);
        expect(await api3Market.owner()).to.equal(roles.owner!.address);
        expect(await api3Market.proxyFactory()).to.equal(await proxyFactory.getAddress());
        expect(await api3Market.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
        expect(await airseekerRegistry.owner()).to.equal(await api3Market.getAddress());
        expect(await airseekerRegistry.api3ServerV1()).to.equal(await api3ServerV1.getAddress());
      });
    });
    context('ProxyFactory address belongs to a contract without the expected interface', function () {
      it('reverts', async function () {
        const { roles, api3ServerV1 } = await helpers.loadFixture(deploy);
        const Api3Market = await ethers.getContractFactory('Api3Market', roles.deployer);
        await expect(Api3Market.deploy(roles.owner!.address, api3ServerV1.getAddress())).to.be.revertedWithoutReason();
      });
    });
    context('ProxyFactory address does not belong to a contract', function () {
      it('reverts', async function () {
        const { roles } = await helpers.loadFixture(deploy);
        const Api3Market = await ethers.getContractFactory('Api3Market', roles.deployer);
        await expect(
          Api3Market.deploy(roles.owner!.address, roles.randomPerson!.address)
        ).to.be.revertedWithoutReason();
      });
    });
  });

  describe('renounceOwnership', function () {
    it('reverts', async function () {
      const { roles, api3Market } = await helpers.loadFixture(deploy);
      await expect(api3Market.connect(roles.owner).renounceOwnership()).to.be.revertedWith(
        'Ownership cannot be renounced'
      );
    });
  });

  describe('transferOwnership', function () {
    it('reverts', async function () {
      const { roles, api3Market } = await helpers.loadFixture(deploy);
      await expect(api3Market.connect(roles.owner).transferOwnership(roles.randomPerson!.address)).to.be.revertedWith(
        'Ownership cannot be transferred'
      );
    });
  });

  describe('buySubscription', function () {
    context('Arguments are valid', function () {
      context('New subscription can be added to the queue', function () {
        context('Payment is enough to get the sponsor wallet balance over the expected amount', function () {
          context('Payment amount is not zero', function () {
            context('Payment transfer succeeds', function () {
              context('Subscription is added to the start of the queue', function () {
                context('dAPI name needs to be updated', function () {
                  it('updates dAPI name and buys subscription', async function () {
                    const {
                      roles,
                      api3ServerV1,
                      beaconIds,
                      dataFeedDetails,
                      api3Market,
                      airseekerRegistry,
                      dapiManagementMerkleLeaves,
                      dapiManagementMerkleRoot,
                      dapiPricingMerkleLeaves,
                      dapiPricingMerkleRoot,
                    } = await helpers.loadFixture(deploy);
                    await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
                    const paymentAmount = await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    );
                    const subscriptionTimestamp = (await helpers.time.latest()) + 1;
                    await helpers.time.setNextBlockTimestamp(subscriptionTimestamp);
                    const subscriptionId = computeSubscriptionId(
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters
                    );
                    expect(
                      await api3Market
                        .connect(roles.randomPerson)
                        .buySubscription.staticCall(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration),
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof,
                            ]
                          ),
                          {
                            value: paymentAmount,
                          }
                        )
                    ).to.equal(subscriptionId);
                    await expect(
                      api3Market
                        .connect(roles.randomPerson)
                        .buySubscription(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof,
                            ]
                          ),
                          {
                            value: paymentAmount,
                          }
                        )
                    )
                      .to.emit(api3Market, 'UpdatedCurrentSubscriptionId')
                      .withArgs(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        computeSubscriptionId(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters
                        )
                      )
                      .to.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters')
                      .withArgs(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters
                      )
                      .to.emit(airseekerRegistry, 'ActivatedDapiName')
                      .withArgs(dapiManagementMerkleLeaves.ethUsd!.values.dapiName)
                      .to.emit(api3ServerV1, 'SetDapiName')
                      .withArgs(
                        dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        await api3Market.getAddress()
                      )
                      .to.emit(api3Market, 'BoughtSubscription')
                      .withArgs(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        subscriptionId,
                        dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                        dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                        paymentAmount
                      );
                    const dataFeedReading = await api3ServerV1.dataFeeds(
                      dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId
                    );
                    const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
                    const dapiData = await api3Market.getDapiData(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
                    expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
                    expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
                    expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
                    expect(dapiData.beaconValues).to.deep.equal(
                      beaconReadings.map((beaconReading) => beaconReading.value)
                    );
                    expect(dapiData.beaconTimestamps).to.deep.equal(
                      beaconReadings.map((beaconReading) => beaconReading.timestamp)
                    );
                    expect(dapiData.updateParameters).to.deep.equal([
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                    ]);
                    expect(dapiData.endTimestamps).to.deep.equal([
                      subscriptionTimestamp +
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                    ]);
                    expect(dapiData.dailyPrices).to.deep.equal([
                      (BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price) *
                        BigInt(24 * 60 * 60)) /
                        BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration),
                    ]);
                  });
                });
                context('dAPI name does not need to be updated', function () {
                  it('buys subscription', async function () {
                    const {
                      roles,
                      api3ServerV1,
                      beaconIds,
                      dataFeedDetails,
                      api3Market,
                      airseekerRegistry,
                      dapiManagementMerkleLeaves,
                      dapiManagementMerkleRoot,
                      dapiPricingMerkleLeaves,
                      dapiPricingMerkleRoot,
                    } = await helpers.loadFixture(deploy);
                    await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
                    const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
                    await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
                    await api3Market
                      .connect(roles.randomPerson)
                      .buySubscription(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                        dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                        ethers.AbiCoder.defaultAbiCoder().encode(
                          ['bytes32', 'bytes32[]'],
                          [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                        ),
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                        ethers.AbiCoder.defaultAbiCoder().encode(
                          ['bytes32', 'bytes32[]'],
                          [
                            dapiPricingMerkleRoot,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof,
                          ]
                        ),
                        {
                          value: await computeRequiredPaymentAmount(
                            api3Market,
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                          ),
                        }
                      );
                    const paymentAmount2 = await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    );
                    const subscriptionTimestamp2 = (await helpers.time.latest()) + 1;
                    await helpers.time.setNextBlockTimestamp(subscriptionTimestamp2);
                    const subscriptionId = computeSubscriptionId(
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters
                    );
                    expect(
                      await api3Market
                        .connect(roles.randomPerson)
                        .buySubscription.staticCall(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof,
                            ]
                          ),
                          { value: paymentAmount2 }
                        )
                    ).to.be.equal(subscriptionId);
                    await expect(
                      api3Market
                        .connect(roles.randomPerson)
                        .buySubscription(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof,
                            ]
                          ),
                          { value: paymentAmount2 }
                        )
                    )
                      .to.emit(api3Market, 'UpdatedCurrentSubscriptionId')
                      .withArgs(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        computeSubscriptionId(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters
                        )
                      )
                      .to.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters')
                      .withArgs(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters
                      )
                      .to.emit(api3Market, 'BoughtSubscription')
                      .withArgs(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        subscriptionId,
                        dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                        dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                        paymentAmount2
                      )
                      .to.not.emit(airseekerRegistry, 'ActivatedDapiName')
                      .to.not.emit(api3ServerV1, 'SetDapiName');
                    const dataFeedReading = await api3ServerV1.dataFeeds(
                      dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId
                    );
                    const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
                    const dapiData = await api3Market.getDapiData(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
                    expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
                    expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
                    expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
                    expect(dapiData.beaconValues).to.deep.equal(
                      beaconReadings.map((beaconReading) => beaconReading.value)
                    );
                    expect(dapiData.beaconTimestamps).to.deep.equal(
                      beaconReadings.map((beaconReading) => beaconReading.timestamp)
                    );
                    expect(dapiData.updateParameters).to.deep.equal([
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                    ]);
                    expect(dapiData.endTimestamps).to.deep.equal([
                      subscriptionTimestamp2 +
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      subscriptionTimestamp1 +
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                    ]);
                    expect(dapiData.dailyPrices).to.deep.equal([
                      (BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price) *
                        BigInt(24 * 60 * 60)) /
                        BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration),
                      (BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price) *
                        BigInt(24 * 60 * 60)) /
                        BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration),
                    ]);
                    // The same subscription can be purchased again after some time passes
                    await helpers.time.increaseTo((await helpers.time.latest()) + 1);
                    const paymentAmount3 = await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    );
                    await expect(
                      api3Market
                        .connect(roles.randomPerson)
                        .buySubscription(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof,
                            ]
                          ),
                          { value: paymentAmount3 }
                        )
                    )
                      .to.emit(api3Market, 'BoughtSubscription')
                      .withArgs(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        subscriptionId,
                        dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                        dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                        paymentAmount3
                      )
                      .to.not.emit(api3Market, 'UpdatedCurrentSubscriptionId')
                      .to.not.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters')
                      .to.not.emit(airseekerRegistry, 'ActivatedDapiName')
                      .to.not.emit(api3ServerV1, 'SetDapiName');
                  });
                });
              });
              context('Subscription is not added to the start of the queue', function () {
                context('Current subscription ID does not need to be updated', function () {
                  context('dAPI name needs to be updated', function () {
                    it('updates dAPI name and buys subscription', async function () {
                      const {
                        roles,
                        api3ServerV1,
                        beaconIds,
                        dataFeedDetails,
                        api3Market,
                        airseekerRegistry,
                        dapiManagementMerkleLeaves,
                        dapiManagementMerkleRoot,
                        dapiPricingMerkleLeaves,
                        dapiPricingMerkleRoot,
                      } = await helpers.loadFixture(deploy);
                      await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
                      const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
                      await api3Market
                        .connect(roles.randomPerson)
                        .buySubscription(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof,
                            ]
                          ),
                          {
                            value: await computeRequiredPaymentAmount(
                              api3Market,
                              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                            ),
                          }
                        );
                      const paymentAmount2 = await computeRequiredPaymentAmount(
                        api3Market,
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                        dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                      );
                      await api3ServerV1
                        .connect(roles.api3ServerV1Manager)
                        .setDapiName(dapiManagementMerkleLeaves.ethUsd!.values.dapiName, ethers.ZeroHash);
                      const subscriptionTimestamp2 = (await helpers.time.latest()) + 1;
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp2);
                      const subscriptionId = computeSubscriptionId(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters
                      );
                      expect(
                        await api3Market
                          .connect(roles.randomPerson)
                          .buySubscription.staticCall(
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                            ),
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [
                                dapiPricingMerkleRoot,
                                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof,
                              ]
                            ),
                            { value: paymentAmount2 }
                          )
                      ).to.equal(subscriptionId);
                      await expect(
                        api3Market
                          .connect(roles.randomPerson)
                          .buySubscription(
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                            ),
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [
                                dapiPricingMerkleRoot,
                                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof,
                              ]
                            ),
                            { value: paymentAmount2 }
                          )
                      )
                        .to.emit(api3ServerV1, 'SetDapiName')
                        .withArgs(
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          await api3Market.getAddress()
                        )
                        .to.emit(api3Market, 'BoughtSubscription')
                        .withArgs(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          subscriptionId,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                          paymentAmount2
                        )
                        .to.not.emit(api3Market, 'UpdatedCurrentSubscriptionId')
                        .to.not.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters')
                        .to.not.emit(airseekerRegistry, 'ActivatedDapiName');
                      const dataFeedReading = await api3ServerV1.dataFeeds(
                        dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId
                      );
                      const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
                      const dapiData = await api3Market.getDapiData(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
                      expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
                      expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
                      expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
                      expect(dapiData.beaconValues).to.deep.equal(
                        beaconReadings.map((beaconReading) => beaconReading.value)
                      );
                      expect(dapiData.beaconTimestamps).to.deep.equal(
                        beaconReadings.map((beaconReading) => beaconReading.timestamp)
                      );
                      expect(dapiData.updateParameters).to.deep.equal([
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                      ]);
                      expect(dapiData.endTimestamps).to.deep.equal([
                        subscriptionTimestamp1 +
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                        subscriptionTimestamp2 +
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                      ]);
                      expect(dapiData.dailyPrices).to.deep.equal([
                        (BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price) *
                          BigInt(24 * 60 * 60)) /
                          BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration),
                        (BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price) *
                          BigInt(24 * 60 * 60)) /
                          BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration),
                      ]);
                    });
                  });
                  context('dAPI name does not need to be updated', function () {
                    it('buys subscription', async function () {
                      const {
                        roles,
                        api3ServerV1,
                        beaconIds,
                        dataFeedDetails,
                        api3Market,
                        airseekerRegistry,
                        dapiManagementMerkleLeaves,
                        dapiManagementMerkleRoot,
                        dapiPricingMerkleLeaves,
                        dapiPricingMerkleRoot,
                      } = await helpers.loadFixture(deploy);
                      await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
                      const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
                      await api3Market
                        .connect(roles.randomPerson)
                        .buySubscription(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof,
                            ]
                          ),
                          {
                            value: await computeRequiredPaymentAmount(
                              api3Market,
                              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                            ),
                          }
                        );
                      const paymentAmount2 = await computeRequiredPaymentAmount(
                        api3Market,
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                        dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                      );
                      const subscriptionTimestamp2 = (await helpers.time.latest()) + 1;
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp2);
                      const subscriptionId = computeSubscriptionId(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters
                      );
                      expect(
                        await api3Market
                          .connect(roles.randomPerson)
                          .buySubscription.staticCall(
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                            ),
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [
                                dapiPricingMerkleRoot,
                                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof,
                              ]
                            ),
                            { value: paymentAmount2 }
                          )
                      ).to.equal(subscriptionId);
                      await expect(
                        api3Market
                          .connect(roles.randomPerson)
                          .buySubscription(
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                            ),
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [
                                dapiPricingMerkleRoot,
                                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof,
                              ]
                            ),
                            { value: paymentAmount2 }
                          )
                      )
                        .to.emit(api3Market, 'BoughtSubscription')
                        .withArgs(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          subscriptionId,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                          paymentAmount2
                        )
                        .to.not.emit(api3Market, 'UpdatedCurrentSubscriptionId')
                        .to.not.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters')
                        .to.not.emit(airseekerRegistry, 'ActivatedDapiName')
                        .to.not.emit(api3ServerV1, 'SetDapiName');
                      const dataFeedReading = await api3ServerV1.dataFeeds(
                        dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId
                      );
                      const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
                      const dapiData = await api3Market.getDapiData(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
                      expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
                      expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
                      expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
                      expect(dapiData.beaconValues).to.deep.equal(
                        beaconReadings.map((beaconReading) => beaconReading.value)
                      );
                      expect(dapiData.beaconTimestamps).to.deep.equal(
                        beaconReadings.map((beaconReading) => beaconReading.timestamp)
                      );
                      expect(dapiData.updateParameters).to.deep.equal([
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                      ]);
                      expect(dapiData.endTimestamps).to.deep.equal([
                        subscriptionTimestamp1 +
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                        subscriptionTimestamp2 +
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                      ]);
                      expect(dapiData.dailyPrices).to.deep.equal([
                        (BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price) *
                          BigInt(24 * 60 * 60)) /
                          BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration),
                        (BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price) *
                          BigInt(24 * 60 * 60)) /
                          BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration),
                      ]);
                    });
                  });
                });
                context('Current subscription ID needs to be updated', function () {
                  context('dAPI name needs to be updated', function () {
                    it('updates current subscription ID, updates dAPI name and buys subscription', async function () {
                      const {
                        roles,
                        airnodes,
                        api3ServerV1,
                        beaconIds,
                        dataFeedDetails,
                        api3Market,
                        airseekerRegistry,
                        dapiManagementMerkleLeaves,
                        dapiManagementMerkleRoot,
                        dapiPricingMerkleLeaves,
                        dapiPricingMerkleRoot,
                      } = await helpers.loadFixture(deploy);
                      await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
                      const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
                      await api3Market
                        .connect(roles.randomPerson)
                        .buySubscription(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof,
                            ]
                          ),
                          {
                            value: await computeRequiredPaymentAmount(
                              api3Market,
                              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                            ),
                          }
                        );
                      const subscriptionTimestamp2 = (await helpers.time.latest()) + 1;
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp2);
                      await api3Market
                        .connect(roles.randomPerson)
                        .buySubscription(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof,
                            ]
                          ),
                          {
                            value: await computeRequiredPaymentAmount(
                              api3Market,
                              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                            ),
                          }
                        );
                      const paymentAmount3 = await computeRequiredPaymentAmount(
                        api3Market,
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                        dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                        dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                        dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                      );
                      await api3ServerV1
                        .connect(roles.api3ServerV1Manager)
                        .setDapiName(dapiManagementMerkleLeaves.ethUsd!.values.dapiName, ethers.ZeroHash);
                      const subscriptionTimestamp3 =
                        subscriptionTimestamp1 +
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration;
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp3 - 60);
                      await updateBeaconSet(
                        api3ServerV1,
                        'ETH/USD',
                        airnodes,
                        subscriptionTimestamp3 - 60,
                        ethers.parseEther('2200')
                      );
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp3);
                      const subscriptionId = computeSubscriptionId(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters
                      );
                      expect(
                        await api3Market
                          .connect(roles.randomPerson)
                          .buySubscription.staticCall(
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                            ),
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values
                              .updateParameters,
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [
                                dapiPricingMerkleRoot,
                                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.proof,
                              ]
                            ),
                            { value: paymentAmount3 }
                          )
                      ).to.equal(subscriptionId);
                      await expect(
                        api3Market
                          .connect(roles.randomPerson)
                          .buySubscription(
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                            ),
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values
                              .updateParameters,
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [
                                dapiPricingMerkleRoot,
                                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.proof,
                              ]
                            ),
                            { value: paymentAmount3 }
                          )
                      )
                        .to.emit(api3Market, 'UpdatedCurrentSubscriptionId')
                        .withArgs(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          computeSubscriptionId(
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters
                          )
                        )
                        .to.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters')
                        .withArgs(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters
                        )
                        .to.emit(api3ServerV1, 'SetDapiName')
                        .withArgs(
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          await api3Market.getAddress()
                        )
                        .to.emit(api3Market, 'BoughtSubscription')
                        .withArgs(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          subscriptionId,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                          paymentAmount3
                        )
                        .to.not.emit(airseekerRegistry, 'ActivatedDapiName');
                      const dataFeedReading = await api3ServerV1.dataFeeds(
                        dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId
                      );
                      const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
                      const dapiData = await api3Market.getDapiData(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
                      expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
                      expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
                      expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
                      expect(dapiData.beaconValues).to.deep.equal(
                        beaconReadings.map((beaconReading) => beaconReading.value)
                      );
                      expect(dapiData.beaconTimestamps).to.deep.equal(
                        beaconReadings.map((beaconReading) => beaconReading.timestamp)
                      );
                      expect(dapiData.updateParameters).to.deep.equal([
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                        dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                      ]);
                      expect(dapiData.endTimestamps).to.deep.equal([
                        subscriptionTimestamp2 +
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                        subscriptionTimestamp3 +
                          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                      ]);
                      expect(dapiData.dailyPrices).to.deep.equal([
                        (BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price) *
                          BigInt(24 * 60 * 60)) /
                          BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration),
                        (BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price) *
                          BigInt(24 * 60 * 60)) /
                          BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration),
                      ]);
                    });
                  });
                  context('dAPI name does not need to be updated', function () {
                    it('updates current subscription ID and buys subscription', async function () {
                      const {
                        roles,
                        airnodes,
                        api3ServerV1,
                        beaconIds,
                        dataFeedDetails,
                        api3Market,
                        airseekerRegistry,
                        dapiManagementMerkleLeaves,
                        dapiManagementMerkleRoot,
                        dapiPricingMerkleLeaves,
                        dapiPricingMerkleRoot,
                      } = await helpers.loadFixture(deploy);
                      await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
                      const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
                      await api3Market
                        .connect(roles.randomPerson)
                        .buySubscription(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof,
                            ]
                          ),
                          {
                            value: await computeRequiredPaymentAmount(
                              api3Market,
                              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                            ),
                          }
                        );
                      const subscriptionTimestamp2 = (await helpers.time.latest()) + 1;
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp2);
                      await api3Market
                        .connect(roles.randomPerson)
                        .buySubscription(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                          ),
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                          ethers.AbiCoder.defaultAbiCoder().encode(
                            ['bytes32', 'bytes32[]'],
                            [
                              dapiPricingMerkleRoot,
                              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof,
                            ]
                          ),
                          {
                            value: await computeRequiredPaymentAmount(
                              api3Market,
                              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                            ),
                          }
                        );
                      const paymentAmount3 = await computeRequiredPaymentAmount(
                        api3Market,
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                        dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                        dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                        dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                      );
                      const subscriptionTimestamp3 =
                        subscriptionTimestamp1 +
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration;
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp3 - 60);
                      await updateBeaconSet(
                        api3ServerV1,
                        'ETH/USD',
                        airnodes,
                        subscriptionTimestamp3 - 60,
                        ethers.parseEther('2200')
                      );
                      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp3);
                      const subscriptionId = computeSubscriptionId(
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters
                      );
                      expect(
                        await api3Market
                          .connect(roles.randomPerson)
                          .buySubscription.staticCall(
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                            ),
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values
                              .updateParameters,
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [
                                dapiPricingMerkleRoot,
                                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.proof,
                              ]
                            ),
                            { value: paymentAmount3 }
                          )
                      ).to.equal(subscriptionId);
                      await expect(
                        api3Market
                          .connect(roles.randomPerson)
                          .buySubscription(
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                            ),
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values
                              .updateParameters,
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                            ethers.AbiCoder.defaultAbiCoder().encode(
                              ['bytes32', 'bytes32[]'],
                              [
                                dapiPricingMerkleRoot,
                                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.proof,
                              ]
                            ),
                            { value: paymentAmount3 }
                          )
                      )
                        .to.emit(api3Market, 'UpdatedCurrentSubscriptionId')
                        .withArgs(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          computeSubscriptionId(
                            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters
                          )
                        )
                        .to.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters')
                        .withArgs(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters
                        )
                        .to.emit(api3Market, 'BoughtSubscription')
                        .withArgs(
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          subscriptionId,
                          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                          paymentAmount3
                        )
                        .to.not.emit(airseekerRegistry, 'ActivatedDapiName')
                        .to.not.emit(api3ServerV1, 'SetDapiName');
                      const dataFeedReading = await api3ServerV1.dataFeeds(
                        dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId
                      );
                      const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
                      const dapiData = await api3Market.getDapiData(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
                      expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
                      expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
                      expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
                      expect(dapiData.beaconValues).to.deep.equal(
                        beaconReadings.map((beaconReading) => beaconReading.value)
                      );
                      expect(dapiData.beaconTimestamps).to.deep.equal(
                        beaconReadings.map((beaconReading) => beaconReading.timestamp)
                      );
                      expect(dapiData.updateParameters).to.deep.equal([
                        dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                        dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                      ]);
                      expect(dapiData.endTimestamps).to.deep.equal([
                        subscriptionTimestamp2 +
                          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                        subscriptionTimestamp3 +
                          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                      ]);
                      expect(dapiData.dailyPrices).to.deep.equal([
                        (BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price) *
                          BigInt(24 * 60 * 60)) /
                          BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration),
                        (BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price) *
                          BigInt(24 * 60 * 60)) /
                          BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration),
                      ]);
                    });
                  });
                });
              });
            });
            context('Payment transfer fails', function () {
              it('reverts', async function () {
                const {
                  roles,
                  dataFeedDetails,
                  api3Market,
                  dapiManagementMerkleLeaves,
                  dapiManagementMerkleRoot,
                  dapiPricingMerkleLeaves,
                  dapiPricingMerkleRoot,
                } = await helpers.loadFixture(deploy);
                await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
                await expect(
                  api3Market
                    .connect(roles.randomPerson)
                    .buySubscription(
                      dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.dapiName,
                      dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.dataFeedId,
                      dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.sponsorWalletAddress,
                      ethers.AbiCoder.defaultAbiCoder().encode(
                        ['bytes32', 'bytes32[]'],
                        [
                          dapiManagementMerkleRoot,
                          dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.proof,
                        ]
                      ),
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      ethers.AbiCoder.defaultAbiCoder().encode(
                        ['bytes32', 'bytes32[]'],
                        [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                      ),
                      {
                        value: await computeRequiredPaymentAmount(
                          api3Market,
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                        ),
                      }
                    )
                ).to.be.revertedWith('Transfer unsuccessful');
              });
            });
          });
          context('Payment amount is zero', function () {
            it('buys subscription', async function () {
              const {
                roles,
                api3ServerV1,
                beaconIds,
                dataFeedDetails,
                api3Market,
                mockContractWithNoDefaultPayable,
                dapiManagementMerkleLeaves,
                dapiManagementMerkleRoot,
                dapiPricingMerkleLeaves,
                dapiPricingMerkleRoot,
              } = await helpers.loadFixture(deploy);
              await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
              await mockContractWithNoDefaultPayable.customPayable({
                value: dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
              });
              const subscriptionTimestamp = (await helpers.time.latest()) + 1;
              await helpers.time.setNextBlockTimestamp(subscriptionTimestamp);
              const subscriptionId = computeSubscriptionId(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters
              );
              expect(
                await api3Market
                  .connect(roles.randomPerson)
                  .buySubscription.staticCall(
                    dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.dapiName,
                    dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.dataFeedId,
                    dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.sponsorWalletAddress,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                      ['bytes32', 'bytes32[]'],
                      [
                        dapiManagementMerkleRoot,
                        dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.proof,
                      ]
                    ),
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                      ['bytes32', 'bytes32[]'],
                      [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                    )
                  )
              ).to.equal(subscriptionId);
              await expect(
                api3Market
                  .connect(roles.randomPerson)
                  .buySubscription(
                    dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.dapiName,
                    dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.dataFeedId,
                    dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.sponsorWalletAddress,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                      ['bytes32', 'bytes32[]'],
                      [
                        dapiManagementMerkleRoot,
                        dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.proof,
                      ]
                    ),
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                      ['bytes32', 'bytes32[]'],
                      [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                    )
                  )
              )
                .to.emit(api3Market, 'BoughtSubscription')
                .withArgs(
                  dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.dapiName,
                  subscriptionId,
                  dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsdWithNoDefaultPayableSponsorWallet!.values.sponsorWalletAddress,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  0
                );
              const dataFeedReading = await api3ServerV1.dataFeeds(
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId
              );
              const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
              const dapiData = await api3Market.getDapiData(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
              expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
              expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
              expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
              expect(dapiData.beaconValues).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.value));
              expect(dapiData.beaconTimestamps).to.deep.equal(
                beaconReadings.map((beaconReading) => beaconReading.timestamp)
              );
              expect(dapiData.updateParameters).to.deep.equal([
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
              ]);
              expect(dapiData.endTimestamps).to.deep.equal([
                subscriptionTimestamp +
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
              ]);
              expect(dapiData.dailyPrices).to.deep.equal([
                (BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price) *
                  BigInt(24 * 60 * 60)) /
                  BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration),
              ]);
            });
          });
        });
        context('Payment is not enough to get the sponsor wallet balance over the expected amount', function () {
          it('reverts', async function () {
            const {
              roles,
              dataFeedDetails,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value:
                      BigInt(
                        await computeRequiredPaymentAmount(
                          api3Market,
                          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                        )
                      ) - BigInt(1),
                  }
                )
            ).to.be.revertedWith('Insufficient payment');
          });
        });
      });
      context('New subscription cannot be added to the queue...', function () {
        context('...because its deviation reference differs from the subscriptions in the queue', function () {
          it('reverts', async function () {
            const {
              roles,
              dataFeedDetails,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonthsWithNonZeroDeviationReference!.values
                    .updateParameters,
                  dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonthsWithNonZeroDeviationReference!.values
                    .duration,
                  dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonthsWithNonZeroDeviationReference!.values
                    .price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [
                      dapiPricingMerkleRoot,
                      dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonthsWithNonZeroDeviationReference!
                        .proof,
                    ]
                  ),
                  {
                    value:
                      dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonthsWithNonZeroDeviationReference!
                        .values.price,
                  }
                )
            ).to.be.revertedWith('Deviation references not equal');
          });
        });
        context(
          '...because its deviation threshold and heartbeat interval are not comparable to a subscription in the queue',
          function () {
            it('reverts', async function () {
              const {
                roles,
                dataFeedDetails,
                api3Market,
                dapiManagementMerkleLeaves,
                dapiManagementMerkleRoot,
                dapiPricingMerkleLeaves,
                dapiPricingMerkleRoot,
              } = await helpers.loadFixture(deploy);
              await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
              await api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                );
              await expect(
                api3Market
                  .connect(roles.randomPerson)
                  .buySubscription(
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                      ['bytes32', 'bytes32[]'],
                      [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                    ),
                    dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonthsWithHourlyHeartbeatInterval!.values
                      .updateParameters,
                    dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonthsWithHourlyHeartbeatInterval!.values
                      .duration,
                    dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonthsWithHourlyHeartbeatInterval!.values
                      .price,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                      ['bytes32', 'bytes32[]'],
                      [
                        dapiPricingMerkleRoot,
                        dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonthsWithHourlyHeartbeatInterval!
                          .proof,
                      ]
                    ),
                    {
                      value:
                        dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonthsWithHourlyHeartbeatInterval!
                          .values.price,
                    }
                  )
              ).to.be.revertedWith('Update parameters incomparable');
            });
          }
        );
        context('...because new subscription does not upgrade the queue', function () {
          it('reverts', async function () {
            const {
              roles,
              dataFeedDetails,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonths!.values.duration,
                dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonths!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonths!.proof]
                ),
                { value: dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonths!.values.price }
              );
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.sixPercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.sixPercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.sixPercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.sixPercentDeviationThresholdForOneMonth!.proof]
                  ),
                  { value: dapiPricingMerkleLeaves.sixPercentDeviationThresholdForOneMonth!.values.price }
                )
            ).to.be.revertedWith('Subscription does not upgrade');
          });
        });
        context('...because the queue is full', function () {
          it('reverts', async function () {
            const {
              roles,
              dataFeedDetails,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                    dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                    dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                    dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                    dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.fourPercentDeviationThresholdForFourMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.fourPercentDeviationThresholdForFourMonths!.values.duration,
                dapiPricingMerkleLeaves.fourPercentDeviationThresholdForFourMonths!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.fourPercentDeviationThresholdForFourMonths!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.fourPercentDeviationThresholdForFourMonths!.values.updateParameters,
                    dapiPricingMerkleLeaves.fourPercentDeviationThresholdForFourMonths!.values.duration,
                    dapiPricingMerkleLeaves.fourPercentDeviationThresholdForFourMonths!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.fivePercentDeviationThresholdForFiveMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.fivePercentDeviationThresholdForFiveMonths!.values.duration,
                dapiPricingMerkleLeaves.fivePercentDeviationThresholdForFiveMonths!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.fivePercentDeviationThresholdForFiveMonths!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.fivePercentDeviationThresholdForFiveMonths!.values.updateParameters,
                    dapiPricingMerkleLeaves.fivePercentDeviationThresholdForFiveMonths!.values.duration,
                    dapiPricingMerkleLeaves.fivePercentDeviationThresholdForFiveMonths!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonths!.values.updateParameters,
                  dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonths!.values.duration,
                  dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonths!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonths!.proof]
                  ),
                  { value: dapiPricingMerkleLeaves.sixPercentDeviationThresholdForSixMonths!.values.price }
                )
            ).to.be.revertedWith('Subscription queue full');
          });
        });
        context('...because doing so will result in a dAPI name to be set to a stale data feed', function () {
          it('reverts', async function () {
            const {
              roles,
              api3ServerV1,
              dataFeedDetails,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
            const dataFeedReading = await api3ServerV1.dataFeeds(dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId);
            await helpers.time.setNextBlockTimestamp(dataFeedReading.timestamp + BigInt(MAXIMUM_DAPI_UPDATE_AGE + 1));
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWith('Data feed value stale');
          });
        });
        context('...because doing so will result in a dAPI name to be set to an unregistered data feed', function () {
          it('reverts', async function () {
            const {
              roles,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWith('Data feed not registered');
          });
        });
        context(
          '...because doing so requires Api3Market to set a dAPI name and Api3Market does not have the respective Api3ServerV1 role',
          function () {
            it('reverts', async function () {
              const {
                roles,
                accessControlRegistry,
                api3ServerV1,
                dataFeedDetails,
                api3Market,
                dapiManagementMerkleLeaves,
                dapiManagementMerkleRoot,
                dapiPricingMerkleLeaves,
                dapiPricingMerkleRoot,
              } = await helpers.loadFixture(deploy);
              await accessControlRegistry
                .connect(roles.api3ServerV1Manager)
                .revokeRole(await api3ServerV1.dapiNameSetterRole(), api3Market.getAddress());
              await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
              await expect(
                api3Market
                  .connect(roles.randomPerson)
                  .buySubscription(
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                      ['bytes32', 'bytes32[]'],
                      [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                    ),
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                      ['bytes32', 'bytes32[]'],
                      [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                    ),
                    {
                      value: await computeRequiredPaymentAmount(
                        api3Market,
                        dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                        dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                        dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                      ),
                    }
                  )
              ).to.be.revertedWith('Sender cannot set dAPI name');
            });
          }
        );
      });
    });
    context('Arguments are not valid', function () {
      context('Data feed ID is zero', function () {
        it('reverts', async function () {
          const {
            roles,
            api3Market,
            dapiManagementMerkleLeaves,
            dapiManagementMerkleRoot,
            dapiPricingMerkleLeaves,
            dapiPricingMerkleRoot,
          } = await helpers.loadFixture(deploy);
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                ethers.ZeroHash,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              )
          ).to.be.revertedWith('Data feed ID zero');
        });
      });
      context('Sponsor wallet address is zero', function () {
        it('reverts', async function () {
          const {
            roles,
            api3Market,
            dapiManagementMerkleLeaves,
            dapiManagementMerkleRoot,
            dapiPricingMerkleLeaves,
            dapiPricingMerkleRoot,
          } = await helpers.loadFixture(deploy);
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                ethers.ZeroAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              )
          ).to.be.revertedWith('Sponsor wallet address zero');
        });
      });
      context('dAPI management Merkle proof verification is not successful...', function () {
        context('...because dAPI name is zero', function () {
          it('reverts', async function () {
            const {
              roles,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  ethers.ZeroHash,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWith('dAPI name zero');
          });
        });
        context('...because dAPI management Merkle data cannot be decoded', function () {
          it('reverts', async function () {
            const { roles, api3Market, dapiManagementMerkleLeaves, dapiPricingMerkleLeaves, dapiPricingMerkleRoot } =
              await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  '0x',
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWithoutReason();
          });
        });
        context('...because dAPI management Merkle root is not registered', function () {
          it('reverts', async function () {
            const { roles, api3Market, dapiManagementMerkleLeaves, dapiPricingMerkleLeaves, dapiPricingMerkleRoot } =
              await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [ethers.ZeroHash, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWith('Invalid root');
          });
        });
        context('... dAPI management Merkle proof is not valid', function () {
          it('reverts', async function () {
            const {
              roles,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof!.slice(1)]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWith('Invalid proof');
          });
        });
      });
      context('dAPI pricing Merkle proof verification is not successful...', function () {
        context('...because update parameters length is invalid', function () {
          it('reverts', async function () {
            const {
              roles,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  '0x',
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWith('Update parameters length invalid');
          });
        });
        context('...because duration is zero', function () {
          it('reverts', async function () {
            const {
              roles,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  0,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWith('Duration zero');
          });
        });
        context('...because price is zero', function () {
          it('reverts', async function () {
            const {
              roles,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  0,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWith('Price zero');
          });
        });
        context('...because dAPI pricing Merkle data cannot be decoded', function () {
          it('reverts', async function () {
            const { roles, api3Market, dapiManagementMerkleLeaves, dapiManagementMerkleRoot, dapiPricingMerkleLeaves } =
              await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  '0x',
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWithoutReason();
          });
        });
        context('...because dAPI pricing Merkle root is not registered', function () {
          it('reverts', async function () {
            const { roles, api3Market, dapiManagementMerkleLeaves, dapiManagementMerkleRoot, dapiPricingMerkleLeaves } =
              await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [ethers.ZeroHash, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWith('Invalid root');
          });
        });
        context('... dAPI pricing Merkle proof is not valid', function () {
          it('reverts', async function () {
            const {
              roles,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .buySubscription(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  ),
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [
                      dapiPricingMerkleRoot,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof!.slice(1),
                    ]
                  ),
                  {
                    value: await computeRequiredPaymentAmount(
                      api3Market,
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                      dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                    ),
                  }
                )
            ).to.be.revertedWith('Invalid proof');
          });
        });
      });
    });
  });

  describe('updateCurrentSubscriptionId', function () {
    context('dAPI subscription queue is not empty', function () {
      context('Current subscription ID needs to be updated', function () {
        context('Queue will be empty after the current subscription ID is updated', function () {
          it('updates the current subscription ID and deactivates the dAPI', async function () {
            const {
              roles,
              api3ServerV1,
              beaconIds,
              dataFeedDetails,
              api3Market,
              airseekerRegistry,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                    dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                    dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            const subscriptionTimestamp3 = (await helpers.time.latest()) + 1;
            await helpers.time.setNextBlockTimestamp(subscriptionTimestamp3);
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                    dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                    dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            await helpers.time.setNextBlockTimestamp(
              subscriptionTimestamp3 +
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration
            );
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .updateCurrentSubscriptionId(dapiManagementMerkleLeaves.ethUsd!.values.dapiName)
            )
              .to.emit(api3Market, 'UpdatedCurrentSubscriptionId')
              .withArgs(dapiManagementMerkleLeaves.ethUsd!.values.dapiName, ethers.ZeroHash)
              .to.emit(airseekerRegistry, 'DeactivatedDapiName')
              .withArgs(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
            const dataFeedReading = await api3ServerV1.dataFeeds(dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId);
            const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
            const dapiData = await api3Market.getDapiData(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
            expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
            expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
            expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
            expect(dapiData.beaconValues).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.value));
            expect(dapiData.beaconTimestamps).to.deep.equal(
              beaconReadings.map((beaconReading) => beaconReading.timestamp)
            );
            expect(dapiData.updateParameters).to.deep.equal([]);
            expect(dapiData.endTimestamps).to.deep.equal([]);
            expect(dapiData.dailyPrices).to.deep.equal([]);
          });
        });
        context('Queue will not be empty after the current subscription ID is updated', function () {
          it('updates the subscription ID and updates the update parameters', async function () {
            const {
              roles,
              api3ServerV1,
              beaconIds,
              dataFeedDetails,
              api3Market,
              airseekerRegistry,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
              dapiPricingMerkleLeaves,
              dapiPricingMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
            const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
            await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                    dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            const subscriptionTimestamp2 = (await helpers.time.latest()) + 1;
            await helpers.time.setNextBlockTimestamp(subscriptionTimestamp2);
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                    dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                    dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            const subscriptionTimestamp3 = (await helpers.time.latest()) + 1;
            await helpers.time.setNextBlockTimestamp(subscriptionTimestamp3);
            await api3Market
              .connect(roles.randomPerson)
              .buySubscription(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                ),
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.proof]
                ),
                {
                  value: await computeRequiredPaymentAmount(
                    api3Market,
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                    dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                    dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                  ),
                }
              );
            await helpers.time.setNextBlockTimestamp(
              subscriptionTimestamp1 + dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration
            );
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .updateCurrentSubscriptionId(dapiManagementMerkleLeaves.ethUsd!.values.dapiName)
            )
              .to.emit(api3Market, 'UpdatedCurrentSubscriptionId')
              .withArgs(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                computeSubscriptionId(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters
                )
              )
              .to.emit(airseekerRegistry, 'UpdatedDapiNameUpdateParameters')
              .withArgs(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters
              );

            const dataFeedReading = await api3ServerV1.dataFeeds(dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId);
            const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
            const dapiData = await api3Market.getDapiData(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
            expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
            expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
            expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
            expect(dapiData.beaconValues).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.value));
            expect(dapiData.beaconTimestamps).to.deep.equal(
              beaconReadings.map((beaconReading) => beaconReading.timestamp)
            );
            expect(dapiData.updateParameters).to.deep.equal([
              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
              dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
            ]);
            expect(dapiData.endTimestamps).to.deep.equal([
              subscriptionTimestamp2 +
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
              subscriptionTimestamp3 +
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
            ]);
            expect(dapiData.dailyPrices).to.deep.equal([
              (BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price) *
                BigInt(24 * 60 * 60)) /
                BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration),
              (BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price) *
                BigInt(24 * 60 * 60)) /
                BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration),
            ]);
          });
        });
      });
      context('Current subscription ID does not need to be updated', function () {
        it('reverts', async function () {
          const {
            roles,
            dataFeedDetails,
            api3Market,
            dapiManagementMerkleLeaves,
            dapiManagementMerkleRoot,
            dapiPricingMerkleLeaves,
            dapiPricingMerkleRoot,
          } = await helpers.loadFixture(deploy);
          await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
          await api3Market
            .connect(roles.randomPerson)
            .buySubscription(
              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
              dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'bytes32[]'],
                [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
              ),
              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'bytes32[]'],
                [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
              ),
              {
                value: await computeRequiredPaymentAmount(
                  api3Market,
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                  dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
                ),
              }
            );
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .updateCurrentSubscriptionId(dapiManagementMerkleLeaves.ethUsd!.values.dapiName)
          ).to.be.revertedWith('Current subscription not ended');
        });
      });
    });
    context('dAPI subscription queue is empty', function () {
      it('reverts', async function () {
        const { roles, api3Market, dapiManagementMerkleLeaves } = await helpers.loadFixture(deploy);
        await expect(
          api3Market
            .connect(roles.randomPerson)
            .updateCurrentSubscriptionId(dapiManagementMerkleLeaves.ethUsd!.values.dapiName)
        ).to.be.revertedWith('Subscription queue empty');
      });
    });
  });

  describe('updateDapiName', function () {
    context('Arguments are valid', function () {
      context('Data feed ID is different than what the dAPI name is currently set to', function () {
        context('Sets the dAPI name to a non-zero data feed ID', function () {
          context('Data feed is ready', function () {
            it('updates dAPI name', async function () {
              const {
                roles,
                dataFeedDetails,
                api3ServerV1,
                api3Market,
                dapiManagementMerkleLeaves,
                dapiManagementMerkleRoot,
              } = await helpers.loadFixture(deploy);
              await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
              await expect(
                api3Market
                  .connect(roles.randomPerson)
                  .updateDapiName(
                    dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                    dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                    dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                      ['bytes32', 'bytes32[]'],
                      [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                    )
                  )
              )
                .to.emit(api3ServerV1, 'SetDapiName')
                .withArgs(
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  await api3Market.getAddress()
                );
            });
          });
          context('Data feed is not ready', function () {
            context('Data feed is stale', function () {
              it('reverts', async function () {
                const {
                  roles,
                  dataFeedDetails,
                  api3ServerV1,
                  api3Market,
                  dapiManagementMerkleLeaves,
                  dapiManagementMerkleRoot,
                } = await helpers.loadFixture(deploy);
                await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
                const dataFeedReading = await api3ServerV1.dataFeeds(
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId
                );
                await helpers.time.setNextBlockTimestamp(
                  dataFeedReading.timestamp + BigInt(MAXIMUM_DAPI_UPDATE_AGE + 1)
                );
                await expect(
                  api3Market
                    .connect(roles.randomPerson)
                    .updateDapiName(
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                      ethers.AbiCoder.defaultAbiCoder().encode(
                        ['bytes32', 'bytes32[]'],
                        [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                      )
                    )
                ).to.be.revertedWith('Data feed value stale');
              });
            });
            context('Data feed has not been registered', function () {
              it('reverts', async function () {
                const { roles, api3Market, dapiManagementMerkleLeaves, dapiManagementMerkleRoot } =
                  await helpers.loadFixture(deploy);
                await expect(
                  api3Market
                    .connect(roles.randomPerson)
                    .updateDapiName(
                      dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                      dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                      dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                      ethers.AbiCoder.defaultAbiCoder().encode(
                        ['bytes32', 'bytes32[]'],
                        [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                      )
                    )
                ).to.be.revertedWith('Data feed not registered');
              });
            });
          });
        });
        context('Sets the dAPI name to zero data feed ID', function () {
          it('updates dAPI name', async function () {
            const {
              roles,
              api3ServerV1,
              dataFeedDetails,
              api3Market,
              dapiManagementMerkleLeaves,
              dapiManagementMerkleRoot,
            } = await helpers.loadFixture(deploy);
            await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
            await api3Market
              .connect(roles.randomPerson)
              .updateDapiName(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                )
              );
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .updateDapiName(
                  dapiManagementMerkleLeaves.ethUsdWithZeroDataFeedIdAndSponsorWalletAddress!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsdWithZeroDataFeedIdAndSponsorWalletAddress!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsdWithZeroDataFeedIdAndSponsorWalletAddress!.values
                    .sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [
                      dapiManagementMerkleRoot,
                      dapiManagementMerkleLeaves.ethUsdWithZeroDataFeedIdAndSponsorWalletAddress!.proof,
                    ]
                  )
                )
            )
              .to.emit(api3ServerV1, 'SetDapiName')
              .withArgs(
                dapiManagementMerkleLeaves.ethUsdWithZeroDataFeedIdAndSponsorWalletAddress!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsdWithZeroDataFeedIdAndSponsorWalletAddress!.values.dapiName,
                await api3Market.getAddress()
              );
          });
        });
      });
      context('Data feed ID is not different than what the dAPI name is currently set to', function () {
        it('reverts', async function () {
          const { roles, dataFeedDetails, api3Market, dapiManagementMerkleLeaves, dapiManagementMerkleRoot } =
            await helpers.loadFixture(deploy);
          await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
          await api3Market
            .connect(roles.randomPerson)
            .updateDapiName(
              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
              dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'bytes32[]'],
                [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
              )
            );
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .updateDapiName(
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                )
              )
          ).to.be.revertedWith('Does not update dAPI name');
        });
      });
    });
    context('Arguments are not valid', function () {
      context('Sponsor wallet address is zero while data feed ID is not', function () {
        it('reverts', async function () {
          const { roles, api3Market, dapiManagementMerkleLeaves, dapiManagementMerkleRoot } =
            await helpers.loadFixture(deploy);
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .updateDapiName(
                dapiManagementMerkleLeaves.ethUsdWithZeroSponsorWalletAddress!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsdWithZeroSponsorWalletAddress!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsdWithZeroSponsorWalletAddress!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsdWithZeroSponsorWalletAddress!.proof]
                )
              )
          ).to.be.revertedWith('Sponsor wallet address zero');
        });
      });
      context('Data feed ID is zero while sponsor wallet address is not', function () {
        it('reverts', async function () {
          const { roles, api3Market, dapiManagementMerkleLeaves, dapiManagementMerkleRoot } =
            await helpers.loadFixture(deploy);
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .updateDapiName(
                dapiManagementMerkleLeaves.ethUsdWithZeroDataFeedId!.values.dapiName,
                dapiManagementMerkleLeaves.ethUsdWithZeroDataFeedId!.values.dataFeedId,
                dapiManagementMerkleLeaves.ethUsdWithZeroDataFeedId!.values.sponsorWalletAddress,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsdWithZeroDataFeedId!.proof]
                )
              )
          ).to.be.revertedWith('Sponsor wallet address not zero');
        });
      });
      context('dAPI management Merkle proof verification is not successful...', function () {
        context('...because dAPI name is zero', function () {
          it('reverts', async function () {
            const { roles, api3Market, dapiManagementMerkleLeaves, dapiManagementMerkleRoot } =
              await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .updateDapiName(
                  ethers.ZeroHash,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
                  )
                )
            ).to.be.revertedWith('dAPI name zero');
          });
        });
        context('...because dAPI management Merkle data cannot be decoded', function () {
          it('reverts', async function () {
            const { roles, api3Market, dapiManagementMerkleLeaves } = await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .updateDapiName(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  '0x'
                )
            ).to.be.revertedWithoutReason();
          });
        });
        context('...because dAPI management Merkle root is not registered', function () {
          it('reverts', async function () {
            const { roles, api3Market, dapiManagementMerkleLeaves } = await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .updateDapiName(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [ethers.ZeroHash, dapiManagementMerkleLeaves.ethUsd!.proof]
                  )
                )
            ).to.be.revertedWith('Invalid root');
          });
        });
        context('... dAPI management Merkle proof is not valid', function () {
          it('reverts', async function () {
            const { roles, api3Market, dapiManagementMerkleLeaves, dapiManagementMerkleRoot } =
              await helpers.loadFixture(deploy);
            await expect(
              api3Market
                .connect(roles.randomPerson)
                .updateDapiName(
                  dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                  dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
                  dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32[]'],
                    [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof!.slice(1)]
                  )
                )
            ).to.be.revertedWith('Invalid proof');
          });
        });
      });
    });
  });

  describe('updateSignedApiUrl', function () {
    context('Signed API URL Merkle proof verification is successful', function () {
      context('Signed API URL is different than that the signed API URL is currently set to', function () {
        it('updates signed API URL', async function () {
          const { roles, airnodes, airseekerRegistry, api3Market, signedApiUrlMerkleLeaves, signedApiUrlMerkleRoot } =
            await helpers.loadFixture(deploy);
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .updateSignedApiUrl(
                signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.airnodeAddress,
                signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.signedApiUrl,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [signedApiUrlMerkleRoot, signedApiUrlMerkleLeaves[airnodes[0]!.address]!.proof]
                )
              )
          )
            .to.emit(airseekerRegistry, 'UpdatedSignedApiUrl')
            .withArgs(
              signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.airnodeAddress,
              signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.signedApiUrl
            );
        });
      });
      context('Signed API URL is not different than that the signed API URL is currently set to', function () {
        it('reverts', async function () {
          const { roles, airnodes, api3Market, signedApiUrlMerkleLeaves, signedApiUrlMerkleRoot } =
            await helpers.loadFixture(deploy);
          await api3Market
            .connect(roles.randomPerson)
            .updateSignedApiUrl(
              signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.airnodeAddress,
              signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.signedApiUrl,
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'bytes32[]'],
                [signedApiUrlMerkleRoot, signedApiUrlMerkleLeaves[airnodes[0]!.address]!.proof]
              )
            );
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .updateSignedApiUrl(
                signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.airnodeAddress,
                signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.signedApiUrl,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [signedApiUrlMerkleRoot, signedApiUrlMerkleLeaves[airnodes[0]!.address]!.proof]
                )
              )
          ).to.be.revertedWith('Does not update signed API URL');
        });
      });
    });
    context('Signed API URL Merkle proof verification is not successful...', function () {
      context('...because signed API URL Merkle data cannot be decoded', function () {
        it('reverts', async function () {
          const { roles, airnodes, api3Market, signedApiUrlMerkleLeaves } = await helpers.loadFixture(deploy);
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .updateSignedApiUrl(
                signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.airnodeAddress,
                signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.signedApiUrl,
                '0x'
              )
          ).to.be.revertedWithoutReason();
        });
      });
      context('...because signed API URL Merkle root is not registered', function () {
        it('reverts', async function () {
          const { roles, airnodes, api3Market, signedApiUrlMerkleLeaves } = await helpers.loadFixture(deploy);
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .updateSignedApiUrl(
                signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.airnodeAddress,
                signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.signedApiUrl,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [ethers.ZeroHash, signedApiUrlMerkleLeaves[airnodes[0]!.address]!.proof]
                )
              )
          ).to.be.revertedWith('Invalid root');
        });
      });
      context('... signed API URL Merkle proof is not valid', function () {
        it('reverts', async function () {
          const { roles, airnodes, api3Market, signedApiUrlMerkleLeaves, signedApiUrlMerkleRoot } =
            await helpers.loadFixture(deploy);
          await expect(
            api3Market
              .connect(roles.randomPerson)
              .updateSignedApiUrl(
                signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.airnodeAddress,
                signedApiUrlMerkleLeaves[airnodes[0]!.address]!.values.signedApiUrl,
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['bytes32', 'bytes32[]'],
                  [signedApiUrlMerkleRoot, signedApiUrlMerkleLeaves[airnodes[0]!.address]!.proof!.slice(1)]
                )
              )
          ).to.be.revertedWith('Invalid proof');
        });
      });
    });
  });

  describe('updateBeaconWithSignedData', function () {
    it('updates Beacon with signed data', async function () {
      const { roles, airnodes, api3ServerV1, templateIds, beaconIds, api3Market } = await helpers.loadFixture(deploy);
      const timestamp = await helpers.time.latest();
      const encodedValue = ethers.AbiCoder.defaultAbiCoder().encode(['int224'], [123]);
      const signature = await airnodes[0]!.signMessage(
        ethers.toBeArray(
          ethers.solidityPackedKeccak256(['bytes32', 'uint256', 'bytes'], [templateIds[0], timestamp, encodedValue])
        )
      );
      await expect(
        api3Market
          .connect(roles.randomPerson)
          .updateBeaconWithSignedData(airnodes[0]!.address, templateIds[0]!, timestamp, encodedValue, signature)
      )
        .to.emit(api3ServerV1, 'UpdatedBeaconWithSignedData')
        .withArgs(beaconIds[0], encodedValue, timestamp);
    });
  });

  describe('updateBeaconSetWithBeacons', function () {
    it('updates Beacon set with Beacons', async function () {
      const { roles, api3ServerV1, beaconIds, api3Market } = await helpers.loadFixture(deploy);
      const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
      await expect(api3Market.connect(roles.randomPerson).updateBeaconSetWithBeacons([beaconIds[0]!, beaconIds[1]!]))
        .to.emit(api3ServerV1, 'UpdatedBeaconSetWithBeacons')
        .withArgs(
          ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [[beaconIds[0], beaconIds[1]]])),
          (beaconReadings[0]!.value + beaconReadings[1]!.value) / BigInt(2),
          (BigInt(beaconReadings[0]!.timestamp) + BigInt(beaconReadings[1]!.timestamp)) / BigInt(2)
        );
    });
  });

  describe('deployDapiProxy', function () {
    it('deploys DapiProxy', async function () {
      const { roles, dapiName, proxyFactory, api3Market } = await helpers.loadFixture(deploy);
      await expect(api3Market.connect(roles.randomPerson).deployDapiProxy(dapiName, '0x12345678'))
        .to.emit(proxyFactory, 'DeployedDapiProxy')
        .withArgs(await proxyFactory.computeDapiProxyAddress(dapiName, '0x12345678'), dapiName, '0x12345678');
    });
  });

  describe('deployDapiProxyWithOev', function () {
    it('deploys DapiProxyWithOev', async function () {
      const { roles, dapiName, proxyFactory, api3Market } = await helpers.loadFixture(deploy);
      await expect(
        api3Market
          .connect(roles.randomPerson)
          .deployDapiProxyWithOev(dapiName, roles.randomPerson!.address, '0x12345678')
      )
        .to.emit(proxyFactory, 'DeployedDapiProxyWithOev')
        .withArgs(
          await proxyFactory.computeDapiProxyWithOevAddress(dapiName, roles.randomPerson!.address, '0x12345678'),
          dapiName,
          roles.randomPerson!.address,
          '0x12345678'
        );
    });
  });

  describe('registerDataFeed', function () {
    it('registers data feed', async function () {
      const { roles, dataFeedId, dataFeedDetails, api3Market, airseekerRegistry } = await helpers.loadFixture(deploy);
      await expect(api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails))
        .to.emit(airseekerRegistry, 'RegisteredDataFeed')
        .withArgs(dataFeedId, dataFeedDetails);
    });
  });

  describe('computeExpectedSponsorWalletBalance', function () {
    it('computes expected sponsor wallet balance', async function () {
      const {
        roles,
        dataFeedDetails,
        api3Market,
        dapiManagementMerkleLeaves,
        dapiManagementMerkleRoot,
        dapiPricingMerkleLeaves,
        dapiPricingMerkleRoot,
      } = await helpers.loadFixture(deploy);
      await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
      const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
      await api3Market
        .connect(roles.randomPerson)
        .buySubscription(
          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'bytes32[]'],
            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
          ),
          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'bytes32[]'],
            [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
          ),
          {
            value: await computeRequiredPaymentAmount(
              api3Market,
              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
            ),
          }
        );

      const subscriptionTimestamp2 = (await helpers.time.latest()) + 1;
      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp2);
      await api3Market
        .connect(roles.randomPerson)
        .buySubscription(
          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'bytes32[]'],
            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
          ),
          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'bytes32[]'],
            [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof]
          ),
          {
            value: await computeRequiredPaymentAmount(
              api3Market,
              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
              dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
            ),
          }
        );
      const subscriptionTimestamp3 = (await helpers.time.latest()) + 1;
      await helpers.time.setNextBlockTimestamp(subscriptionTimestamp3);
      await api3Market
        .connect(roles.randomPerson)
        .buySubscription(
          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
          dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
          dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'bytes32[]'],
            [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
          ),
          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'bytes32[]'],
            [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.proof]
          ),
          {
            value: await computeRequiredPaymentAmount(
              api3Market,
              dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
              dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
              dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
              dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
              dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
            ),
          }
        );
      const currentTimestamp = Math.floor(
        subscriptionTimestamp1 +
          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration +
          (dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration -
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration) /
            2
      );
      await helpers.time.increaseTo(currentTimestamp);
      const subscription2EndTimestamp =
        subscriptionTimestamp2 + dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration;
      const subscription2DailyPrice =
        (BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price) *
          BigInt(24 * 60 * 60)) /
        BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration);
      const expectedSponsorWalletBalanceFromSubscription2 =
        ((BigInt(subscription2EndTimestamp) - BigInt(currentTimestamp)) * BigInt(subscription2DailyPrice)) /
        BigInt(24 * 60 * 60);
      const subscription3EndTimestamp =
        subscriptionTimestamp3 + dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration;
      const subscription3DailyPrice =
        (BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price) *
          BigInt(24 * 60 * 60)) /
        BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration);
      const expectedSponsorWalletBalanceFromSubscription3 =
        ((BigInt(subscription3EndTimestamp) - BigInt(subscription2EndTimestamp)) * BigInt(subscription3DailyPrice)) /
        BigInt(24 * 60 * 60);
      const expectedSponsorWalletBalance =
        BigInt(expectedSponsorWalletBalanceFromSubscription2) + BigInt(expectedSponsorWalletBalanceFromSubscription3);
      expect(
        await api3Market.computeExpectedSponsorWalletBalance(dapiManagementMerkleLeaves.ethUsd!.values.dapiName)
      ).to.equal(expectedSponsorWalletBalance);
    });
  });

  describe('computeExpectedSponsorWalletBalanceAfterSubscriptionIsAdded', function () {
    context('Update parameters length is valid', function () {
      it('computes expected sponsor wallet balance after subscription is added', async function () {
        const {
          roles,
          dataFeedDetails,
          api3Market,
          dapiManagementMerkleLeaves,
          dapiManagementMerkleRoot,
          dapiPricingMerkleLeaves,
          dapiPricingMerkleRoot,
        } = await helpers.loadFixture(deploy);
        await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
        const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
            ),
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );

        const subscriptionTimestamp2 = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(subscriptionTimestamp2);
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
            ),
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );
        const currentTimestamp = Math.floor(
          subscriptionTimestamp1 +
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration +
            (dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration -
              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration) /
              2
        );
        await helpers.time.increaseTo(currentTimestamp);
        const subscription2EndTimestamp =
          subscriptionTimestamp2 + dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration;
        const subscription2DailyPrice =
          (BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price) *
            BigInt(24 * 60 * 60)) /
          BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration);
        const expectedSponsorWalletBalanceFromSubscription2 =
          ((BigInt(subscription2EndTimestamp) - BigInt(currentTimestamp)) * BigInt(subscription2DailyPrice)) /
          BigInt(24 * 60 * 60);
        const subscription3EndTimestamp =
          currentTimestamp + dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration;
        const subscription3DailyPrice =
          (BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price) *
            BigInt(24 * 60 * 60)) /
          BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration);
        const expectedSponsorWalletBalanceFromSubscription3 =
          ((BigInt(subscription3EndTimestamp) - BigInt(subscription2EndTimestamp)) * BigInt(subscription3DailyPrice)) /
          BigInt(24 * 60 * 60);
        const expectedSponsorWalletBalanceAfterSubscriptionIsAdded =
          expectedSponsorWalletBalanceFromSubscription2 + expectedSponsorWalletBalanceFromSubscription3;
        expect(
          await api3Market.computeExpectedSponsorWalletBalanceAfterSubscriptionIsAdded(
            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price
          )
        ).to.equal(expectedSponsorWalletBalanceAfterSubscriptionIsAdded);
      });
    });
    context('Update parameters length is invalid', function () {
      it('reverts', async function () {
        const {
          roles,
          dataFeedDetails,
          api3Market,
          dapiManagementMerkleLeaves,
          dapiManagementMerkleRoot,
          dapiPricingMerkleLeaves,
          dapiPricingMerkleRoot,
        } = await helpers.loadFixture(deploy);
        await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
        const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
            ),
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
            ),
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );
        const currentTimestamp = Math.floor(
          subscriptionTimestamp1 +
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration +
            (dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration -
              dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration) /
              2
        );
        await helpers.time.increaseTo(currentTimestamp);
        await expect(
          api3Market.computeExpectedSponsorWalletBalanceAfterSubscriptionIsAdded(
            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
            '0x',
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price
          )
        ).to.be.revertedWith('Update parameters length invalid');
      });
    });
  });

  describe('getDapiData', function () {
    context('dAPI name is set to a Beacon set', function () {
      it('gets dAPI data', async function () {
        const {
          roles,
          api3ServerV1,
          beaconIds,
          dataFeedDetails,
          api3Market,
          dapiManagementMerkleLeaves,
          dapiManagementMerkleRoot,
          dapiPricingMerkleLeaves,
          dapiPricingMerkleRoot,
        } = await helpers.loadFixture(deploy);
        await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
        const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
            ),
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );
        const subscriptionTimestamp2 = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(subscriptionTimestamp2);
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
            ),
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );
        const subscriptionTimestamp3 = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(subscriptionTimestamp3);
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
            ),
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );
        const dataFeedReading = await api3ServerV1.dataFeeds(dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId);
        const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
        const dapiData = await api3Market.getDapiData(dapiManagementMerkleLeaves.ethUsd!.values.dapiName);
        expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
        expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
        expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
        expect(dapiData.beaconValues).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.value));
        expect(dapiData.beaconTimestamps).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.timestamp));
        expect(dapiData.updateParameters).to.deep.equal([
          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
        ]);
        expect(dapiData.endTimestamps).to.deep.equal([
          subscriptionTimestamp1 + dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
          subscriptionTimestamp2 + dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
          subscriptionTimestamp3 +
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
        ]);
        expect(dapiData.dailyPrices).to.deep.equal([
          (BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price) *
            BigInt(24 * 60 * 60)) /
            BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration),
          (BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price) *
            BigInt(24 * 60 * 60)) /
            BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration),
          (BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price) *
            BigInt(24 * 60 * 60)) /
            BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration),
        ]);
      });
    });
    context('dAPI name is set to a Beacon', function () {
      it('gets dAPI data', async function () {
        const {
          roles,
          airnodes,
          api3ServerV1,
          templateIds,
          beaconIds,
          api3Market,
          dapiManagementMerkleLeaves,
          dapiManagementMerkleRoot,
          dapiPricingMerkleLeaves,
          dapiPricingMerkleRoot,
        } = await helpers.loadFixture(deploy);
        const beaconDataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'bytes32'],
          [airnodes[0]!.address, templateIds[0]]
        );
        await api3Market.connect(roles.randomPerson).registerDataFeed(beaconDataFeedDetails);
        const subscriptionTimestamp1 = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(subscriptionTimestamp1);
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.proof]
            ),
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );

        const subscriptionTimestamp2 = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(subscriptionTimestamp2);
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.proof]
            ),
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
            dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
                dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );
        const subscriptionTimestamp3 = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(subscriptionTimestamp3);
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.proof]
            ),
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
                dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );
        const dataFeedReading = await api3ServerV1.dataFeeds(
          dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dataFeedId
        );
        const beaconReadings = await readBeacons(api3ServerV1, [beaconIds[0]!]);
        const dapiData = await api3Market.getDapiData(
          dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dapiName
        );
        expect(dapiData.dataFeedDetails).to.equal(beaconDataFeedDetails);
        expect(dapiData.dapiValue).to.equal(dataFeedReading.value);
        expect(dapiData.dapiTimestamp).to.equal(dataFeedReading.timestamp);
        expect(dapiData.beaconValues).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.value));
        expect(dapiData.beaconTimestamps).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.timestamp));
        expect(dapiData.updateParameters).to.deep.equal([
          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
          dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.updateParameters,
          dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.updateParameters,
        ]);
        expect(dapiData.endTimestamps).to.deep.equal([
          subscriptionTimestamp1 + dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
          subscriptionTimestamp2 + dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration,
          subscriptionTimestamp3 +
            dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration,
        ]);
        expect(dapiData.dailyPrices).to.deep.equal([
          (BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price) *
            BigInt(24 * 60 * 60)) /
            BigInt(dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration),
          (BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.price) *
            BigInt(24 * 60 * 60)) /
            BigInt(dapiPricingMerkleLeaves.twoPercentDeviationThresholdForTwoMonths!.values.duration),
          (BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.price) *
            BigInt(24 * 60 * 60)) /
            BigInt(dapiPricingMerkleLeaves.threePercentDeviationThresholdForThreeMonths!.values.duration),
        ]);
      });
    });
  });

  describe('getDataFeedData', function () {
    context('Data feed ID belongs to a Beacon set', function () {
      it('gets data feed data', async function () {
        const { roles, api3ServerV1, beaconIds, dataFeedDetails, api3Market, dapiManagementMerkleLeaves } =
          await helpers.loadFixture(deploy);
        await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
        const dataFeedReading = await api3ServerV1.dataFeeds(dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId);
        const beaconReadings = await readBeacons(api3ServerV1, beaconIds);
        const dapiData = await api3Market.getDataFeedData(dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId);
        expect(dapiData.dataFeedDetails).to.equal(dataFeedDetails);
        expect(dapiData.dataFeedValue).to.equal(dataFeedReading.value);
        expect(dapiData.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
        expect(dapiData.beaconValues).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.value));
        expect(dapiData.beaconTimestamps).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.timestamp));
      });
    });
    context('Data feed ID belongs to a Beacon', function () {
      it('gets data feed data', async function () {
        const { roles, airnodes, api3ServerV1, templateIds, api3Market, dapiManagementMerkleLeaves } =
          await helpers.loadFixture(deploy);
        const beaconDataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'bytes32'],
          [airnodes[0]!.address, templateIds[0]]
        );
        await api3Market.connect(roles.randomPerson).registerDataFeed(beaconDataFeedDetails);
        const dataFeedReading = await api3ServerV1.dataFeeds(
          dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dataFeedId
        );
        const beaconReadings = await readBeacons(api3ServerV1, [
          dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dataFeedId,
        ]);
        const dapiData = await api3Market.getDataFeedData(
          dapiManagementMerkleLeaves.ethUsdWithASingleBeacon!.values.dataFeedId
        );
        expect(dapiData.dataFeedDetails).to.equal(beaconDataFeedDetails);
        expect(dapiData.dataFeedValue).to.equal(dataFeedReading.value);
        expect(dapiData.dataFeedTimestamp).to.equal(dataFeedReading.timestamp);
        expect(dapiData.beaconValues).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.value));
        expect(dapiData.beaconTimestamps).to.deep.equal(beaconReadings.map((beaconReading) => beaconReading.timestamp));
      });
    });
  });

  describe('subscriptionIdToUpdateParameters', function () {
    context('Subscription exists', function () {
      it('returns the update parameters of the subscription', async function () {
        const {
          roles,
          dataFeedDetails,
          api3Market,
          dapiManagementMerkleLeaves,
          dapiManagementMerkleRoot,
          dapiPricingMerkleLeaves,
          dapiPricingMerkleRoot,
        } = await helpers.loadFixture(deploy);
        await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);
        const subscriptionId = computeSubscriptionId(
          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters
        );
        await api3Market
          .connect(roles.randomPerson)
          .buySubscription(
            dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
            dapiManagementMerkleLeaves.ethUsd!.values.dataFeedId,
            dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiManagementMerkleRoot, dapiManagementMerkleLeaves.ethUsd!.proof]
            ),
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
            dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32[]'],
              [dapiPricingMerkleRoot, dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.proof]
            ),
            {
              value: await computeRequiredPaymentAmount(
                api3Market,
                dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.duration,
                dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.price,
                dapiManagementMerkleLeaves.ethUsd!.values.sponsorWalletAddress
              ),
            }
          );
        expect(await api3Market.subscriptionIdToUpdateParameters(subscriptionId)).to.equal(
          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters
        );
      });
    });
    context('Subscription does not exist', function () {
      it('returns empty bytes string', async function () {
        const { api3Market, dapiManagementMerkleLeaves, dapiPricingMerkleLeaves } = await helpers.loadFixture(deploy);
        const subscriptionId = computeSubscriptionId(
          dapiManagementMerkleLeaves.ethUsd!.values.dapiName,
          dapiPricingMerkleLeaves.onePercentDeviationThresholdForOneMonth!.values.updateParameters
        );
        expect(await api3Market.subscriptionIdToUpdateParameters(subscriptionId)).to.equal('0x');
      });
    });
  });
});
