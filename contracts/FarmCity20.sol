// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

/// @custom:security-contact admin@farmcity.dev
contract FarmCity20 is
    Initializable,
    ERC721Upgradeable,
    ERC721PausableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    uint256 public constant MINT_PRICE = 300_000_000; // 300 USDC
    uint256 public totalSupply;
    uint256 public totalMinted;
    uint256 public mintingStartTime;
    string public baseURI;
    IERC20 public USDC;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    error InssuficientTokenAmount(uint256 amount);
    error SaleIsntStarted();
    error TotalSupplyAlreadyMaxedOut();
    error TokenIdExceedsTotalSupply(uint256 tokenId);
    error InvalidTokenId(uint256 tokenId);

    function initialize(address initialOwner, IERC20 _usdc) public initializer {
        __ERC721_init("FarmCity", "FCITY");
        __ERC721Pausable_init();
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        totalSupply = 40_000;
        USDC = _usdc;
    }

    function setMintingStartTime(uint256 startTime) external onlyOwner {
        mintingStartTime = startTime;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // The following functions are overrides required by Solidity.

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Upgradeable, ERC721PausableUpgradeable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function setBaseURI(string memory newURI) external onlyOwner {
        baseURI = newURI;
    }

    function getTotalSupply() external view returns (uint256) {
        return totalSupply;
    }

    function withdraw() external onlyOwner {
        USDC.transfer(msg.sender, USDC.balanceOf(address(this)));
    }

    function purchaseFarm(uint256 tokenId) external payable {
        if (tokenId > totalSupply) {
            revert InvalidTokenId(tokenId);
        }

        if (mintingStartTime == 0 || block.timestamp < mintingStartTime) {
            revert SaleIsntStarted();
        }

        if (totalMinted >= totalSupply) {
            revert TotalSupplyAlreadyMaxedOut();
        }

        if (USDC.allowance(msg.sender, address(this)) < MINT_PRICE) {
            revert InssuficientTokenAmount({amount: USDC.allowance(msg.sender, address(this))});
        }

        USDC.transferFrom(msg.sender, address(this), MINT_PRICE);

        _safeMint(msg.sender, tokenId);
        totalMinted++;
    }

    function batchPurchaseFarm(uint256[] calldata tokenIds) external payable {
        if (mintingStartTime == 0 || block.timestamp < mintingStartTime) {
            revert SaleIsntStarted();
        }

        if (totalMinted + tokenIds.length > totalSupply) {
            revert TotalSupplyAlreadyMaxedOut();
        }

        if (USDC.allowance(msg.sender, address(this)) < MINT_PRICE * tokenIds.length) {
            revert InssuficientTokenAmount({amount: USDC.allowance(msg.sender, address(this))});
        }

        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (tokenIds[i] > totalSupply) {
                revert InvalidTokenId(tokenIds[i]);
            }

            _safeMint(msg.sender, tokenIds[i]);
            totalMinted++;
        }

        USDC.transferFrom(msg.sender, address(this), MINT_PRICE * tokenIds.length);
    }

    function adminBatchMint(uint256[] calldata tokenIds) external onlyOwner {
        if (totalMinted + tokenIds.length > totalSupply) {
            revert TotalSupplyAlreadyMaxedOut();
        }

        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (tokenIds[i] > totalSupply) {
                revert InvalidTokenId(tokenIds[i]);
            }
            _safeMint(msg.sender, tokenIds[i]);
            totalMinted++;
        }
    }
}
