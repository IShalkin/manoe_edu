-- Add output_format column to projects table
-- Supports: short_story, novel_chapter, screenplay, novella
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS output_format TEXT DEFAULT 'short_story'
CHECK (output_format IN ('short_story', 'novel_chapter', 'screenplay', 'novella'));

-- Add reader_sensibilities column to projects table (JSONB for flexible structure)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS reader_sensibilities JSONB DEFAULT NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
