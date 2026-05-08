const { query } = require('./src/config/db');

async function check() {
  try {
    const res = await query("SHOW TABLES");
    console.log(res);
  } catch (e) {
    console.error(e);
  }
}

check();
