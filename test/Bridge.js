const { should } = require('chai').should()

const Bridge = artifacts.require('Bridge')
const Token = artifacts.require('TestToken')
const ControllerStub = artifacts.require('ControllerStub')

const sendETH = async (txObject) => {
  await web3.eth.sendTransaction(txObject)
}

contract('Bridge', (accounts) => {
  let creator = accounts[0]
  let participant = accounts[1]

  const rewards = {
    tokens: 10000,
    eth: 10000
  }

  let totalCollected = web3.toWei(600000, 'ether') // let's say 600000 USD
  let totalCollectedETH = web3.toWei(100, 'ether')
  let totalSold = web3.toWei(1500, 'ether')

  let token, crowdsale, controller, bridge, decimals

  before(async () => {
    // deploy token
    token = await Token.new(web3.toWei(10000, 'ether'), {
      from: creator
    })

    decimals = (await token.decimals.call()).toNumber()

    // deploy bridge
    bridge = await Bridge.new(
      web3.toWei(55, 'ether'),
      web3.toWei(555, 'ether'),
      token.address,
      {
        from: creator
      }
    )

    // controller stub just for manager
    controller = await ControllerStub.new(
      rewards.eth,
      rewards.tokens,
      {
        from: creator
      }
    )

    // start crowdsale (in wings will be done in controller)
    await bridge.start(0, 0, '0x0', {
      from: creator
    })
  })

  it('Should allow to change token', async () => {

    let changeToken_event = bridge.CUSTOM_CROWDSALE_TOKEN_ADDED({}, {fromBlock: 0, toBlock: 'latest'})

    await bridge.changeToken(token.address, {
      from: creator
    })

    changeToken_event.get((error, events) => {
      let args = events[0].args
      args.token.should.be.equal(token.address)
      args.decimals.toNumber().should.be.equal(decimals)
    })
  })

  it('Should notify sale', async () => {
    await bridge.notifySale(totalCollected, totalCollectedETH, totalSold, {
      from: creator
    })
  })

  it('Should check how notification went', async () => {
    let notifiedTotalCollected = (await bridge.totalCollected.call()).toString(10)
    let notifiedTotalCollectedETH = (await bridge.totalCollectedETH.call()).toString(10)
    let notifiedTotalSold = (await bridge.totalSold.call()).toString(10)

    notifiedTotalCollected.should.be.equal(totalCollected.toString(10)),
    notifiedTotalCollectedETH.should.be.equal(totalCollectedETH.toString(10))
    notifiedTotalSold.should.be.equal(totalSold.toString(10))
  })

  it('Should move bridge manager to controller', async () => {
    await bridge.transferManager(controller.address, {
      from: creator
    })
  })

  it('Should transfer token and ETH rewards', async () => {
    const [ethReward, tokenReward] = await bridge.calculateRewards.call()

    // Transfer token reward
    await token.transfer(bridge.address, tokenReward, { from: creator })

    // Send ETH reward
    await sendETH({
      from: creator,
      to: bridge.address,
      value: ethReward,
      gas: 500000
    })
  })

  it('Should update total sold value in bridge', async () => {
    const bgSold = await bridge.totalSold.call()
    bgSold.toString(10).should.be.equal(totalSold.toString(10))
  })

  it('Should update total collected value in bridge', async () => {
    const bgCollected = await bridge.totalCollected.call()
    bgCollected.toString(10).should.be.equal(totalCollected.toString(10))
  })

  it('Should finish Bridge', async () => {
    await bridge.finish({
      from: creator
    })

    const completed = await bridge.isSuccessful.call()
    completed.should.be.equal(true);
  })

  it('Should have tokens reward on contract', async () => {
    const tokenReward = web3.toBigNumber(totalSold).mul(rewards.tokens).div(1000000).toString(10)
    const tokenBalance = (await token.balanceOf.call(bridge.address)).toString(10)

    tokenBalance.should.be.equal(tokenReward)
  })

  it('Should have eth reward on contract', async () => {
    const ethReward = web3.toBigNumber(totalCollectedETH == 0 ? totalCollected : totalCollectedETH).mul(rewards.eth).div(1000000).toString(10)
    const ethBalance = web3.eth.getBalance(bridge.address).toString(10)

    ethBalance.should.be.equal(ethReward)
  })

  it('Should allow to withdraw reward', async () => {
    await bridge.withdraw({ from: creator })
  })

  it('Shouldn\'t have rewards on contract', async () => {
    const ethBalance = web3.eth.getBalance(bridge.address).toString(10)
    const tokenBalance = (await token.balanceOf.call(bridge.address)).toString(10)

    ethBalance.should.be.equal('0')
    tokenBalance.should.be.equal('0')
  })
})
