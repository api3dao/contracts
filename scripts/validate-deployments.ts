import * as fs from 'node:fs';
import { join } from 'node:path';

import { go } from '@api3/promise-utils';
import { config, ethers } from 'hardhat';

import * as auctioneerMetadata from '../data/auctioneer-metadata.json';
import {
  chainsSupportedByManagerMultisig,
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import {
  dapiManagementMerkleRootSigners,
  dapiPricingMerkleRootSigners,
  signedApiUrlMerkleRootSigners,
} from '../data/dapi-management-metadata.json';
import * as managerMultisigMetadata from '../data/manager-multisig-metadata.json';
import type {
  AccessControlRegistry,
  Api3MarketV2,
  Api3ReaderProxyV1Factory,
  GnosisSafeWithoutProxy,
  IApi3ReaderProxy,
  OevAuctionHouse,
  OwnableCallForwarder,
} from '../src/index';
import { CHAINS, computeApi3ReaderProxyV1Address } from '../src/index';

import { goAsyncOptions, skippedChainAliasesInOevAuctionHouseNativeCurrencyRateValidation } from './constants';

const chainSymbolToTicker: Record<string, string> = {
  xDAI: 'DAI',
};
const dappId = 1;
const api3ReaderProxyV1Metadata = '0x';

async function validateDeployments(network: string) {
  if (!chainsSupportedByManagerMultisig.includes(network)) {
    return;
  }
  const provider = new ethers.JsonRpcProvider((config.networks[network] as any).url);

  // Validate the manager multisig owners and threshold
  const { address: gnosisSafeWithoutProxyAddress, abi: gnosisSafeWithoutProxyAbi } = JSON.parse(
    fs.readFileSync(join('deployments', network, `GnosisSafeWithoutProxy.json`), 'utf8')
  );
  const gnosisSafeWithoutProxy = new ethers.Contract(
    gnosisSafeWithoutProxyAddress,
    gnosisSafeWithoutProxyAbi,
    provider
  ) as unknown as GnosisSafeWithoutProxy;
  const goFetchGnosisSafeWithoutProxyOwners = await go(async () => gnosisSafeWithoutProxy.getOwners(), goAsyncOptions);
  if (!goFetchGnosisSafeWithoutProxyOwners.success || !goFetchGnosisSafeWithoutProxyOwners.data) {
    throw new Error(`${network} GnosisSafeWithoutProxy owners could not be fetched`);
  }
  const { owners: managerMultisigOwners, threshold: managerMultisigThreshold } =
    managerMultisigMetadata[CHAINS.find((chain) => chain.alias === network)?.testnet ? 'testnet' : 'mainnet'];
  if (
    !(
      managerMultisigOwners.length === goFetchGnosisSafeWithoutProxyOwners.data.length &&
      managerMultisigOwners.every((managerMultisigOwner: string) =>
        goFetchGnosisSafeWithoutProxyOwners.data
          .map((owner) => ethers.getAddress(owner))
          .includes(ethers.getAddress(managerMultisigOwner))
      )
    )
  ) {
    throw new Error(
      `${network} GnosisSafeWithoutProxy owners are expected to be\n${managerMultisigOwners}\nbut are\n${goFetchGnosisSafeWithoutProxyOwners.data}`
    );
  }

  const goFetchGnosisSafeWithoutProxyThreshold = await go(
    async () => gnosisSafeWithoutProxy.getThreshold(),
    goAsyncOptions
  );
  if (!goFetchGnosisSafeWithoutProxyThreshold.success || !goFetchGnosisSafeWithoutProxyThreshold.data) {
    throw new Error(`${network} GnosisSafeWithoutProxy threshold could not be fetched`);
  }
  if (BigInt(managerMultisigThreshold) !== goFetchGnosisSafeWithoutProxyThreshold.data) {
    throw new Error(
      `${network} GnosisSafeWithoutProxy threshold is expected to be ${managerMultisigThreshold} but is ${goFetchGnosisSafeWithoutProxyThreshold.data}`
    );
  }

  // Validate that the OwnableCallForwarder owner is the manager multisig
  const { address: ownableCallForwarderAddress, abi: ownableCallForwarderAbi } = JSON.parse(
    fs.readFileSync(join('deployments', network, `OwnableCallForwarder.json`), 'utf8')
  );
  const ownableCallForwarder = new ethers.Contract(
    ownableCallForwarderAddress,
    ownableCallForwarderAbi,
    provider
  ) as unknown as OwnableCallForwarder;
  const goFetchOwnableCallForwarderOwner = await go(async () => ownableCallForwarder.owner(), goAsyncOptions);
  if (!goFetchOwnableCallForwarderOwner.success || !goFetchOwnableCallForwarderOwner.data) {
    throw new Error(`${network} OwnableCallForwarder owner could not be fetched`);
  }
  if (ethers.getAddress(goFetchOwnableCallForwarderOwner.data) !== ethers.getAddress(gnosisSafeWithoutProxyAddress)) {
    throw new Error(
      `${network} OwnableCallForwarder owner ${ethers.getAddress(goFetchOwnableCallForwarderOwner.data)} is not the same as the manager multisig address ${ethers.getAddress(gnosisSafeWithoutProxyAddress)}`
    );
  }
  if (chainsSupportedByDapis.includes(network)) {
    // Validate that the Api3ReaderProxyV1Factory owner is OwnableCallForwarder
    const { address: api3ReaderProxyV1FactoryAddress, abi: api3ReaderProxyV1FactoryAbi } = JSON.parse(
      fs.readFileSync(join('deployments', network, `Api3ReaderProxyV1Factory.json`), 'utf8')
    );
    const api3ReaderProxyV1Factory = new ethers.Contract(
      api3ReaderProxyV1FactoryAddress,
      api3ReaderProxyV1FactoryAbi,
      provider
    ) as unknown as Api3ReaderProxyV1Factory;
    const goFetchApi3ReaderProxyV1FactoryOwner = await go(async () => api3ReaderProxyV1Factory.owner(), goAsyncOptions);
    if (!goFetchApi3ReaderProxyV1FactoryOwner.success || !goFetchApi3ReaderProxyV1FactoryOwner.data) {
      throw new Error(`${network} Api3ReaderProxyV1Factory owner could not be fetched`);
    }
    if (
      ethers.getAddress(goFetchApi3ReaderProxyV1FactoryOwner.data) !== ethers.getAddress(ownableCallForwarderAddress)
    ) {
      throw new Error(
        `${network} Api3ReaderProxyV1Factory owner ${ethers.getAddress(goFetchApi3ReaderProxyV1FactoryOwner.data)} is not the same as the OwnableCallForwarder address ${ethers.getAddress(ownableCallForwarderAddress)}`
      );
    }

    if (chainsSupportedByMarket.includes(network)) {
      // Validate that the Api3MarketV2 AirseekerRegistry address belongs to AirseekerRegistry
      const { address: api3MarketV2Address, abi: api3MarketV2Abi } = JSON.parse(
        fs.readFileSync(join('deployments', network, `Api3MarketV2.json`), 'utf8')
      );
      const api3MarketV2 = new ethers.Contract(
        api3MarketV2Address,
        api3MarketV2Abi,
        provider
      ) as unknown as Api3MarketV2;
      const goFetchApi3MarketV2AirseekerRegistry = await go(
        async () => api3MarketV2.airseekerRegistry(),
        goAsyncOptions
      );
      if (!goFetchApi3MarketV2AirseekerRegistry.success || !goFetchApi3MarketV2AirseekerRegistry.data) {
        throw new Error(`${network} Api3MarketV2 AirseekerRegistry address could not be fetched`);
      }
      const { address: airseekerRegistryAddress } = JSON.parse(
        fs.readFileSync(join('deployments', network, `AirseekerRegistry.json`), 'utf8')
      );
      if (
        ethers.getAddress(goFetchApi3MarketV2AirseekerRegistry.data) !== ethers.getAddress(airseekerRegistryAddress)
      ) {
        throw new Error(
          `${network} Api3MarketV2 AirseekerRegistry address ${ethers.getAddress(goFetchApi3MarketV2AirseekerRegistry.data)} is not the same as the AirseekerRegistry address ${airseekerRegistryAddress}`
        );
      }

      // Validate that Api3MarketV2 dAPI management and dAPI pricing MT hash signers are set
      const goFetchApi3MarketV2DapiManagementMerkleRootSignersHash = await go(
        async () =>
          api3MarketV2.hashTypeToSignersHash(
            ethers.solidityPackedKeccak256(['string'], ['dAPI management Merkle root'])
          ),
        goAsyncOptions
      );
      if (
        !goFetchApi3MarketV2DapiManagementMerkleRootSignersHash.success ||
        !goFetchApi3MarketV2DapiManagementMerkleRootSignersHash.data
      ) {
        throw new Error(`${network} Api3MarketV2 dAPI management Merkle root signers hash could not be fetched`);
      }
      if (goFetchApi3MarketV2DapiManagementMerkleRootSignersHash.data === ethers.ZeroHash) {
        throw new Error(`${network} Api3MarketV2 dAPI management Merkle root signers are not set`);
      }
      if (
        goFetchApi3MarketV2DapiManagementMerkleRootSignersHash.data !==
        ethers.solidityPackedKeccak256(['address[]'], [dapiManagementMerkleRootSigners])
      ) {
        throw new Error(`${network} Api3MarketV2 dAPI management Merkle root signers are set incorrectly`);
      }
      const goFetchApi3MarketV2DapiPricingMerkleRootSignersHash = await go(
        async () =>
          api3MarketV2.hashTypeToSignersHash(ethers.solidityPackedKeccak256(['string'], ['dAPI pricing Merkle root'])),
        goAsyncOptions
      );
      if (
        !goFetchApi3MarketV2DapiPricingMerkleRootSignersHash.success ||
        !goFetchApi3MarketV2DapiPricingMerkleRootSignersHash.data
      ) {
        throw new Error(`${network} Api3MarketV2 dAPI pricing Merkle root signers hash could not be fetched`);
      }
      if (goFetchApi3MarketV2DapiPricingMerkleRootSignersHash.data === ethers.ZeroHash) {
        throw new Error(`${network} Api3MarketV2 dAPI pricing Merkle root signers are not set`);
      }
      if (
        goFetchApi3MarketV2DapiPricingMerkleRootSignersHash.data !==
        ethers.solidityPackedKeccak256(['address[]'], [dapiPricingMerkleRootSigners])
      ) {
        throw new Error(`${network} Api3MarketV2 dAPI pricing Merkle root signers are set incorrectly`);
      }
      const goFetchApi3MarketV2SignedApiUrlMerkleRootSignersHash = await go(
        async () =>
          api3MarketV2.hashTypeToSignersHash(
            ethers.solidityPackedKeccak256(['string'], ['Signed API URL Merkle root'])
          ),
        goAsyncOptions
      );
      if (
        !goFetchApi3MarketV2SignedApiUrlMerkleRootSignersHash.success ||
        !goFetchApi3MarketV2SignedApiUrlMerkleRootSignersHash.data
      ) {
        throw new Error(`${network} Api3MarketV2 Signed API URL Merkle root signers hash could not be fetched`);
      }
      if (goFetchApi3MarketV2SignedApiUrlMerkleRootSignersHash.data === ethers.ZeroHash) {
        throw new Error(`${network} Api3MarketV2 Signed API URL Merkle root signers are not set`);
      }
      if (
        goFetchApi3MarketV2SignedApiUrlMerkleRootSignersHash.data !==
        ethers.solidityPackedKeccak256(['address[]'], [signedApiUrlMerkleRootSigners])
      ) {
        throw new Error(`${network} Api3MarketV2 Signed API URL Merkle root signers are set incorrectly`);
      }

      // Validate that Api3MarketV2 is a dAPI name setter
      const rootRole = ethers.solidityPackedKeccak256(['address'], [ownableCallForwarderAddress]);
      const api3ServerV1AdminRole = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [rootRole, ethers.solidityPackedKeccak256(['string'], ['Api3ServerV1 admin'])]
      );
      const dapiNameSetterRole = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [api3ServerV1AdminRole, ethers.solidityPackedKeccak256(['string'], ['dAPI name setter'])]
      );
      const { address: accessControlRegistryAddress, abi: accessControlRegistryAbi } = JSON.parse(
        fs.readFileSync(join('deployments', network, `AccessControlRegistry.json`), 'utf8')
      );
      const accessControlRegistry = new ethers.Contract(
        accessControlRegistryAddress,
        accessControlRegistryAbi,
        provider
      ) as unknown as AccessControlRegistry;
      const goFetchApi3MarketV2DapiNameSetterRoleStatus = await go(
        async () => accessControlRegistry.hasRole(dapiNameSetterRole, api3MarketV2Address),
        goAsyncOptions
      );
      if (!goFetchApi3MarketV2DapiNameSetterRoleStatus.success) {
        throw new Error(`${network} Api3MarketV2 dAPI name setter role status could not be fetched`);
      }
      if (!goFetchApi3MarketV2DapiNameSetterRoleStatus.data) {
        throw new Error(`${network} Api3MarketV2 does not have the dAPI name setter role`);
      }

      // Validate that auction resolvers have the auctioneer role
      const api3ServerV1OevExtensionAdminRole = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [rootRole, ethers.solidityPackedKeccak256(['string'], ['Api3ServerV1OevExtension admin'])]
      );
      const auctioneerRole = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [api3ServerV1OevExtensionAdminRole, ethers.solidityPackedKeccak256(['string'], ['Auctioneer'])]
      );

      const goFetchApi3ServerV1OevExtensionAuctioneerRoleStatus = await go(
        async () =>
          accessControlRegistry.multicall.staticCall(
            auctioneerMetadata['auction-resolvers'].map((auctioneerResolverAddress) =>
              accessControlRegistry.interface.encodeFunctionData('hasRole', [auctioneerRole, auctioneerResolverAddress])
            )
          ),
        goAsyncOptions
      );
      if (!goFetchApi3ServerV1OevExtensionAuctioneerRoleStatus.success) {
        throw new Error(`${network} Api3ServerV1OevExtension auctioneer role status could not be fetched`);
      }
      if (
        !goFetchApi3ServerV1OevExtensionAuctioneerRoleStatus.data.every(
          (auctioneerRoleStatus) => auctioneerRoleStatus !== ethers.ZeroHash
        )
      ) {
        throw new Error(
          `${network} (${auctioneerMetadata['auction-resolvers']}) Api3ServerV1OevExtension auctioneer role statuses are (${goFetchApi3ServerV1OevExtensionAuctioneerRoleStatus.data.map((auctioneerRoleStatus) => (auctioneerRoleStatus === ethers.ZeroHash ? false : true))})`
        );
      }
    }

    if (chainsSupportedByOevAuctions.includes(network)) {
      // Validate that auction resolvers and auction cops have the auctioneer role
      const { address: accessControlRegistryAddress, abi: accessControlRegistryAbi } = JSON.parse(
        fs.readFileSync(join('deployments', network, `AccessControlRegistry.json`), 'utf8')
      );
      const accessControlRegistry = new ethers.Contract(
        accessControlRegistryAddress,
        accessControlRegistryAbi,
        provider
      ) as unknown as AccessControlRegistry;
      const rootRole = ethers.solidityPackedKeccak256(['address'], [ownableCallForwarderAddress]);
      const api3ServerV1OevExtensionAdminRole = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [rootRole, ethers.solidityPackedKeccak256(['string'], ['Api3ServerV1OevExtension admin'])]
      );
      const auctioneerRole = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [api3ServerV1OevExtensionAdminRole, ethers.solidityPackedKeccak256(['string'], ['Auctioneer'])]
      );

      const goFetchApi3ServerV1OevExtensionAuctioneerRoleStatus = await go(
        async () =>
          accessControlRegistry.multicall.staticCall(
            [...auctioneerMetadata['auction-resolvers'], ...auctioneerMetadata['auction-cops']].map(
              (auctioneerResolverAddress) =>
                accessControlRegistry.interface.encodeFunctionData('hasRole', [
                  auctioneerRole,
                  auctioneerResolverAddress,
                ])
            )
          ),
        goAsyncOptions
      );
      if (!goFetchApi3ServerV1OevExtensionAuctioneerRoleStatus.success) {
        throw new Error(`${network} Api3ServerV1OevExtension auctioneer role status could not be fetched`);
      }
      if (
        !goFetchApi3ServerV1OevExtensionAuctioneerRoleStatus.data.every(
          (auctioneerRoleStatus) => auctioneerRoleStatus !== ethers.ZeroHash
        )
      ) {
        throw new Error(
          `${network} (${[...auctioneerMetadata['auction-resolvers'], ...auctioneerMetadata['auction-cops']]}) Api3ServerV1OevExtension auctioneer role statuses are (${goFetchApi3ServerV1OevExtensionAuctioneerRoleStatus.data.map((auctioneerRoleStatus) => (auctioneerRoleStatus === ethers.ZeroHash ? false : true))})`
        );
      }

      // Validate that collateral rate proxy is set
      const { address: oevAuctionHouseAddress, abi: oevAuctionHouseAbi } = JSON.parse(
        fs.readFileSync(join('deployments', network, `OevAuctionHouse.json`), 'utf8')
      );
      const oevAuctionHouse = new ethers.Contract(
        oevAuctionHouseAddress,
        oevAuctionHouseAbi,
        provider
      ) as unknown as OevAuctionHouse;

      const goFetchCollateralRateProxyAddress = await go(
        async () => oevAuctionHouse.collateralRateProxy(),
        goAsyncOptions
      );
      if (!goFetchCollateralRateProxyAddress.success) {
        throw new Error('OevAuctionHouse collateral rate proxy address could not be fetched');
      }
      const oevAuctionChainId = CHAINS.find((chain) => chain.alias === network)!.id;
      const ethUsdRateReaderProxyV1Address = computeApi3ReaderProxyV1Address(
        oevAuctionChainId,
        'ETH/USD',
        dappId,
        api3ReaderProxyV1Metadata
      );
      if (goFetchCollateralRateProxyAddress.data !== ethUsdRateReaderProxyV1Address) {
        throw new Error(
          `OevAuctionHouse collateral rate proxy address is ${goFetchCollateralRateProxyAddress.data} while it should have been ${ethUsdRateReaderProxyV1Address}`
        );
      }

      // Validate that native currency rate proxies are set
      const chainsWithNativeRateProxies = chainsSupportedByMarket.reduce((acc, chainAlias) => {
        const chain = CHAINS.find((chain) => chain.alias === chainAlias)!;
        if (!chain.testnet) {
          acc.push(chain);
        }
        return acc;
      }, [] as any[]);
      const goFetchNativeCurrencyRateProxyAddresses = await go(
        async () =>
          oevAuctionHouse.multicall.staticCall(
            chainsWithNativeRateProxies.map((chain) =>
              oevAuctionHouse.interface.encodeFunctionData('chainIdToNativeCurrencyRateProxy', [chain.id])
            )
          ),
        goAsyncOptions
      );
      if (!goFetchNativeCurrencyRateProxyAddresses.success) {
        throw new Error('OevAuctionHouse native currency rate proxy addresses could not be fetched');
      }
      const nativeCurrencyRateProxyAddresses = goFetchNativeCurrencyRateProxyAddresses.data.map((returndata) =>
        ethers.AbiCoder.defaultAbiCoder().decode(['address'], returndata)
      );
      const errorMessages = chainsWithNativeRateProxies.reduce((acc, chain, ind) => {
        const dapiName = `${chainSymbolToTicker[chain.symbol] ?? chain.symbol}/USD`;
        const api3ReaderProxyV1Address = computeApi3ReaderProxyV1Address(
          oevAuctionChainId,
          dapiName,
          dappId,
          api3ReaderProxyV1Metadata
        );
        if (nativeCurrencyRateProxyAddresses[ind]!.toString() !== api3ReaderProxyV1Address) {
          acc.push(
            `${chain.alias} OevAuctionHouse native currency rate proxy address is ${nativeCurrencyRateProxyAddresses[ind]} while it should have been ${api3ReaderProxyV1Address}`
          );
        }
        return acc;
      }, [] as string[]);
      if (errorMessages.length > 0) {
        // eslint-disable-next-line unicorn/error-message
        throw new Error(errorMessages.join('\n'));
      }

      // Validate that used proxies all serve fresh values
      const { abi: api3ReaderProxyAbi } = JSON.parse(
        fs.readFileSync(
          join('artifacts', 'contracts', 'interfaces', 'IApi3ReaderProxy.sol', 'IApi3ReaderProxy.json'),
          'utf8'
        )
      );
      const ethUsdRateReaderProxy = new ethers.Contract(
        ethUsdRateReaderProxyV1Address,
        api3ReaderProxyAbi,
        provider
      ) as unknown as IApi3ReaderProxy;
      const goReadEthUsdRateProxy = await go(async () => ethUsdRateReaderProxy.read(), goAsyncOptions);
      if (!goReadEthUsdRateProxy.success) {
        throw new Error('OevAuctionHouse collateral rate proxy could not be read from');
      }
      if (goReadEthUsdRateProxy.data.timestamp < Date.now() / 1000 - 24 * 60 * 60) {
        throw new Error(
          `OevAuctionHouse collateral rate timestamp is ${new Date(Number(goReadEthUsdRateProxy.data.timestamp) * 1000).toISOString()}`
        );
      }

      const proxyReadErrorMessages = await Promise.all(
        chainsWithNativeRateProxies.map(async (chain, ind) => {
          if (skippedChainAliasesInOevAuctionHouseNativeCurrencyRateValidation.includes(chain.alias)) {
            return null;
          }

          const nativeCurrencyRateReaderProxy = new ethers.Contract(
            nativeCurrencyRateProxyAddresses[ind]!.toString(),
            api3ReaderProxyAbi,
            provider
          ) as unknown as IApi3ReaderProxy;

          const goReadNativeCurrencyRateProxy = await go(
            async () => nativeCurrencyRateReaderProxy.read(),
            goAsyncOptions
          );

          if (!goReadNativeCurrencyRateProxy.success) {
            return `OevAuctionHouse native currency rate proxy of ${chain.alias} with address ${nativeCurrencyRateProxyAddresses[ind]!.toString()} could not be read from`;
          }

          if (goReadNativeCurrencyRateProxy.data.timestamp < Date.now() / 1000 - 24 * 60 * 60) {
            return `The timestamp read from OevAuctionHouse native currency rate proxy of ${chain.alias} with address ${nativeCurrencyRateProxyAddresses[ind]!.toString()} is too old (${new Date(Number(goReadNativeCurrencyRateProxy.data.timestamp) * 1000).toISOString()})`;
          }

          return null;
        })
      ).then((messages) => messages.filter((message) => message !== null));
      if (proxyReadErrorMessages.length > 0) {
        // eslint-disable-next-line unicorn/error-message
        throw new Error(proxyReadErrorMessages.join('\n'));
      }
    }
  }
}

async function main() {
  const networks = process.env.NETWORK ? [process.env.NETWORK] : chainsSupportedByManagerMultisig;

  const erroredMainnets: string[] = [];
  const erroredTestnets: string[] = [];
  await Promise.all(
    networks.map(async (network) => {
      try {
        await validateDeployments(network);
      } catch (error) {
        if (CHAINS.find((chain) => chain.alias === network)?.testnet) {
          erroredTestnets.push(network);
        } else {
          erroredMainnets.push(network);
        }
        // eslint-disable-next-line no-console
        console.error(error, '\n');
      }
    })
  );
  if (erroredTestnets.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Validation failed on testnets: ${erroredTestnets.join(', ')}`);
  }
  if (erroredMainnets.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Validation failed on: ${erroredMainnets.join(', ')}`);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
