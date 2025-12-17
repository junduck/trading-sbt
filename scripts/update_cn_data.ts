import Database from "better-sqlite3";
import { toEpoch } from "../src/shared/utils.js";

const db = new Database("./fixtures/cn_data.db");

// Add the epoch column
// db.exec("ALTER TABLE daily ADD COLUMN epoch INTEGER;");

// Prepare statements
const selectStmt = db.prepare("SELECT rowid, date FROM daily");
const updateStmt = db.prepare("UPDATE daily SET epoch = ? WHERE rowid = ?");

// Fetch all rows first
const rows = selectStmt.all();

// Update each row
for (const row of rows) {
  // Assume date is in YYYY-MM-DD format, treat as midnight in Asia/Shanghai
  const date = new Date(row.date + "T00:00:00+08:00");
  const epoch = toEpoch(date, { epochUnit: "days", timezone: "Asia/Shanghai" });
  updateStmt.run(epoch, row.rowid);
}

console.log("Epoch column added and populated.");
db.close();
