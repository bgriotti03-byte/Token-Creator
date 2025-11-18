const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

/**
 * Add verification columns to tokens table
 * This script adds is_verified, verified_at, and verification_status columns
 */
const addVerificationColumns = async () => {
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

    // Read migration SQL file
    const migrationPath = path.join(__dirname, "..", "database", "add_verification_columns.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    // Remove USE statement and comments
    let cleanSQL = migrationSQL
      .replace(/USE.*?;/gi, "")
      .replace(/--.*$/gm, "") // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, ""); // Remove multi-line comments

    // Split by semicolons and clean up
    const statements = cleanSQL
      .split(";")
      .map((s) => s.trim().replace(/\n/g, " ").replace(/\s+/g, " ")) // Normalize whitespace
      .filter((s) => s.length > 0 && !s.match(/^\s*$/));

    console.log(`\nExecuting ${statements.length} SQL statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length > 0) {
        try {
          await connection.query(statement);
          
          // Extract column/index name from statement
          const columnMatch = statement.match(/ADD COLUMN.*?(\w+)/i);
          const indexMatch = statement.match(/CREATE INDEX.*?(\w+)/i);
          
          if (columnMatch) {
            console.log(`✅ Added column: ${columnMatch[1]}`);
          } else if (indexMatch) {
            console.log(`✅ Created index: ${indexMatch[1]}`);
          } else {
            console.log(`✅ Executed statement ${i + 1}`);
          }
        } catch (error) {
          // Ignore "column/index already exists" errors
          if (
            error.message.includes("already exists") ||
            error.message.includes("Duplicate column") ||
            error.code === "ER_DUP_FIELDNAME" ||
            error.code === "ER_DUP_KEYNAME"
          ) {
            const columnMatch = statement.match(/ADD COLUMN.*?(\w+)/i);
            const indexMatch = statement.match(/CREATE INDEX.*?(\w+)/i);
            
            if (columnMatch) {
              console.log(`⚠️  Column ${columnMatch[1]} already exists, skipping...`);
            } else if (indexMatch) {
              console.log(`⚠️  Index ${indexMatch[1]} already exists, skipping...`);
            } else {
              console.log(`⚠️  Statement ${i + 1} already executed, skipping...`);
            }
          } else {
            console.error(`❌ Error executing statement ${i + 1}:`, error.message);
            console.error("Statement:", statement.substring(0, 150) + "...");
          }
        }
      }
    }

    console.log("\n✅ Migration completed successfully!");
    console.log("\nVerifying columns in tokens table...");
    
    // Verify columns were added
    const [columns] = await connection.query("DESCRIBE tokens");
    const verificationColumns = columns.filter(col => 
      col.Field === 'is_verified' || 
      col.Field === 'verified_at' || 
      col.Field === 'verification_status'
    );
    
    if (verificationColumns.length === 3) {
      console.log("\n✅ All verification columns are present:");
      verificationColumns.forEach(col => {
        console.log(`   - ${col.Field}: ${col.Type}`);
      });
    } else {
      console.log("\n⚠️  Some verification columns may be missing. Please check manually.");
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.code === "ER_BAD_DB_ERROR") {
      console.error("\nDatabase does not exist. Please create it first.");
    } else if (error.code === "ECONNREFUSED") {
      console.error("\nCould not connect to database. Please check your .env configuration.");
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run
addVerificationColumns();

