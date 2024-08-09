import { deployments, ethers, network } from 'hardhat';

import { chainsSupportedByDapis } from '../data/chain-support.json';
import { Api3ServerV1__factory } from '../src/index';

type Address = string | `0x${string}`;
type BytesLike = string | Uint8Array;

module.exports = async () => {
  const { log } = deployments;
  const [deployer] = await ethers.getSigners();
  const airnodeAddress = '0x07b589f06bD0A5324c4E2376d66d2F4F25921DE1' as Address;
  const BEACON_SET_BEACON_COUNT = 7;

  if (!chainsSupportedByDapis.includes(network.name)) {
    log(`Skipping Beacon set update for ${network.name}`);
    return;
  }

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

  const updateMulticallData = [] as BytesLike[];

  const updateSignatures = [
    '0x3149d2642658ca2bbf08a47bce005ef5edb8d6c084a154638f4acff14bd9dc77110b54243126ed6cea05eaf810d825b5b4d816e0c254f6160ff97abab67919ee1b',
    '0x4da679af6915f03bf9c2865cedba81ac141c9ed40952fba7a9f827b3fba0236949d9bf3a3a468eb7a146f95369aed60998d0123afbb6260427d3e9140c8fbeda1b',
    '0xb44989a9afb4b0f1a7cc21964c8f3bdfcf42f707823ab40771a473f3d2b8288468a1677d5c509233362ca73ef9e17653216ea72cff163a1a3246428fb02410971b',
    '0xbbb946b391ac46ccf0bbd5f549a01cfcb36471525bfd80e8eef8bc62ea5ee1215adb7a4b3aa6a22cc9db3ac44837c765330d7660b1136edd0fdc30ec1a8a48ce1c',
    '0x620db08a26b8acba0108a4e6be834aa5aefc8a7304581b2117ed775df40aedbf75ae190d7f000dd152f921df44469690b816834e68eef2bac2ea6daa8e94960b1b',
    '0x94f32241043cda7efbb3aeff88e460eb46bce8d6b8df784621cd47a39790f7e80f7aca6567b2e656cdf4fd7277d3fd4522bafbfaeb2c31b6e837dd71af7869931c',
    '0x2c25ed17835336f80d1a4705817685069e3d1b93108469e330766ae6921d27262a66ee6318e6aec3d58ce5fcfcd12fa3a528f2a3e042bbda6c9eba7b322099a01c',
  ];
  for (const [ind, templateId] of templateIds.entries()) {
    if (dataFeedReadings[ind] === ethers.AbiCoder.defaultAbiCoder().encode(['int224', 'uint32'], [0, 0])) {
      const signature = updateSignatures[ind] as BytesLike;
      const data = `0x${(ind + 1).toString().padStart(64, '0')}` as BytesLike;
      const callData = api3ServerV1.interface.encodeFunctionData('updateBeaconWithSignedData', [
        airnodeAddress,
        templateId,
        ind + 1,
        data,
        signature,
      ]);
      updateMulticallData.push(callData);
    }
  }

  if (
    dataFeedReadings[BEACON_SET_BEACON_COUNT] === ethers.AbiCoder.defaultAbiCoder().encode(['int224', 'uint32'], [0, 0])
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
  const estimateGasMulticallData = [] as BytesLike[];

  const gasEstimationSignatures = [
    '0xc536e13f74384d8cfcfee6a9f96bdc2572208fc71dec8b95cb08f535776237af7adbf9eaf217483c60f5fabfaf601d5d620d37894cc0ed4e6d30a763790bb2ba1c',
    '0x414969811706716036ce99f8abbeeedadef376e3d4c83ebcd75f5d60391ff5cb4250e0d70b37acce9fc33d6bdd12816dd6154ab8bf76ef2a5bb9ce667af527f01c',
    '0xca9b15bb0e6502c3ee845b207fc3421baaf56a570ef19dc1aadbfa0f2c4773780908bb8fc4b42b0b51b3bde37a115d90049c9a05adf9eab21610b17c7e6308081b',
    '0xf6acb06f80e13ebaee53d48759a2790cff8dcbf1505c1c16702b370714b8dda4768bf84e1ffc0b1cca239b47f100870968b22072e4e3037dc5d4e1b9255aae301b',
    '0xcf9b9ed2a24cb84077f04b5c668df943171cdede356a9573ac253c2f2fe225392098eeef1c1a8ffd4b8fe118790f78d1c2317fc56ce28c30711d5262523f11a81c',
    '0x141e0ac1537e7e82bb6c524ae66978753ea4786995b3cdb8fac32731dabdb5257934ca1a728e7128419dcd8797955c37d20373a3230a64959f63c6d787d305681c',
    '0xef3c28334bfbc669cb73135536dd32a0115766376dfa2c6237926da6a81dd4240c67b12c1232e15b0cd1a6fb569d8f85fa608e549b871ccc9aa69e5112b7f10b1c',
  ];

  for (const [ind, templateId] of templateIds.entries()) {
    const signature = gasEstimationSignatures[ind] as BytesLike;
    const data = `0x${(ind + 101).toString().padStart(64, '0')}` as BytesLike;
    const callData = api3ServerV1.interface.encodeFunctionData('updateBeaconWithSignedData', [
      airnodeAddress,
      templateId,
      ind + 101,
      data,
      signature,
    ]);
    estimateGasMulticallData.push(callData);
  }

  estimateGasMulticallData.push(api3ServerV1.interface.encodeFunctionData('updateBeaconSetWithBeacons', [beaconIds]));
  const estimateGasCalldata = api3ServerV1.interface.encodeFunctionData('multicall', [estimateGasMulticallData]);
  // log(`Beacon set update estimate gas calldata:\n${estimateGasCalldata}`);
  const voidSigner = new ethers.VoidSigner(airnodeAddress, ethers.provider);
  const gasCost = await voidSigner?.estimateGas({ to: api3ServerV1.getAddress(), data: estimateGasCalldata });
  log(`Estimated Beacon set update gas cost: ${gasCost}`);
};
module.exports.tags = ['update'];
