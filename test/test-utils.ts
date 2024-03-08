import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import type { AddressLike, BigNumberish, BytesLike, HDNodeWallet } from 'ethers';
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

const BIT_MASK_FOR_LEAST_SIGNIFICANT_31_BITS = 2n ** 32n - 1n;

function deriveWalletPathFromSponsorAddress(sponsorAddress: AddressLike, protocolId: number) {
  const sponsorAddressBN = BigInt(sponsorAddress as any);
  const paths = [];
  for (let i = 0; i < 6; i++) {
    const shiftedSponsorAddressBN = sponsorAddressBN >> (31n * BigInt(i));
    paths.push((shiftedSponsorAddressBN & BIT_MASK_FOR_LEAST_SIGNIFICANT_31_BITS).toString());
  }
  return `${protocolId}/${paths.join('/')}`;
}

function generateRandomAirnodeWallet() {
  const airnodeWallet = ethers.HDNodeWallet.createRandom();
  const airnodeMnemonic = airnodeWallet.mnemonic!.phrase;
  const hdNode = ethers.HDNodeWallet.fromPhrase(airnodeMnemonic).derivePath("m/44'/60'/0'");
  const airnodeXpub = hdNode.neuter().extendedKey;
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
  const hdNodeFromXpub = ethers.HDNodeWallet.fromExtendedKey(airnodeXpub);
  const sponsorWalletHdNode = hdNodeFromXpub.derivePath(deriveWalletPathFromSponsorAddress(sponsorAddress, protocolId));
  return sponsorWalletHdNode.address;
}

function deriveSponsorWallet(airnodeMnemonic: string, sponsorAddress: AddressLike, protocolId: number) {
  return ethers.HDNodeWallet.fromPhrase(
    airnodeMnemonic,
    `m/44'/60'/0'/${deriveWalletPathFromSponsorAddress(sponsorAddress, protocolId)}`
  ).connect(ethers.provider);
}

function decodeRevertString(returndata: BytesLike) {
  return ethers.AbiCoder.defaultAbiCoder().decode(['string'], `0x${returndata.toString().slice(2 + 4 * 2)}`)[0];
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

async function signData(
  airnode: HardhatEthersSigner | HDNodeWallet,
  templateId: BytesLike,
  timestamp: number,
  data: BytesLike
) {
  const signature = await airnode.signMessage(
    ethers.toBeArray(ethers.solidityPackedKeccak256(['bytes32', 'uint256', 'bytes'], [templateId, timestamp, data]))
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
  airnode: HDNodeWallet,
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
    ethers.toBeArray(ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [oevUpdateHash, templateId]))
  );
  return signature;
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
};
