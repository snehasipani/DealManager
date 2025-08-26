// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

interface IDealManager {
    // Structs and Enums
    struct Deal {
        address business;
        address influencer;
        bytes32 contentHash;
        uint256 price;
        address validator;
        uint256 deadline;
        State state;
    }

    enum State {
        CREATED,
        APPLIED,
        REJECTED,
        VALIDATED,
        APPEAL,
        CLOSED
    }

    // Events
    event DealProposalCreated(
        bytes32 dealID,
        address indexed business,
        address indexed validator,
        uint256 deadline
    );
    event DealAccepted(bytes32 indexed dealID, address indexed validator);
    event DealValidated(bytes32 indexed dealID, State indexed result);
    event DealReverted(bytes32 indexed dealID, address indexed business);
    event DealWithdrawn(bytes32 indexed dealID, address indexed influencer);
    event DealAppealed(bytes32 indexed dealID, address indexed business);
    event DealClosed(bytes32 indexed dealID, address indexed influencer);
    event AppealSolved(bytes32 indexed dealID, address indexed moderator);

    // Errors
    error InvalidAddress();
    error DealCannotBeAccepted();
    error DealAlreadyApplied();
    error DealCannotBeWithdrawn();
    error DealCannotBeAppealed();
    error DealIsNotOnAppeal();
    error NotAuthorized();
    error InvalidFeeCalculation();
    error DealWasNotAccepted();

    // Functions
    function createDeal(
        address validator,
        address influencer,
        bytes32 content,
        uint256 deadline,
        uint256 tokenAmount
    ) external returns (bytes32);

    function acceptDeal(bytes32 dealID) external;
    function setDealResult(bytes32 dealID, State result) external;
    function revertDeal(bytes32 dealID) external;
    function withdrawPayment(bytes32 dealID) external;
    function appealDeal(bytes32 dealID) external;
    function submitModeratorVerdict(bytes32 dealID, address receiver) external;
    function calculateFee(
        uint256 amount,
        uint64 feePercentage
    ) external pure returns (uint256 fee, uint256 remaining);

    // // View functions
    // function deals(bytes32 dealID) external view returns (Deal memory);
}