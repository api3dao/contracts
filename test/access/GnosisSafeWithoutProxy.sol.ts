/*
const { ethers } = require('hardhat');
const { expect } = require('chai');

const OperationEnum = Object.freeze({ Call: 0, DelegateCall: 1 });

describe('GnosisSafeWithoutProxy', function () {
  let roles;
  let gnosisSafe, ownableCallForwarder, target;
  let threshold = 2;

  async function executeTransaction(owners, to, data, value, throughOwnableCallForwarder) {
    if (throughOwnableCallForwarder) {
      to = ownableCallForwarder.address;
      const forwardFunctionSelector = ethers.utils.hexDataSlice(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes('forwardCall(address,bytes)')),
        0,
        4
      );
      const forwardEncodedParameters = ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [target.address, data]
      );
      data = ethers.utils.solidityPack(['bytes4', 'bytes'], [forwardFunctionSelector, forwardEncodedParameters]);
    }
    const SAFE_TX_TYPEHASH = '0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8';
    const operation = OperationEnum.Call;
    const safeTxGas = 0;
    const baseGas = 0;
    const gasPrice = 0;
    const gasToken = ethers.constants.AddressZero;
    const refundReceiver = ethers.constants.AddressZero;
    const nonce = await gnosisSafe.nonce();
    const safeTxHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        [
          'bytes32',
          'address',
          'uint256',
          'bytes32',
          'uint256',
          'uint256',
          'uint256',
          'uint256',
          'address',
          'address',
          'uint256',
        ],
        [
          SAFE_TX_TYPEHASH,
          to,
          value,
          ethers.utils.keccak256(data),
          operation,
          safeTxGas,
          baseGas,
          gasPrice,
          gasToken,
          refundReceiver,
          nonce,
        ]
      )
    );

    const DOMAIN_SEPARATOR_TYPEHASH = '0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218';
    const domainSeperator = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'uint256', 'address'],
        [DOMAIN_SEPARATOR_TYPEHASH, (await ethers.provider.getNetwork()).chainId, gnosisSafe.address]
      )
    );
    expect(await gnosisSafe.domainSeparator()).to.equal(domainSeperator);

    const txHashData = ethers.utils.solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      ['0x19', '0x01', domainSeperator, safeTxHash]
    );
    expect(
      await gnosisSafe.encodeTransactionData(
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        nonce
      )
    ).to.equal(txHashData);
    const txHash = ethers.utils.keccak256(txHashData);

    // For some reason GnosisSafe wants the v of signed messages to be increased by 4
    // https://docs.gnosis-safe.io/contracts/signatures#eth_sign-signature
    async function signHashForGnosisSafe(wallet, hash) {
      const signature = await wallet.signMessage(ethers.utils.arrayify(hash));
      const v = parseInt(signature.slice(-2), 16);
      const updatedV = v + 4;
      return signature.slice(0, -2) + updatedV.toString(16);
    }

    const ownerAddressToSignature = {};
    for (const owner of owners) {
      ownerAddressToSignature[owner.address] = await signHashForGnosisSafe(owner, txHash);
    }

    const signaturesWithAscendingAddresses = Object.keys(ownerAddressToSignature)
      .sort()
      .reduce((array, key) => {
        array.push(ownerAddressToSignature[key]);
        return array;
      }, []);
    const signatures = ethers.utils.solidityPack(
      Array(signaturesWithAscendingAddresses.length).fill('bytes'),
      signaturesWithAscendingAddresses
    );

    expect(await gnosisSafe.getThreshold()).to.equal(threshold);

    await gnosisSafe.execTransaction(
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      signatures
    );
  }

  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    roles = {
      deployer: accounts[0],
      owner1: accounts[1],
      owner2: accounts[2],
      owner3: accounts[3],
      addedOwner: accounts[4],
    };
    const gnosisSafeWithoutProxyFactory = await ethers.getContractFactory('GnosisSafeWithoutProxy', roles.deployer);
    gnosisSafe = await gnosisSafeWithoutProxyFactory.deploy(
      [roles.owner1.address, roles.owner2.address, roles.owner3.address],
      threshold
    );
    const ownableCallForwarderFactory = await ethers.getContractFactory('OwnableCallForwarder', roles.deployer);
    ownableCallForwarder = await ownableCallForwarderFactory.deploy(gnosisSafe.address);
    const targetFactory = await ethers.getContractFactory('MockTarget', roles.deployer);
    target = await targetFactory.deploy(gnosisSafe.address, ownableCallForwarder.address);
    expect(await gnosisSafe.getOwners()).to.deep.equal([
      roles.owner1.address,
      roles.owner2.address,
      roles.owner3.address,
    ]);
    expect(await gnosisSafe.getThreshold()).to.equal(threshold);
    await roles.deployer.sendTransaction({
      to: gnosisSafe.address,
      value: ethers.utils.parseEther('1'),
    });
  });

  // The contract gets set up by the constructor and should not allow consecutive setups
  describe('setup', function () {
    it('reverts', async function () {
      await expect(
        gnosisSafe.setup(
          [roles.owner1.address, roles.owner2.address, roles.owner3.address],
          threshold,
          ethers.constants.AddressZero,
          '0x',
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          0,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith('GS200');
    });
  });

  describe('execTransaction', function () {
    context('Transaction is direct', function () {
      context('Transaction is a function call', function () {
        it('executes transaction', async function () {
          const owners = [roles.owner1, roles.owner2];
          const to = target.address;
          const targetFunctionSignature = 'setNumberAsSafe(uint256)';
          const parameters = [123456];
          const functionSelector = ethers.utils.hexDataSlice(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(targetFunctionSignature)),
            0,
            4
          );
          const parameterTypes = targetFunctionSignature
            .substring(targetFunctionSignature.indexOf('(') + 1, targetFunctionSignature.indexOf(')'))
            .split(',');
          const encodedParameters = ethers.utils.defaultAbiCoder.encode(parameterTypes, parameters);
          const data = ethers.utils.solidityPack(['bytes4', 'bytes'], [functionSelector, encodedParameters]);
          const value = 1;
          await executeTransaction(owners, to, data, value, false);
          expect(await ethers.provider.getBalance(target.address)).to.equal(value);
          expect(await target.number()).to.equal(123456);
        });
      });
      context('Transaction is not a function call', function () {
        it('executes transaction', async function () {
          const owners = [roles.owner1, roles.owner2];
          const to = target.address;
          const data = '0x';
          const value = 1;
          await executeTransaction(owners, to, data, value, false);
          expect(await ethers.provider.getBalance(target.address)).to.equal(value);
          expect(await target.number()).to.equal(0);
        });
      });
    });
    context('Transaction is through OwnableCallForwarder', function () {
      context('Transaction is a function call', function () {
        it('executes transaction', async function () {
          const owners = [roles.owner1, roles.owner2];
          const to = target.address;
          const targetFunctionSignature = 'setNumberAsForwarder(uint256)';
          const parameters = [123456];
          const functionSelector = ethers.utils.hexDataSlice(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(targetFunctionSignature)),
            0,
            4
          );
          const parameterTypes = targetFunctionSignature
            .substring(targetFunctionSignature.indexOf('(') + 1, targetFunctionSignature.indexOf(')'))
            .split(',');
          const encodedParameters = ethers.utils.defaultAbiCoder.encode(parameterTypes, parameters);
          const data = ethers.utils.solidityPack(['bytes4', 'bytes'], [functionSelector, encodedParameters]);
          const value = 1;
          await executeTransaction(owners, to, data, value, true);
          expect(await ethers.provider.getBalance(target.address)).to.equal(value);
          expect(await target.number()).to.equal(123456);
        });
      });
    });
  });

  describe('changeThreshold', function () {
    it('changes threshold', async function () {
      const owners = [roles.owner1, roles.owner2];
      const to = gnosisSafe.address;
      const newThreshold = 3;
      const data = ethers.utils.solidityPack(
        ['bytes4', 'bytes'],
        [
          ethers.utils.hexDataSlice(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('changeThreshold(uint256)')), 0, 4),
          ethers.utils.defaultAbiCoder.encode(['uint256'], [newThreshold]),
        ]
      );
      await executeTransaction(owners, to, data, 0, false);
      expect(await gnosisSafe.getThreshold()).to.equal(newThreshold);
      expect(await gnosisSafe.getOwners()).to.deep.equal([
        roles.owner1.address,
        roles.owner2.address,
        roles.owner3.address,
      ]);
    });
  });

  describe('addOwnerWithThreshold', function () {
    it('adds owner with threshold', async function () {
      const owners = [roles.owner1, roles.owner2];
      const to = gnosisSafe.address;
      const newThreshold = 3;
      const data = ethers.utils.solidityPack(
        ['bytes4', 'bytes'],
        [
          ethers.utils.hexDataSlice(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes('addOwnerWithThreshold(address,uint256)')),
            0,
            4
          ),
          ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [roles.addedOwner.address, newThreshold]),
        ]
      );
      await executeTransaction(owners, to, data, 0, false);
      expect(await gnosisSafe.getThreshold()).to.equal(newThreshold);
      expect(await gnosisSafe.getOwners()).to.deep.equal([
        roles.addedOwner.address,
        roles.owner1.address,
        roles.owner2.address,
        roles.owner3.address,
      ]);
    });
  });
});
*/
