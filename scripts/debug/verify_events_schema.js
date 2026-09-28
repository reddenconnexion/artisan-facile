
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchemaAndData() {
    console.log("Checking events table...");
    const { data: events, error } = await supabase.from('events').select('*').limit(5);

    if (error) {
        console.error("Error fetching events:", error);
        return;
    }

    if (events.length > 0) {
        console.log("Sample event:", events[0]);
        if ('client_id' in events[0]) {
            console.log("Column 'client_id' EXISTS.");
        } else {
            console.log("Column 'client_id' MISSING in returned data (might be missing in DB or schema cache).");
        }
    } else {
        console.log("No events found to check structure.");
    }
}

checkSchemaAndData();
