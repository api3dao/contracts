/* eslint-disable no-console */
import { ethers, network } from 'hardhat';

async function main() {
  if (!['ethereum', 'localhost', 'hardhat'].includes(network.name)) {
    throw new Error(
      `HumpyComp deployment is supported on ethereum and local forks (localhost/hardhat), got ${network.name}`
    );
  }

  const compAddress = '0xc00e94Cb662C3520282E6f5717214004A7f26888';
  const compCode = await ethers.provider.getCode(compAddress);
  if (compCode === '0x') {
    throw new Error(
      `COMP is not available at ${compAddress} on ${network.name}. Use Ethereum mainnet or a local Ethereum mainnet fork.`
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying HumpyComp with the account: ${deployer!.address}`);

  const ownerAddress = process.env.OWNER ?? deployer!.address;
  const initialDelegatee = process.env.INITIAL_DELEGATEE;

  if (!initialDelegatee) {
    throw new Error('Set INITIAL_DELEGATEE in environment');
  }

  const HumpyComp = await ethers.getContractFactory('HumpyComp', deployer);
  const humpyComp = await HumpyComp.deploy(ownerAddress, initialDelegatee);
  await humpyComp.waitForDeployment();

  const deployedAddress = await humpyComp.getAddress();
  console.log(`HumpyComp deployed at: ${deployedAddress}`);
  console.log(`Owner: ${await humpyComp.owner()}`);
  console.log(`Initial delegatee: ${await humpyComp.delegatee()}`);

  if (network.name === 'ethereum') {
    console.log('Verify with:');
    console.log(`pnpm hardhat verify --network ethereum ${deployedAddress} "${ownerAddress}" "${initialDelegatee}"`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
