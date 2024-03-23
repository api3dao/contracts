import * as fs from 'node:fs';

import { hardhatConfig } from '@api3/chains';
import { glob } from 'glob';
import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-deploy';
import 'dotenv/config';
import { task } from 'hardhat/config';

const config: HardhatUserConfig = {
  etherscan: hardhatConfig.etherscan(),
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    outputFile: 'gas_report',
    noColors: true,
  },
  mocha: {
    timeout: process.env.EXTENDED_TEST ? 60 * 60_000 : 60_000,
  },
  networks: hardhatConfig.networks(),
  paths: {
    tests: process.env.EXTENDED_TEST ? './test-extended' : './test',
  },
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
};

task(
  'compile',
  'Compiles the entire project, building all artifacts, and overwrites contract metadata hash for consistent deterministic deployment addresses',
  async (args, hre, runSuper) => {
    await runSuper();
    const contractMetadataHashes = {
      AccessControlRegistry: {
        oldMetadataHash:
          'a2646970667358221220ae4f3421aaad5b1af12510ac03d7ec2649209de4471e48601a849e44cc2f1d5864736f6c63430008110033',
        newMetadataHash:
          'a264697066735822122049e79d59fec464055a13b1a550ea1be46e16effaf1876c0da61e0fcc8bfda86364736f6c63430008110033',
      },
      Api3ServerV1: {
        oldMetadataHash:
          'a2646970667358221220693313c61a998d79d0e9b250367bd14ac439bd3d1d1f36bf50317fc99059456d64736f6c63430008110033',
        newMetadataHash:
          'a2646970667358221220a4d1beae5a583496c3fd546c22d8d7b6026f64446d7a97937beedaa142a134b564736f6c63430008110033',
      },
      OwnableCallForwarder: {
        oldMetadataHash:
          'a26469706673582212209bc00d30ca9753335445fb76197730f010383979aa0fd4b393e2e8826680071064736f6c63430008110033',
        newMetadataHash:
          'a2646970667358221220c6d60bcd12cea7d82a3c5388fa1fa84ca1d8dfa2917c4e9e0037441302a9a50e64736f6c63430008110033',
      },
      DapiProxy: {
        oldMetadataHash:
          'a26469706673582212201d061d50f160b049953a990ae61794869544bc65e5a0d25812e444c431cb90f964736f6c63430008110033',
        newMetadataHash:
          'a26469706673582212204d3393530e535e3569140afa4c7c81c268dd64b87dfbd3906f5506fdf182327064736f6c63430008110033',
      },
      DapiProxyWithOev: {
        oldMetadataHash:
          'a2646970667358221220165f090121acbfb6f16face0e037df12b601e08d2e0fd3fd3f5e021e053308ce64736f6c63430008110033',
        newMetadataHash:
          'a26469706673582212206e316e144d39ba7f685df4203166425d62bc2b037b8b962ddfe43b136df5f28364736f6c63430008110033',
      },
      DataFeedProxy: {
        oldMetadataHash:
          'a26469706673582212204c00c55f37d9d93afc24a97a86b86c67275c3e6f0288edd31c678400d06b4dcc64736f6c63430008110033',
        newMetadataHash:
          'a2646970667358221220f18d169af51f14c70c3e1306bac114aad61233456eac3e294fc6aeee4c81aabf64736f6c63430008110033',
      },
      DataFeedProxyWithOev: {
        oldMetadataHash:
          'a2646970667358221220491c4b81100c410951a4eacc896ef33bf2f2865d87768147c4ca7217d63d79c864736f6c63430008110033',
        newMetadataHash:
          'a26469706673582212206421406599870e5b60adbcd2eb836fe0e9704d132ee0c8e85d6f24954176ebbc64736f6c63430008110033',
      },
      ProxyFactory: {
        oldMetadataHash:
          'a2646970667358221220c65d86e8fe1882ee9717fe8fadf286e2319482a7213942b09ed85c68e3cb244164736f6c63430008110033',
        newMetadataHash:
          'a2646970667358221220333b0ed644c7120d01ccc6ab4a08f700d99c0e019aa04a88cc487872e686627864736f6c63430008110033',
      },
    };
    for (const contractName of Object.keys(contractMetadataHashes)) {
      const [artifactFilePath] = await glob(`./artifacts/contracts/**/${contractName}.json`);
      const artifact = fs.readFileSync(artifactFilePath!, 'utf8');
      const overwrittenArtifact = Object.values(contractMetadataHashes).reduce(
        (acc, { oldMetadataHash, newMetadataHash }) => {
          return acc.replaceAll(newMetadataHash, oldMetadataHash);
        },
        artifact
      );
      fs.writeFileSync(artifactFilePath!, overwrittenArtifact);
      const [factoryFilePath] = await glob(`./typechain-types/factories/**/${contractName}__factory.ts`);
      const factory = fs.readFileSync(factoryFilePath!, 'utf8');
      const overwrittenFactory = Object.values(contractMetadataHashes).reduce(
        (acc, { oldMetadataHash, newMetadataHash }) => {
          return acc.replaceAll(newMetadataHash, oldMetadataHash);
        },
        factory
      );
      fs.writeFileSync(factoryFilePath!, overwrittenFactory);
    }
  }
);

// eslint-disable-next-line import/no-default-export
export default config;
