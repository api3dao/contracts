# @api3/contracts

## 13.1.0

### Minor Changes

- a261641: Add dAPI and Market support to hashkey chain

## 13.0.0

### Major Changes

- 39055a0: Replace old GnosisSafeWithoutProxy deployments with deterministic contract deployments on testnets

## 12.0.0

### Major Changes

- da83b91: Replace GnosisSafeWithoutProxy deployment with deterministically deployed contract for rari-arbitrum-sepolia-testnet

## 11.2.0

### Minor Changes

- 773e5b5: Add dAPI and Market support to hashkey-sepolia-testnet chain

## 11.1.0

### Minor Changes

- 0483e03: Add dAPI and Market support to sonic chain

## 11.0.0

### Major Changes

- ab06250: Removed dAPI and Market support from deprecated Sonic testnet and added active Sonic testnet (with the same alias)

## 10.3.1

### Patch Changes

- 30c63ca: Have computeDappId() return a BigInt instead of a hex string

## 10.3.0

### Minor Changes

- 7824fce: Exports a list of dApps
- 82bebb0: Add computeDappId() to compute the dApp ID with a dApp alias and chain ID, and add computeDappSpecificApi3ReaderProxyV1Address() to compute the Api3ReaderProxyV1 address with this dApp ID
- 06050ab: Add computeCommunalApi3ReaderProxyV1Address() to compute the address of the Api3ReaderProxyV1 with dApp ID 1 and empty metadata

## 10.2.0

### Minor Changes

- 428e8fe: Add dAPI and Market support to ink-sepolia-testnet

## 10.1.0

### Minor Changes

- b8fb92d: Add dAPI and Market support to:

  - apechain
  - atleta-testnet
  - world
  - world-sepolia-testnet

## 10.0.0

### Major Changes

- ae1de2d: Changed the Solidity versions of contracts HashRegistry and AirseekerRegistry
- ae1de2d: Retracted OEV auction support from arbitrum-sepolia-testnet
- 0ee865c: Manager multisig addresses are no longer exported under `managerMultisigAddresses`.
  You can find them under `deploymentAddresses.GnosisSafeWithoutProxy`.
- ae1de2d: Removed contracts Api3Market, DapiProxy, DapiProxyWithOev DataFeedProxy DataFeedProxyWithOev, ExternalMulticallSimulator, OevSearcherMulticallV1, ProxyFactory
- ae1de2d: Removed `computeDapiProxyAddress()`, `computeDapiProxyWithOevAddress()`, `computeDataFeedProxyAddress()`, `computeDataFeedProxyWithOevAddress()`.
  Added `computeApi3ReaderProxyV1Address()` instead.
- ae1de2d: Retracted dAPI and Market support from bsquared, neon-evm, neon-evm-testnet, rsk
- ae1de2d: AirseekerRegistry addresses belonging to the market contracts are no longer exported under `computeApi3MarketAirseekerRegistryAddress()`.
  You can find them under `deploymentAddresses.AirseekerRegistry`.

### Minor Changes

- ae1de2d: Exported auctioneer addresses under auctioneerMetadata
- ae1de2d: Deployed all newly added contracts on the respective networks
- ae1de2d: Added contracts GnosisSafeWithoutProxy, Api3MarketV2, Api3ServerV1OevExtension, Api3ReaderProxyV1, Api3ReaderProxyV1Factory, IApi3ServerV1OevExtensionOevBidPayer, IApi3ReaderProxy, MockApi3ReaderProxy

## 9.1.0

### Minor Changes

- 96c4e9e: Add dAPI and Market support to unichain-sepolia-testnet, odyssey-sepolia-testnet

## 9.0.0

### Major Changes

- 581511f: Remove deployment block numbers

### Minor Changes

- 67cd34c: Add dAPI and Market support to soneium-sepolia-testnet

## 8.0.0

### Major Changes

- d73336d: Remove bsquared-testnet support

### Minor Changes

- ed1655d: Add dAPI and Market support to sonic-testnet

## 7.0.0

### Major Changes

- daf2511: - Removed dAPI and Market support from deprecated BOB testnet and added to active BOB testnet (with the same alias)

### Minor Changes

- 071da83: - Add dAPI and Market support to lumia and Lumia-sepolia-testnet

## 6.2.0

### Minor Changes

- a1a4044: Add dAPI and Market support to conflux and conflux-testnet

## 6.1.0

### Minor Changes

- e7feb59: Add dAPI and Market support to manta and manta-sepolia-testnet

## 6.0.0

