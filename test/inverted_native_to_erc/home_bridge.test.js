const HomeBridge = artifacts.require('HomeBridgeInvertedNativeToErc.sol')
const EternalStorageProxy = artifacts.require('EternalStorageProxy.sol')
const BridgeValidators = artifacts.require('BridgeValidators.sol')
const ERC677BridgeToken = artifacts.require('ERC677BridgeToken.sol')
const FrontierMock = artifacts.require('FrontierMock.sol')

const { expect } = require('chai')
const { ERROR_MSG, ZERO_ADDRESS, toBN } = require('../setup')
const { createMessage, sign, getEvents, ether, expectEventInLogs } = require('../helpers/helpers')

const minPerTx = ether('0.01')
const requireBlockConfirmations = 8
const gasPrice = web3.utils.toWei('1', 'gwei')
const quarterEther = ether('0.25')
const oneEther = ether('1')
const halfEther = ether('0.5')
const foreignDailyLimit = oneEther
const foreignMaxPerTx = halfEther
const ZERO = toBN(0)
const markedAsProcessed = toBN(2)
  .pow(toBN(255))
  .add(toBN(1))

contract('HomeBridge_Inverted_Native_to_ERC20', async accounts => {
  let homeContract
  let validatorContract
  let authorities
  let owner
  let token
  before(async () => {
    validatorContract = await BridgeValidators.new()
    authorities = [accounts[1]]
    owner = accounts[0]
    await validatorContract.initialize(1, authorities, owner)
  })
  describe('#initialize', async () => {
    beforeEach(async () => {
      homeContract = await HomeBridge.new()
      token = await ERC677BridgeToken.new('Some ERC20', 'RSZT', 18)
    })
    it('sets variables', async () => {
      expect(await homeContract.validatorContract()).to.be.equal(ZERO_ADDRESS)
      expect(await homeContract.deployedAtBlock()).to.be.bignumber.equal(ZERO)
      expect(await homeContract.dailyLimit()).to.be.bignumber.equal(ZERO)
      expect(await homeContract.maxPerTx()).to.be.bignumber.equal(ZERO)
      expect(await homeContract.isInitialized()).to.be.equal(false)

      const { logs } = await homeContract.initialize(
        validatorContract.address,
        '3',
        '2',
        '1',
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      ).should.be.fulfilled

      expect(await homeContract.isInitialized()).to.be.equal(true)
      expect(await homeContract.validatorContract()).to.be.equal(validatorContract.address)
      expect(await homeContract.deployedAtBlock()).to.be.bignumber.above(ZERO)
      expect(await homeContract.dailyLimit()).to.be.bignumber.equal('3')
      expect(await homeContract.maxPerTx()).to.be.bignumber.equal('2')
      expect(await homeContract.minPerTx()).to.be.bignumber.equal('1')
      const bridgeMode = '0x2d559eed' // 4 bytes of keccak256('inverted-native-to-erc-core')
      expect(await homeContract.getBridgeMode()).to.be.equal(bridgeMode)
      const { major, minor, patch } = await homeContract.getBridgeInterfacesVersion()
      expect(major).to.be.bignumber.gte(ZERO)
      expect(minor).to.be.bignumber.gte(ZERO)
      expect(patch).to.be.bignumber.gte(ZERO)

      expectEventInLogs(logs, 'RequiredBlockConfirmationChanged', {
        requiredBlockConfirmations: toBN(requireBlockConfirmations)
      })
      expectEventInLogs(logs, 'GasPriceChanged', { gasPrice })
      expectEventInLogs(logs, 'DailyLimitChanged', { newLimit: '3' })
      expectEventInLogs(logs, 'ExecutionDailyLimitChanged', { newLimit: foreignDailyLimit })
    })
    it('cant set maxPerTx > dailyLimit', async () => {
      expect(await homeContract.isInitialized()).to.be.equal(false)

      await homeContract
        .initialize(
          validatorContract.address,
          '1',
          '2',
          '1',
          gasPrice,
          requireBlockConfirmations,
          token.address,
          foreignDailyLimit,
          foreignMaxPerTx,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)
      await homeContract
        .initialize(
          validatorContract.address,
          '3',
          '2',
          '2',
          gasPrice,
          requireBlockConfirmations,
          token.address,
          foreignDailyLimit,
          foreignMaxPerTx,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)

      expect(await homeContract.isInitialized()).to.be.equal(false)
    })

    it('can be deployed via upgradeToAndCall', async () => {
      const storageProxy = await EternalStorageProxy.new().should.be.fulfilled
      const data = homeContract.contract.methods
        .initialize(
          validatorContract.address,
          '3',
          '2',
          '1',
          gasPrice,
          requireBlockConfirmations,
          token.address,
          '3',
          '2',
          owner
        )
        .encodeABI()
      await storageProxy.upgradeToAndCall('1', homeContract.address, data).should.be.fulfilled
      const finalContract = await HomeBridge.at(storageProxy.address)

      expect(await finalContract.isInitialized()).to.be.equal(true)
      expect(await finalContract.validatorContract()).to.be.equal(validatorContract.address)
      expect(await finalContract.dailyLimit()).to.be.bignumber.equal('3')
      expect(await finalContract.maxPerTx()).to.be.bignumber.equal('2')
      expect(await finalContract.minPerTx()).to.be.bignumber.equal('1')
    })

    it('cant initialize with invalid arguments', async () => {
      expect(await homeContract.isInitialized()).to.be.equal(false)

      await homeContract
        .initialize(
          owner,
          '3',
          '2',
          '1',
          gasPrice,
          requireBlockConfirmations,
          token.address,
          foreignDailyLimit,
          foreignMaxPerTx,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)
      await homeContract
        .initialize(
          ZERO_ADDRESS,
          '3',
          '2',
          '1',
          gasPrice,
          requireBlockConfirmations,
          token.address,
          foreignDailyLimit,
          foreignMaxPerTx,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)
      await homeContract
        .initialize(
          validatorContract.address,
          '3',
          '2',
          '1',
          gasPrice,
          requireBlockConfirmations,
          ZERO_ADDRESS,
          foreignDailyLimit,
          foreignMaxPerTx,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)
      await homeContract
        .initialize(
          validatorContract.address,
          '3',
          '2',
          '1',
          gasPrice,
          requireBlockConfirmations,
          owner,
          foreignDailyLimit,
          foreignMaxPerTx,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)
      await homeContract
        .initialize(
          validatorContract.address,
          '3',
          '2',
          '1',
          gasPrice,
          requireBlockConfirmations,
          token.address,
          halfEther,
          oneEther,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)
      await homeContract.initialize(
        validatorContract.address,
        '3',
        '2',
        '1',
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      ).should.be.fulfilled

      expect(await homeContract.isInitialized()).to.be.equal(true)
    })
    it('can initialize with zero gas price ', async () => {
      // Given
      expect(await homeContract.isInitialized()).to.be.equal(false)

      // When
      await homeContract.initialize(
        validatorContract.address,
        '3',
        '2',
        '1',
        0,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      ).should.be.fulfilled

      // Then
      expect(await homeContract.isInitialized()).to.be.equal(true)
    })
  })

  describe('#fallback', async () => {
    beforeEach(async () => {
      homeContract = await HomeBridge.new()
      token = await ERC677BridgeToken.new('Some ERC20', 'RSZT', 18)
      await homeContract.initialize(
        validatorContract.address,
        '3',
        '2',
        '1',
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      )
    })
    it('reverts', async () => {
      await homeContract
        .sendTransaction({
          from: accounts[1],
          value: 1
        })
        .should.be.rejectedWith(ERROR_MSG)
    })
  })

  describe('#setting limits', async () => {
    let homeContract
    beforeEach(async () => {
      homeContract = await HomeBridge.new()
      token = await ERC677BridgeToken.new('Some ERC20', 'RSZT', 18)
      await homeContract.initialize(
        validatorContract.address,
        '3',
        '2',
        '1',
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      )
    })
    it('#setMaxPerTx allows to set only to owner and cannot be more than daily limit', async () => {
      await homeContract.setMaxPerTx(2, { from: authorities[0] }).should.be.rejectedWith(ERROR_MSG)
      await homeContract.setMaxPerTx(2, { from: owner }).should.be.fulfilled

      await homeContract.setMaxPerTx(3, { from: owner }).should.be.rejectedWith(ERROR_MSG)
    })

    it('#setMinPerTx allows to set only to owner and cannot be more than daily limit and should be less than maxPerTx', async () => {
      await homeContract.setMinPerTx(1, { from: authorities[0] }).should.be.rejectedWith(ERROR_MSG)
      await homeContract.setMinPerTx(1, { from: owner }).should.be.fulfilled

      await homeContract.setMinPerTx(2, { from: owner }).should.be.rejectedWith(ERROR_MSG)
    })
  })

  describe('#executeAffirmation', async () => {
    let homeBridge
    beforeEach(async () => {
      homeBridge = await HomeBridge.new()
      token = await ERC677BridgeToken.new('Some ERC20', 'RSZT', 18)
      await homeBridge.initialize(
        validatorContract.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      )
      await token.transferOwnership(homeBridge.address)
    })
    it('should allow validator to withdraw', async () => {
      const recipient = accounts[5]
      const value = halfEther
      const balanceBefore = await token.balanceOf(recipient)
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const { logs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      })
      expectEventInLogs(logs, 'SignedForAffirmation', {
        signer: authorities[0],
        transactionHash
      })
      expectEventInLogs(logs, 'AffirmationCompleted', {
        recipient,
        value,
        transactionHash
      })

      const totalSupply = await token.totalSupply()
      const balanceAfter = await token.balanceOf(recipient)
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value))
      totalSupply.should.be.bignumber.equal(value)

      const msgHash = web3.utils.soliditySha3(recipient, value, transactionHash)
      const senderHash = web3.utils.soliditySha3(authorities[0], msgHash)
      true.should.be.equal(await homeBridge.affirmationsSigned(senderHash))
      markedAsProcessed.should.be.bignumber.equal(await homeBridge.numAffirmationsSigned(msgHash))
      await homeBridge
        .executeAffirmation(recipient, value, transactionHash, { from: authorities[0] })
        .should.be.rejectedWith(ERROR_MSG)
    })

    it('should allow validator to withdraw through frontier', async () => {
      const frontier = await FrontierMock.new(token.address, homeBridge.address)
      await homeBridge.setFrontierAddress(frontier.address, { from: owner })

      const recipient = accounts[5]
      const value = halfEther
      const balanceBefore = await token.balanceOf(recipient)
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const { logs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      })
      expectEventInLogs(logs, 'SignedForAffirmation', {
        signer: authorities[0],
        transactionHash
      })
      expectEventInLogs(logs, 'AffirmationCompleted', {
        recipient,
        value,
        transactionHash
      })

      const totalSupply = await token.totalSupply()
      const balanceAfter = await token.balanceOf(recipient)
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value))
      totalSupply.should.be.bignumber.equal(value)
    })

    it('should allow validator to withdraw with zero value', async () => {
      const recipient = accounts[5]
      const value = ZERO
      const balanceBefore = await token.balanceOf(recipient)
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'

      const { logs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      })

      expectEventInLogs(logs, 'SignedForAffirmation', {
        signer: authorities[0],
        transactionHash
      })
      expectEventInLogs(logs, 'AffirmationCompleted', {
        recipient,
        value,
        transactionHash
      })

      const totalSupply = await token.totalSupply()
      const balanceAfter = await token.balanceOf(recipient)
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value))
      totalSupply.should.be.bignumber.equal(value)

      const msgHash = web3.utils.soliditySha3(recipient, value, transactionHash)
      const senderHash = web3.utils.soliditySha3(authorities[0], msgHash)
      true.should.be.equal(await homeBridge.affirmationsSigned(senderHash))
      markedAsProcessed.should.be.bignumber.equal(await homeBridge.numAffirmationsSigned(msgHash))
      await homeBridge
        .executeAffirmation(recipient, value, transactionHash, { from: authorities[0] })
        .should.be.rejectedWith(ERROR_MSG)
    })

    it('test with 2 signatures required', async () => {
      const token2sig = await ERC677BridgeToken.new('Some ERC20', 'RSZT', 18)
      const validatorContractWith2Signatures = await BridgeValidators.new()
      const authoritiesThreeAccs = [accounts[1], accounts[2], accounts[3]]
      const ownerOfValidators = accounts[0]
      await validatorContractWith2Signatures.initialize(2, authoritiesThreeAccs, ownerOfValidators)
      const homeBridgeWithTwoSigs = await HomeBridge.new()
      await homeBridgeWithTwoSigs.initialize(
        validatorContractWith2Signatures.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token2sig.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      )
      await token2sig.transferOwnership(homeBridgeWithTwoSigs.address)
      const recipient = accounts[5]
      const value = halfEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const balanceBefore = await token2sig.balanceOf(recipient)
      const msgHash = web3.utils.soliditySha3(recipient, value, transactionHash)

      const { logs } = await homeBridgeWithTwoSigs.executeAffirmation(recipient, value, transactionHash, {
        from: authoritiesThreeAccs[0]
      }).should.be.fulfilled

      expectEventInLogs(logs, 'SignedForAffirmation', {
        signer: authorities[0],
        transactionHash
      })

      expect(await token2sig.totalSupply()).to.be.bignumber.equal(ZERO)
      const notProcessed = await homeBridgeWithTwoSigs.numAffirmationsSigned(msgHash)
      notProcessed.should.be.bignumber.equal('1')

      await homeBridgeWithTwoSigs
        .executeAffirmation(recipient, value, transactionHash, { from: authoritiesThreeAccs[0] })
        .should.be.rejectedWith(ERROR_MSG)
      const secondSignature = await homeBridgeWithTwoSigs.executeAffirmation(recipient, value, transactionHash, {
        from: authoritiesThreeAccs[1]
      }).should.be.fulfilled

      const balanceAfter = await token2sig.balanceOf(recipient)
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value))

      expectEventInLogs(secondSignature.logs, 'AffirmationCompleted', {
        recipient,
        value,
        transactionHash
      })

      const senderHash = web3.utils.soliditySha3(authoritiesThreeAccs[0], msgHash)
      true.should.be.equal(await homeBridgeWithTwoSigs.affirmationsSigned(senderHash))

      const senderHash2 = web3.utils.soliditySha3(authoritiesThreeAccs[1], msgHash)
      true.should.be.equal(await homeBridgeWithTwoSigs.affirmationsSigned(senderHash2))

      const processed = toBN(2)
        .pow(toBN(255))
        .add(toBN(2))
      expect(await homeBridgeWithTwoSigs.numAffirmationsSigned(msgHash)).to.be.bignumber.equal(processed)
    })
    it('should not allow to double submit', async () => {
      const recipient = accounts[5]
      const value = '1'
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled
      await homeBridge
        .executeAffirmation(recipient, value, transactionHash, { from: authorities[0] })
        .should.be.rejectedWith(ERROR_MSG)
    })

    it('should not allow non-authorities to execute deposit', async () => {
      const recipient = accounts[5]
      const value = oneEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      await homeBridge
        .executeAffirmation(recipient, value, transactionHash, { from: accounts[7] })
        .should.be.rejectedWith(ERROR_MSG)
    })

    it('doesnt allow to deposit if requiredSignatures has changed', async () => {
      const token2sig = await ERC677BridgeToken.new('Some ERC20', 'RSZT', 18)
      const validatorContractWith2Signatures = await BridgeValidators.new()
      const authoritiesThreeAccs = [accounts[1], accounts[2], accounts[3]]
      const ownerOfValidators = accounts[0]
      await validatorContractWith2Signatures.initialize(2, authoritiesThreeAccs, ownerOfValidators)
      const homeBridgeWithTwoSigs = await HomeBridge.new()
      await homeBridgeWithTwoSigs.initialize(
        validatorContractWith2Signatures.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token2sig.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      )
      await token2sig.transferOwnership(homeBridgeWithTwoSigs.address)
      const recipient = accounts[5]
      const value = halfEther.div(toBN(2))
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const balanceBefore = await token.balanceOf(recipient)

      await homeBridgeWithTwoSigs.executeAffirmation(recipient, value, transactionHash, {
        from: authoritiesThreeAccs[0]
      }).should.be.fulfilled
      await homeBridgeWithTwoSigs.executeAffirmation(recipient, value, transactionHash, {
        from: authoritiesThreeAccs[1]
      }).should.be.fulfilled
      balanceBefore.add(value).should.be.bignumber.equal(await token2sig.balanceOf(recipient))
      await validatorContractWith2Signatures.setRequiredSignatures(3).should.be.fulfilled
      await homeBridgeWithTwoSigs
        .executeAffirmation(recipient, value, transactionHash, { from: authoritiesThreeAccs[2] })
        .should.be.rejectedWith(ERROR_MSG)
      await validatorContractWith2Signatures.setRequiredSignatures(1).should.be.fulfilled
      await homeBridgeWithTwoSigs
        .executeAffirmation(recipient, value, transactionHash, { from: authoritiesThreeAccs[2] })
        .should.be.rejectedWith(ERROR_MSG)
      balanceBefore.add(value).should.be.bignumber.equal(await token2sig.balanceOf(recipient))
    })
    it('works with 5 validators and 3 required signatures', async () => {
      const recipient = accounts[8]
      const authoritiesFiveAccs = [accounts[1], accounts[2], accounts[3], accounts[4], accounts[5]]
      const ownerOfValidators = accounts[0]
      const validatorContractWith3Signatures = await BridgeValidators.new()
      await validatorContractWith3Signatures.initialize(3, authoritiesFiveAccs, ownerOfValidators)
      const token = await ERC677BridgeToken.new('Some ERC20', 'RSZT', 18)

      const homeBridgeWithThreeSigs = await HomeBridge.new()
      await homeBridgeWithThreeSigs.initialize(
        validatorContractWith3Signatures.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      )
      await token.transferOwnership(homeBridgeWithThreeSigs.address)

      const value = ether('0.5')
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'

      const { logs } = await homeBridgeWithThreeSigs.executeAffirmation(recipient, value, transactionHash, {
        from: authoritiesFiveAccs[0]
      }).should.be.fulfilled
      expectEventInLogs(logs, 'SignedForAffirmation', {
        signer: authorities[0],
        transactionHash
      })

      await homeBridgeWithThreeSigs.executeAffirmation(recipient, value, transactionHash, {
        from: authoritiesFiveAccs[1]
      }).should.be.fulfilled
      const thirdSignature = await homeBridgeWithThreeSigs.executeAffirmation(recipient, value, transactionHash, {
        from: authoritiesFiveAccs[2]
      }).should.be.fulfilled

      expectEventInLogs(thirdSignature.logs, 'AffirmationCompleted', {
        recipient,
        value,
        transactionHash
      })
    })
    it('should not allow execute affirmation over foreign max tx limit', async () => {
      const recipient = accounts[5]
      const value = oneEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const { logs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled

      expectEventInLogs(logs, 'AmountLimitExceeded', {
        recipient,
        value,
        transactionHash
      })
    })
    it('should fail if txHash already set as above of limits', async () => {
      const recipient = accounts[5]
      const value = oneEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const { logs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled

      expectEventInLogs(logs, 'AmountLimitExceeded', {
        recipient,
        value,
        transactionHash
      })

      await homeBridge
        .executeAffirmation(recipient, value, transactionHash, { from: authorities[0] })
        .should.be.rejectedWith(ERROR_MSG)
      await homeBridge
        .executeAffirmation(accounts[6], value, transactionHash, { from: authorities[0] })
        .should.be.rejectedWith(ERROR_MSG)
    })
    it('should not allow execute affirmation over daily foreign limit', async () => {
      const recipient = accounts[5]
      const value = halfEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const { logs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled

      expectEventInLogs(logs, 'SignedForAffirmation', {
        signer: authorities[0],
        transactionHash
      })
      expectEventInLogs(logs, 'AffirmationCompleted', {
        recipient,
        value,
        transactionHash
      })

      const transactionHash2 = '0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121'
      const { logs: logs2 } = await homeBridge.executeAffirmation(recipient, value, transactionHash2, {
        from: authorities[0]
      }).should.be.fulfilled

      expectEventInLogs(logs2, 'SignedForAffirmation', {
        signer: authorities[0],
        transactionHash: transactionHash2
      })
      expectEventInLogs(logs2, 'AffirmationCompleted', {
        recipient,
        value,
        transactionHash: transactionHash2
      })

      const transactionHash3 = '0x69debd8fd1923c9cb3cd8ef6461e2740b2d037943b941729d5a47671a2bb8712'
      const { logs: logs3 } = await homeBridge.executeAffirmation(recipient, value, transactionHash3, {
        from: authorities[0]
      }).should.be.fulfilled

      expectEventInLogs(logs3, 'AmountLimitExceeded', {
        recipient,
        value,
        transactionHash: transactionHash3
      })

      const outOfLimitAmount = await homeBridge.outOfLimitAmount()

      outOfLimitAmount.should.be.bignumber.equal(halfEther)

      const transactionHash4 = '0xc9ffe298d85ec5c515153608924b7bdcf1835539813dcc82cdbcc071170c3196'
      const { logs: logs4 } = await homeBridge.executeAffirmation(recipient, value, transactionHash4, {
        from: authorities[0]
      }).should.be.fulfilled

      expectEventInLogs(logs4, 'AmountLimitExceeded', {
        recipient,
        value,
        transactionHash: transactionHash4
      })

      expect(await homeBridge.outOfLimitAmount()).to.be.bignumber.equal(oneEther)
    })
  })
  describe('#isAlreadyProcessed', async () => {
    it('returns ', async () => {
      const homeBridge = await HomeBridge.new()
      const bn = toBN(2).pow(toBN(255))
      const processedNumbers = [bn.add(toBN(1)).toString(10), bn.add(toBN(100)).toString(10)]
      true.should.be.equal(await homeBridge.isAlreadyProcessed(processedNumbers[0]))
      true.should.be.equal(await homeBridge.isAlreadyProcessed(processedNumbers[1]))
      false.should.be.equal(await homeBridge.isAlreadyProcessed(10))
    })
  })

  describe('#submitSignature', async () => {
    let validatorContractWith2Signatures
    let authoritiesThreeAccs
    let ownerOfValidators
    let homeBridgeWithTwoSigs
    beforeEach(async () => {
      const token2sig = await ERC677BridgeToken.new('Some ERC20', 'RSZT', 18)
      validatorContractWith2Signatures = await BridgeValidators.new()
      authoritiesThreeAccs = [accounts[1], accounts[2], accounts[3]]
      ownerOfValidators = accounts[0]
      await validatorContractWith2Signatures.initialize(2, authoritiesThreeAccs, ownerOfValidators)
      homeBridgeWithTwoSigs = await HomeBridge.new()
      await homeBridgeWithTwoSigs.initialize(
        validatorContractWith2Signatures.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token2sig.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      )
      await token2sig.transferOwnership(homeBridgeWithTwoSigs.address)
    })
    it('allows a validator to submit a signature', async () => {
      const recipientAccount = accounts[8]
      const value = ether('0.5')
      const transactionHash = '0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80'
      const message = createMessage(recipientAccount, value, transactionHash, homeBridgeWithTwoSigs.address)
      const signature = await sign(authoritiesThreeAccs[0], message)
      const { logs } = await homeBridgeWithTwoSigs.submitSignature(signature, message, {
        from: authorities[0]
      }).should.be.fulfilled
      logs[0].event.should.be.equal('SignedForUserRequest')
      const msgHashFromLog = logs[0].args.messageHash
      const signatureFromContract = await homeBridgeWithTwoSigs.signature(msgHashFromLog, 0)
      const messageFromContract = await homeBridgeWithTwoSigs.message(msgHashFromLog)

      signature.should.be.equal(signatureFromContract)
      messageFromContract.should.be.equal(messageFromContract)
      const hashMsg = web3.utils.soliditySha3(message)
      expect(await homeBridgeWithTwoSigs.numMessagesSigned(hashMsg)).to.be.bignumber.equal('1')
      const hashSenderMsg = web3.utils.soliditySha3(authorities[0], hashMsg)
      true.should.be.equal(await homeBridgeWithTwoSigs.messagesSigned(hashSenderMsg))
    })
    it('when enough requiredSignatures are collected, CollectedSignatures event is emitted', async () => {
      const recipientAccount = accounts[8]
      const value = ether('0.5')
      const transactionHash = '0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80'
      const message = createMessage(recipientAccount, value, transactionHash, homeBridgeWithTwoSigs.address)
      const hashMsg = web3.utils.soliditySha3(message)
      const signature = await sign(authoritiesThreeAccs[0], message)
      const signature2 = await sign(authoritiesThreeAccs[1], message)
      expect(await validatorContractWith2Signatures.requiredSignatures()).to.be.bignumber.equal('2')
      await homeBridgeWithTwoSigs.submitSignature(signature, message, {
        from: authoritiesThreeAccs[0]
      }).should.be.fulfilled
      await homeBridgeWithTwoSigs
        .submitSignature(signature, message, { from: authoritiesThreeAccs[0] })
        .should.be.rejectedWith(ERROR_MSG)
      await homeBridgeWithTwoSigs
        .submitSignature(signature, message, { from: authoritiesThreeAccs[1] })
        .should.be.rejectedWith(ERROR_MSG)
      const { logs } = await homeBridgeWithTwoSigs.submitSignature(signature2, message, {
        from: authoritiesThreeAccs[1]
      }).should.be.fulfilled
      logs.length.should.be.equal(2)
      logs[1].event.should.be.equal('CollectedSignatures')
      logs[1].args.authorityResponsibleForRelay.should.be.equal(authoritiesThreeAccs[1])
      const markedAsProcessed = toBN(2)
        .pow(toBN(255))
        .add(toBN(2))
      markedAsProcessed.should.be.bignumber.equal(await homeBridgeWithTwoSigs.numMessagesSigned(hashMsg))
    })
    it('works with 5 validators and 3 required signatures', async () => {
      const recipientAccount = accounts[8]
      const authoritiesFiveAccs = [accounts[1], accounts[2], accounts[3], accounts[4], accounts[5]]
      const validatorContractWith3Signatures = await BridgeValidators.new()
      await validatorContractWith3Signatures.initialize(3, authoritiesFiveAccs, ownerOfValidators)
      const token = await ERC677BridgeToken.new('Some ERC20', 'RSZT', 18)

      const homeBridgeWithThreeSigs = await HomeBridge.new()
      await homeBridgeWithThreeSigs.initialize(
        validatorContractWith3Signatures.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      )

      const value = ether('0.5')
      const transactionHash = '0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80'
      const message = createMessage(recipientAccount, value, transactionHash, homeBridgeWithThreeSigs.address)
      const signature = await sign(authoritiesFiveAccs[0], message)
      const signature2 = await sign(authoritiesFiveAccs[1], message)
      const signature3 = await sign(authoritiesFiveAccs[2], message)
      expect(await validatorContractWith3Signatures.requiredSignatures()).to.be.bignumber.equal('3')

      await homeBridgeWithThreeSigs.submitSignature(signature, message, {
        from: authoritiesFiveAccs[0]
      }).should.be.fulfilled
      await homeBridgeWithThreeSigs.submitSignature(signature2, message, {
        from: authoritiesFiveAccs[1]
      }).should.be.fulfilled
      const { logs } = await homeBridgeWithThreeSigs.submitSignature(signature3, message, {
        from: authoritiesFiveAccs[2]
      }).should.be.fulfilled
      logs.length.should.be.equal(2)
      logs[1].event.should.be.equal('CollectedSignatures')
      logs[1].args.authorityResponsibleForRelay.should.be.equal(authoritiesFiveAccs[2])
    })
    it('attack when increasing requiredSignatures', async () => {
      const recipientAccount = accounts[8]
      const value = ether('0.5')
      const transactionHash = '0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80'
      const message = createMessage(recipientAccount, value, transactionHash, homeBridgeWithTwoSigs.address)
      const signature = await sign(authoritiesThreeAccs[0], message)
      const signature2 = await sign(authoritiesThreeAccs[1], message)
      const signature3 = await sign(authoritiesThreeAccs[2], message)
      expect(await validatorContractWith2Signatures.requiredSignatures()).to.be.bignumber.equal('2')

      await homeBridgeWithTwoSigs.submitSignature(signature, message, {
        from: authoritiesThreeAccs[0]
      }).should.be.fulfilled
      await homeBridgeWithTwoSigs
        .submitSignature(signature, message, { from: authoritiesThreeAccs[0] })
        .should.be.rejectedWith(ERROR_MSG)
      await homeBridgeWithTwoSigs
        .submitSignature(signature, message, { from: authoritiesThreeAccs[1] })
        .should.be.rejectedWith(ERROR_MSG)
      const { logs } = await homeBridgeWithTwoSigs.submitSignature(signature2, message, {
        from: authoritiesThreeAccs[1]
      }).should.be.fulfilled
      logs.length.should.be.equal(2)
      logs[1].event.should.be.equal('CollectedSignatures')
      logs[1].args.authorityResponsibleForRelay.should.be.equal(authoritiesThreeAccs[1])
      await validatorContractWith2Signatures.setRequiredSignatures(3).should.be.fulfilled
      expect(await validatorContractWith2Signatures.requiredSignatures()).to.be.bignumber.equal('3')

      await homeBridgeWithTwoSigs
        .submitSignature(signature3, message, { from: authoritiesThreeAccs[2] })
        .should.be.rejectedWith(ERROR_MSG)
    })
    it('attack when decreasing requiredSignatures', async () => {
      const recipientAccount = accounts[8]
      const value = ether('0.5')
      const transactionHash = '0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80'
      const message = createMessage(recipientAccount, value, transactionHash, homeBridgeWithTwoSigs.address)
      const signature = await sign(authoritiesThreeAccs[0], message)
      const signature2 = await sign(authoritiesThreeAccs[1], message)

      expect(await validatorContractWith2Signatures.requiredSignatures()).to.be.bignumber.equal('2')

      await homeBridgeWithTwoSigs.submitSignature(signature, message, {
        from: authoritiesThreeAccs[0]
      }).should.be.fulfilled
      await validatorContractWith2Signatures.setRequiredSignatures(1).should.be.fulfilled

      expect(await validatorContractWith2Signatures.requiredSignatures()).to.be.bignumber.equal('1')
      const { logs } = await homeBridgeWithTwoSigs.submitSignature(signature2, message, {
        from: authoritiesThreeAccs[1]
      }).should.be.fulfilled
      logs.length.should.be.equal(2)
      logs[1].event.should.be.equal('CollectedSignatures')
      logs[1].args.authorityResponsibleForRelay.should.be.equal(authoritiesThreeAccs[1])
    })
  })

  describe('#requiredMessageLength', async () => {
    beforeEach(async () => {
      homeContract = await HomeBridge.new()
    })

    it('should return the required message length', async () => {
      const requiredMessageLength = await homeContract.requiredMessageLength()
      expect(requiredMessageLength).to.be.bignumber.equal('104')
    })
  })

  describe('#fixAssetsAboveLimits', async () => {
    let homeBridge
    beforeEach(async () => {
      const homeBridgeImpl = await HomeBridge.new()
      const storageProxy = await EternalStorageProxy.new().should.be.fulfilled
      await storageProxy.upgradeTo('1', homeBridgeImpl.address).should.be.fulfilled
      homeBridge = await HomeBridge.at(storageProxy.address)
      await homeBridge.initialize(
        validatorContract.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      ).should.be.fulfilled
    })
    it('Should revert if value to unlock is bigger than max per transaction', async () => {
      const recipient = accounts[5]
      const value = oneEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const { logs: affirmationLogs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled

      affirmationLogs[0].event.should.be.equal('AmountLimitExceeded')

      const outOfLimitAmount = await homeBridge.outOfLimitAmount()
      outOfLimitAmount.should.be.bignumber.equal(value)

      await homeBridge.fixAssetsAboveLimits(transactionHash, false, value).should.be.rejectedWith(ERROR_MSG)
    })
    it('Should allow to partially reduce outOfLimitAmount and not emit UserRequestForSignature', async () => {
      const recipient = accounts[5]
      const value = oneEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const { logs: affirmationLogs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled

      affirmationLogs[0].event.should.be.equal('AmountLimitExceeded')

      const outOfLimitAmount = await homeBridge.outOfLimitAmount()
      outOfLimitAmount.should.be.bignumber.equal(value)

      const { logs } = await homeBridge.fixAssetsAboveLimits(transactionHash, false, halfEther).should.be.fulfilled

      logs.length.should.be.equal(1)
      expectEventInLogs(logs, 'AssetAboveLimitsFixed', {
        transactionHash,
        value: halfEther,
        remaining: halfEther
      })
      expect(await homeBridge.outOfLimitAmount()).to.be.bignumber.equal(halfEther)

      const { logs: logsSecondTx } = await homeBridge.fixAssetsAboveLimits(transactionHash, false, halfEther).should.be
        .fulfilled

      logsSecondTx.length.should.be.equal(1)
      expectEventInLogs(logsSecondTx, 'AssetAboveLimitsFixed', {
        transactionHash,
        value: halfEther,
        remaining: ZERO
      })
      expect(await homeBridge.outOfLimitAmount()).to.be.bignumber.equal(ZERO)
    })
    it('Should allow to partially reduce outOfLimitAmount and emit UserRequestForSignature', async () => {
      const recipient = accounts[5]
      const value = oneEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const { logs: affirmationLogs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled

      affirmationLogs[0].event.should.be.equal('AmountLimitExceeded')

      const outOfLimitAmount = await homeBridge.outOfLimitAmount()
      outOfLimitAmount.should.be.bignumber.equal(value)

      const { logs } = await homeBridge.fixAssetsAboveLimits(transactionHash, true, halfEther).should.be.fulfilled

      logs.length.should.be.equal(2)
      expectEventInLogs(logs, 'AssetAboveLimitsFixed', {
        transactionHash,
        value: halfEther,
        remaining: halfEther
      })
      expectEventInLogs(logs, 'UserRequestForSignature', {
        recipient,
        value: halfEther
      })

      expect(await homeBridge.outOfLimitAmount()).to.be.bignumber.equal(halfEther)

      const { logs: logsSecondTx } = await homeBridge.fixAssetsAboveLimits(transactionHash, true, halfEther).should.be
        .fulfilled

      logsSecondTx.length.should.be.equal(2)
      expectEventInLogs(logsSecondTx, 'AssetAboveLimitsFixed', {
        transactionHash,
        value: halfEther,
        remaining: ZERO
      })
      expectEventInLogs(logsSecondTx, 'UserRequestForSignature', {
        recipient,
        value: halfEther
      })

      expect(await homeBridge.outOfLimitAmount()).to.be.bignumber.equal(ZERO)
    })
    it('Should revert if try to unlock more than available', async () => {
      const recipient = accounts[5]
      const value = oneEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const { logs: affirmationLogs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled

      affirmationLogs[0].event.should.be.equal('AmountLimitExceeded')

      const outOfLimitAmount = await homeBridge.outOfLimitAmount()
      outOfLimitAmount.should.be.bignumber.equal(value)

      const { logs } = await homeBridge.fixAssetsAboveLimits(transactionHash, true, halfEther).should.be.fulfilled

      logs.length.should.be.equal(2)
      expectEventInLogs(logs, 'AssetAboveLimitsFixed', {
        transactionHash,
        value: halfEther,
        remaining: halfEther
      })
      expectEventInLogs(logs, 'UserRequestForSignature', {
        recipient,
        value: halfEther
      })

      expect(await homeBridge.outOfLimitAmount()).to.be.bignumber.equal(halfEther)

      const { logs: logsSecondTx } = await homeBridge.fixAssetsAboveLimits(transactionHash, true, quarterEther).should
        .be.fulfilled

      logsSecondTx.length.should.be.equal(2)
      expectEventInLogs(logsSecondTx, 'AssetAboveLimitsFixed', {
        transactionHash,
        value: quarterEther,
        remaining: quarterEther
      })
      expectEventInLogs(logsSecondTx, 'UserRequestForSignature', {
        recipient,
        value: quarterEther
      })

      expect(await homeBridge.outOfLimitAmount()).to.be.bignumber.equal(quarterEther)

      await homeBridge.fixAssetsAboveLimits(transactionHash, true, halfEther).should.be.rejectedWith(ERROR_MSG)
      const { logs: logsThirdTx } = await homeBridge.fixAssetsAboveLimits(transactionHash, true, quarterEther).should.be
        .fulfilled
      expectEventInLogs(logsThirdTx, 'AssetAboveLimitsFixed', {
        transactionHash,
        value: quarterEther,
        remaining: ZERO
      })
      expectEventInLogs(logsThirdTx, 'UserRequestForSignature', {
        recipient,
        value: quarterEther
      })

      expect(await homeBridge.outOfLimitAmount()).to.be.bignumber.equal(ZERO)
    })
    it('Should not be allow to be called by an already fixed txHash', async () => {
      const recipient = accounts[5]
      const value = oneEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const transactionHash2 = '0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121'

      await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled
      await homeBridge.executeAffirmation(recipient, value, transactionHash2, {
        from: authorities[0]
      }).should.be.fulfilled

      const outOfLimitAmount = await homeBridge.outOfLimitAmount()
      outOfLimitAmount.should.be.bignumber.equal(value.add(value))

      await homeBridge.fixAssetsAboveLimits(transactionHash, false, halfEther).should.be.fulfilled
      await homeBridge.fixAssetsAboveLimits(transactionHash, false, halfEther).should.be.fulfilled

      const newOutOfLimitAmount = await homeBridge.outOfLimitAmount()
      newOutOfLimitAmount.should.be.bignumber.equal(value)

      await homeBridge.fixAssetsAboveLimits(transactionHash, false, halfEther).should.be.rejectedWith(ERROR_MSG)

      await homeBridge.fixAssetsAboveLimits(transactionHash2, false, halfEther).should.be.fulfilled
      await homeBridge.fixAssetsAboveLimits(transactionHash2, false, halfEther).should.be.fulfilled

      expect(await homeBridge.outOfLimitAmount()).to.be.bignumber.equal(ZERO)

      await homeBridge.fixAssetsAboveLimits(transactionHash2, false, halfEther).should.be.rejectedWith(ERROR_MSG)
    })
    it('Should fail if txHash didnt increase out of limit amount', async () => {
      const recipient = accounts[5]
      const value = oneEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'
      const invalidTxHash = '0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121'

      const { logs: affirmationLogs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled

      affirmationLogs[0].event.should.be.equal('AmountLimitExceeded')

      await homeBridge.fixAssetsAboveLimits(invalidTxHash, true, halfEther).should.be.rejectedWith(ERROR_MSG)
    })
    it('Should fail if not called by proxyOwner', async () => {
      const recipient = accounts[5]
      const value = oneEther
      const transactionHash = '0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415'

      const { logs: affirmationLogs } = await homeBridge.executeAffirmation(recipient, value, transactionHash, {
        from: authorities[0]
      }).should.be.fulfilled

      affirmationLogs[0].event.should.be.equal('AmountLimitExceeded')

      await homeBridge
        .fixAssetsAboveLimits(transactionHash, true, halfEther, { from: recipient })
        .should.be.rejectedWith(ERROR_MSG)
      await homeBridge.fixAssetsAboveLimits(transactionHash, true, halfEther, { from: owner }).should.be.fulfilled
    })
  })
  describe('#claimTokens', () => {
    it('should be able to call claimTokens on tokenAddress', async () => {
      const token = await ERC677BridgeToken.new('Bridge Token', 'BT20', 18)

      const homeBridgeImpl = await HomeBridge.new()
      const storageProxy = await EternalStorageProxy.new().should.be.fulfilled
      await storageProxy.upgradeTo('1', homeBridgeImpl.address).should.be.fulfilled
      const homeBridge = await HomeBridge.at(storageProxy.address)
      await homeBridge.initialize(
        validatorContract.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      ).should.be.fulfilled

      await token.transferOwnership(homeBridge.address).should.be.fulfilled

      const tokenSecond = await ERC677BridgeToken.new('Test Token', 'TST', 18)

      await tokenSecond.mint(accounts[0], halfEther).should.be.fulfilled
      expect(await tokenSecond.balanceOf(accounts[0])).to.be.bignumber.equal(halfEther)

      await tokenSecond.transfer(token.address, halfEther)
      expect(await tokenSecond.balanceOf(accounts[0])).to.be.bignumber.equal(ZERO)
      expect(await tokenSecond.balanceOf(token.address)).to.be.bignumber.equal(halfEther)

      await homeBridge
        .claimTokensFromErc677(tokenSecond.address, accounts[3], { from: accounts[3] })
        .should.be.rejectedWith(ERROR_MSG)
      await homeBridge.claimTokensFromErc677(tokenSecond.address, accounts[3], { from: owner }).should.be.fulfilled
      expect(await tokenSecond.balanceOf(token.address)).to.be.bignumber.equal(ZERO)
      expect(await tokenSecond.balanceOf(accounts[3])).to.be.bignumber.equal(halfEther)
    })
  })
  describe('#onTokenTransfer', async () => {
    let homeBridge
    beforeEach(async () => {
      homeBridge = await HomeBridge.new()
      token = await ERC677BridgeToken.new('Some ERC20', 'TEST', 18)
    })
    it('should trigger UserRequestForSignature with transfer value', async () => {
      // Given
      const owner = accounts[0]
      const user = accounts[4]
      await homeBridge.initialize(
        validatorContract.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      ).should.be.fulfilled
      const value = halfEther
      await token.mint(user, value, { from: owner }).should.be.fulfilled

      // When
      await token.transferAndCall(homeBridge.address, value, '0x00', { from: user }).should.be.fulfilled

      // Then
      const events = await getEvents(homeBridge, { event: 'UserRequestForSignature' })
      expect(events[0].returnValues.recipient).to.be.equal(user)
      expect(toBN(events[0].returnValues.value)).to.be.bignumber.equal(value)
    })
    it('should trigger UserRequestForSignature using frontier', async () => {
      // Given
      const frontier = await FrontierMock.new(token.address, homeBridge.address)
      const owner = accounts[0]
      const user = accounts[4]
      await homeBridge.initialize(
        validatorContract.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      ).should.be.fulfilled
      await homeBridge.setFrontierAddress(frontier.address, { from: owner })
      const value = halfEther
      await token.mint(user, value, { from: owner }).should.be.fulfilled

      // When
      await token.transferAndCall(frontier.address, value, '0x00', { from: user }).should.be.fulfilled

      // Then
      const events = await getEvents(homeBridge, { event: 'UserRequestForSignature' })
      expect(events[0].returnValues.recipient).to.be.equal(user)
      expect(toBN(events[0].returnValues.value)).to.be.bignumber.equal(value)
    })
  })
  describe('#setFrontierAddress', async () => {
    let homeBridge
    beforeEach(async () => {
      homeBridge = await HomeBridge.new()
      token = await ERC677BridgeToken.new('Some ERC20', 'TEST', 18)
    })
    it('should allow to change the frontier address to owners', async () => {
      // Given
      const frontier = await FrontierMock.new(token.address, homeBridge.address)
      const owner = accounts[0]
      await homeBridge.initialize(
        validatorContract.address,
        oneEther,
        halfEther,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        token.address,
        foreignDailyLimit,
        foreignMaxPerTx,
        owner
      ).should.be.fulfilled

      await homeBridge.setFrontierAddress(frontier.address, { from: accounts[1] }).should.be.rejectedWith(ERROR_MSG)

      await homeBridge.setFrontierAddress(frontier.address, { from: owner })
      expect(await homeBridge.getFrontierAddress()).to.be.equal(frontier.address)
    })
  })
})
