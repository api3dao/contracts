---
'@api3/contracts': major
---

Upgrade the repository to Hardhat 3:

- The package is published as both an ES module and CommonJS, so `import` and `require` both resolve to the root entry point
- An `exports` map restricts subpath imports to the package root and the Solidity directories. Deep imports into `dist` no longer resolve
- `hardhatConfig.v3` returns the `networks`, `chainDescriptors` and `verify` shapes that Hardhat 3 expects. `hardhatConfig.etherscan()`, `blockscout()` and `networks()` still return the Hardhat 2 shapes
