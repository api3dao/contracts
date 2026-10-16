---
'@api3/contracts': major
---

Build the package with Hardhat 3. Consumers on Hardhat 2 or CommonJS keep working, and runtime exports (addresses, ABIs, bytecode, chain data) are unchanged.

- The package is published as both an ES module and CommonJS, so `import` and `require` both resolve to the root entry point
- An ES module can no longer default-import the package (`import api3 from '@api3/contracts'`), which worked while it was CommonJS only. Use named imports or `import * as api3 from '@api3/contracts'`
- An `exports` map restricts subpath imports to the package root and the Solidity directories. Deep imports into `dist` no longer resolve
- `deploymentAddresses`, `auctioneerMetadata` and `dapiManagementMetadata` are now typed even when the consumer doesn't enable `resolveJsonModule`, where they used to be `any`. Code that relied on `any` may need casts
- `hardhatConfig.v3` returns the `networks`, `chainDescriptors` and `verify` shapes that Hardhat 3 expects. `hardhatConfig.etherscan()`, `blockscout()` and `networks()` still return the Hardhat 2 shapes
- Add `hardhatConfig.networkHttpRpcUrl`
