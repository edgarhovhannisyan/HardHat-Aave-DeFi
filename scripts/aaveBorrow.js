const { getNamedAccounts, ethers } = require("hardhat")
const { getWeth, AMOUNT } = require("../scripts/getWeth")
const { networkConfig } = require("../helper-hardhat-config")

async function main() {
  // As Aave treats everything as an ERC20, we need to get WETH first
  await getWeth()
  // Now we want to deposit some WETH in Aave
  const { deployer } = await getNamedAccounts()
  // We again need abi and contract address, which is done in separate function here
  const lendingPool = await getLendingPool(deployer)
  console.log(`Lending pool address is ${lendingPool.address}`)
  // Deposit
  const wethTokenAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
  await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)
  console.log("Depositing WETH...")
  await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
  console.log("Desposited!")

  //Borrow time, but before that we want to know hwo much we can borrow

  /// Getting your borrowing stats
  let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer)
  //Get DAI price
  const daiPrice = await getDaiPrice()
  const amountDaiToBorrow = availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber())
  const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString())
  console.log(`You can borrow ${amountDaiToBorrow.toString()} DAI`)
  await borrowDai(
    networkConfig[network.config.chainId].daiToken,
    lendingPool,
    amountDaiToBorrowWei,
    deployer
  )
  await getBorrowUserData(lendingPool, deployer)
  await repay(
    amountDaiToBorrowWei,
    networkConfig[network.config.chainId].daiToken,
    lendingPool,
    deployer
  )
  await getBorrowUserData(lendingPool, deployer)
}

async function repay(amount, daiAddress, lendingPool, account) {
  await approveErc20(daiAddress, lendingPool.address, amount, account)
  const repayTx = await lendingPool.repay(daiAddress, amount, 1, account)
  await repayTx.wait(1)
  console.log("Repaid!")
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrow, account) {
  const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrow, 1, 0, account)
  await borrowTx.wait(1)
  console.log("You've borrowed!")
}

async function getDaiPrice() {
  const daiEthPriceFeed = await ethers.getContractAt(
    "AggregatorV3Interface",
    networkConfig[network.config.chainId].daiEthPriceFeed
  )
  const price = (await daiEthPriceFeed.latestRoundData())[1]
  console.log(`The DAI/ETH price is ${price.toString()}`)
  return price
}

async function getLendingPool(account) {
  const lendingPoolAddressesProvider = await ethers.getContractAt(
    "ILendingPoolAddressesProvider",
    "0xb53c1a33016b2dc2ff3653530bff1848a515c8c5",
    account
  )
  const lendingPoolAddress = await lendingPoolAddressesProvider.getLendingPool()
  const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account)
  return lendingPool
}

async function approveErc20(erc20Address, spenderAddress, amount, signer) {
  const erc20Token = await ethers.getContractAt("IERC20", erc20Address, signer)
  txResponse = await erc20Token.approve(spenderAddress, amount)
  await txResponse.wait(1)
  console.log("Approved!")
}

async function getBorrowUserData(lendingPool, account) {
  const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
    await lendingPool.getUserAccountData(account)
  console.log(`You have ${totalCollateralETH} worth of ETH deposited.`)
  console.log(`You have ${totalDebtETH} worth of ETH borrowed.`)
  console.log(`You can borrow ${availableBorrowsETH} worth of ETH.`)
  return { availableBorrowsETH, totalDebtETH }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
