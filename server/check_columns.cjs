require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  // Test 1: SELECT * - does it include status?
  const { data: all, error: err1 } = await supabase.from('wbs_templates').select('*').limit(1);
  console.log('SELECT * error:', err1?.message || 'none');
  console.log('Columns in SELECT * result:', Object.keys(all?.[0] || {}).sort().join(', '));

  // Test 2: Check if status column exists
  const { data: withStatus, error: err2 } = await supabase.from('wbs_templates').select('id, template_name, status').limit(1);
  console.log('SELECT status error:', err2?.message || 'none');
  console.log('status value:', withStatus?.[0]?.status);

  // Test 3: Check the actual count via API endpoint logic
  const { data: templates, error: err3 } = await supabase
    .from('wbs_templates')
    .select('id, template_name, template_type, is_default, deleted_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  console.log('\nAll templates with deleted_at=null:', templates?.length);
  templates?.forEach(t => {
    const isActive = t.deleted_at === null;
    const isDraft = t.is_default === true;
    const status = !isActive ? 'disabled' : (isDraft ? 'draft' : 'published');
    console.log(JSON.stringify({ name: t.template_name, is_default: t.is_default, deleted_at: t.deleted_at, computed_status: status }));
  });
}

run().catch(console.error);
