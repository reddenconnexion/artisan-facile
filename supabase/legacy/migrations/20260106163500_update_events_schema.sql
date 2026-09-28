-- Migration to add support for full calendar features in the 'events' table
-- Needed for the AI Assistant's calendar intent

-- Add start_time and end_time for precise scheduling
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS start_time timestamp with time zone,
ADD COLUMN IF NOT EXISTS end_time timestamp with time zone;

-- Add description for event details
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS description text;

-- Add type to distinguish between meetings, blocks, etc.
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS type text DEFAULT 'meeting';

-- Add color for UI styling (e.g. 'bg-blue-500')
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS color text DEFAULT 'bg-blue-500';

-- (Optional) Data Backfill:
-- If existing events have 'date' but no 'start_time', copy 'date' to 'start_time'
UPDATE events 
SET start_time = date 
WHERE start_time IS NULL AND date IS NOT NULL;
