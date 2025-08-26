import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AgentRegistry", function () {
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

  beforeEach(async function () {
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
    agentRegistry = await AgentRegistry.deploy(owner.address);
    await agentRegistry.waitForDeployment();
  });

  describe("Agent Registration", function () {
    it("should allow an address to register as a validator", async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(VALIDATOR);
      expect(await agentRegistry.isValidator(validator.address)).to.be.false;
      expect(await agentRegistry.isModerator(validator.address)).to.be.false;
      await agentRegistry
        .connect(validator)
        .joinAsAgent(VALIDATOR, { value: stakeAmount });

      expect(await agentRegistry.isValidator(validator.address)).to.be.true;
      expect(await agentRegistry.isModerator(validator.address)).to.be.false;
    });

    it("should allow an address to register as a moderator", async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(MODERATOR);

      expect(await agentRegistry.isModerator(moderator.address)).to.be.false;
      expect(await agentRegistry.isValidator(moderator.address)).to.be.false;

      await agentRegistry
        .connect(moderator)
        .joinAsAgent(MODERATOR, { value: stakeAmount });

      expect(await agentRegistry.isModerator(moderator.address)).to.be.true;
      expect(await agentRegistry.isValidator(moderator.address)).to.be.false;
    });

    it("should not allow registration with insufficient stake", async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(VALIDATOR);

      await expect(
        agentRegistry
          .connect(validator)
          .joinAsAgent(VALIDATOR, { value: stakeAmount - 1n })
      ).to.be.revertedWithCustomError(agentRegistry, "InvalidStakeAmount");
    });

    it("should not allow registration as both validator and moderator", async function () {
      const validatorStake = await agentRegistry.getStakeAmount(VALIDATOR);
      const moderatorStake = await agentRegistry.getStakeAmount(MODERATOR);

      await agentRegistry
        .connect(validator)
        .joinAsAgent(VALIDATOR, { value: validatorStake });

      await expect(
        agentRegistry
          .connect(validator)
          .joinAsAgent(MODERATOR, { value: moderatorStake })
      ).to.be.revertedWithCustomError(agentRegistry, "AlreadyRegistered");
    });
  });

  describe("Agent Leaving", function () {
    it("should allow a validator to leave and receive their stake back", async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(VALIDATOR);

      await agentRegistry
        .connect(validator)
        .joinAsAgent(VALIDATOR, { value: stakeAmount });

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

    it("should allow a moderator to leave and receive their stake back", async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(MODERATOR);

      await agentRegistry
        .connect(moderator)
        .joinAsAgent(MODERATOR, { value: stakeAmount });

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

    it("should not allow non-registered address to leave", async function () {
      await expect(
        agentRegistry.connect(other).leaveAsAgent()
      ).to.be.revertedWithCustomError(agentRegistry, "NotRegistered");
    });
  });

  describe("Slash Request System", function () {
    beforeEach(async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(MODERATOR);
      const stakeAmountV = await agentRegistry.getStakeAmount(VALIDATOR);
      await agentRegistry
        .connect(validator)
        .joinAsAgent(VALIDATOR, { value: stakeAmountV });
      await agentRegistry
        .connect(moderator)
        .joinAsAgent(MODERATOR, { value: stakeAmount });
      await agentRegistry
        .connect(moderator1)
        .joinAsAgent(MODERATOR, { value: stakeAmount });
      await agentRegistry
        .connect(moderator2)
        .joinAsAgent(MODERATOR, { value: stakeAmount });
    });

    it("should allow creating a slash request", async function () {
      const requestID = createSlashRequest(agentRegistry, moderator, validator);
      const request = await agentRegistry.getSlashRequest(requestID);
      expect(request.target).to.equal(validator.address);
      expect(request.deadline).to.be.gt(0);
    });

    it("should not allow creating multiple slash requests for the same agent", async function () {
      await agentRegistry
        .connect(moderator)
        .createSlashRequest(validator.address);

      expect(
        await agentRegistry
          .connect(moderator)
          .createSlashRequest(validator.address)
      ).to.be.revertedWithCustomError(agentRegistry, "Duplicate");
    });

    it("should allow approving a slash request", async function () {
      const requestID = createSlashRequest(agentRegistry, moderator, validator);

      const initialBalance = await ethers.provider.getBalance(
        validator.address
      );
      await agentRegistry.connect(moderator1).approveSlashRequest(requestID);
      await agentRegistry.connect(moderator2).approveSlashRequest(requestID);

      await agentRegistry.connect(owner).executeSlashRequest(requestID);

      const finalBalance = await ethers.provider.getBalance(validator.address);

      expect(await agentRegistry.isValidator(validator.address)).to.be.false;
      expect(finalBalance - initialBalance).to.equal(0n); // No stake returned
    });

    it("should not allow non-owner to approve slash requests", async function () {
      const requestID = createSlashRequest(agentRegistry, moderator, validator);

      await expect(
        agentRegistry.connect(other).approveSlashRequest(requestID)
      ).to.be.revertedWithCustomError(agentRegistry, "NotRegistered");
    });

    it("should not allow approving non-existent slash requests", async function () {
      await expect(
        agentRegistry
          .connect(moderator)
          .approveSlashRequest(ethers.randomBytes(32))
      ).to.be.revertedWithCustomError(agentRegistry, "SlashRequestNotFound");
    });
  });

  describe("Stake Management", function () {
    it("should have different stake amounts for validators and moderators", async function () {
      const validatorStake = await agentRegistry.getStakeAmount(VALIDATOR);
      const moderatorStake = await agentRegistry.getStakeAmount(MODERATOR);

      expect(validatorStake).to.not.equal(moderatorStake);
    });
  });
});

