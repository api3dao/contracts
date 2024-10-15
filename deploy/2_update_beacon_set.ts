import { type HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import type { AddressLike, BytesLike } from 'ethers';
import { deployments, ethers, network } from 'hardhat';

import { chainsSupportedByDapis } from '../data/chain-support.json';
import { type Api3ServerV1, Api3ServerV1__factory } from '../src/index';

type UpdateBeaconWithSignedDataArgsType = [AddressLike, BytesLike, number, BytesLike, BytesLike];

async function getCallData(
  api3ServerV1: Api3ServerV1,
  airnodeAddress: AddressLike,
  value: number,
  templateId: BytesLike,
  signature: BytesLike
): Promise<BytesLike> {
  const data = `0x${value.toString().padStart(64, '0')}` as BytesLike;
  const args: UpdateBeaconWithSignedDataArgsType = [airnodeAddress, templateId, value, data, signature];
  return api3ServerV1.interface.encodeFunctionData('updateBeaconWithSignedData', args);
}

function getUpdateSignature(ind: number): BytesLike {
  const updateSignatures = [
    '0x3149d2642658ca2bbf08a47bce005ef5edb8d6c084a154638f4acff14bd9dc77110b54243126ed6cea05eaf810d825b5b4d816e0c254f6160ff97abab67919ee1b',
    '0x4da679af6915f03bf9c2865cedba81ac141c9ed40952fba7a9f827b3fba0236949d9bf3a3a468eb7a146f95369aed60998d0123afbb6260427d3e9140c8fbeda1b',
    '0xb44989a9afb4b0f1a7cc21964c8f3bdfcf42f707823ab40771a473f3d2b8288468a1677d5c509233362ca73ef9e17653216ea72cff163a1a3246428fb02410971b',
    '0xbbb946b391ac46ccf0bbd5f549a01cfcb36471525bfd80e8eef8bc62ea5ee1215adb7a4b3aa6a22cc9db3ac44837c765330d7660b1136edd0fdc30ec1a8a48ce1c',
    '0x620db08a26b8acba0108a4e6be834aa5aefc8a7304581b2117ed775df40aedbf75ae190d7f000dd152f921df44469690b816834e68eef2bac2ea6daa8e94960b1b',
    '0x94f32241043cda7efbb3aeff88e460eb46bce8d6b8df784621cd47a39790f7e80f7aca6567b2e656cdf4fd7277d3fd4522bafbfaeb2c31b6e837dd71af7869931c',
    '0x2c25ed17835336f80d1a4705817685069e3d1b93108469e330766ae6921d27262a66ee6318e6aec3d58ce5fcfcd12fa3a528f2a3e042bbda6c9eba7b322099a01c',
  ] as BytesLike[];

  return updateSignatures[ind] as BytesLike;
}

function signatureCorrection(signature: string) {
  const v = Number.parseInt(signature.slice(-2), 16);
  let updatedV;
  if (v === 0 || v === 1) {
    // Ledger subtracts 27 from v, undo that
    // https://github.com/LedgerHQ/ledgerjs/issues/466
    updatedV = v + 27;
  } else if (v === 27 || v === 28) {
    updatedV = v;
  } else {
    throw new Error(`Unexpected v in signature: ${v}`);
  }
  return signature.slice(0, -2) + updatedV.toString(16).padStart(2, '0');
}

async function signMessage(value: number, templateId: BytesLike, deployer: HardhatEthersSigner): Promise<BytesLike> {
  const data = `0x${value.toString().padStart(64, '0')}` as BytesLike;
  const encodeFunctionData = ethers.solidityPackedKeccak256(['bytes32', 'uint256', 'bytes'], [templateId, value, data]);
  return signatureCorrection(await deployer.signMessage(ethers.getBytes(encodeFunctionData)));
}

module.exports = async () => {
  const { log } = deployments;
  const [deployer] = await ethers.getSigners();
  const airnodeAddress = ethers.getAddress('0x07b589f06bD0A5324c4E2376d66d2F4F25921DE1');
  const BEACON_SET_BEACON_COUNT = 7;

  if (!chainsSupportedByDapis.includes(network.name)) {
    log(`Skipping Beacon set update for ${network.name}`);
    return;
  }

  if (!deployer) {
    log('Deployer not provided');
    return;
  }
  const isDeployer = airnodeAddress === deployer.address;

  const Api3ServerV1 = await deployments.get('Api3ServerV1');
  const api3ServerV1 = Api3ServerV1__factory.connect(Api3ServerV1.address, deployer);

  const templateIds = [...Array.from({ length: BEACON_SET_BEACON_COUNT }).keys()].map(
    (index) => `0x${(index + 1).toString(16).padStart(64, '0')}`
  ) as BytesLike[];
  const beaconIds = templateIds.map((templateId) =>
    ethers.solidityPackedKeccak256(['address', 'bytes32'], [airnodeAddress, templateId])
  );
  const beaconSetId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [beaconIds]));
  const dataFeedReadings = await api3ServerV1.multicall.staticCall([
    ...beaconIds.map((beaconId) => api3ServerV1.interface.encodeFunctionData('dataFeeds', [beaconId])),
    api3ServerV1.interface.encodeFunctionData('dataFeeds', [beaconSetId]),
  ]);

  const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(['int224', 'uint32'], [0, 0]);

  const updateMulticallData = [] as BytesLike[];

  for (const [ind, templateId] of templateIds.entries()) {
    if (dataFeedReadings[ind] === initialValue) {
      const signature = isDeployer ? await signMessage(ind + 1, templateId, deployer) : getUpdateSignature(ind);
      updateMulticallData.push(await getCallData(api3ServerV1, airnodeAddress, ind + 1, templateId, signature));
    }
  }

  if (dataFeedReadings[BEACON_SET_BEACON_COUNT] === initialValue) {
    updateMulticallData.push(api3ServerV1.interface.encodeFunctionData('updateBeaconSetWithBeacons', [beaconIds]));
  }

  if (updateMulticallData.length > 0) {
    const transaction = await api3ServerV1.multicall(updateMulticallData);
    await transaction.wait();
    log('Executed Beacon set update');
  } else {
    log('Beacon set update already executed');
  }

  if (!isDeployer) {
    log('Skipping gas estimation for non-deployer');
    return;
  }

  const estimateGasMulticallData = [] as BytesLike[];

  for (const [ind, templateId] of templateIds.entries()) {
    const signature = await signMessage(ind + 102, templateId, deployer);
    estimateGasMulticallData.push(await getCallData(api3ServerV1, airnodeAddress, ind + 102, templateId, signature));
  }

  estimateGasMulticallData.push(api3ServerV1.interface.encodeFunctionData('updateBeaconSetWithBeacons', [beaconIds]));
  const estimateGasCalldata = api3ServerV1.interface.encodeFunctionData('multicall', [estimateGasMulticallData]);
  // log(`Beacon set update estimate gas calldata:\n${estimateGasCalldata}`);
  const voidSigner = new ethers.VoidSigner(airnodeAddress, ethers.provider);
  const gasCost = await voidSigner?.estimateGas({ to: api3ServerV1.getAddress(), data: estimateGasCalldata });
  log(`Estimated Beacon set update gas cost: ${gasCost}`);
};
module.exports.tags = ['update'];
