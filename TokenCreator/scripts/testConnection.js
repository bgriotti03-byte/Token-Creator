const mysql = require("mysql2/promise");
require("dotenv").config();

/**
 * Test MySQL connection with different configurations
 */
const testConnection = async () => {
  const configs = [
    {
      name: "With password from .env",
      config: {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "3306", 10),
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
      },
    },
    {
      name: "Without password (empty)",
      config: {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "3306", 10),
        user: process.env.DB_USER || "root",
        password: "",
      },
    },
    {
      name: "User 'root' with empty password",
      config: {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "",
      },
    },
    {
      name: "User 'root' with common password 'root'",
      config: {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "root",
      },
    },
  ];

  console.log("Testing MySQL connections...\n");

  for (const { name, config } of configs) {
    try {
      console.log(`Testing: ${name}...`);
      const connection = await mysql.createConnection(config);
      console.log(`✅ SUCCESS with: ${name}`);
      console.log(`   Host: ${config.host}, User: ${config.user}`);
      
      // Test a simple query
      const [rows] = await connection.query("SELECT USER(), DATABASE()");
      console.log(`   Current user: ${rows[0]['USER()']}`);
      
      await connection.end();
      console.log(`\n🎉 Working configuration found!\n`);
      console.log(`Update your .env with:`);
      console.log(`DB_USER=${config.user}`);
      console.log(`DB_PASSWORD=${config.password || '(empty)'}`);
      return config;
    } catch (error) {
      console.log(`❌ Failed: ${error.code || error.message}\n`);
    }
  }

  console.log("\n❌ None of the configurations worked.");
  console.log("\nYou may need to:");
  console.log("1. Reset MySQL root password");
  console.log("2. Check phpMyAdmin config file for credentials");
  console.log("3. Create a new MySQL user");
};

testConnection().catch(console.error);

