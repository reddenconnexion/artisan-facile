import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpqcmfsxrpctaiaydhsu.supabase.co';
const supabaseKey = 'sb_publishable_2P8j1ssyYxqZQlFr4IPU5A_XNlkd9FT';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking profiles table structure...');

    // Try to select the new columns for a random user (or just limit 1)
    const { data, error } = await supabase
        .from('profiles')
        .select('id, professional_email, website, logo_url')
        .limit(1);

    if (error) {
        console.error('Schema Check Error:', error);
        console.log('It seems the columns might be missing.');
    } else {
        console.log('Schema Check Success. Columns exist.');
        console.log('Data sample:', data);
    }
}

checkSchema();
