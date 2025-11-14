const mysql = require("mysql2/promise");
require("dotenv").config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "token_creator_bot",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

/**
 * Get user by Telegram ID or create if not exists
 * @param {number} telegramId - Telegram user ID
 * @param {object} userData - User data (username, first_name, last_name)
 * @returns {Promise<object>} User object
 */
const getUser = async (telegramId, userData = {}) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE telegram_id = ?",
      [telegramId]
    );

    if (rows.length > 0) {
      // Update last_active
      await pool.execute(
        "UPDATE users SET last_active = NOW(), username = COALESCE(?, username), first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name) WHERE telegram_id = ?",
        [
          userData.username || null,
          userData.first_name || null,
          userData.last_name || null,
          telegramId,
        ]
      );
      return rows[0];
    }

    // Create new user
    const [result] = await pool.execute(
      "INSERT INTO users (telegram_id, username, first_name, last_name) VALUES (?, ?, ?, ?)",
      [
        telegramId,
        userData.username || null,
        userData.first_name || null,
        userData.last_name || null,
      ]
    );

    const [newUser] = await pool.execute("SELECT * FROM users WHERE id = ?", [
      result.insertId,
    ]);
    return newUser[0];
  } catch (error) {
    console.error("Error in getUser:", error);
    throw error;
  }
};

/**
 * Save token to database
 * @param {number} userId - User ID
 * @param {object} tokenData - Token data
 * @returns {Promise<number>} Token ID
 */
const saveToken = async (userId, tokenData) => {
  try {
    const [result] = await pool.execute(
      `INSERT INTO tokens (
        user_id, token_name, token_symbol, initial_supply, tax_percent,
        tax_wallet, token_address, owner_wallet, factory_address, tx_hash, network
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        tokenData.token_name,
        tokenData.token_symbol,
        tokenData.initial_supply.toString(),
        tokenData.tax_percent || 0,
        tokenData.tax_wallet || null,
        tokenData.token_address,
        tokenData.owner_wallet,
        tokenData.factory_address,
        tokenData.tx_hash,
        tokenData.network || "alvey",
      ]
    );
    return result.insertId;
  } catch (error) {
    console.error("Error in saveToken:", error);
    throw error;
  }
};

/**
 * Get all tokens for a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of tokens
 */
const getUserTokens = async (userId) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM tokens WHERE user_id = ? ORDER BY deployed_at DESC",
      [userId]
    );
    return rows;
  } catch (error) {
    console.error("Error in getUserTokens:", error);
    throw error;
  }
};

/**
 * Get token by ID
 * @param {number} tokenId - Token ID
 * @returns {Promise<object|null>} Token object or null
 */
const getToken = async (tokenId) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM tokens WHERE id = ?", [
      tokenId,
    ]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("Error in getToken:", error);
    throw error;
  }
};

/**
 * Save payment to database
 * @param {number} userId - User ID
 * @param {string} paymentId - Payment ID
 * @param {object} paymentData - Payment data
 * @returns {Promise<number>} Payment ID
 */
const savePayment = async (userId, paymentId, paymentData) => {
  try {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const [result] = await pool.execute(
      `INSERT INTO payments (
        user_id, token_id, payment_id, amount, currency, payer_wallet, tx_hash, status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        paymentData.token_id || null,
        paymentId,
        paymentData.amount,
        paymentData.currency || "USDT",
        paymentData.payer_wallet,
        paymentData.tx_hash || null,
        paymentData.status || "pending",
        expiresAt,
      ]
    );
    return result.insertId;
  } catch (error) {
    console.error("Error in savePayment:", error);
    throw error;
  }
};

/**
 * Get payment by payment ID
 * @param {string} paymentId - Payment ID
 * @returns {Promise<object|null>} Payment object or null
 */
const getPayment = async (paymentId) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM payments WHERE payment_id = ?",
      [paymentId]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("Error in getPayment:", error);
    throw error;
  }
};

