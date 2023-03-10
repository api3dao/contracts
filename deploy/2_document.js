const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

module.exports = async () => {
  const networks = fs
    .readdirSync('deployments', { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);
  const contractNames = ['AccessControlRegistry', 'OwnableCallForwarder', 'Api3ServerV1', 'ProxyFactory'];
  const references = {};
  references.chainNames = {};
  for (const network of networks) {
    references.chainNames[hre.config.networks[network].chainId] = network;
  }
  for (const contractName of contractNames) {
    references[contractName] = {};
    for (const network of networks) {
      const deployment = JSON.parse(fs.readFileSync(path.join('deployments', network, `${contractName}.json`), 'utf8'));
      references[contractName][hre.config.networks[network].chainId] = deployment.address;
    }
  }
  fs.writeFileSync(path.join('deployments', 'references.json'), JSON.stringify(references, null, 2));
};
module.exports.tags = ['document'];
