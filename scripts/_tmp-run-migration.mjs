import { Client } from "pg";
import fs from "fs";
import path from "path";
import "dotenv/config";

const client = new Client({ connectionString: process.env.DATABASE_URL });
const file = process.argv[2];
try {
  await client.connect();
  const sql = fs.readFileSync(path.resolve(file), "utf8");
  await client.query(sql);
  console.log("Migration applied:", file);
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
