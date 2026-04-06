require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function runMigration() {
  const sql = fs.readFileSync('./migrations/027_add_wbs_templates_missing_columns.sql', 'utf8');

  const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    if (!stmt) continue;
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt });
      if (error) {
        console.log('Error:', stmt.substring(0, 60), '->', error.message.substring(0, 80));
      } else {
        console.log('OK:', stmt.substring(0, 70));
      }
    } catch(e) {
      console.log('Exception:', e.message.substring(0, 120));
    }
  }

  console.log('\n=== Verify ===');
  const { data } = await supabase
    .from('wbs_templates')
    .select('id, template_name, status, is_public, is_builtin, node_count, category, template_data')
    .order('created_at', { ascending: false });
  console.log('Templates with new columns:', data?.length);
  data?.forEach(t => console.log(JSON.stringify({
    name: t.template_name,
    status: t.status,
    is_public: t.is_public,
    node_count: t.node_count,
    has_template_data: t.template_data !== null
  })));
}

runMigration().catch(console.error);
