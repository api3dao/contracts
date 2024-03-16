import { deployments, ethers, network } from 'hardhat';

import { chainsSupportedByDapis } from '../data/chain-support.json';
import type { Api3ServerV1 } from '../src/index';

module.exports = async () => {
  const { log } = deployments;
  const [deployer] = await ethers.getSigners();
  const EXPECTED_DEPLOYER_ADDRESS = ethers.getAddress('0x07b589f06bD0A5324c4E2376d66d2F4F25921DE1');
  const BEACON_SET_BEACON_COUNT = 7;

  if (chainsSupportedByDapis.includes(network.name)) {
    if (deployer!.address === EXPECTED_DEPLOYER_ADDRESS) {
      const Api3ServerV1 = await deployments.get('Api3ServerV1');
      const api3ServerV1 = new ethers.Contract(
        Api3ServerV1.address,
        Api3ServerV1.abi,
        deployer
      ) as unknown as Api3ServerV1;
      const airnodeAddress = deployer?.address;
      const templateIds = [...Array.from({ length: BEACON_SET_BEACON_COUNT }).keys()].map(
        (index) => `0x${(index + 1).toString(16).padStart(64, '0')}`
      );
      const beaconIds = templateIds.map((templateId) =>
        ethers.solidityPackedKeccak256(['address', 'bytes32'], [airnodeAddress, templateId])
      );
      const beaconSetId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [beaconIds]));
      const dataFeedReadings = await api3ServerV1.multicall.staticCall([
        ...beaconIds.map((beaconId) => api3ServerV1.interface.encodeFunctionData('dataFeeds', [beaconId])),
        api3ServerV1.interface.encodeFunctionData('dataFeeds', [beaconSetId]),
      ]);
      const updateMulticallData = [];
      for (const [ind, templateId] of templateIds.entries()) {
        if (dataFeedReadings[ind] === ethers.AbiCoder.defaultAbiCoder().encode(['int224', 'uint32'], [0, 0])) {
          updateMulticallData.push(
            api3ServerV1.interface.encodeFunctionData('updateBeaconWithSignedData', [
              airnodeAddress,
              templateId,
              ind + 1,
              `0x${(ind + 1).toString().padStart(64, '0')}`,
              await deployer?.signMessage(
                ethers.toBeArray(
                  ethers.solidityPackedKeccak256(
                    ['bytes32', 'uint256', 'bytes'],
                    [templateId, ind + 1, `0x${(ind + 1).toString().padStart(64, '0')}`]
                  )
                )
              ),
            ])
          );
        }
      }
      if (
        dataFeedReadings[BEACON_SET_BEACON_COUNT] ===
        ethers.AbiCoder.defaultAbiCoder().encode(['int224', 'uint32'], [0, 0])
      ) {
        updateMulticallData.push(api3ServerV1.interface.encodeFunctionData('updateBeaconSetWithBeacons', [beaconIds]));
      }
      if (updateMulticallData.length > 0) {
        const transaction = await api3ServerV1.multicall(updateMulticallData);
        await transaction.wait();
        log('Executed Beacon set update');
      } else {
        log('Beacon set update already executed');
      }
      const estimateGasMulticallData = [];
      for (const [ind, templateId] of templateIds.entries()) {
        estimateGasMulticallData.push(
          api3ServerV1.interface.encodeFunctionData('updateBeaconWithSignedData', [
            airnodeAddress,
            templateId,
            ind + 101,
            `0x${(ind + 101).toString().padStart(64, '0')}`,
            await deployer?.signMessage(
              ethers.toBeArray(
                ethers.solidityPackedKeccak256(
                  ['bytes32', 'uint256', 'bytes'],
                  [templateId, ind + 101, `0x${(ind + 101).toString().padStart(64, '0')}`]
                )
              )
            ),
          ])
        );
      }
      estimateGasMulticallData.push(
        api3ServerV1.interface.encodeFunctionData('updateBeaconSetWithBeacons', [beaconIds])
      );
      const estimateGasCalldata = api3ServerV1.interface.encodeFunctionData('multicall', [estimateGasMulticallData]);
      // log(`Beacon set update estimate gas calldata:\n${estimateGasCalldata}`);
      const voidSigner = new ethers.VoidSigner(EXPECTED_DEPLOYER_ADDRESS, ethers.provider);
      log(
        `Estimated Beacon set update gas cost: ${await voidSigner?.estimateGas({ to: api3ServerV1.getAddress(), data: estimateGasCalldata })}`
      );
    } else {
      log(`Skipping Beacon set update because deployer is not ${EXPECTED_DEPLOYER_ADDRESS}`);
    }
  }
};
module.exports.tags = ['update'];
