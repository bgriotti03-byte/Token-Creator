const { ethers } = require("ethers");

/**
 * Validate Ethereum address
 * @param {string} address - Address to validate
 * @returns {boolean}
 */
const isValidEthereumAddress = (address) => {
  if (!address || typeof address !== "string") {
    return false;
  }
  if (!ethers.isAddress(address)) {
    return false;
  }
  // Check for zero address
  if (address.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    return false;
  }
  return true;
};

/**
 * Validate token name
 * @param {string} name - Token name
 * @returns {boolean}
 */
const isValidTokenName = (name) => {
  if (!name || typeof name !== "string") {
    return false;
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    return false;
  }
  return true;
};

/**
 * Validate token symbol
 * @param {string} symbol - Token symbol
 * @returns {boolean}
 */
const isValidTokenSymbol = (symbol) => {
  if (!symbol || typeof symbol !== "string") {
    return false;
  }
  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.length < 1 || trimmed.length > 10) {
    return false;
  }
  // Check for valid characters (letters and numbers only)
  if (!/^[A-Z0-9]+$/.test(trimmed)) {
    return false;
  }
  return true;
};

/**
 * Validate token supply
 * @param {string|number} supply - Token supply
 * @returns {boolean}
 */
const isValidSupply = (supply) => {
  if (!supply) {
    return false;
  }
  const num = typeof supply === "string" ? parseFloat(supply) : supply;
  if (isNaN(num) || num <= 0) {
    return false;
  }
  // Check if it's a valid integer
  if (!Number.isInteger(parseFloat(supply))) {
    return false;
  }
  return true;
};

/**
 * Validate tax percentage
 * @param {string|number} percent - Tax percentage
 * @returns {boolean}
 */
const isValidTaxPercent = (percent) => {
  if (percent === null || percent === undefined || percent === "") {
    return false;
  }
  const num = typeof percent === "string" ? parseFloat(percent) : percent;
  if (isNaN(num)) {
    return false;
  }
  if (num < 0 || num > 100) {
    return false;
  }
  return true;
};

/**
 * Sanitize user input
 * @param {string} input - Input to sanitize
 * @returns {string}
 */
const sanitizeInput = (input) => {
  if (!input || typeof input !== "string") {
    return "";
  }
  // Remove leading/trailing whitespace
  let sanitized = input.trim();
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");
  // Limit length
  if (sanitized.length > 1000) {
    sanitized = sanitized.substring(0, 1000);
  }
  return sanitized;
};

module.exports = {
  isValidEthereumAddress,
  isValidTokenName,
  isValidTokenSymbol,
  isValidSupply,
  isValidTaxPercent,
  sanitizeInput,
};

