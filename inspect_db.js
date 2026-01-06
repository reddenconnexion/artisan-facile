
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectProfile() {
    const { data, error } = await supabase
        .from('price_library')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Profile Schema Keys:", data && data.length > 0 ? Object.keys(data[0]) : "No profiles found");
        if (data && data.length > 0) {
            console.log("Sample Profile:", data[0]);
        }
    }
}

inspectProfile();
