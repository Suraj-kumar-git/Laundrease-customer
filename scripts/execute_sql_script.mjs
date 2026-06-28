import { Client } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  try {
    console.log("Connecting to database...");
    await client.connect();
    console.log("Reading SQL schema file...");
    const schemaSQL = fs.readFileSync(path.join(__dirname, "30-Migration-june.sql"), "utf8");
    console.log("Executing schema creation...");
    await client.query(schemaSQL);
    console.log("Database schema created successfully!");
  } catch (error) {
      console.error("Error setting up database:", error);
      process.exit(1);
  } finally {
    await client.end();
  }
}

await setupDatabase();
