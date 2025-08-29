# @api3/contracts

## 27.2.0

### Minor Changes

- 1a4e118: Add rsETH/USDC and ezETH/USDC Morpho markets on Arbitrum

## 27.1.0

### Minor Changes

- afbecad: Add Market support to hyperliquid, hyperliquid-testnet and somnia-testnet

## 27.0.0

### Major Changes

- 407a6be: Migrates zod to v4

### Minor Changes

- 619bee2: Add Market support to injective-testnet and katana-sepolia-testnet

## 26.2.1

### Patch Changes

- 810f03c: Update dependency zod to ^3.25.76

## 26.2.0

### Minor Changes

- 230fed2: Added the `compute-dapp-id` CLI command
- eca462d: Add first wave of Morpho markets to dApp details on Gnosis chain

## 26.1.0

### Minor Changes

- fd084dc: Add Morpho markets on Katana

## 26.0.0

### Major Changes

- adf5421: Remove support for following chain:

  - kroma

## 25.0.0

### Major Changes

- 6171e77: Remove support for following chains:

  - atleta-testnet
  - inevm-testnet
  - inevm
  - kroma-sepolia-testnet
  - lightlink-sepolia-testnet
  - lightlink
  - rari-arbitrum-sepolia-testnet
  - rari
  - zircuit-sepolia-testnet (48899)

### Minor Changes

- f9e3e4b: Add dAPI and Market support to zircuit-sepolia-testnet (48898)

### Patch Changes

- cd423b4: Updates RPC provider configurations:

  - Update public provider for manta
  - Replace publicnode with tenderly-public for polygon-sepolia-testnet

## 24.2.1

### Patch Changes

- a4d6344: Fix typo from WTBC to WBTC

## 24.2.0

### Minor Changes

- 7161784: Add Morpho BTC dApp aliases

## 24.1.0

### Minor Changes

- e4e71c5: Add dAPI and Market support to katana

## 24.0.0

### Major Changes

- 1f3906a: Remove unused dApp aliases

### Minor Changes

- 184643d: Add dAPI and Market support to metal-sepolia-testnet

### Patch Changes

- ce97433: Updates RPC provider configurations:

  - Update default provider for ethereum-holesky-testnet
  - Remove publicnode from berachain
  - Remove blastapi from moonriver

## 23.1.0

### Minor Changes

- c94f62b: Add Segment Finance on Core chain to dApp details

## 23.0.0

### Major Changes

- 8592e34: Removed dAPI and Market support for the deprecated Core testnet (chain ID 1115) and added support for the replacement Core testnet (chain ID 1114) under the same alias

### Patch Changes

- c6b1692: Update default provider for taiko

## 22.0.0

### Major Changes

- fe10931: Remove support for following chains:

  - rechain-testnet

### Patch Changes

- 317509e: Update block explorer for following chains:

  - apechain-arbitrum-sepolia-testnet
  - berachain-testnet
  - kroma-sepolia-testnet
  - metis
  - world-sepolia-testnet

- 7cfebed: Updates RPC provider configurations:

  - Update default provider for atleta-testnet, ethereum-holesky-testnet, rari-arbitrum-sepolia-testnet, x-layer-sepolia-testnet
  - Remove not realible alternative providers from blast-sepolia-testnet, scroll-sepolia-testnet, scroll, taiko-holesky-testnet, zircuit-sepolia-testnet

## 21.3.0

### Minor Changes

- 68d855a: Add TakoTako weETH/ETH isolated market to dApp details

## 21.2.0

### Minor Changes

- 796f033: Add TakoTako dApp details
- 97c61a3: Add Morpho and tunnl to dApp details

## 21.1.1

### Patch Changes

- 5170255: Updates RPC provider configurations:

  - Remove ankr from bitlayer, core, kava, moonbeam, taiko, x-layer
  - Update default provider for blast-sepolia-testnet, x-layer-sepolia-testnet, zircuit-sepolia-testnet, zircuit
  - Add blastapi for opbnb, ronin, sei
  - Replace drpc with publicnode for mantle
  - Add tenderly for ronin
  - Add omniatech for lightlink

## 21.1.0

### Minor Changes

- 1283b3d: Add Stability on Sonic to dApp details

## 21.0.1

### Patch Changes

- fca6acb: Update Fraxtal symbol name from ETH to FXS

## 21.0.0

### Major Changes

- cc71f82: Remove support for following chains:

  - conflux
  - conflux-testnet

## 20.3.0

### Minor Changes

- 7a9fdef: Add Malda on Linea to dApp details

## 20.2.0

### Minor Changes

- 091caa2: Add the dApps nerite and segment-finance
- 091caa2: Add the chain sonic to the dApp dtrinity

## 20.1.0

### Minor Changes

- 3b95181: Add dAPI and Market support to megaeth-testnet

## 20.0.0

### Major Changes

- b295ca8: Remove support from the following chains:

  - camp-sepolia-testnet
  - hyperliquid-testnet
  - hyperliquid
  - immutable-sepolia-testnet

### Minor Changes

- 1d5b61b: Export dAPI management metadata

## 19.1.0

### Minor Changes

- cb8c835: Add ApeBank and update Ionic Protocol dApp data

## 19.0.1

### Patch Changes

