import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AgentRegistry" ,function (){
    const VALIDATOR = 0;
    const MODERATOR = 1;

    let agentRegistry: any;
let owner: any;
let validator: any;
let validator1: any;
let validator2: any;
let moderator: any;
let moderator1: any;
let moderator2: any;
let other: any;

beforeEach(async function() {
    [
        owner,
        validator,
        validator1,
        validator2,
        moderator,
        moderator1,
        moderator2,
        other,
    ] = await ethers.getSigners();

    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    const agentRegistry = await AgentRegistry.deploy(owner.address);
    await agentRegistry.waitForDeployment();
});

describe("Agent Registration", function(){
    it("should allow an address to register as a validator" , async function (){
        const stakeAmount = await agentRegistry.getStakeAmount(VALIDATOR);
        expect(await agentRegistry.isValidator(validator.address)).to.be.false;
        expect(await agentRegistry.isModerator(validator.address)).to.be.false;
        await agentRegistry
        .connect(validator)
        .joinAsAgent(VALIDATOR, {value: stakeAmount});

    expect(await agentRegistry.isValidator(validator.address)).to.be.true;
    expect(await agentRegistry.isModerator(validator.address)).to.be.false;
    });

    it("should allow an address to register as a Moderator", async function(){
        const stakeAmount = await agentRegistry.getStakeAmount(MODERATOR);
        expect(await agentRegistry.isModerator(moderator.address)).to.be.false;
        expect(await agentRegistry.isValidator(moderator.address)).to.be.false;
        await agentRegistry
        .connect(moderator)
        .joinAsAgent(MODERATOR, {value: stakeAmount});

        expect(await agentRegistry.isModerator(moderator.address)).to.be.true;
        expect(await agentRegistry.isValidator(moderator.address)).to.be.false;
    });

    it("should not allow registration with insufficient funds",async function() {
        const stakeAmount = await agentRegistry.getStakeAmount(VALIDATOR);

        await expect(
            agentRegistry
            .connect(validator)
            .joinAsAgent(VALIDATOR, { value: stakeAmount - 1n})
        ).to.be.revertedWithCustomError(agentRegistry,"InvalidStakeAmount");
    });
it("should not allow registration as both validator and moderator", async function() {
    const validatorStake = await agentRegistry.getStakeAmount(VALIDATOR);
    const moderatorStake = await agentRegistry.getStakeAmount(MODERATOR);

    await agentRegistry
    .connect(validator)
    .joinAsAgent(VALIDATOR, {value: validatorStake});


await expect(
    agentRegistry
    .connect(validator)
    .joinAsAgent(MODERATOR, { value: moderatorStake })
).to.be.revertedWithCustomError(agentRegistry,"AlreadyRegistered");
});
});

describe ("Agent Leaving", function (){
    it("should allow an agent to leave the registry", async function () {
const stakeAmount = await agentRegistry.getStakeAmount(VALIDATOR);

await agentRegistry
.connect(validator)
.joinAsAgent(VALIDATOR, {value: stakeAmount});

const initialBalance = await ethers.provider.getBalance(
    validator.address
);

const tx = await agentRegistry.connect(validator).leaveAsAgent();
const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
const finalBalance = await ethers.provider.getBalance(validator.address);

expect(await agentRegistry.isValidator(validator.address)).to.be.false;
expect(finalBalance).to.equal(initialBalance + stakeAmount - gasCost);
});

it("should allow moderator to leave and receive their stake back",async function (){
   const stakeAmount = await agentRegistry.getStakeAmount(MODERATOR);
   await agentRegistry
   .connect(moderator)
   .joinAsAgent(MODERATOR, {value: stakeAmount});
   
const initialBalance = await ethers.provider.getBalance(
    moderator.address
);
const tx = await agentRegistry.connect(moderator).leaveAsAgent();
const receipt = await tx.wait();
const gasCost = receipt.gasUsed * receipt.gasPrice;

const finalBalance = await ethers.provider.getBalance(moderator.address);

expect(await agentRegistry.isModerator(moderator.address)).to.be.false;
expect(finalBalance).to.equal(initialBalance + stakeAmount - gasCost);
});

it("should not allow non-registerd address to leave", async function() {
    await expect(
        agentRegistry
        .connect(other).leaveAsAgent()
    ).to.be.revertedWithCustomError(agentRegistry,"Not Registered");
});
    });