async function createSlashRequest(agentRegistry, slasher, slashed) {
  const reqTx = await agentRegistry
    .connect(slasher)
    .createSlashRequest(slashed.address);
  const slashReceipt = await reqTx.wait();
  const filter = agentRegistry.filters.SlashRequestCreated();
  const events = await agentRegistry.queryFilter(
    filter,
    slashReceipt.blockNumber,
    slashReceipt.blockNumber
  );
  return events[0].args.requestId;
}
//////////////

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const dealAmount = ethers.parseUnits("100", 6);
const deadline = Math.floor(Date.now() / 1000) + 3600;

const DEAL_LIFESPAN = 2 * 7 * 24 * 60 * 60; // 2 weeks in seconds
const APPEAL_PERIOD = 1 * 7 * 24 * 60 * 60; // 2 weeks in seconds
const VALIDATE_PERIOD = 10 * 60; // 10 minutes  in seconds

async function createDeal(usdt, business, dealManager, validator, influencer) {
  await usdt
    .connect(business)
    .approve(await dealManager.getAddress(), dealAmount);
  const content = ethers.randomBytes(32);
  // Create deal
  const createTx = await dealManager
    .connect(business)
    .createDeal(
      validator.address,
      influencer.address,
      content,
      deadline,
      dealAmount
    );
  const createReceipt = await createTx.wait();
  const filter = dealManager.filters.DealProposalCreated();
  const events = await dealManager.queryFilter(
    filter,
    createReceipt.blockNumber,
    createReceipt.blockNumber
  );
  return events[0].args.dealID;
}

