/**
 * Migration script to add verification columns to tokens table
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  let connection;
  
  try {
    console.log('Connecting to database:', process.env.DB_NAME);
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'token_creator_bot',
      multipleStatements: true
    });

    console.log('✅ Connected to database');
    
    // Read SQL file
    const sqlPath = path.join(__dirname, '../database/add_verification_columns.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Executing migration...');
    
    // Execute migration
    await connection.query(sql);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify columns were added
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tokens' 
      AND COLUMN_NAME IN ('compiler_version', 'evm_version', 'optimization_enabled', 'optimization_runs', 'constructor_arguments')
      ORDER BY COLUMN_NAME
    `, [process.env.DB_NAME || 'token_creator_bot']);
    
    console.log('\nVerification columns:');
    columns.forEach(col => {
      console.log(`  ✅ ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠️  Some columns may already exist. This is OK.');
    } else {
      throw error;
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration()
  .then(() => {
    console.log('\n✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });

