// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.27;

import {ERC1155Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {ERC1155BurnableUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155BurnableUpgradeable.sol";
import {ERC1155PausableUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155PausableUpgradeable.sol";
import {ERC1155SupplyUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @custom:security-contact admin@farmcity.dev
contract FarmCity is
    Initializable,
    ERC1155Upgradeable,
    OwnableUpgradeable,
    ERC1155PausableUpgradeable,
    ERC1155BurnableUpgradeable,
    ERC1155SupplyUpgradeable,
    UUPSUpgradeable
{
    // Variables
    IERC20 public usdtToken;
    uint256 public mintPrice;

    mapping(uint256 => bool) public validTokenIds;
    mapping(uint256 => uint256) public maxSupplyPerToken;

    // Errors
    error InvalidTokenId(uint256 tokenId);
    error ExceedsMaxSupply(uint256 tokenId, uint256 requested, uint256 available);
    error InvalidMaxSupply(uint256 maxSupply);
    error TokenIdAlreadyExists(uint256 tokenId);

    // Events
    event USDTAddressUpdated(address indexed newAddress);
    event MintPriceUpdated(uint256 newPrice);
    event TokensMinted(address indexed to, uint256 indexed tokenId, uint256 amount, uint256 totalCost);
    event TokenIdAdded(uint256 indexed tokenId, uint256 maxSupply);
    event TokenIdRemoved(uint256 indexed tokenId);
    event MaxSupplyUpdated(uint256 indexed tokenId, uint256 newMaxSupply);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __ERC1155_init("https://farmcity.dev/api/token/{id}.json");
        __Ownable_init(initialOwner);
        __ERC1155Pausable_init();
        __ERC1155Burnable_init();
        __ERC1155Supply_init();
        __UUPSUpgradeable_init();

        // Mint price to 300 USDT
        mintPrice = 300 * 10 ** 6;

        // Initialize max supplies
        _addValidTokenId(1, 10000);
        _addValidTokenId(2, 10000);
        _addValidTokenId(3, 10000);
        _addValidTokenId(4, 10000);
    }

    function setURI(string memory newuri) public onlyOwner {
        _setURI(newuri);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function mint(address account, uint256 id, uint256 amount, bytes memory data) public onlyOwner {
        _mint(account, id, amount, data);
    }

    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data)
        public
        onlyOwner
    {
        _mintBatch(to, ids, amounts, data);
    }

    // Public mint
    function mintPublic(uint256 id, uint256 amount, bytes memory data) public whenNotPaused {
        require(address(usdtToken) != address(0), "USDT token not set");
        require(amount > 0, "Amount must be greater than 0");

        // Check Token ID
        if (!validTokenIds[id]) {
            revert InvalidTokenId(id);
        }

        // Check supply limits
        uint256 currentSupply = totalSupply(id);
        uint256 maxSupply = maxSupplyPerToken[id];
        uint256 newSupply = currentSupply + amount;

        if (newSupply > maxSupply) {
            uint256 available = maxSupply > currentSupply ? maxSupply - currentSupply : 0;
            revert ExceedsMaxSupply(id, amount, available);
        }

        uint256 totalCost = mintPrice * amount;

        // Transfer USDT
        require(usdtToken.transferFrom(msg.sender, address(this), totalCost), "USDT transfer failed");

        // Mint Token
        _mint(msg.sender, id, amount, data);

        emit TokensMinted(msg.sender, id, amount, totalCost);
    }

    // Admin - set USDT token address
    function setUSDTToken(address _usdtToken) public onlyOwner {
        require(_usdtToken != address(0), "Invalid USDT address");
        usdtToken = IERC20(_usdtToken);
        emit USDTAddressUpdated(_usdtToken);
    }

    // Admin - mint price
    function setMintPrice(uint256 _mintPrice) public onlyOwner {
        mintPrice = _mintPrice;
        emit MintPriceUpdated(_mintPrice);
    }

    // Admin - withdraw USDT
    function withdrawUSDT(address to, uint256 amount) public onlyOwner {
        require(address(usdtToken) != address(0), "USDT token not set");
        require(to != address(0), "Invalid recipient address");
        require(usdtToken.transfer(to, amount), "USDT transfer failed");
    }

    // Admin - token ID management
    function addValidTokenId(uint256 tokenId, uint256 maxSupply) public onlyOwner {
        if (validTokenIds[tokenId]) {
            revert TokenIdAlreadyExists(tokenId);
        }
        if (maxSupply == 0) {
            revert InvalidMaxSupply(maxSupply);
        }

        _addValidTokenId(tokenId, maxSupply);
    }

    // Admin - remove token ID
    function removeValidTokenId(uint256 tokenId) public onlyOwner {
        if (!validTokenIds[tokenId]) {
            revert InvalidTokenId(tokenId);
        }

        validTokenIds[tokenId] = false;
        maxSupplyPerToken[tokenId] = 0;

        emit TokenIdRemoved(tokenId);
    }

    // Admin - update max supply for a token ID
    function updateMaxSupply(uint256 tokenId, uint256 newMaxSupply) public onlyOwner {
        if (!validTokenIds[tokenId]) {
            revert InvalidTokenId(tokenId);
        }
        if (newMaxSupply == 0) {
            revert InvalidMaxSupply(newMaxSupply);
        }

        // Ensure new max supply is not less than current total supply
        uint256 currentSupply = totalSupply(tokenId);
        if (newMaxSupply < currentSupply) {
            revert ExceedsMaxSupply(tokenId, newMaxSupply, currentSupply);
        }

        maxSupplyPerToken[tokenId] = newMaxSupply;

        emit MaxSupplyUpdated(tokenId, newMaxSupply);
    }

    /// @notice Get available supply for a token ID
    /// @param tokenId The token ID to check
    /// @return The number of tokens still available to mint
    function getAvailableSupply(uint256 tokenId) public view returns (uint256) {
        if (!validTokenIds[tokenId]) {
            return 0;
        }

        uint256 currentSupply = totalSupply(tokenId);
        uint256 maxSupply = maxSupplyPerToken[tokenId];

        return maxSupply > currentSupply ? maxSupply - currentSupply : 0;
    }

    /// @notice Check if a token ID is valid for minting
    /// @param tokenId The token ID to check
    /// @return Whether the token ID is valid
    function isValidTokenId(uint256 tokenId) public view returns (bool) {
        return validTokenIds[tokenId];
    }

    /// @notice Internal function to add a valid token ID
    /// @param tokenId The token ID to add
    /// @param maxSupply The maximum supply for this token ID
    function _addValidTokenId(uint256 tokenId, uint256 maxSupply) internal {
        validTokenIds[tokenId] = true;
        maxSupplyPerToken[tokenId] = maxSupply;

        emit TokenIdAdded(tokenId, maxSupply);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // The following functions are overrides required by Solidity.

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155Upgradeable, ERC1155PausableUpgradeable, ERC1155SupplyUpgradeable)
    {
        super._update(from, to, ids, values);
    }
}