describe("DealManager", function () {
  const VALIDATOR = 0;
  const MODERATOR = 1;

  const CREATED = 0;
  const APPLIED = 1;
  const REJECTED = 2;
  const VALIDATED = 3;
  const APPEAL = 4;
  const CLOSED = 5;

  let dealManager: any;
  let agentRegistry: any;
  let usdt: any;
  let owner: any;
  let business: any;
  let validator: any;
  let influencer: any;
  let moderator: any;

  beforeEach(async function () {
    [owner, business, validator, influencer, moderator] =
      await ethers.getSigners();

    // Deploy USDT mock
    const USDT = await ethers.getContractFactory("MockERC20");
    usdt = await USDT.deploy("USDT", "USDT", 6);
    await usdt.waitForDeployment();

    // Deploy AgentRegistry
    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    agentRegistry = await AgentRegistry.deploy(owner.address);
    await agentRegistry.waitForDeployment();

    // Deploy DealManager
    const DealManager = await ethers.getContractFactory("DealManager");
    dealManager = await DealManager.deploy(
      await agentRegistry.getAddress(),
      await usdt.getAddress()
    );
    await dealManager.waitForDeployment();

    // Setup agents
    const validatorStake = await agentRegistry.getStakeAmount(VALIDATOR);
    const moderatorStake = await agentRegistry.getStakeAmount(MODERATOR);

    await agentRegistry
      .connect(validator)
      .joinAsAgent(VALIDATOR, { value: validatorStake });
    await agentRegistry
      .connect(moderator)
      .joinAsAgent(MODERATOR, { value: moderatorStake });

    // Mint USDT to business
    await usdt.mint(business.address, ethers.parseUnits("1000", 6));
  });

  it("should create and complete a deal successfully", async function () {
    const dealId = createDeal(
      usdt,
      business,
      dealManager,
      validator,
      influencer
    );

    // Accept deal
    await dealManager.connect(influencer).acceptDeal(dealId);

    // Validate deal
    await dealManager.connect(validator).setDealResult(dealId, VALIDATED);

    const initialValidatorBalance = await usdt.balanceOf(validator.address);
    const initialInfluencerBalance = await usdt.balanceOf(influencer.address);

    await dealManager.connect(influencer).withdrawPayment(dealId);

    const deal = await dealManager.deals(dealId);
    expect(deal.state).to.equal(CLOSED);

    const finalValidatorBalance = await usdt.balanceOf(validator.address);
    const finalInfluencerBalance = await usdt.balanceOf(influencer.address);

    const validatorFee = (dealAmount * 2000n) / 100000n; // 2% fee
    const influencerAmount = dealAmount - validatorFee;

    expect(finalValidatorBalance - initialValidatorBalance).to.equal(
      validatorFee
    );
    expect(finalInfluencerBalance - initialInfluencerBalance).to.equal(
      influencerAmount
    );
  });

  it("should handle deal appeal when validator submits validation result", async function () {
    const dealId = await createDeal(
      usdt,
      business,
      dealManager,
      validator,
      influencer
    );
    await dealManager.connect(influencer).acceptDeal(dealId);

    await dealManager.connect(validator).setDealResult(dealId, REJECTED);

    await dealManager.connect(business).appealDeal(dealId);

    // Get initial balances
    const initialModeratorBalance = await usdt.balanceOf(moderator.address);
    const initialBusinessBalance = await usdt.balanceOf(business.address);

    await dealManager
      .connect(moderator)
      .submitModeratorVerdict(dealId, business.address);

    const deal = await dealManager.deals(dealId);
    expect(deal.state).to.equal(CLOSED);

    const finalModeratorBalance = await usdt.balanceOf(moderator.address);
    const finalBusinessBalance = await usdt.balanceOf(business.address);

    const moderatorFee = (dealAmount * 10000n) / 100000n; // 10% fee
    const businessAmount = dealAmount - moderatorFee;

    expect(finalModeratorBalance - initialModeratorBalance).to.equal(
      moderatorFee
    );
    expect(finalBusinessBalance - initialBusinessBalance).to.equal(
      businessAmount
    );
  });

  it("should handle deal appeal when validator doesn't submit validation result", async function () {
    // Create and accept deal
    const dealId = await createDeal(
      usdt,
      business,
      dealManager,
      validator,
      influencer
    );

    await dealManager.connect(influencer).acceptDeal(dealId);

    await expect(
      dealManager.connect(business).appealDeal(dealId)
    ).to.be.revertedWithCustomError(dealManager, "DealCannotBeAppealed");

    await time.increase(DEAL_LIFESPAN + VALIDATE_PERIOD + 1);

    // Appeal deal
    await dealManager.connect(business).appealDeal(dealId);

    // Get initial balances
    const initialModeratorBalance = await usdt.balanceOf(moderator.address);
    const initialBusinessBalance = await usdt.balanceOf(business.address);

    // Submit moderator verdict
    await dealManager
      .connect(moderator)
      .submitModeratorVerdict(dealId, business.address);

    // Check final state
    const deal = await dealManager.deals(dealId);
    expect(deal.state).to.equal(CLOSED);

    // Check final balances
    const finalModeratorBalance = await usdt.balanceOf(moderator.address);
    const finalBusinessBalance = await usdt.balanceOf(business.address);

    // Calculate expected amounts
    const moderatorFee = (dealAmount * 10000n) / 100000n; // 10% fee
    const businessAmount = dealAmount - moderatorFee;

    // Verify balances
    expect(finalModeratorBalance - initialModeratorBalance).to.equal(
      moderatorFee
    );
    expect(finalBusinessBalance - initialBusinessBalance).to.equal(
      businessAmount
    );
  });
});


