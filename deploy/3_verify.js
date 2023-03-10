const hre = require('hardhat');

module.exports = async ({ getUnnamedAccounts, deployments }) => {
  const accounts = await getUnnamedAccounts();

  const AccessControlRegistry = await deployments.get('AccessControlRegistry');
  await hre.run('verify:verify', {
    address: AccessControlRegistry.address,
  });

  const OwnableCallForwarder = await deployments.get('OwnableCallForwarder');
  await hre.run('verify:verify', {
    address: OwnableCallForwarder.address,
    constructorArguments: [accounts[0]],
  });

  const Api3ServerV1 = await deployments.get('Api3ServerV1');
  await hre.run('verify:verify', {
    address: Api3ServerV1.address,
    constructorArguments: [AccessControlRegistry.address, 'Api3ServerV1 admin', OwnableCallForwarder.address],
  });

  const ProxyFactory = await deployments.get('ProxyFactory');
  await hre.run('verify:verify', {
    address: ProxyFactory.address,
    constructorArguments: [Api3ServerV1.address],
  });
};
module.exports.tags = ['verify'];
