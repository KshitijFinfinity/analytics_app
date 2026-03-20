const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config({ path: path.join(__dirname, ".env") });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to backend/.env");
}

const useLocalDb = connectionString && connectionString.includes("localhost");

const pool = new Pool({
  connectionString,
  ssl: useLocalDb ? false : { rejectUnauthorized: false },
});

module.exports = pool;
