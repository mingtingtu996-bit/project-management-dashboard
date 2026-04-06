require('dotenv').config({ path: '.env' });
console.log('DB_PASSWORD loaded:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.substring(0, 4) + '...' : 'NOT LOADED');
const { Pool } = require('pg');
const p = new Pool({
  host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000
});
p.query('SELECT id, username, display_name, role FROM public.users WHERE username = $1', ['admin'])
  .then(r => { console.log('Result:', JSON.stringify(r.rows)); p.end(); })
  .catch(e => { console.log('Error:', e.message); p.end(); });
