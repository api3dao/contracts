---
'@api3/contracts': major
---

Build the package with Hardhat 3, keeping the exported addresses, ABIs, bytecode and chain data unchanged:

- Publish the package as both an ES module and CommonJS
- Drop `import api3 from '@api3/contracts'` in ES modules in favor of named imports or `import * as api3 from '@api3/contracts'`
- Add an `exports` map that limits imports to the package root, `package.json` and the Solidity directories, so deep imports into `dist` no longer resolve
- Move the `api3-contracts` CLI from `dist/bin/cli.js` to `dist/cjs/bin/cli.js`
- Stop shipping `dist/data/*.json` and `dist/deployments/addresses.json`, whose data stays exported as `auctioneerMetadata`, `dapiManagementMetadata` and `deploymentAddresses`
- Type `auctioneerMetadata`, `dapiManagementMetadata` and `deploymentAddresses` for consumers without `resolveJsonModule`, who used to get `any`
- Add `hardhatConfig.v3`, whose `networks()`, `chainDescriptors()` and `verify()` return the Hardhat 3 config shapes, and keep `hardhatConfig.networks()`, `etherscan()` and `blockscout()` on the Hardhat 2 shapes
- Add `hardhatConfig.networkHttpRpcUrl()`
