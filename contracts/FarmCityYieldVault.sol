// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./FarmCity.sol";

contract YieldVault is ReentrancyGuard, Ownable {
    IERC20 public immutable erc20Token;
    FarmCity public immutable nft;

    uint256 public totalDeposited;
    mapping(uint256 => uint256) public withdrawnPerNFT;

    constructor(address _erc20Address, address _nftAddress) Ownable(msg.sender) {
        erc20Token = IERC20(_erc20Address);
        nft = FarmCity(_nftAddress);
    }

    function withdrawableYield(uint256 tokenId) external view returns (uint256) {
        uint256 totalNFTs = nft.totalMinted();
        uint256 totalEntitlement = totalDeposited / totalNFTs;
        uint256 withdrawn = withdrawnPerNFT[tokenId];

        return totalEntitlement - withdrawn;
    }

    function deposit(uint256 amount) external onlyOwner {
        require(erc20Token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        totalDeposited += amount;
    }

    function withdraw(uint256 nftId) external nonReentrant {
        require(nft.ownerOf(nftId) == msg.sender, "Not NFT owner");

        uint256 totalNFTs = nft.totalMinted();
        require(totalNFTs > 0, "No NFTs exist");

        uint256 totalEntitlement = totalDeposited / totalNFTs;
        uint256 withdrawn = withdrawnPerNFT[nftId];
        require(totalEntitlement > withdrawn, "No tokens to withdraw");

        uint256 withdrawAmount = totalEntitlement - withdrawn;
        withdrawnPerNFT[nftId] += withdrawAmount;

        require(erc20Token.transfer(msg.sender, withdrawAmount), "Transfer failed");
    }
}
