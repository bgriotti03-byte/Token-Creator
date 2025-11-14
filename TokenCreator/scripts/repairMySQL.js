const mysql = require("mysql2/promise");
require("dotenv").config();

/**
 * Repair MySQL system tables
 */
const repairMySQL = async () => {
  let connection;

  try {
    // Try to connect without database first
    const connectionConfig = {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "3306", 10),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
    };

    console.log("Attempting to connect to MySQL...");
    connection = await mysql.createConnection(connectionConfig);
    console.log("✅ Connected to MySQL server");

    // Repair the mysql.db table
    console.log("\nRepairing mysql.db table...");
    try {
      await connection.query("REPAIR TABLE mysql.db");
      console.log("✅ mysql.db table repaired");
    } catch (error) {
      console.error("❌ Error repairing mysql.db:", error.message);
    }

    // Repair other mysql system tables
    const systemTables = ['mysql.user', 'mysql.tables_priv', 'mysql.columns_priv', 'mysql.procs_priv'];
    
    for (const table of systemTables) {
      try {
        console.log(`Repairing ${table}...`);
        await connection.query(`REPAIR TABLE ${table}`);
        console.log(`✅ ${table} repaired`);
      } catch (error) {
        console.log(`⚠️  Could not repair ${table}: ${error.message}`);
      }
    }

    console.log("\n✅ Repair process completed!");
    console.log("\nPlease try running 'npm run setup-db' again.");

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("\nIf you cannot connect, you may need to:");
    console.error("1. Stop MySQL service");
    console.error("2. Run MySQL in safe mode");
    console.error("3. Repair tables manually");
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run repair
repairMySQL();

