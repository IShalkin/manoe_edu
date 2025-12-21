-- Create projects table for storing user projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    seed_idea TEXT NOT NULL,
    moral_compass TEXT NOT NULL DEFAULT 'ambiguous',
    target_audience TEXT,
    themes TEXT,
    run_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'error')),
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster user queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_run_id ON projects(run_id) WHERE run_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own projects
CREATE POLICY "Users can view own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);

-- Create policy: Users can insert their own projects
CREATE POLICY "Users can insert own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own projects
CREATE POLICY "Users can update own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id);

-- Create policy: Users can delete their own projects
CREATE POLICY "Users can delete own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create generation_events table for storing agent chat history
CREATE TABLE IF NOT EXISTS generation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    agent TEXT,
    content TEXT,
    data JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster event queries
CREATE INDEX IF NOT EXISTS idx_generation_events_project_id ON generation_events(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_events_timestamp ON generation_events(timestamp);

-- Enable Row Level Security for generation_events
ALTER TABLE generation_events ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see events for their own projects
CREATE POLICY "Users can view own project events" ON generation_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = generation_events.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can insert events for their own projects
CREATE POLICY "Users can insert own project events" ON generation_events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = generation_events.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO authenticated;
GRANT SELECT, INSERT ON generation_events TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant read permissions to anon for public data (if needed later)
GRANT SELECT ON projects TO anon;
GRANT SELECT ON generation_events TO anon;
