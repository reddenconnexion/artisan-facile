
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env vars provided
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = fs.readFileSync(envPath, 'utf8');
const env = {};
envConfig.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchemaAndData() {
    console.log("Checking events table...");
    // Only select the new column to see if it errors
    const { data: events, error } = await supabase.from('events').select('id, client_id').limit(1);

    if (error) {
        console.error("Error fetching events:", error.message, error.code);
        // code 42703 is undefined_column
        return;
    }

    console.log("Column 'client_id' access successful.");

    // Now check if there are unlinked events
    const { count } = await supabase.from('events').select('*', { count: 'exact', head: true }).is('client_id', null);
    console.log(`Events with null client_id: ${count}`);
}

checkSchemaAndData();
