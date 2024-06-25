import type { AddressLike, BaseWallet, BigNumberish, BytesLike } from 'ethers';
import { ethers } from 'hardhat';

import type { Api3ServerV1 } from '../src/index';

const PROTOCOL_IDS = {
  RRP: '1',
  PSP: '2',
  RELAYED_RRP: '3',
  RELAYED_PSP: '4',
  AIRSEEKER: '5',
  AIRKEEPER: '12345',
};

const BIT_MASK_FOR_LEAST_SIGNIFICANT_31_BITS = BigInt(2 ** 31 - 1);

const ROOT_PATH = "m/44'/60'/0'";

function deriveWalletPathFromSponsorAddress(sponsorAddress: AddressLike, protocolId: number) {
  const sponsorAddressBN = BigInt(sponsorAddress as any);
  const paths = [];
  for (let i = 0; i < 6; i++) {
    const shiftedSponsorAddressBN = sponsorAddressBN >> BigInt(31 * i);
    paths.push((shiftedSponsorAddressBN & BIT_MASK_FOR_LEAST_SIGNIFICANT_31_BITS).toString());
  }
  return `${protocolId}/${paths.join('/')}`;
}

function generateRandomAirnodeWallet() {
  const airnodeWallet = ethers.HDNodeWallet.createRandom();
  const airnodeMnemonic = airnodeWallet.mnemonic!.phrase;
  const airnodeXpub = ethers.HDNodeWallet.fromPhrase(airnodeMnemonic, undefined, ROOT_PATH).neuter().extendedKey;
  return { airnodeAddress: airnodeWallet.address, airnodeMnemonic, airnodeXpub };
}

function generateRandomAddress() {
  return ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
}

function generateRandomBytes32() {
  return ethers.hexlify(ethers.randomBytes(32));
}

function generateRandomBytes() {
  return ethers.hexlify(ethers.randomBytes(256));
}

function deriveSponsorWalletAddress(airnodeXpub: string, sponsorAddress: AddressLike, protocolId: number) {
  return ethers.HDNodeWallet.fromExtendedKey(airnodeXpub).derivePath(
    deriveWalletPathFromSponsorAddress(sponsorAddress, protocolId)
  ).address;
}

function deriveSponsorWallet(airnodeMnemonic: string, sponsorAddress: AddressLike, protocolId: number) {
  return ethers.HDNodeWallet.fromPhrase(
    airnodeMnemonic,
    undefined,
    `${ROOT_PATH}/${deriveWalletPathFromSponsorAddress(sponsorAddress, protocolId)}`
  );
}

function decodeRevertString(returndata: BytesLike) {
  try {
    return ethers.AbiCoder.defaultAbiCoder().decode(['string'], `0x${returndata.toString().slice(2 + 4 * 2)}`)[0];
  } catch {
    return 'No revert string';
  }
}

function deriveRootRole(managerAddress: AddressLike) {
  return ethers.solidityPackedKeccak256(['address'], [managerAddress]);
}

function deriveRole(adminRole: BytesLike, roleDescription: string) {
  return ethers.solidityPackedKeccak256(
    ['bytes32', 'bytes32'],
    [adminRole, ethers.solidityPackedKeccak256(['string'], [roleDescription])]
  );
}

async function signData(airnode: BaseWallet, templateId: BytesLike, timestamp: number, data: BytesLike) {
  const signature = await airnode.signMessage(
    ethers.getBytes(ethers.solidityPackedKeccak256(['bytes32', 'uint256', 'bytes'], [templateId, timestamp, data]))
  );
  return signature;
}

async function signOevData(
  api3ServerV1: Api3ServerV1,
  oevProxyAddress: AddressLike,
  dataFeedId: BytesLike,
  updateId: BytesLike,
  timestamp: number,
  data: BytesLike,
  searcherAddress: AddressLike,
  bidAmount: BigNumberish,
  airnode: BaseWallet,
  templateId: BytesLike
) {
  const { chainId } = await api3ServerV1.runner!.provider!.getNetwork();
  const oevUpdateHash = ethers.solidityPackedKeccak256(
    ['uint256', 'address', 'address', 'bytes32', 'bytes32', 'uint256', 'bytes', 'address', 'uint256'],
    [
      chainId,
      await api3ServerV1.getAddress(),
      oevProxyAddress,
      dataFeedId,
      updateId,
      timestamp,
      data,
      searcherAddress,
      bidAmount,
    ]
  );
  const signature = await airnode.signMessage(
    ethers.getBytes(ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [oevUpdateHash, templateId]))
  );
  return signature;
}

async function updateBeacon(
  api3ServerV1: Api3ServerV1,
  feedName: string,
  airnode: BaseWallet,
  timestamp: BigNumberish,
  value: BigNumberish
) {
  const encodedValue = ethers.AbiCoder.defaultAbiCoder().encode(['int224'], [value]);
  const templateId = deriveTemplateId(`OIS title of Airnode with address ${airnode.address}`, feedName);
  const beaconId = deriveBeaconId(airnode.address, templateId);
  await api3ServerV1.updateBeaconWithSignedData(
    airnode.address,
    templateId,
    timestamp,
    encodedValue,
    await airnode.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(['bytes32', 'uint256', 'bytes'], [templateId, timestamp, encodedValue])
      )
    )
  );
  return {
    templateId,
    beaconId,
  };
}

async function updateBeaconSet(
  api3ServerV1: Api3ServerV1,
  feedName: string,
  airnodes: BaseWallet[],
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
        ethers.getBytes(
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

async function readBeacons(api3ServerV1: Api3ServerV1, beaconIds: BytesLike[]) {
  const returndata = await api3ServerV1.multicall.staticCall(
    beaconIds.map((beaconId) => api3ServerV1.interface.encodeFunctionData('dataFeeds', [beaconId]))
  );
  return returndata
    .map((returndata) => ethers.AbiCoder.defaultAbiCoder().decode(['int224', 'uint32'], returndata))
    .map((decodedReturnData) => {
      return { value: decodedReturnData[0], timestamp: decodedReturnData[1] };
    });
}

function encodeUpdateParameters(deviationThreshold: number, deviationReference: number, heartbeatInterval: number) {
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

export {
  PROTOCOL_IDS,
  generateRandomAirnodeWallet,
  generateRandomAddress,
  generateRandomBytes32,
  generateRandomBytes,
  deriveSponsorWalletAddress,
  deriveSponsorWallet,
  decodeRevertString,
  deriveRootRole,
  deriveRole,
  signData,
  signOevData,
  updateBeacon,
  updateBeaconSet,
  readBeacons,
  encodeUpdateParameters,
  deriveTemplateId,
  deriveBeaconId,
  deriveBeaconSetId,
};
