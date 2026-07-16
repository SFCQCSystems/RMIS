const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const config = fs.readFileSync('config.js', 'utf8');
const matchUrl = config.match(/SUPABASE_URL = '(.*?)'/);
const matchKey = config.match(/SUPABASE_ANON_KEY = '(.*?)'/);
const supabase = createClient(matchUrl[1], matchKey[1]);
async function test() {
  const { data: adminAuth, error: err1 } = await supabase.auth.signInWithPassword({ email: 'admin', password: 'admin' });
  if (err1) { console.log('Login failed', err1); return; }
  console.log('Logged in as Admin');
  const { data: users } = await supabase.from('profiles').select('*').eq('role', 'requester').limit(1);
  const reqUser = users[0].id;
  console.log('Requester ID:', reqUser);
  const reqId = require('crypto').randomUUID();
  const { error: err2 } = await supabase.from('requests').insert([{ id: reqId, request_no: 9999, request_year: 2026, request_date: '2026-07-16', customer_name: 'Test', status: 'Approved', requester_id: reqUser }]);
  if (err2) { console.log('Failed inserting request', err2); return; }
  console.log('Insert request OK');
  const itemId = require('crypto').randomUUID();
  const { error: err3 } = await supabase.from('request_items').insert([{ id: itemId, request_id: reqId, product_name: 'Test', batch_number: '123', quantity: '10' }]);
  if (err3) { console.log('Failed inserting item', err3); return; }
  console.log('Insert item OK');
}
test();
