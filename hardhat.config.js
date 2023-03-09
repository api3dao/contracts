require('@nomicfoundation/hardhat-toolbox');
require('@nomiclabs/hardhat-etherscan');
require('hardhat-deploy');
const api3Chains = require('@api3/chains/src');
require('dotenv').config();

const { apiKey: etherscanApiKey, customChains: etherscanCustomChains } = api3Chains.hardhatEtherscan();
const etherscan = {
  apiKey: Object.entries(etherscanApiKey).reduce((populatedApiKey, etherscanApiKeyEntry) => {
    const hardhatEtherscanChainAlias = etherscanApiKeyEntry[0];
    const chainAlias = etherscanApiKeyEntry[1];
    if (chainAlias !== 'DUMMY_VALUE') {
      const envVariableName = `ETHERSCAN_API_KEY_${chainAlias}`;
      populatedApiKey[hardhatEtherscanChainAlias] = process.env[envVariableName] ? process.env[envVariableName] : '';
    } else {
      populatedApiKey[hardhatEtherscanChainAlias] = 'DUMMY_VALUE';
    }
    return populatedApiKey;
  }, {}),
  customChains: etherscanCustomChains,
};

const networks = Object.entries(api3Chains.hardhatConfigNetworks()).reduce((networksWithMnemonic, networkEntry) => {
  const chainAlias = networkEntry[0];
  const network = networkEntry[1];
  networksWithMnemonic[chainAlias] = {
    ...network,
    accounts: { mnemonic: process.env.MNEMONIC ? process.env.MNEMONIC : '' },
  };
  return networksWithMnemonic;
}, {});

module.exports = {
  etherscan,
  networks,
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
