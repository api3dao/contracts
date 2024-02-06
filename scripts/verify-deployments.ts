// Even though hardhat-etherscan claims to also verify the deployment locally,
// it doesn't expose that as a command. As a result, you can't verify deployments
// on chains at which there is no supported block explorer. This is an alternative
// that fetches the deployed bytecode from a chain and compares that with the output
// of the local compilation.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { go } from '@api3/promise-utils';
import { config, deployments, ethers } from 'hardhat';

import { chainsSupportedByDapis } from '../src/supported-chains';

const METADATA_HASH_LENGTH = 106;
const CREATE2_FACTORY_ADDRESS = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

async function main() {
  const chainAliases = chainsSupportedByDapis.includes(process.env.NETWORK!)
    ? [process.env.NETWORK]
    : chainsSupportedByDapis;
  const contractNames = ['AccessControlRegistry', 'Api3ServerV1', 'OwnableCallForwarder', 'ProxyFactory'];

  for (const chainAlias of chainAliases) {
    const provider = new ethers.JsonRpcProvider((config.networks[chainAlias!] as any).url);
    for (const contractName of contractNames) {
      const deployment = JSON.parse(
        fs.readFileSync(path.join('deployments', chainAlias!, `${contractName}.json`), 'utf8')
      );
      const artifact = await deployments.getArtifact(contractName);
      const constructor = artifact.abi.find((method) => method.type === 'constructor');
      const expectedEncodedConstructorArguments = constructor
        ? ethers.AbiCoder.defaultAbiCoder().encode(
            constructor.inputs.map((input: any) => input.type),
            deployment.args
          )
        : '0x';

      const goFetchCreationTx = await go(async () => provider.getTransaction(deployment.transactionHash), {
        retries: 5,
        attemptTimeoutMs: 10_000,
        totalTimeoutMs: 50_000,
        delay: {
          type: 'random',
          minDelayMs: 2000,
          maxDelayMs: 5000,
        },
      });
      if (!goFetchCreationTx.success || !goFetchCreationTx.data) {
        throw new Error(`${chainAlias} ${contractName} creation tx could not be fetched`);
      }
      const creationTx: any = goFetchCreationTx.data;
      const creationData = creationTx.data;

      const deterministicDeployment = creationTx!.to === CREATE2_FACTORY_ADDRESS;

      if (deterministicDeployment) {
        const salt = ethers.ZeroHash;
        const deterministicDeploymentAddress = ethers.getCreate2Address(
          CREATE2_FACTORY_ADDRESS,
          salt,
          ethers.solidityPackedKeccak256(['bytes', 'bytes'], [artifact.bytecode, expectedEncodedConstructorArguments])
        );
        if (deployment.address !== deterministicDeploymentAddress) {
          throw new Error(`${chainAlias} ${contractName} deterministic deployment address does not match`);
        }
      } else if (deployment.address !== ethers.getCreateAddress(creationTx)) {
        throw new Error(`${chainAlias} ${contractName} deployment address does not match`);
      }

      // Salt precedes the bytecode if it is a deterministic deployment
      const creationBytecode = deterministicDeployment
        ? creationData.slice(0, artifact.bytecode.length + 64)
        : creationData.slice(0, artifact.bytecode.length);
      const creationBytecodeWithoutMetadataHash = creationBytecode.slice(0, -METADATA_HASH_LENGTH);
      const creationMetadataHash = `0x${creationBytecode.slice(-METADATA_HASH_LENGTH)}`;
      const creationEncodedConstructorArguments = `0x${creationData.slice(creationBytecode.length)}`;

      const expectedCreationBytecode = deterministicDeployment
        ? `${ethers.ZeroHash}${artifact.bytecode.slice(2)}`
        : artifact.bytecode;
      const expectedBytecodeWithoutMetadataHash = expectedCreationBytecode.slice(0, -METADATA_HASH_LENGTH);
      const expectedMetadataHash = `0x${expectedCreationBytecode.slice(-METADATA_HASH_LENGTH)}`;

      if (creationBytecodeWithoutMetadataHash !== expectedBytecodeWithoutMetadataHash) {
        throw new Error(
          `${chainAlias} ${contractName} ${deterministicDeployment ? 'deterministic' : ''} deployment bytecode does not match`
        );
      }
      if (creationMetadataHash !== expectedMetadataHash) {
        // eslint-disable-next-line no-console
        console.log(
          `${chainAlias} ${contractName} ${deterministicDeployment ? 'deterministic' : ''} deployment metadata hash does not match`
        );
      }
      if (creationEncodedConstructorArguments !== expectedEncodedConstructorArguments) {
        throw new Error(
          `${chainAlias} ${contractName} ${deterministicDeployment ? 'deterministic' : ''} deployment constructor arguments do not match`
        );
      }
    }
  }
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
