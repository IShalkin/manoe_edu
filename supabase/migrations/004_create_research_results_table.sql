-- Create research_results table for storing market research (Eternal Memory)
-- This table stores research results that can be reused across projects
CREATE TABLE IF NOT EXISTS research_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    model TEXT,
    seed_idea TEXT NOT NULL,
    target_audience TEXT,
    themes TEXT[],
    moral_compass TEXT,
    content TEXT NOT NULL,
    prompt_context TEXT,
    citations JSONB,
    search_results JSONB,
    web_searches JSONB,
    usage JSONB,
    qdrant_point_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_research_results_user_id ON research_results(user_id);
CREATE INDEX IF NOT EXISTS idx_research_results_project_id ON research_results(project_id);
CREATE INDEX IF NOT EXISTS idx_research_results_created_at ON research_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_results_provider ON research_results(provider);

-- Full-text search index on seed_idea for text-based similarity
CREATE INDEX IF NOT EXISTS idx_research_results_seed_idea_fts 
    ON research_results USING gin(to_tsvector('english', seed_idea));

-- Enable Row Level Security
ALTER TABLE research_results ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own research results
CREATE POLICY "Users can view own research results" ON research_results
    FOR SELECT USING (auth.uid() = user_id);

-- Create policy: Users can insert their own research results
CREATE POLICY "Users can insert own research results" ON research_results
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own research results
CREATE POLICY "Users can update own research results" ON research_results
    FOR UPDATE USING (auth.uid() = user_id);

-- Create policy: Users can delete their own research results
CREATE POLICY "Users can delete own research results" ON research_results
    FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON research_results TO authenticated;

-- Add comment explaining the table
COMMENT ON TABLE research_results IS 'Stores market research results for Eternal Memory - reusable across projects';
COMMENT ON COLUMN research_results.prompt_context IS 'Distilled summary (~1500 tokens) for injection into agent prompts';
COMMENT ON COLUMN research_results.qdrant_point_id IS 'Reference to vector embedding in Qdrant for similarity search';
