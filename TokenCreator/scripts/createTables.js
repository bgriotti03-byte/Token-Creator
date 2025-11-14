const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

/**
 * Create tables directly in the database
 */
const createTables = async () => {
  let connection;

  try {
    const connectionConfig = {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "3306", 10),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "token_creator_bot",
    };

    console.log("Connecting to database:", connectionConfig.database);
    connection = await mysql.createConnection(connectionConfig);
    console.log("✅ Connected to database");

    // Read schema file
    const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");

    // Remove CREATE DATABASE and USE statements
    let cleanSchema = schema
      .replace(/CREATE DATABASE.*?;/gi, "")
      .replace(/USE.*?;/gi, "")
      .replace(/CREATE DATABASE IF NOT EXISTS.*?;/gi, "");

    // Split by semicolons and execute each statement
    const statements = cleanSchema
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--") && !s.startsWith("/*"));

    console.log(`\nExecuting ${statements.length} SQL statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length > 0) {
        try {
          await connection.query(statement);
          // Extract table name from CREATE TABLE statement
          const tableMatch = statement.match(/CREATE TABLE.*?`?(\w+)`?/i);
          if (tableMatch) {
            console.log(`✅ Created table: ${tableMatch[1]}`);
          } else {
            console.log(`✅ Executed statement ${i + 1}`);
          }
        } catch (error) {
          // Ignore "table already exists" errors
          if (error.message.includes("already exists") || error.code === "ER_TABLE_EXISTS_ERROR") {
            const tableMatch = statement.match(/CREATE TABLE.*?`?(\w+)`?/i);
            if (tableMatch) {
              console.log(`⚠️  Table ${tableMatch[1]} already exists, skipping...`);
            }
          } else {
            console.error(`❌ Error executing statement ${i + 1}:`, error.message);
            console.error("Statement:", statement.substring(0, 150) + "...");
          }
        }
      }
    }

    console.log("\n✅ All tables created successfully!");
    console.log("\nTables in database:");
    const [tables] = await connection.query("SHOW TABLES");
    tables.forEach((row) => {
      console.log(`  - ${Object.values(row)[0]}`);
    });

  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.code === "ER_BAD_DB_ERROR") {
      console.error("\nDatabase does not exist. Please create it first in phpMyAdmin.");
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run
createTables();