- a4f5948: Updates RPC provider configurations:

  - Add publicnode for berachain, fraxtal, metis-sepolia-testnet, metis, soneium-sepolia-test
    net, soneium, sonic-testnet, unichain-sepolia-testnet, and unichain
  - Add reblok for fraxtal
  - Add blastapi for lumia, soneium
  - Add tenderly for mode
  - Add nirvanalabs for lumia
  - Add alchemy for apechain, lumia, polygon
  - Add drpc for berachain, merlin, unichain
  - Replace ankr with alchemy for metis, optimism, polygon-zkevm
  - Replace ankr with blastapi for sonic
  - Replace blastapi with alchemy for opbnb
  - Remove blockpi from conflux
  - Remove reblok from lumia

## 19.0.0

### Major Changes

- 8d6cd44: Removed dAPI and Market support from deprecated Berachain testnet and added replaced Berachain testnet (with the same alias)

## 18.2.0

### Minor Changes

- fc23880: Adds following chain:

  - rechain-testnet

- daf17d7: Add dAPI and Market support to rechain-testnet

## 18.1.0

### Minor Changes

- 122bb0f: Add dAPI and Market support for hyperliquid and hyperliquid-testnet

## 18.0.0

### Major Changes

- ca76e88: Refactor dApps schema structure and remove unused dApps
- b01760f: Rename computeDappId to unsafeComputeDappId and remove dApp alias verification

## 17.2.0

### Minor Changes

- d6414f1: Add dAPI and Market support to monad-testnet

### Patch Changes

- 5639919: Move zod from devDependencies to dependencies

## 17.1.0

### Minor Changes

- b8a1575: Migrates @api3/chains into this package

## 17.0.0

### Major Changes

- 411cdb1: Remove support from the following chains:

  - astar
  - fantom
  - fantom-testnet
  - hashkey
  - hashkey-sepolia-testnet
  - lukso
  - lukso-testnet

## 16.8.0

### Minor Changes

- 6d2b0e9: Add dAPI and Market support to ronin and ronin-testnet chains

## 16.7.0

### Minor Changes

- f6efa23: Add dAPI and Market support to unichain chain

### Patch Changes

- 4410bec: Remove the dApp `morpho` (to be added on a per-pool basis)

## 16.6.0

### Minor Changes

- b9cf4cd: Add dAPI and Market support to berachain chain

## 16.5.0

### Minor Changes

- 28d749d: Add the dApp `elara`

### Patch Changes

- 942237e: Have the print-api3readerproxyv1-address CLI command print better looking errors
- 942237e: Have the print-api3readerproxyv1-address CLI command require strict validation by default

## 16.4.0

### Minor Changes

- bb6ad34: Add the dApp `correlate`

## 16.3.0

### Minor Changes

- 82ab69a: Add the dApp `dtrinity`

### Patch Changes

- 3c97e51: Update the alias of the dApp `vicuna` to `vicuna-finance` because that alias is already used to deploy proxies.

## 16.2.0

### Minor Changes

- fd56b48: Add the following dApps:

  - aurelius
  - granary
  - ionic
  - juice
  - minterest
  - pac
  - takotako

## 16.1.0

### Minor Changes

- a0cc0ef: Add dAPI and Market support to soneium chain

## 16.0.0

### Major Changes

- c30baba: Purge the following dApps (note that this merely means that you won't be able to derive dApp-specific Api3ReaderProxyV1 addresses using `@api3/contracts` for these dApps, they will be able to continue using data feed services as usual):

  - airpuff
  - aurelius
  - davos-protocol
  - granary-finance
  - gravita-protocol
  - grimoire-finance
  - ionic-protocol
  - ironclad-finance
  - juice-finance
  - kinetix-derivatives
  - lore-finance
  - mantisswap
  - mean-finance
  - mendi-minterest
  - minterest
  - pac-finance
  - quickperps
  - satoshi-protocol
  - segment-finance
  - seismic
  - shoebill-finance
  - splice-finance
  - sturdy
  - takotako
  - wefi

- a20ac37: Update the aliases of the following dApps:

  - hana-finance (to hana)
  - init-capital (to init)
  - orbit-protocol (to orbit)
  - yei-finance (to yei)

### Minor Changes

- a20ac37: Extend the dApp data schema to include name and homepage URL (optional)
- aef7d46: Add the following dApps:

  - aave
  - abracadabra
  - aeroscraper
  - aurum-finance
  - avalon
  - benqi
  - beraborrow
  - burrbear
  - compound-finance
  - curvance
  - dahlia
  - dolomite
  - eggs
  - enclabs
  - fisclend
  - fluid
  - macaron
  - mach-finance
  - moonwell
  - morpho
  - nitro
  - omega
  - origami
  - paddle
  - positions
  - roots
  - sake
  - scallop
  - silo
  - spark
  - stacking-salmon
  - stout
  - sumer
  - takara
  - taofi
  - untitled-bank
  - ursa
  - venus
  - vestation
  - vicuna
  - yield-hive
  - yieldfi
  - zeno
  - zeru

## 15.1.0

### Minor Changes

- 1acf989: Added the `print-api3readerproxyv1-address` CLI command

## 15.0.0

### Major Changes

- 0b1ecc7: - Replace GnosisSafeWithoutProxy deployments with deterministic ones on mainnets that they were deployed on non-deterministically
  - Remove deployments for unsupported networks

## 14.0.0

### Major Changes

- d53c16f: Remove astar-sepolia-testnet support

## 13.3.0

### Minor Changes

- 5d12734: MockApi3ReaderProxyV1 (MockApi3ReaderProxy that also implements AggregatorV2V3Interface) is added

### Patch Changes

- 9e4b776: MockApi3ReaderProxy reverts when it is read before `mock()` is called

## 13.2.0

### Minor Changes

- c2679fd: Add dAPI and Market support to ink chain

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