### Major Changes

- 44b57a4: Removed dAPI and Market support from Sei devnet and added to Sei testnet (with the same alias)
- 44b57a4: Removed dAPI and Market support from ApeChain "Jenkins" testnet and added to ApeChain "Curtis" testnet (with the same alias)

### Minor Changes

- 44b57a4: Add dAPI and Market support to camp-sepolia-testnet

## 5.1.0

### Minor Changes

- f8cdc14: Add dAPI and Market support to berachain-testnet and zircuit
- 3e8ed41: Add Market support to mantle-sepolia-testnet

## 5.0.0

### Major Changes

- 65227d4: Remove berachain-testnet dAPI support

## 4.2.0

### Minor Changes

- f476aaa: Add ExternalMulticallSimulator for mainnets that support the Market

## 4.1.1

### Patch Changes

- ce96c06: Fix neon-evm and neon-evm-testnet Api3Market deployments

## 4.1.0

### Minor Changes

- 90a9936: Add dAPI and Market support to bitlayer, bitlayer-testnet, scroll, scroll-sepolia-testnet
- 90a9936: Add Market support to neon-evm, neon-evm-testnet, oev-network

## 4.0.0

### Major Changes

- f27c258: Remove oev-network-sepolia-testnet

### Minor Changes

- 0f7bb18: Add dAPI and Market support to core-testnet, metal, rari-arbitrum-sepolia-testnet, sei and taiko

## 3.7.0

### Minor Changes

- d33b3b1: Export manager multisig addresses
- 265c365: Add dAPI and Market support to apechain-arbitrum-sepolia-testnet, astar, astar-sepolia-tesnet, core, immutable-sepolia-testnet

## 3.6.0

### Minor Changes

- 6ddadd1: Add dAPI and OEV auction support to oev-network

## 3.5.0

### Minor Changes

- 60aa12c: Add dAPI and Market support to bob, polygon-sepolia-testnet, rari
- 60aa12c: Add dAPI support to berachain-testnet

## 3.4.0

### Minor Changes

- 8b2195e: Add dAPI and Market support to bsquared-testnet, inevm- inevm-testnet, kroma, kroma-sepolia-testnet and taiko-holesky-testnet

## 3.3.0

### Minor Changes

- e75f6ba: Add dAPI and Market support to bsquared, lukso, lukso-testnet and sei-testnet

## 3.2.1

### Patch Changes

- 71e9278: Fix lightlink-sepolia-testnet deployments

## 3.2.0

### Minor Changes

- da2e47e: Add dAPI support to neon-evm and neon-evm-testnet
- da2e47e: Add dAPI and Market support to bob-sepolia-testnet, lightlink- lightlink-sepolia-testnet

## 3.1.0

### Minor Changes

- 0548743: Add dAPI and Market support to merlin, merlin-testnet, metis, metis-sepolia-testnet
- 0548743: Add Market support to x-layer-sepolia-testnet

## 3.0.0

### Major Changes

- b9d10af: Rename oev-network-agg-sepolia-testnet as oev-network-sepolia-testnet and remove the old oev-network-sepolia-testnet
- b9d10af: Remove Goerli L2s, polygon-testnet

### Minor Changes

- b9d10af: Add dAPI and Market support for ethereum-holesky-testnet, opbnb, opbnb-testnet, zicuit-sepolia-testnet
- b9d10af: Add Market support for x-layer

## 2.6.0

### Minor Changes

- d28cec3: Add OEV auction support to arbitrum-sepolia-testnet

## 2.5.0

### Minor Changes

- 650745f: Add dAPI and Market support for fraxtal, fraxtal-holesky-testnet, linea-sepolia-testnet, mode, mode-sepolia-testnet

## 2.4.0

### Minor Changes

- f93df05: Add dAPI and OEV auction support for oev-network-agg-sepolia-testnet

## 2.3.0

### Minor Changes

- 5dc511b: Add dAPI support for x-layer and x-layer-sepolia-testnet

## 2.2.0

### Minor Changes

- f433d4a: Add Market support for arbitrum, avalanche, base, blast, bsc, ethereum, fantom, gnosis, kava, linea, mantle, moonbeam, moonriver, optimism, polygon, polygon-zkevm

## 2.1.0

### Minor Changes

- 2258894: Add dAPI and Market support for arbitrum-sepolia-testnet, base-sepolia-testnet, optimism-sepolia-testnet, polygon-zkevm-sepolia-testnet

## 2.0.0

### Major Changes

- 774be84: Support for API3 Market Phase 2.1
