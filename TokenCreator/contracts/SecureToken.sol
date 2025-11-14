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

    // NEW: Reflection rewards configuration
    uint8 public immutable REFLECTION_PERCENT;
    uint8 public immutable BURN_PERCENT;
    bool public immutable HAS_REFLECTION;
    bool public immutable HAS_BURN;

    // NEW: Track reflection balances for each holder
    mapping(address => uint256) private _reflectionBalance;
    uint256 private _totalReflectionDistributed;

    // Event emitted when tokens are transferred with tax
    event TokensTransferred(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 taxAmount
    );

    // NEW: Event when reflection is added to holder balance
    event ReflectionAdded(address indexed holder, uint256 amount);

    // NEW: Event when holder claims reflection rewards
    event ReflectionClaimed(address indexed holder, uint256 amount);

    // NEW: Event when tokens are burned
    event TokensBurned(address indexed from, uint256 amount);

    /**
     * @dev Constructor
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _initialSupply Initial token supply
     * @param _taxPercent Tax percentage (0-100)
     * @param _taxWallet Address that receives tax tokens
     * @param _reflectionPercent Reflection percentage (0-100)
     * @param _burnPercent Burn percentage (0-100)
     * @param _enableReflection Enable reflection feature
     * @param _enableBurn Enable burn feature
     * @param _initialOwner Initial owner address
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        uint8 _taxPercent,
        address _taxWallet,
        uint8 _reflectionPercent,
        uint8 _burnPercent,
        bool _enableReflection,
        bool _enableBurn,
        address _initialOwner
    ) ERC20(_name, _symbol) Ownable(_initialOwner) {
        require(_taxPercent <= 100, "Tax percent must be <= 100");
        require(_reflectionPercent <= 100, "Reflection percent must be <= 100");
        require(_burnPercent <= 100, "Burn percent must be <= 100");
        require(_initialOwner != address(0), "Owner cannot be zero address");
        require(_initialSupply > 0, "Initial supply must be > 0");
        
        // Tax wallet is only required if tax percent > 0
        if (_taxPercent > 0) {
            require(_taxWallet != address(0), "Tax wallet cannot be zero address when tax > 0");
        }

        // NEW: Initialize reflection and burn parameters
        REFLECTION_PERCENT = _reflectionPercent;
        BURN_PERCENT = _burnPercent;
        HAS_REFLECTION = _enableReflection;
        HAS_BURN = _enableBurn;

        // NEW: Validate total fees don't exceed 100%
        require(
            _taxPercent + _reflectionPercent + _burnPercent <= 100,
            "Total fees cannot exceed 100%"
        );

        taxPercent = _taxPercent;
        taxWallet = _taxWallet;

        // Mint initial supply to the initial owner
        _mint(_initialOwner, _initialSupply);
    }

    /**
     * @dev Override transfer to apply burn, reflection, and tax
     * @param to Recipient address
     * @param amount Amount to transfer
     */
    function transfer(address to, uint256 amount) public override returns (bool) {
        address sender = _msgSender();
        uint256 burnAmount = 0;
        uint256 reflectionAmount = 0;
        uint256 taxAmount = 0;
        uint256 netAmount = amount;

        // NEW: Calculate burn amount if enabled
        if (HAS_BURN && sender != address(0)) {
            burnAmount = (amount * BURN_PERCENT) / 100;
            netAmount -= burnAmount;
        }

        // NEW: Calculate reflection amount if enabled
        if (HAS_REFLECTION && sender != address(0)) {
            reflectionAmount = (netAmount * REFLECTION_PERCENT) / 100;
            netAmount -= reflectionAmount;
        }

        // Calculate tax amount
        if (taxPercent > 0 && taxWallet != address(0) && sender != taxWallet) {
            taxAmount = (netAmount * taxPercent) / 100;
            netAmount -= taxAmount;
        }

        // Execute all transfers
        if (burnAmount > 0) {
            _update(sender, address(0), burnAmount);  // Burn tokens (reduce balance and totalSupply)
            emit TokensBurned(sender, burnAmount);
        }
        
        if (reflectionAmount > 0) {
            _transfer(sender, address(this), reflectionAmount);  // Transfer reflection to contract
            _addReflectionReward(to, reflectionAmount);  // Queue reflection reward
        }
        
        if (taxAmount > 0) {
            _transfer(sender, taxWallet, taxAmount);  // Send tax
        }
        
        _transfer(sender, to, netAmount);  // Send final amount
        emit TokensTransferred(sender, to, netAmount, taxAmount);

        return true;
    }

    /**
     * @dev Override transferFrom to apply burn, reflection, and tax
     * @param from Sender address
     * @param to Recipient address
     * @param amount Amount to transfer
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);

        uint256 burnAmount = 0;
        uint256 reflectionAmount = 0;
        uint256 taxAmount = 0;
        uint256 netAmount = amount;

        // NEW: Calculate burn amount if enabled
        if (HAS_BURN && from != address(0)) {
            burnAmount = (amount * BURN_PERCENT) / 100;
            netAmount -= burnAmount;
        }

        // NEW: Calculate reflection amount if enabled
        if (HAS_REFLECTION && from != address(0)) {
            reflectionAmount = (netAmount * REFLECTION_PERCENT) / 100;
            netAmount -= reflectionAmount;
        }

        // Calculate tax amount
        if (taxPercent > 0 && taxWallet != address(0) && from != taxWallet) {
            taxAmount = (netAmount * taxPercent) / 100;
            netAmount -= taxAmount;
        }

        // Execute all transfers
        if (burnAmount > 0) {
            _update(from, address(0), burnAmount);  // Burn tokens (reduce balance and totalSupply)
            emit TokensBurned(from, burnAmount);
        }
        
        if (reflectionAmount > 0) {
            _transfer(from, address(this), reflectionAmount);  // Transfer reflection to contract
            _addReflectionReward(to, reflectionAmount);  // Queue reflection reward
        }
        
        if (taxAmount > 0) {
            _transfer(from, taxWallet, taxAmount);  // Send tax
        }
        
        _transfer(from, to, netAmount);  // Send final amount
        emit TokensTransferred(from, to, netAmount, taxAmount);

        return true;
    }

    /**
     * NEW: Distribute reflection rewards to a recipient
     * Called during transfer to queue rewards
     */
    function _addReflectionReward(address holder, uint256 amount) private {
        if (!HAS_REFLECTION || amount == 0) return;
        _reflectionBalance[holder] += amount;
        _totalReflectionDistributed += amount;
        emit ReflectionAdded(holder, amount);
    }

    /**
     * NEW: Allow holders to claim their reflection rewards
     * Returns the amount of rewards claimed
     */
    function claimReflectionRewards() external returns (uint256) {
        require(HAS_REFLECTION, "Reflection is disabled for this token");
        
        uint256 rewards = _reflectionBalance[msg.sender];
        require(rewards > 0, "No reflection rewards to claim");
        
        // Clear the pending rewards
        _reflectionBalance[msg.sender] = 0;
        
        // Transfer rewards to user
        _transfer(address(this), msg.sender, rewards);
        
        emit ReflectionClaimed(msg.sender, rewards);
        return rewards;
    }

    /**
     * NEW: Check pending reflection rewards for an address
     */
    function getPendingReflection(address holder) 
        external 
        view 
        returns (uint256) 
    {
        if (!HAS_REFLECTION) return 0;
        return _reflectionBalance[holder];
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

