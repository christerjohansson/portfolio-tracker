import Database from "better-sqlite3";
import fs from "fs";

const PLAIN_DB_FILE = "portfolio_plain.db";
const ENCRYPTED_DB_FILE = "portfolio.db";
const KEY = "20260411171630";

async function migrate() {
  let sourceDb = "";
  
  if (fs.existsSync(PLAIN_DB_FILE)) {
    console.log(`Using existing ${PLAIN_DB_FILE} as source.`);
    sourceDb = PLAIN_DB_FILE;
  } else if (fs.existsSync(ENCRYPTED_DB_FILE)) {
    console.log(`Renaming ${ENCRYPTED_DB_FILE} to ${PLAIN_DB_FILE} for migration...`);
    fs.renameSync(ENCRYPTED_DB_FILE, PLAIN_DB_FILE);
    sourceDb = PLAIN_DB_FILE;
  } else {
    console.error("No database file found to migrate (checked portfolio.db and portfolio_plain.db).");
    return;
  }

  // Ensure target doesn't exist
  if (fs.existsSync(ENCRYPTED_DB_FILE)) {
    console.log(`Removing existing target ${ENCRYPTED_DB_FILE}...`);
    fs.unlinkSync(ENCRYPTED_DB_FILE);
  }

  const plainDb = new Database(sourceDb);
  const encryptedDb = new Database(ENCRYPTED_DB_FILE);

  try {
    console.log("Setting up encryption on new database...");
    encryptedDb.pragma(`cipher='sqlcipher'`);
    encryptedDb.pragma(`key='${KEY}'`);

    // Get all tables from plain DB
    const tables = plainDb.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name: string, sql: string}[];

    console.log(`Found ${tables.length} tables to migrate.`);

    for (const table of tables) {
      console.log(`Migrating table: ${table.name}...`);
      
      // Create table in encrypted DB
      encryptedDb.exec(table.sql);

      // Get data from plain DB
      const rows = plainDb.prepare(`SELECT * FROM ${table.name}`).all();
      if (rows.length === 0) {
        console.log(`  Table ${table.name} is empty.`);
        continue;
      }

      // Prepare insert statement
      const columns = Object.keys(rows[0] as any);
      const placeholders = columns.map(() => "?").join(",");
      const insert = encryptedDb.prepare(`INSERT INTO ${table.name} (${columns.join(",")}) VALUES (${placeholders})`);

      // Insert all rows in a transaction
      encryptedDb.transaction((data) => {
        for (const row of data) {
          insert.run(Object.values(row as any));
        }
      })(rows);

      console.log(`  Inserted ${rows.length} rows.`);
    }

    console.log("Migration completed successfully!");
    console.log(`Your data has been moved to the encrypted ${ENCRYPTED_DB_FILE}.`);
    console.log(`The plain backup is at ${PLAIN_DB_FILE}.`);
  } catch (err) {
    console.error("Migration failed:", err);
    encryptedDb.close();
    if (fs.existsSync(ENCRYPTED_DB_FILE)) fs.unlinkSync(ENCRYPTED_DB_FILE);
  } finally {
    plainDb.close();
    encryptedDb.close();
  }
}

migrate();
