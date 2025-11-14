// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./SecureToken.sol";

/**
 * @title TokenFactory
 * @dev Factory contract to deploy SecureToken instances
 */
contract TokenFactory {
    // Array of all deployed token addresses
    address[] public deployedTokens;

    // Mapping from creator address to array of token addresses
    mapping(address => address[]) public creatorTokens;

    // Event emitted when a token is deployed
    event TokenDeployed(
        address indexed tokenAddress,
        address indexed creator,
        string name,
        string symbol,
        uint256 initialSupply,
        uint256 taxPercent,
        address taxWallet,
        address initialOwner
    );

    /**
     * @dev Deploy a new SecureToken
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
     * @return tokenAddress Address of the deployed token
     */
    function createToken(
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
    ) external returns (address tokenAddress) {
        // Validate inputs
        require(bytes(_name).length > 0, "Name required");
        require(bytes(_symbol).length > 0, "Symbol required");
        
        // NEW: Validate reflection and burn parameters
        require(_reflectionPercent <= 100, "Reflection cannot exceed 100%");
        require(_burnPercent <= 100, "Burn cannot exceed 100%");
        
        // NEW: Validate total fees
        require(
            _taxPercent + _reflectionPercent + _burnPercent <= 100,
            "Total fees (tax + reflection + burn) cannot exceed 100%"
        );
        
        // Deploy new SecureToken
        SecureToken newToken = new SecureToken(
            _name,
            _symbol,
            _initialSupply,
            _taxPercent,
            _taxWallet,
            _reflectionPercent,
            _burnPercent,
            _enableReflection,
            _enableBurn,
            _initialOwner
        );

        tokenAddress = address(newToken);

        // Add to deployed tokens array
        deployedTokens.push(tokenAddress);

        // Add to creator's tokens
        creatorTokens[msg.sender].push(tokenAddress);

        // Emit event
        emit TokenDeployed(
            tokenAddress,
            msg.sender,
            _name,
            _symbol,
            _initialSupply,
            _taxPercent,
            _taxWallet,
            _initialOwner
        );

        return tokenAddress;
    }

    /**
     * @dev Get all tokens created by a specific creator
     * @param creator Creator address
     * @return Array of token addresses
     */
    function getCreatorTokens(address creator) external view returns (address[] memory) {
        return creatorTokens[creator];
    }

    /**
     * @dev Get total number of deployed tokens
     * @return Total count
     */
    function getTotalTokens() external view returns (uint256) {
        return deployedTokens.length;
    }

    /**
     * @dev Get token address at specific index
     * @param index Index in deployedTokens array
     * @return Token address
     */
    function getTokenAtIndex(uint256 index) external view returns (address) {
        require(index < deployedTokens.length, "Index out of bounds");
        return deployedTokens[index];
    }

    /**
     * NEW: Get all features of a deployed token
     * Returns: (hasReflection, hasBurn, reflectionPercent, burnPercent, taxWallet, taxPercent)
     */
    function getTokenFeatures(address tokenAddress) 
        external 
        view 
        returns (
            bool hasReflection,
            bool hasBurn,
            uint8 reflectionPercent,
            uint8 burnPercent,
            address taxWallet,
            uint8 taxPercent
        ) 
    {
        SecureToken token = SecureToken(tokenAddress);
        return (
            token.HAS_REFLECTION(),
            token.HAS_BURN(),
            token.REFLECTION_PERCENT(),
            token.BURN_PERCENT(),
            token.taxWallet(),
            uint8(token.taxPercent())
        );
    }
}

