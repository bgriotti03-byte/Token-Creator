/**
 * Flatten contract source code
 * Removes OpenZeppelin imports and includes code directly
 * Based on OpenZeppelin Contracts v5.0.1
 */

const fs = require('fs');
const path = require('path');

/**
 * Get flattened contract source (all in one file, no external imports)
 * This matches the exact implementation of SecureToken.sol
 */
function getFlattenedSecureToken() {
    // OpenZeppelin IERC20 interface
    const ierc20 = `
// OpenZeppelin Contracts (last updated v5.0.1) (token/ERC20/IERC20.sol)
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
    `;

    // OpenZeppelin ERC20 implementation (minimal version matching v5.0.1)
    const erc20 = `
// OpenZeppelin Contracts (last updated v5.0.1) (token/ERC20/ERC20.sol)
abstract contract ERC20 is IERC20 {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;
    string private _name;
    string private _symbol;

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    function name() public view virtual returns (string memory) {
        return _name;
    }

    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }

    function decimals() public view virtual returns (uint8) {
        return 18;
    }

    function totalSupply() public view virtual returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 value) public virtual returns (bool) {
        address owner = msg.sender;
        _transfer(owner, to, value);
        return true;
    }

    function allowance(address owner, address spender) public view virtual returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 value) public virtual returns (bool) {
        address owner = msg.sender;
        _approve(owner, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public virtual returns (bool) {
        address spender = msg.sender;
        _spendAllowance(from, spender, value);
        _transfer(from, to, value);
        return true;
    }

    function _update(address from, address to, uint256 value) internal virtual {
        if (from == address(0)) {
            _totalSupply += value;
        } else {
            uint256 fromBalance = _balances[from];
            require(fromBalance >= value, "ERC20: transfer amount exceeds balance");
            unchecked {
                _balances[from] = fromBalance - value;
            }
        }

        if (to == address(0)) {
            unchecked {
                _totalSupply -= value;
            }
        } else {
            unchecked {
                _balances[to] += value;
            }
        }

        emit Transfer(from, to, value);
    }

    function _transfer(address from, address to, uint256 value) internal virtual {
        if (from == address(0)) {
            revert("ERC20: transfer from the zero address");
        }
        if (to == address(0)) {
            revert("ERC20: transfer to the zero address");
        }
        _update(from, to, value);
    }

    function _mint(address to, uint256 value) internal virtual {
        if (to == address(0)) {
            revert("ERC20: mint to the zero address");
        }
        _update(address(0), to, value);
    }

    function _approve(address owner, address spender, uint256 value) internal virtual {
        if (owner == address(0)) {
            revert("ERC20: approve from the zero address");
        }
        if (spender == address(0)) {
            revert("ERC20: approve to the zero address");
        }
        _allowances[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function _spendAllowance(address owner, address spender, uint256 value) internal virtual {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < value) {
                revert("ERC20: insufficient allowance");
            }
            unchecked {
                _approve(owner, spender, currentAllowance - value);
            }
        }
    }

    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }
}
    `;

    // OpenZeppelin Ownable
    const ownable = `
// OpenZeppelin Contracts (last updated v5.0.1) (access/Ownable.sol)
abstract contract Ownable {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert("Ownable: initial owner is the zero address");
        }
        _transferOwnership(initialOwner);
    }

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function _checkOwner() internal view virtual {
        if (owner() != msg.sender) {
            revert("Ownable: caller is not the owner");
        }
    }

    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert("Ownable: new owner is the zero address");
        }
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
    `;

    // SecureToken contract (exact copy from SecureToken.sol)
    const secureToken = `
// SPDX-License-Identifier: MIT
contract SecureToken is ERC20, Ownable {
    uint256 public immutable taxPercent;
    address public immutable taxWallet;
    uint8 public immutable REFLECTION_PERCENT;
    uint8 public immutable BURN_PERCENT;
    bool public immutable HAS_REFLECTION;
    bool public immutable HAS_BURN;

    mapping(address => uint256) private _reflectionBalance;
    uint256 private _totalReflectionDistributed;
    mapping(address => uint256) private _reflectionClaimed;

    event TokensTransferred(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 taxAmount
    );
    event ReflectionAdded(address indexed holder, uint256 amount);
    event ReflectionClaimed(address indexed holder, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

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
        
        if (_taxPercent > 0) {
            require(_taxWallet != address(0), "Tax wallet cannot be zero address when tax > 0");
        }

        REFLECTION_PERCENT = _reflectionPercent;
        BURN_PERCENT = _burnPercent;
        HAS_REFLECTION = _enableReflection;
        HAS_BURN = _enableBurn;

        require(
            _taxPercent + _reflectionPercent + _burnPercent <= 100,
            "Total fees cannot exceed 100%"
        );

        taxPercent = _taxPercent;
        taxWallet = _taxWallet;

        _mint(_initialOwner, _initialSupply);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        address sender = _msgSender();
        uint256 burnAmount = 0;
        uint256 reflectionAmount = 0;
        uint256 taxAmount = 0;
        uint256 netAmount = amount;

        if (HAS_BURN && sender != address(0)) {
            burnAmount = (amount * BURN_PERCENT) / 100;
            netAmount -= burnAmount;
        }

        if (HAS_REFLECTION && sender != address(0)) {
            reflectionAmount = (netAmount * REFLECTION_PERCENT) / 100;
            netAmount -= reflectionAmount;
        }

        if (taxPercent > 0 && taxWallet != address(0) && sender != taxWallet) {
            taxAmount = (netAmount * taxPercent) / 100;
            netAmount -= taxAmount;
        }

        if (burnAmount > 0) {
            _update(sender, address(0), burnAmount);
            emit TokensBurned(sender, burnAmount);
        }
        
        if (reflectionAmount > 0) {
            _transfer(sender, address(this), reflectionAmount);
            _totalReflectionDistributed += reflectionAmount;
            emit ReflectionAdded(address(this), reflectionAmount);
        }
        
        if (taxAmount > 0) {
            _transfer(sender, taxWallet, taxAmount);
        }
        
        _transfer(sender, to, netAmount);
        emit TokensTransferred(sender, to, netAmount, taxAmount);

        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);

        uint256 burnAmount = 0;
        uint256 reflectionAmount = 0;
        uint256 taxAmount = 0;
        uint256 netAmount = amount;

        if (HAS_BURN && from != address(0)) {
            burnAmount = (amount * BURN_PERCENT) / 100;
            netAmount -= burnAmount;
        }

        if (HAS_REFLECTION && from != address(0)) {
            reflectionAmount = (netAmount * REFLECTION_PERCENT) / 100;
            netAmount -= reflectionAmount;
        }

        if (taxPercent > 0 && taxWallet != address(0) && from != taxWallet) {
            taxAmount = (netAmount * taxPercent) / 100;
            netAmount -= taxAmount;
        }

        if (burnAmount > 0) {
            _update(from, address(0), burnAmount);
            emit TokensBurned(from, burnAmount);
        }
        
        if (reflectionAmount > 0) {
            _transfer(from, address(this), reflectionAmount);
            _totalReflectionDistributed += reflectionAmount;
            emit ReflectionAdded(address(this), reflectionAmount);
        }
        
        if (taxAmount > 0) {
            _transfer(from, taxWallet, taxAmount);
        }
        
        _transfer(from, to, netAmount);
        emit TokensTransferred(from, to, netAmount, taxAmount);

        return true;
    }

    function claimReflectionRewards() external returns (uint256) {
        require(HAS_REFLECTION, "Reflection is disabled for this token");
        
        uint256 holderBalance = balanceOf(msg.sender);
        require(holderBalance > 0, "You must hold tokens to claim reflection");
        
        uint256 totalSupply = totalSupply();
        require(totalSupply > 0, "Total supply must be greater than 0");
        
        uint256 contractBalance = balanceOf(address(this));
        require(contractBalance > 0, "No reflection rewards available");
        
        uint256 proportionalReflection = (holderBalance * contractBalance) / totalSupply;
        
        uint256 alreadyClaimed = _reflectionClaimed[msg.sender];
        
        uint256 claimableAmount = proportionalReflection > alreadyClaimed 
            ? proportionalReflection - alreadyClaimed 
            : 0;
        
        require(claimableAmount > 0, "No reflection rewards to claim");
        
        _reflectionClaimed[msg.sender] = proportionalReflection;
        
        _transfer(address(this), msg.sender, claimableAmount);
        
        emit ReflectionClaimed(msg.sender, claimableAmount);
        return claimableAmount;
    }
    
    function getClaimableReflection(address holder) external view returns (uint256) {
        if (!HAS_REFLECTION) return 0;
        
        uint256 holderBalance = balanceOf(holder);
        if (holderBalance == 0) return 0;
        
        uint256 totalSupply = totalSupply();
        if (totalSupply == 0) return 0;
        
        uint256 contractBalance = balanceOf(address(this));
        if (contractBalance == 0) return 0;
        
        uint256 proportionalReflection = (holderBalance * contractBalance) / totalSupply;
        
        uint256 alreadyClaimed = _reflectionClaimed[holder];
        
        return proportionalReflection > alreadyClaimed 
            ? proportionalReflection - alreadyClaimed 
            : 0;
    }

    function getPendingReflection(address holder) 
        external 
        view 
        returns (uint256) 
    {
        if (!HAS_REFLECTION) return 0;
        
        uint256 holderBalance = balanceOf(holder);
        if (holderBalance == 0) return 0;
        
        uint256 totalSupply = totalSupply();
        if (totalSupply == 0) return 0;
        
        uint256 contractBalance = balanceOf(address(this));
        if (contractBalance == 0) return 0;
        
        uint256 proportionalReflection = (holderBalance * contractBalance) / totalSupply;
        
        uint256 alreadyClaimed = _reflectionClaimed[holder];
        
        return proportionalReflection > alreadyClaimed 
            ? proportionalReflection - alreadyClaimed 
            : 0;
    }

    function mint(address /* to */, uint256 /* amount */) external pure {
        revert("Minting is permanently disabled");
    }

    function burn(uint256 /* amount */) external pure {
        revert("Burning is not allowed");
    }

    function burnFrom(address /* account */, uint256 /* amount */) external pure {
        revert("Burning is not allowed");
    }
}
    `;

    // Combine all parts
    const flattened = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

${ierc20}

${erc20}

${ownable}

${secureToken}
`;

    return flattened;
}

module.exports = {
    getFlattenedSecureToken,
};

