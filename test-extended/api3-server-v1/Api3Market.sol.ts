/* eslint-disable @typescript-eslint/no-loop-func */
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import type { BytesLike, HDNodeWallet } from 'ethers';
import { ethers } from 'hardhat';

import { encodeUpdateParameters, updateBeaconSet } from '../../test/test-utils';

describe('Api3Market', function () {
  const MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH = 5;

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

    const beaconSetValueTimestamp = await helpers.time.latest();
    const {
      templateIds,
      beaconIds,
      beaconSetId: dataFeedId,
    } = await updateBeaconSet(api3ServerV1, 'ETH/USD', airnodes, beaconSetValueTimestamp, ethers.parseEther('2200'));
    const dataFeedDetails = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address[]', 'bytes32[]'],
      [airnodes.map((airnode) => airnode.address), templateIds]
    );

    const dapiName = ethers.encodeBytes32String('ETH/USD');

    const ProxyFactory = await ethers.getContractFactory('ProxyFactory', roles.deployer);
    const proxyFactory = await ProxyFactory.deploy(api3ServerV1.getAddress());

    const Api3Market = await ethers.getContractFactory('MockApi3Market', roles.deployer);
    const api3Market = await Api3Market.deploy(
      roles.owner!.address,
      proxyFactory.getAddress(),
      MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH
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

    await api3Market.connect(roles.randomPerson).registerDataFeed(dataFeedDetails);

    return {
      accessControlRegistry,
      airnodes,
      api3Market,
      api3ServerV1,
      beaconIds,
      dapiName,
      dataFeedDetails,
      dataFeedId,
      proxyFactory,
      roles,
      templateIds,
    };
  }

  describe('Subscription queue', function () {
    for (let initialQueueLength = 0; initialQueueLength <= MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH; initialQueueLength++) {
      context(`Initial queue length is ${initialQueueLength}`, function () {
        // Say we start with a subscription queue of length 2 that goes like S1->S2 (where S1 is superior to S2 and
        // ends earlier). A new subscription can make the queue look like either of the following:
        // 1. SN (SN is superior to both, and ends after both)
        // 2. SN->S2 (SN is superior to both, and ends after S1 and before S2)
        // 3. SN->S1->S2 (SN is superior to both, and ends before both)
        // 4. S1->SN (SN is superior to S2, and ends after both)
        // 5. S1->SN->S2 (SN is superior to S2, and ends after S1 and before S2)
        // 6. S1->S2->SN (SN is not superior to either, and ends after both)
        // Therefore, there are two main parameters for candidate subscriptions:
        // 1. How many of the subscriptions in the queue are inferior to it (both, S2, or none)
        // 2. How many of the subscriptions in the queue end before it (both, S1, or none)
        // which creates (queueLength + 1) * (queueLength + 1) = (2 + 1) * (2 + 1) = 9 combinations. Out of these 9
        // combinations, 6 are valid (the ones listed above), and the other three correspond to cases where the new
        // subscription can't be added:
        // 7. SN is superior to S2, and ends before both
        // 8. SN is not superior to either, and ends after S1 and before S2
        // 9. SN is not superior to either, and ends before both
        for (
          let countSubscriptionsInferiorToCandidate = 0;
          countSubscriptionsInferiorToCandidate <= initialQueueLength;
          countSubscriptionsInferiorToCandidate++
        ) {
          for (
            let countSubscriptionsEndingBeforeCandidate = 0;
            countSubscriptionsEndingBeforeCandidate <= initialQueueLength;
            countSubscriptionsEndingBeforeCandidate++
          ) {
            context(
              `${countSubscriptionsInferiorToCandidate} subscriptions are inferior to the candidate`,
              function () {
                context(
                  `${countSubscriptionsEndingBeforeCandidate} subscriptions end before the candidate`,
                  function () {
                    // Recall the cases 1-9 from above. If we create a table where the columns (C1, C2) are
                    // countSubscriptionsInferiorToCandidate and countSubscriptionsEndingBeforeCandidate,
                    //   C1 C2
                    // 1. 2  2  (valid)
                    // 2. 2  1  (valid)
                    // 3. 2  0  (valid)
                    // 4. 1  2  (valid)
                    // 5. 1  1  (valid)
                    // 6. 0  2  (valid)
                    // 7. 1  0  (invalid)
                    // 8. 0  1  (invalid)
                    // 9. 0  0  (invalid)
                    // It is clear that the sum of the two values being greater than or equal to the initial queue
                    // length is required for the candidate subscription to upgrade the queue.
                    if (
                      countSubscriptionsInferiorToCandidate + countSubscriptionsEndingBeforeCandidate <
                      initialQueueLength
                    ) {
                      it('reverts because the candidate subscription does not upgrade the queue', async function () {
                        const { api3Market, dapiName, dataFeedId } = await helpers.loadFixture(deploy);
                        // Prepare the starting subscription queue
                        // The queue consists of increasingly inferior update parameters and later end timestamps
                        for (let subscriptionInd = 0; subscriptionInd < initialQueueLength; subscriptionInd++) {
                          await api3Market.addSubscriptionToQueue_(
                            dapiName,
                            dataFeedId,
                            encodeUpdateParameters((subscriptionInd + 1) * 1_000_000, 0, 24 * 60 * 60),
                            (subscriptionInd + 1) * 24 * 60 * 60,
                            1000
                          );
                        }
                        const nextBlockTimestamp = (await helpers.time.latest()) + 1;
                        await helpers.time.setNextBlockTimestamp(nextBlockTimestamp);
                        const candidateUpdateParameters = encodeUpdateParameters(
                          (initialQueueLength - countSubscriptionsInferiorToCandidate + 1) * 1_000_000 - 1,
                          0,
                          24 * 60 * 60
                        );
                        const startingSubscriptions = await api3Market.getDapiData(dapiName);
                        const subscriptionQueueEndTimestamps = startingSubscriptions.endTimestamps;
                        let candidateEndTimestamp;
                        if (countSubscriptionsEndingBeforeCandidate < subscriptionQueueEndTimestamps.length) {
                          candidateEndTimestamp =
                            subscriptionQueueEndTimestamps[countSubscriptionsEndingBeforeCandidate]! - 1n;
                        } else {
                          candidateEndTimestamp = nextBlockTimestamp + 1000 * 24 * 60 * 60;
                        }
                        const candidateDuration = BigInt(candidateEndTimestamp) - BigInt(nextBlockTimestamp);
                        await expect(
                          api3Market.addSubscriptionToQueue_(
                            dapiName,
                            dataFeedId,
                            candidateUpdateParameters,
                            candidateDuration,
                            1000
                          )
                        ).to.be.revertedWith('Subscription does not upgrade');
                      });
                    }
                    // One thing to note here is that even if the initial queue length is at the limit, the candidate
                    // subscription can replace some of the subscriptions (cases 1, 2, 4), in which case the queue
                    // wouldn't grow, meaning that we wouldn't get a revert due to the queue size limit.
                    else if (
                      initialQueueLength === MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH &&
                      countSubscriptionsInferiorToCandidate + countSubscriptionsEndingBeforeCandidate <=
                        initialQueueLength
                    ) {
                      it('reverts because the queue is full', async function () {
                        const { api3Market, dapiName, dataFeedId } = await helpers.loadFixture(deploy);
                        for (let subscriptionInd = 0; subscriptionInd < initialQueueLength; subscriptionInd++) {
                          await api3Market.addSubscriptionToQueue_(
                            dapiName,
                            dataFeedId,
                            encodeUpdateParameters((subscriptionInd + 1) * 1_000_000, 0, 24 * 60 * 60),
                            (subscriptionInd + 1) * 24 * 60 * 60,
                            1000
                          );
                        }
                        const nextBlockTimestamp = (await helpers.time.latest()) + 1;
                        await helpers.time.setNextBlockTimestamp(nextBlockTimestamp);
                        const candidateUpdateParameters = encodeUpdateParameters(
                          (initialQueueLength - countSubscriptionsInferiorToCandidate + 1) * 1_000_000 - 1,
                          0,
                          24 * 60 * 60
                        );
                        const startingSubscriptions = await api3Market.getDapiData(dapiName);
                        const subscriptionQueueEndTimestamps = startingSubscriptions.endTimestamps;
                        let candidateEndTimestamp;
                        if (countSubscriptionsEndingBeforeCandidate < subscriptionQueueEndTimestamps.length) {
                          candidateEndTimestamp =
                            subscriptionQueueEndTimestamps[countSubscriptionsEndingBeforeCandidate]! - 1n;
                        } else {
                          candidateEndTimestamp = nextBlockTimestamp + 1000 * 24 * 60 * 60;
                        }
                        const candidateDuration = BigInt(candidateEndTimestamp) - BigInt(nextBlockTimestamp);
                        await expect(
                          api3Market.addSubscriptionToQueue_(
                            dapiName,
                            dataFeedId,
                            candidateUpdateParameters,
                            candidateDuration,
                            1000
                          )
                        ).to.be.revertedWith('Subscription queue full');
                      });
                    } else {
                      it('candidate subscription gets added to the queue', async function () {
                        const { api3Market, dapiName, dataFeedId } = await helpers.loadFixture(deploy);
                        for (let subscriptionInd = 0; subscriptionInd < initialQueueLength; subscriptionInd++) {
                          const deviationThreshold = (subscriptionInd + 1) * 1_000_000;
                          await api3Market.addSubscriptionToQueue_(
                            dapiName,
                            dataFeedId,
                            encodeUpdateParameters(deviationThreshold, 0, 24 * 60 * 60),
                            (subscriptionInd + 1) * 24 * 60 * 60,
                            1000
                          );
                        }
                        const nextBlockTimestamp = (await helpers.time.latest()) + 1;
                        await helpers.time.setNextBlockTimestamp(nextBlockTimestamp);
                        const candidateDeviationThreshold =
                          (initialQueueLength - countSubscriptionsInferiorToCandidate + 1) * 1_000_000 - 1;
                        const candidateUpdateParameters = encodeUpdateParameters(
                          candidateDeviationThreshold,
                          0,
                          24 * 60 * 60
                        );
                        const startingSubscriptions = await api3Market.getDapiData(dapiName);
                        const subscriptionQueueEndTimestamps = startingSubscriptions.endTimestamps;
                        let candidateEndTimestamp;
                        if (countSubscriptionsEndingBeforeCandidate < subscriptionQueueEndTimestamps.length) {
                          candidateEndTimestamp =
                            subscriptionQueueEndTimestamps[countSubscriptionsEndingBeforeCandidate]! - 1n;
                        } else {
                          candidateEndTimestamp = nextBlockTimestamp + 1000 * 24 * 60 * 60;
                        }
                        const candidateDuration = BigInt(candidateEndTimestamp) - BigInt(nextBlockTimestamp);
                        await api3Market.addSubscriptionToQueue_(
                          dapiName,
                          dataFeedId,
                          candidateUpdateParameters,
                          candidateDuration,
                          1000
                        );
                        const expectedUpdateParameters: BytesLike[] = [];
                        const expectedEndTimestamps = [];
                        for (let subscriptionInd = 0; subscriptionInd < initialQueueLength; subscriptionInd++) {
                          const deviationThreshold = (subscriptionInd + 1) * 1_000_000;
                          if (candidateDeviationThreshold < deviationThreshold) {
                            if (!expectedUpdateParameters.includes(candidateUpdateParameters)) {
                              expectedUpdateParameters.push(candidateUpdateParameters);
                              expectedEndTimestamps.push(candidateEndTimestamp);
                            }
                            if (candidateEndTimestamp < subscriptionQueueEndTimestamps[subscriptionInd]!) {
                              expectedUpdateParameters.push(
                                encodeUpdateParameters(deviationThreshold, 0, 24 * 60 * 60)
                              );
                              expectedEndTimestamps.push(subscriptionQueueEndTimestamps[subscriptionInd]);
                            }
                          } else {
                            expectedUpdateParameters.push(encodeUpdateParameters(deviationThreshold, 0, 24 * 60 * 60));
                            expectedEndTimestamps.push(subscriptionQueueEndTimestamps[subscriptionInd]);
                          }
                        }
                        if (!expectedUpdateParameters.includes(candidateUpdateParameters)) {
                          expectedUpdateParameters.push(candidateUpdateParameters);
                          expectedEndTimestamps.push(candidateEndTimestamp);
                        }
                        const resultingSubscriptions = await api3Market.getDapiData(dapiName);
                        expect(resultingSubscriptions.updateParameters).to.deep.equal(expectedUpdateParameters);
                        expect(resultingSubscriptions.endTimestamps).to.deep.equal(expectedEndTimestamps);
                      });
                    }
                  }
                );
              }
            );
          }
        }
      });
    }
  });
});
