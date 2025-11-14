// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SecureToken
 * @dev ERC-20 Token with immutable tax fee and wallet
 * Minting and burning are permanently disabled
 */
contract SecureToken is ERC20, Ownable {
    // Immutable tax parameters
    uint256 public immutable taxPercent;
    address public immutable taxWallet;

    // Event emitted when tokens are transferred with tax
    event TokensTransferred(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 taxAmount
    );

    /**
     * @dev Constructor
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _initialSupply Initial token supply
     * @param _taxPercent Tax percentage (0-100)
     * @param _taxWallet Address that receives tax tokens
     * @param _initialOwner Initial owner address
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        uint256 _taxPercent,
        address _taxWallet,
        address _initialOwner
    ) ERC20(_name, _symbol) Ownable(_initialOwner) {
        require(_taxPercent <= 100, "Tax percent must be <= 100");
        require(_initialOwner != address(0), "Owner cannot be zero address");
        require(_initialSupply > 0, "Initial supply must be > 0");
        // Tax wallet is only required if tax percent > 0
        if (_taxPercent > 0) {
            require(_taxWallet != address(0), "Tax wallet cannot be zero address when tax > 0");
        }

        taxPercent = _taxPercent;
        taxWallet = _taxWallet;

        // Mint initial supply to the initial owner
        _mint(_initialOwner, _initialSupply);
    }

    /**
     * @dev Override transfer to apply tax
     * @param to Recipient address
     * @param amount Amount to transfer
     */
    function transfer(address to, uint256 amount) public override returns (bool) {
        address owner = _msgSender();
        (uint256 transferAmount, uint256 taxAmount) = _calculateTax(amount);

        if (taxAmount > 0) {
            _transfer(owner, taxWallet, taxAmount);
        }
        _transfer(owner, to, transferAmount);

        emit TokensTransferred(owner, to, amount, taxAmount);
        return true;
    }

    /**
     * @dev Override transferFrom to apply tax
     * @param from Sender address
     * @param to Recipient address
     * @param amount Amount to transfer
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);

        (uint256 transferAmount, uint256 taxAmount) = _calculateTax(amount);

        if (taxAmount > 0) {
            _transfer(from, taxWallet, taxAmount);
        }
        _transfer(from, to, transferAmount);

        emit TokensTransferred(from, to, amount, taxAmount);
        return true;
    }

    /**
     * @dev Calculate tax amount
     * @param amount Original amount
     * @return transferAmount Amount after tax
     * @return taxAmount Tax amount
     */
    function _calculateTax(uint256 amount) internal view returns (uint256 transferAmount, uint256 taxAmount) {
        if (taxPercent == 0) {
            return (amount, 0);
        }
        taxAmount = (amount * taxPercent) / 100;
        transferAmount = amount - taxAmount;
    }

    /**
     * @dev Minting is permanently disabled
     */
    function mint(address /* to */, uint256 /* amount */) external pure {
        revert("Minting is permanently disabled");
    }

    /**
     * @dev Burning is not allowed
     */
    function burn(uint256 /* amount */) external pure {
        revert("Burning is not allowed");
    }

    /**
     * @dev Burn from is not allowed
     */
    function burnFrom(address /* account */, uint256 /* amount */) external pure {
        revert("Burning is not allowed");
    }
}