//////////////

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AgentRegistry is Ownable, IAgentRegistry {
    uint256 public constant VALIDATOR_STAKE = 0.1 ether;
    uint256 public constant MODERATOR_STAKE = 0.2 ether;
    uint256 public constant SLASH_REQUEST_DURATION = 2 * 7 * 24 * 60 * 60; // 2 weeks in seconds
    uint128 requiredApprovals = 2;

    mapping(address => Agent) private agents;
    mapping(bytes32 => SlashRequest) private slashRequests;
    mapping(bytes32 => mapping(address => bool)) private slashApprovals;

    modifier isValidModerator() {
        if (agents[msg.sender].agentType != AgentType.MODERATOR) {
            revert NotRegistered();
        }
        if (agents[msg.sender].slashed) revert SlashedAgent();
        _;
    }
    constructor(address _owner) Ownable(_owner) {}

    function joinAsAgent(AgentType _agentType) external payable override {
        if (agents[msg.sender].joined == true) {
            revert AlreadyRegistered(); // check if agent does not have other role;
        }
        if (
            _agentType != AgentType.VALIDATOR &&
            _agentType != AgentType.MODERATOR
        ) {
            revert InvalidAgentType();
        }
        if (agents[msg.sender].slashed) revert SlashedAgent(); // check if agent was slashed;

        uint256 requiredStake = getStakeAmount(_agentType);
        if (msg.value != requiredStake) {
            revert InvalidStakeAmount();
        }

        agents[msg.sender] = Agent(true, false, _agentType);
        emit AgentJoined(msg.sender, _agentType);
    }

    function leaveAsAgent() external override {
        if (agents[msg.sender].joined != true) {
            revert NotRegistered();
        }
        if (agents[msg.sender].slashed) revert SlashedAgent();

        AgentType agentType = agents[msg.sender].agentType;
        delete agents[msg.sender];
        payable(msg.sender).transfer(getStakeAmount(agentType));
        emit AgentLeft(msg.sender, agentType);
    }

    function createSlashRequest(
        address target
    ) external override isValidModerator {
        bytes32 requestId = keccak256(
            abi.encodePacked(target, block.timestamp)
        );

        if (slashRequests[requestId].target != address(0)) revert Duplicate();

        slashRequests[requestId] = SlashRequest({
            target: target,
            deadline: block.timestamp + SLASH_REQUEST_DURATION,
            approvals: 0,
            executed: false
        });

        emit SlashRequestCreated(
            requestId,
            target,
            block.timestamp + SLASH_REQUEST_DURATION
        );
    }

    function approveSlashRequest(
        bytes32 requestId
    ) external override isValidModerator {
        SlashRequest storage request = slashRequests[requestId];
        if (request.target == address(0)) {
            revert SlashRequestNotFound();
        }
        if (block.timestamp > request.deadline) {
            revert SlashRequestExpired();
        }
        if (request.executed) {
            revert SlashRequestAlreadyExecuted();
        }
        if (slashApprovals[requestId][msg.sender]) {
            revert AlreadyApproved();
        }

        slashApprovals[requestId][msg.sender] = true;
        request.approvals++;
        emit SlashRequestApproved(requestId, msg.sender);
    }

    function executeSlashRequest(
        bytes32 requestId
    ) external override onlyOwner {
        SlashRequest storage request = slashRequests[requestId];
        if (request.target == address(0)) {
            revert SlashRequestNotFound();
        }
        if (block.timestamp > request.deadline) {
            revert SlashRequestExpired();
        }
        if (request.executed) {
            revert SlashRequestAlreadyExecuted();
        }
        if (request.approvals < requiredApprovals) {
            revert NotEnoughApprovals();
        }

        request.executed = true;
        AgentType agentType = agents[request.target].agentType;
        delete agents[request.target];
        payable(msg.sender).transfer(getStakeAmount(agentType));
        emit AgentSlashed(request.target, agentType, msg.sender);
    }

    function isValidator(address agent) external view override returns (bool) {
        return
            agents[agent].joined &&
            agents[agent].agentType == AgentType.VALIDATOR &&
            !agents[agent].slashed;
    }

    function isModerator(address agent) external view override returns (bool) {
        return
            agents[agent].agentType == AgentType.MODERATOR &&
            !agents[agent].slashed;
    }

    function getAgentType(
        address agent
    ) external view override returns (AgentType) {
        return agents[agent].agentType;
    }

    function getStakeAmount(
        AgentType agentType
    ) public pure override returns (uint256) {
        return
            agentType == AgentType.VALIDATOR
                ? VALIDATOR_STAKE
                : MODERATOR_STAKE;
    }

    function getSlashRequest(
        bytes32 requestId
    ) external view override returns (SlashRequest memory) {
        return slashRequests[requestId];
    }

    function changeRequiredApprovals(
        uint128 _requiredApprovals
    ) public onlyOwner {
        if (_requiredApprovals == 0) revert("Can't be a zero");
        requiredApprovals = _requiredApprovals;
    }

    receive() external payable {}
}