const hre = require('hardhat');

module.exports = async ({ deployments }) => {
  const AirnodeProtocol = await deployments.get('Test');
  await hre.run('verify:verify', {
    address: AirnodeProtocol.address,
    constructorArguments: [123],
  });
};
module.exports.tags = ['verify'];
