// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IERC1155ReceiverUpgradeable.sol";

/// @title FarmCityStaking
/// @notice Staking contract for FarmCity ERC1155 tokens with USDT rewards
/// @custom:security-contact admin@farmcity.dev
contract FarmCityStaking is
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ERC165Upgradeable,
    IERC1155ReceiverUpgradeable,
    UUPSUpgradeable
{
    // ================ State Variables ================

    /// @notice The FarmCity ERC1155 token contract
    IERC1155 public farmToken;

    /// @notice The USDT ERC20 token used for rewards
    IERC20 public rewardToken;

    /// @notice Precision factor for reward calculations (1e18)
    uint256 private constant PRECISION_FACTOR = 1e18;

    /// @notice Struct to track staking information for each user and tokenId
    struct StakeInfo {
        uint256 amount; // Amount of tokens staked
        uint256 rewardPerTokenPaid; // Snapshot of rewardPerToken at last update
        uint256 rewards; // Accumulated rewards
        uint256 lastUpdateTime; // Last time rewards were calculated for this user
    }

    /// @notice Mapping from tokenId to user address to stake info
    mapping(uint256 => mapping(address => StakeInfo)) public stakeInfo;

    /// @notice Mapping from tokenId to total staked amount
    mapping(uint256 => uint256) public totalStaked;

    /// @notice Mapping from tokenId to accumulated rewards per token
    mapping(uint256 => uint256) public rewardPerTokenStored;

    /// @notice Mapping from tokenId to last update time
    mapping(uint256 => uint256) public lastUpdateTimePerToken;

    /// @notice Mapping from tokenId to reward rate (tokens per second)
    mapping(uint256 => uint256) public rewardRatePerToken;

    /// @notice Mapping from tokenId to reward duration in seconds
    mapping(uint256 => uint256) public rewardDurationPerToken;

    /// @notice Mapping from tokenId to reward finish time
    mapping(uint256 => uint256) public rewardFinishTimePerToken;

    // ================ Events ================

    event Staked(address indexed user, uint256 indexed tokenId, uint256 amount);
    event Unstaked(address indexed user, uint256 indexed tokenId, uint256 amount);
    event RewardClaimed(address indexed user, uint256 indexed tokenId, uint256 reward);
    event RewardAdded(uint256 indexed tokenId, uint256 amount, uint256 duration);
    event RewardsDurationUpdated(uint256 indexed tokenId, uint256 newDuration);
    event RecoveredERC20(address indexed token, uint256 amount);
    event RecoveredERC1155(address indexed token, uint256 tokenId, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ================ Initializer ================

    /// @notice Initialize the contract
    /// @param _farmToken The address of the FarmCity ERC1155 token contract
    /// @param _rewardToken The address of the USDT ERC20 token contract
    /// @param initialOwner The address of the initial owner
    function initialize(address _farmToken, address _rewardToken, address initialOwner) public initializer {
        __ReentrancyGuard_init();
        __Ownable_init(initialOwner);
        __Pausable_init();
        __ERC165_init();
        __UUPSUpgradeable_init();

        require(_farmToken != address(0), "FarmCityStaking: farm token is zero address");
        require(_rewardToken != address(0), "FarmCityStaking: reward token is zero address");

        farmToken = IERC1155(_farmToken);
        rewardToken = IERC20(_rewardToken);
    }

    // ================ External Functions ================

    /// @notice Stake FarmCity tokens
    /// @param tokenId The ID of the token to stake
    /// @param amount The amount of tokens to stake
    function stake(uint256 tokenId, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "FarmCityStaking: cannot stake 0");

        // Update rewards for the user
        _updateReward(msg.sender, tokenId);

        // Update stake info
        stakeInfo[tokenId][msg.sender].amount += amount;
        totalStaked[tokenId] += amount;

        // Transfer tokens from user to this contract
        farmToken.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        emit Staked(msg.sender, tokenId, amount);
    }

    /// @notice Unstake FarmCity tokens
    /// @param tokenId The ID of the token to unstake
    /// @param amount The amount of tokens to unstake
    function unstake(uint256 tokenId, uint256 amount) external nonReentrant {
        require(amount > 0, "FarmCityStaking: cannot unstake 0");

        StakeInfo storage userStake = stakeInfo[tokenId][msg.sender];
        require(userStake.amount >= amount, "FarmCityStaking: unstake amount exceeds balance");

        // Update rewards for the user
        _updateReward(msg.sender, tokenId);

        // Update stake info
        userStake.amount -= amount;
        totalStaked[tokenId] -= amount;

        // Transfer tokens back to user
        farmToken.safeTransferFrom(address(this), msg.sender, tokenId, amount, "");

        emit Unstaked(msg.sender, tokenId, amount);
    }

    /// @notice Claim accumulated rewards for a specific token ID
    /// @param tokenId The ID of the token to claim rewards for
    function claimReward(uint256 tokenId) external nonReentrant {
        // Update rewards for the user
        _updateReward(msg.sender, tokenId);

        StakeInfo storage userStake = stakeInfo[tokenId][msg.sender];
        uint256 reward = userStake.rewards;

        if (reward > 0) {
            userStake.rewards = 0;

            // Transfer rewards to user
            require(rewardToken.transfer(msg.sender, reward), "FarmCityStaking: reward transfer failed");

            emit RewardClaimed(msg.sender, tokenId, reward);
        }
    }

    /// @notice Claim accumulated rewards for multiple token IDs
    /// @param tokenIds Array of token IDs to claim rewards for
    function claimRewards(uint256[] calldata tokenIds) external nonReentrant {
        uint256 totalReward = 0;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];

            // Update rewards for the user
            _updateReward(msg.sender, tokenId);

            StakeInfo storage userStake = stakeInfo[tokenId][msg.sender];
            uint256 reward = userStake.rewards;

            if (reward > 0) {
                userStake.rewards = 0;
                totalReward += reward;

                emit RewardClaimed(msg.sender, tokenId, reward);
            }
        }

        if (totalReward > 0) {
            // Transfer total rewards to user
            require(rewardToken.transfer(msg.sender, totalReward), "FarmCityStaking: reward transfer failed");
        }
    }

    /// @notice Exit: Unstake all tokens and claim rewards for a specific token ID
    /// @param tokenId The ID of the token to exit from
    function exit(uint256 tokenId) external nonReentrant {
        StakeInfo storage userStake = stakeInfo[tokenId][msg.sender];
        uint256 stakedAmount = userStake.amount;
        
        if (stakedAmount > 0) {
            // Update rewards for the user
            _updateReward(msg.sender, tokenId);

            // Update stake info
            userStake.amount = 0;
            totalStaked[tokenId] -= stakedAmount;

            // Transfer tokens back to user
            farmToken.safeTransferFrom(address(this), msg.sender, tokenId, stakedAmount, "");

            emit Unstaked(msg.sender, tokenId, stakedAmount);
        }

        // Claim rewards if any
        uint256 reward = userStake.rewards;
        if (reward > 0) {
            userStake.rewards = 0;

            // Transfer rewards to user
            require(rewardToken.transfer(msg.sender, reward), "FarmCityStaking: reward transfer failed");

            emit RewardClaimed(msg.sender, tokenId, reward);
        }
    }

    // ================ Admin Functions ================

    /// @notice Add rewards for a specific token ID
    /// @param tokenId The ID of the token to add rewards for
    /// @param amount The amount of reward tokens to add
    function addReward(uint256 tokenId, uint256 amount) external nonReentrant onlyOwner {
        require(amount > 0, "FarmCityStaking: reward amount must be greater than 0");
        require(totalStaked[tokenId] > 0, "FarmCityStaking: no tokens staked for this ID");

        // Update reward for this token ID
        _updateRewardPerToken(tokenId);

        // Calculate new reward rate
        uint256 duration = rewardDurationPerToken[tokenId];
        if (duration == 0) {
            duration = 7 days; // Default to 7 days if not set
            rewardDurationPerToken[tokenId] = duration;
        }

        // If previous rewards haven't finished yet, add to them
        if (block.timestamp < rewardFinishTimePerToken[tokenId]) {
            uint256 remaining = rewardFinishTimePerToken[tokenId] - block.timestamp;
            uint256 leftover = remaining * rewardRatePerToken[tokenId];
            amount += leftover;
        }

        rewardRatePerToken[tokenId] = amount / duration;
        lastUpdateTimePerToken[tokenId] = block.timestamp;
        rewardFinishTimePerToken[tokenId] = block.timestamp + duration;

        // Transfer reward tokens from caller to this contract
        require(rewardToken.transferFrom(msg.sender, address(this), amount), "FarmCityStaking: reward transfer failed");

        emit RewardAdded(tokenId, amount, duration);
    }

    /// @notice Set the reward duration for a specific token ID
    /// @param tokenId The ID of the token to set the duration for
    /// @param duration The new duration in seconds
    function setRewardDuration(uint256 tokenId, uint256 duration) external onlyOwner {
        require(duration > 0, "FarmCityStaking: reward duration must be greater than 0");
        require(
            block.timestamp > rewardFinishTimePerToken[tokenId],
            "FarmCityStaking: previous rewards period must be complete"
        );

        rewardDurationPerToken[tokenId] = duration;

        emit RewardsDurationUpdated(tokenId, duration);
    }

    /// @notice Pause staking
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause staking
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recover ERC20 tokens sent to this contract by mistake
    /// @param tokenAddress The address of the token to recover
    /// @param amount The amount of tokens to recover
    function recoverERC20(address tokenAddress, uint256 amount) external onlyOwner {
        require(tokenAddress != address(rewardToken), "FarmCityStaking: cannot recover reward token");

        IERC20(tokenAddress).transfer(owner(), amount);

        emit RecoveredERC20(tokenAddress, amount);
    }

    /// @notice Recover ERC1155 tokens sent to this contract by mistake
    /// @param tokenAddress The address of the token to recover
    /// @param tokenId The ID of the token to recover
    /// @param amount The amount of tokens to recover
    function recoverERC1155(address tokenAddress, uint256 tokenId, uint256 amount) external onlyOwner {
        require(
            tokenAddress != address(farmToken) || totalStaked[tokenId] < amount,
            "FarmCityStaking: cannot recover staked tokens"
        );

        IERC1155(tokenAddress).safeTransferFrom(address(this), owner(), tokenId, amount, "");

        emit RecoveredERC1155(tokenAddress, tokenId, amount);
    }

    // ================ View Functions ================

    /// @notice Get the last time rewards were applicable for a token ID
    /// @param tokenId The ID of the token
    /// @return The timestamp when rewards were last applicable
    function lastTimeRewardApplicable(uint256 tokenId) public view returns (uint256) {
        return block.timestamp < rewardFinishTimePerToken[tokenId] ? block.timestamp : rewardFinishTimePerToken[tokenId];
    }

    /// @notice Calculate the current reward per token for a specific token ID
    /// @param tokenId The ID of the token
    /// @return The current reward per token
    function rewardPerToken(uint256 tokenId) public view returns (uint256) {
        if (totalStaked[tokenId] == 0) {
            return rewardPerTokenStored[tokenId];
        }

        uint256 lastTimeApplicable = lastTimeRewardApplicable(tokenId);
        uint256 timeElapsed = lastTimeApplicable - lastUpdateTimePerToken[tokenId];

        return rewardPerTokenStored[tokenId]
            + ((timeElapsed * rewardRatePerToken[tokenId] * PRECISION_FACTOR) / totalStaked[tokenId]);
    }

    /// @notice Calculate the earned rewards for a user and token ID
    /// @param account The address of the user
    /// @param tokenId The ID of the token
    /// @return The earned rewards
    function earned(address account, uint256 tokenId) public view returns (uint256) {
        StakeInfo storage userStake = stakeInfo[tokenId][account];

        uint256 currentRewardPerToken = rewardPerToken(tokenId);
        uint256 rewardDelta = currentRewardPerToken - userStake.rewardPerTokenPaid;
        uint256 newRewards = (userStake.amount * rewardDelta) / PRECISION_FACTOR;

        return userStake.rewards + newRewards;
    }

    /// @notice Get the reward rate for a specific token ID
    /// @param tokenId The ID of the token
    /// @return The reward rate (tokens per second)
    function getRewardRate(uint256 tokenId) external view returns (uint256) {
        return rewardRatePerToken[tokenId];
    }

    /// @notice Get the staked amount for a user and token ID
    /// @param account The address of the user
    /// @param tokenId The ID of the token
    /// @return The staked amount
    function getStakedAmount(address account, uint256 tokenId) external view returns (uint256) {
        return stakeInfo[tokenId][account].amount;
    }

    /// @notice Get the total staked amount for a token ID
    /// @param tokenId The ID of the token
    /// @return The total staked amount
    function getTotalStaked(uint256 tokenId) external view returns (uint256) {
        return totalStaked[tokenId];
    }

    /// @notice Get the reward finish time for a token ID
    /// @param tokenId The ID of the token
    /// @return The reward finish time
    function getRewardFinishTime(uint256 tokenId) external view returns (uint256) {
        return rewardFinishTimePerToken[tokenId];
    }

    // ================ Internal Functions ================

    /// @notice Update reward for a specific user and token ID
    /// @param account The address of the user
    /// @param tokenId The ID of the token
    function _updateReward(address account, uint256 tokenId) internal {
        // Update reward per token for this token ID
        _updateRewardPerToken(tokenId);

        // Update user's rewards
        StakeInfo storage userStake = stakeInfo[tokenId][account];

        if (account != address(0)) {
            userStake.rewards = earned(account, tokenId);
            userStake.rewardPerTokenPaid = rewardPerTokenStored[tokenId];
            userStake.lastUpdateTime = block.timestamp;
        }
    }

    /// @notice Update reward per token for a specific token ID
    /// @param tokenId The ID of the token
    function _updateRewardPerToken(uint256 tokenId) internal {
        rewardPerTokenStored[tokenId] = rewardPerToken(tokenId);
        lastUpdateTimePerToken[tokenId] = lastTimeRewardApplicable(tokenId);
    }

    // ================ UUPS Upgrade ================

    /// @notice Authorize an upgrade
    /// @param newImplementation The address of the new implementation
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ================ ERC1155Receiver Implementation ================

    /// @notice Handle the receipt of a single ERC1155 token type
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.onERC1155Received.selector;
    }

    /// @notice Handle the receipt of multiple ERC1155 token types
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    /// @notice Check if the contract supports an interface
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC165Upgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return interfaceId == type(IERC1155ReceiverUpgradeable).interfaceId || super.supportsInterface(interfaceId);
    }
}
