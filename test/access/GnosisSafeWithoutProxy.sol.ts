import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import type { AddressLike, BigNumberish, BytesLike, HDNodeWallet } from 'ethers';
import hardhat from 'hardhat';
import type { GnosisSafeWithoutProxy } from 'typechain-types';

const { ethers } = hardhat;

// Similar to https://github.com/safe-global/safe-smart-account/blob/v1.3.0/contracts/handler/CompatibilityFallbackHandler.sol#L74
const SENTINEL_MODULES = `0x${'1'.padStart(40, '0')}`;

describe('GnosisSafeWithoutProxy', function () {
  const OperationEnum = Object.freeze({ Call: 0, DelegateCall: 1 });

  // GnosisSafe wants the v of signed messages to be increased by 4
  // https://docs.safe.global/advanced/smart-account-signatures#eth_sign-signature
  async function signTxHashForGnosisSafe(signer: HDNodeWallet, txHash: BytesLike) {
    const signature = await signer.signMessage(ethers.getBytes(txHash));
    const v = Number.parseInt(signature.slice(-2), 16);
    const updatedV = v + 4;
    return signature.slice(0, -2) + updatedV.toString(16);
  }

  async function signAndExecuteTransaction(
    gnosisSafe: GnosisSafeWithoutProxy,
    signers: HDNodeWallet[],
    to: AddressLike,
    data: BytesLike,
    value: BigNumberish
  ) {
    const operation = OperationEnum.Call;
    const safeTxGas = 0;
    const baseGas = 0;
    const gasPrice = 0;
    const gasToken = ethers.ZeroAddress;
    const refundReceiver = ethers.ZeroAddress;
    const nonce = await gnosisSafe.nonce();
    const txHash = ethers.keccak256(
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
    );

    const signaturesSortedBySignerAddress = await Promise.all(
      signers
        .sort((a, b) => (BigInt(a.address) > BigInt(b.address) ? 1 : -1))
        .map((signer: HDNodeWallet) => signTxHashForGnosisSafe(signer, txHash))
    );
    const encodedSignatures = ethers.solidityPacked(
      Array.from({ length: signaturesSortedBySignerAddress.length }).map(() => 'bytes'),
      signaturesSortedBySignerAddress
    );

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
      encodedSignatures
    );
  }

  async function deploy() {
    const [deployer] = await ethers.getSigners();
    const owners = Array.from({ length: 3 }).map(() => ethers.Wallet.createRandom());
    const threshold = 2;

    const GnosisSafeWithoutProxy = await ethers.getContractFactory('GnosisSafeWithoutProxy', deployer);
    const gnosisSafeWithoutProxy = await GnosisSafeWithoutProxy.deploy(
      owners.map((owner) => owner.address),
      threshold
    );
    await deployer?.sendTransaction({ to: gnosisSafeWithoutProxy.getAddress(), value: ethers.parseEther('1') });

    const OwnableCallForwarder = await ethers.getContractFactory('OwnableCallForwarder', deployer);
    const ownableCallForwarder = await OwnableCallForwarder.deploy(gnosisSafeWithoutProxy.getAddress());

    const MockSafeTarget = await ethers.getContractFactory('MockSafeTarget', deployer);
    const mockSafeTarget = await MockSafeTarget.deploy(
      gnosisSafeWithoutProxy.getAddress(),
      ownableCallForwarder.getAddress()
    );

    return {
      owners,
      threshold,
      gnosisSafeWithoutProxy,
      ownableCallForwarder,
      mockSafeTarget,
    };
  }

  describe('constructor', function () {
    it('sets up the contract', async function () {
      const { owners, threshold, gnosisSafeWithoutProxy } = await helpers.loadFixture(deploy);
      expect(await gnosisSafeWithoutProxy.getThreshold()).to.equal(threshold);
      expect(await gnosisSafeWithoutProxy.getOwners()).to.deep.equal(owners.map((owner) => owner.address));
      expect(
        await gnosisSafeWithoutProxy.getStorageAt(
          BigInt(ethers.solidityPackedKeccak256(['string'], ['fallback_manager.handler.address'])),
          1
        )
      ).to.equal(ethers.ZeroHash);
      expect(await gnosisSafeWithoutProxy.getModulesPaginated(SENTINEL_MODULES, 10)).to.deep.equal([
        [],
        SENTINEL_MODULES,
      ]);
    });
  });

  // The contract gets set up by the constructor and should not allow consecutive setups
  describe('setup', function () {
    it('reverts', async function () {
      const { owners, threshold, gnosisSafeWithoutProxy } = await helpers.loadFixture(deploy);
      await expect(
        gnosisSafeWithoutProxy.setup(
          owners.map((owner) => owner.address),
          threshold,
          ethers.ZeroAddress,
          '0x',
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          0,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith('GS200');
    });
  });

  // From this point on, try a few of the expected use-cases
  describe('execTransaction', function () {
    context('Transaction is direct', function () {
      context('Transaction is a function call', function () {
        it('executes transaction', async function () {
          const { owners, threshold, gnosisSafeWithoutProxy, mockSafeTarget } = await helpers.loadFixture(deploy);
          const thresholdManyRandomlySelectedSigners = [...owners].sort(() => Math.random() - 0.5).slice(0, threshold);
          const number = 123;
          const value = 1;
          await signAndExecuteTransaction(
            gnosisSafeWithoutProxy,
            thresholdManyRandomlySelectedSigners,
            await mockSafeTarget.getAddress(),
            mockSafeTarget.interface.encodeFunctionData('setNumberAsSafe', [number]),
            value
          );
          expect(await ethers.provider.getBalance(await mockSafeTarget.getAddress())).to.equal(value);
          expect(await mockSafeTarget.number()).to.equal(number);
        });
      });
      context('Transaction is not a function call', function () {
        it('executes transaction', async function () {
          const { owners, threshold, gnosisSafeWithoutProxy, mockSafeTarget } = await helpers.loadFixture(deploy);
          const thresholdManyRandomlySelectedSigners = [...owners].sort(() => Math.random() - 0.5).slice(0, threshold);
          const value = 1;
          await signAndExecuteTransaction(
            gnosisSafeWithoutProxy,
            thresholdManyRandomlySelectedSigners,
            await mockSafeTarget.getAddress(),
            '0x',
            value
          );
          expect(await ethers.provider.getBalance(await mockSafeTarget.getAddress())).to.equal(value);
          expect(await mockSafeTarget.number()).to.equal(0);
        });
      });
    });
    context('Transaction is through OwnableCallForwarder', function () {
      context('Transaction is a function call', function () {
        it('executes transaction', async function () {
          const { owners, threshold, gnosisSafeWithoutProxy, mockSafeTarget, ownableCallForwarder } =
            await helpers.loadFixture(deploy);
          const thresholdManyRandomlySelectedSigners = [...owners].sort(() => Math.random() - 0.5).slice(0, threshold);
          const number = 123;
          const value = 1;
          await signAndExecuteTransaction(
            gnosisSafeWithoutProxy,
            thresholdManyRandomlySelectedSigners,
            await ownableCallForwarder.getAddress(),
            ownableCallForwarder.interface.encodeFunctionData('forwardCall', [
              await mockSafeTarget.getAddress(),
              mockSafeTarget.interface.encodeFunctionData('setNumberAsForwarder', [number]),
            ]),
            value
          );
          expect(await ethers.provider.getBalance(await mockSafeTarget.getAddress())).to.equal(value);
          expect(await mockSafeTarget.number()).to.equal(number);
        });
      });
    });
  });

  describe('changeThreshold', function () {
    it('changes threshold', async function () {
      const { owners, threshold, gnosisSafeWithoutProxy } = await helpers.loadFixture(deploy);
      const thresholdManyRandomlySelectedSigners = [...owners].sort(() => Math.random() - 0.5).slice(0, threshold);
      const newThreshold = 3;
      await signAndExecuteTransaction(
        gnosisSafeWithoutProxy,
        thresholdManyRandomlySelectedSigners,
        gnosisSafeWithoutProxy.getAddress(),
        gnosisSafeWithoutProxy.interface.encodeFunctionData('changeThreshold', [newThreshold]),
        0
      );
      expect(await gnosisSafeWithoutProxy.getThreshold()).to.equal(newThreshold);
    });
  });

  describe('addOwnerWithThreshold', function () {
    it('adds owner with threshold', async function () {
      const { owners, threshold, gnosisSafeWithoutProxy } = await helpers.loadFixture(deploy);
      const thresholdManyRandomlySelectedSigners = [...owners].sort(() => Math.random() - 0.5).slice(0, threshold);
      const newOwner = ethers.Wallet.createRandom();
      const newThreshold = 3;
      await signAndExecuteTransaction(
        gnosisSafeWithoutProxy,
        thresholdManyRandomlySelectedSigners,
        gnosisSafeWithoutProxy.getAddress(),
        gnosisSafeWithoutProxy.interface.encodeFunctionData('addOwnerWithThreshold', [newOwner.address, newThreshold]),
        0
      );
      expect(await gnosisSafeWithoutProxy.getOwners()).to.deep.equal([
        newOwner.address,
        ...owners.map((owner) => owner.address),
      ]);
      expect(await gnosisSafeWithoutProxy.getThreshold()).to.equal(newThreshold);
    });
  });
});
