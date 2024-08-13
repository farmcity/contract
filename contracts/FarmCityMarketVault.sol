// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract MarketVault is Ownable {
    IERC20 public erc20Token;
    IERC721 public nftToken;
    uint256 public nftPrice; // Fixed NFT price

    event NFTPurchased(address buyer, uint256 tokenId, uint256 price);
    event NFTSold(address seller, uint256 tokenId, uint256 price);

    uint256 private constant SELL_BACK_DISCOUNT = 80; // Percentage of NFT price to be given back to the seller

    constructor(address _erc20Address, address _nftAddress, uint256 _nftPrice) Ownable(msg.sender) {
        erc20Token = IERC20(_erc20Address);
        nftToken = IERC721(_nftAddress);
        nftPrice = _nftPrice; // Set initial NFT price
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function setNFTPrice(uint256 _price) external onlyOwner {
        nftPrice = _price; // Update NFT price
    }

    function depositERC20(uint256 amount) external onlyOwner {
        require(erc20Token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    function withdrawERC20(uint256 amount) external onlyOwner {
        require(erc20Token.transfer(msg.sender, amount), "Transfer failed");
    }

    function buyNFT(uint256 tokenId) external {
        require(erc20Token.balanceOf(msg.sender) >= nftPrice, "Insufficient ERC20 balance");
        require(erc20Token.allowance(msg.sender, address(this)) >= nftPrice, "MarketVault not approved to spend tokens");
        require(erc20Token.transferFrom(msg.sender, address(this), nftPrice), "Transfer failed");

        nftToken.transferFrom(address(this), msg.sender, tokenId);
        emit NFTPurchased(msg.sender, tokenId, nftPrice);
    }

    function sellNFTBackToMarket(uint256 tokenId) external {
        require(nftToken.ownerOf(tokenId) == msg.sender, "Not the owner");

        nftToken.transferFrom(msg.sender, address(this), tokenId);

        // Calculate the amount to transfer to the seller
        uint256 amountToSeller = nftPrice * SELL_BACK_DISCOUNT / 100;
        require(erc20Token.transfer(msg.sender, amountToSeller), "Transfer failed");

        emit NFTSold(msg.sender, tokenId, amountToSeller);
    }
}
