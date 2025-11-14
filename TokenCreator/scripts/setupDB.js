const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

/**
 * Setup database by executing schema.sql
 */
const setupDatabase = async () => {
  let connection;

  try {
    // Try connecting to the database directly first (if it exists)
    // If that fails, try connecting without database
    const connectionConfig = {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "3306", 10),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "token_creator_bot",
    };

    console.log("Attempting to connect with config:", {
      host: connectionConfig.host,
      port: connectionConfig.port,
      user: connectionConfig.user,
      database: connectionConfig.database,
      password: connectionConfig.password ? "***" : "(empty)",
    });

    try {
      // Try connecting with database first
      connection = await mysql.createConnection(connectionConfig);
    } catch (dbError) {
      // If database connection fails, try without database
      console.log("Connection with database failed, trying without database...");
      const { database, ...configWithoutDb } = connectionConfig;
      connection = await mysql.createConnection(configWithoutDb);
    }

    console.log("Connected to MySQL server");

    // Read schema file
    const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");

    // Split by semicolons and execute each statement
    const statements = schema
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    console.log(`Executing ${statements.length} SQL statements...`);

    for (const statement of statements) {
      if (statement.length > 0) {
        try {
          await connection.query(statement);
          console.log("✓ Executed statement");
        } catch (error) {
          // Ignore "database already exists" errors
          if (!error.message.includes("already exists")) {
            console.error("Error executing statement:", error.message);
            console.error("Statement:", statement.substring(0, 100) + "...");
          }
        }
      }
    }

    console.log("\n✅ Database setup completed successfully!");
    console.log("\nTables created:");
    console.log("  - users");
    console.log("  - tokens");
    console.log("  - payments");
    console.log("  - user_sessions");
    console.log("  - activity_logs");
  } catch (error) {
    console.error("❌ Error setting up database:", error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run setup
setupDatabase();

