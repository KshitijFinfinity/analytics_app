require("dotenv").config({ path: ".env" });
const pool = require("./db");

async function main() {
  const query = `
    SELECT event_name, page, country, city, region, timezone, created_at
    FROM events
    WHERE event_name = 'location_test_event'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query);
  console.log(JSON.stringify(result.rows[0] || null));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  await pool.end();
  process.exit(1);
});
