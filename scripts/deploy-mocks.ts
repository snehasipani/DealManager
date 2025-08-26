import { ethers } from "hardhat";
import { MockERC20 } from "../typechain-types/contracts/mocks/MockERC20";

async function main() {
    const deployer = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdt = (await MockERC20.deploy(
        "USDT",
        "USDT",
        6
    )) as unknown as MockERC20;
    await usdt.waitForDeployment();

    const usdtAddress = await usdt.getAddress();
      console.log("Mock USDT deployed to:", usdtAddress);

      const mintAmount = ethers.parseUnits("1000000", 6);
      await usdt.mint(deployer.address, mintAmount);
       console.log(
    `Minted ${ethers.formatUnits(mintAmount, 6)} USDT to ${deployer.address}`
  );  
}

main()
.then(() => process.exit(0))
.catch((error) => {
    console.error(error);
    process.exit(1);
});