/**
 * Update payment status
 * @param {string} paymentId - Payment ID
 * @param {string} status - New status
 * @param {string} txHash - Transaction hash (optional)
 * @returns {Promise<void>}
 */
const updatePaymentStatus = async (paymentId, status, txHash = null) => {
  try {
    if (txHash) {
      await pool.execute(
        "UPDATE payments SET status = ?, tx_hash = ?, confirmed_at = NOW() WHERE payment_id = ?",
        [status, txHash, paymentId]
      );
    } else {
      await pool.execute(
        "UPDATE payments SET status = ?, confirmed_at = NOW() WHERE payment_id = ?",
        [status, paymentId]
      );
    }
  } catch (error) {
    console.error("Error in updatePaymentStatus:", error);
    throw error;
  }
};

/**
 * Get user session
 * @param {number} telegramId - Telegram user ID
 * @returns {Promise<object|null>} Session object or null
 */
const getUserSession = async (telegramId) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM user_sessions WHERE telegram_id = ? AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY updated_at DESC LIMIT 1",
      [telegramId]
    );
    if (rows.length > 0) {
      return {
        ...rows[0],
        session_data: JSON.parse(rows[0].session_data),
      };
    }
    return null;
  } catch (error) {
    console.error("Error in getUserSession:", error);
    throw error;
  }
};

/**
 * Save user session
 * @param {number} telegramId - Telegram user ID
 * @param {string} step - Current step
 * @param {object} data - Session data
 * @returns {Promise<void>}
 */
const saveUserSession = async (telegramId, step, data) => {
  try {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Check if session exists
    const [existing] = await pool.execute(
      "SELECT id FROM user_sessions WHERE telegram_id = ?",
      [telegramId]
    );

    if (existing.length > 0) {
      // Update existing session
      await pool.execute(
        "UPDATE user_sessions SET session_data = ?, step = ?, updated_at = NOW(), expires_at = ? WHERE telegram_id = ?",
        [JSON.stringify(data), step, expiresAt, telegramId]
      );
    } else {
      // Create new session
      await pool.execute(
        "INSERT INTO user_sessions (telegram_id, session_data, step, expires_at) VALUES (?, ?, ?, ?)",
        [telegramId, JSON.stringify(data), step, expiresAt]
      );
    }
  } catch (error) {
    console.error("Error in saveUserSession:", error);
    throw error;
  }
};

/**
 * Delete user session
 * @param {number} telegramId - Telegram user ID
 * @returns {Promise<void>}
 */
const deleteUserSession = async (telegramId) => {
  try {
    await pool.execute("DELETE FROM user_sessions WHERE telegram_id = ?", [
      telegramId,
    ]);
  } catch (error) {
    console.error("Error in deleteUserSession:", error);
    throw error;
  }
};

/**
 * Log user activity
 * @param {number} userId - User ID
 * @param {string} action - Action name
 * @param {object} metadata - Additional metadata
 * @returns {Promise<void>}
 */
const logActivity = async (userId, action, metadata = {}) => {
  try {
    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, description, metadata) VALUES (?, ?, ?, ?)",
      [userId, action, metadata.description || null, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error("Error in logActivity:", error);
    // Don't throw - logging errors shouldn't break the flow
  }
};

/**
 * Update token owner
 * @param {number} tokenId - Token ID
 * @param {string} newOwner - New owner address
 * @returns {Promise<void>}
 */
const updateTokenOwner = async (tokenId, newOwner) => {
  try {
    await pool.execute("UPDATE tokens SET owner_wallet = ? WHERE id = ?", [
      newOwner,
      tokenId,
    ]);
  } catch (error) {
    console.error("Error in updateTokenOwner:", error);
    throw error;
  }
};

module.exports = {
  pool,
  getUser,
  saveToken,
  getUserTokens,
  getToken,
  savePayment,
  getPayment,
  updatePaymentStatus,
  getUserSession,
  saveUserSession,
  deleteUserSession,
  logActivity,
  updateTokenOwner,
};

