const hre = require('hardhat');

module.exports = async ({ getUnnamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const accounts = await getUnnamedAccounts();

  const test = await deploy('Test', {
    from: accounts[0],
    log: true,
    args: [123],
    deterministicDeployment: process.env.DETERMINISTIC ? hre.ethers.constants.HashZero : undefined,
  });
  log(`Deployed Test at ${test.address}`);
};
module.exports.tags = ['deploy'];
