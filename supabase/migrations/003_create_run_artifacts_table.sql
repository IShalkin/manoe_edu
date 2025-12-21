-- Create run_artifacts table for storing phase outputs for phase-based regeneration
-- This table stores artifacts from each phase of generation, allowing resumption from any phase
CREATE TABLE IF NOT EXISTS run_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_run_artifacts_project_id ON run_artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_id ON run_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_phase ON run_artifacts(phase);
CREATE UNIQUE INDEX IF NOT EXISTS idx_run_artifacts_run_phase_type ON run_artifacts(run_id, phase, artifact_type);

-- Enable Row Level Security for run_artifacts
ALTER TABLE run_artifacts ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see artifacts for their own projects
CREATE POLICY "Users can view own project artifacts" ON run_artifacts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = run_artifacts.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can insert artifacts for their own projects
CREATE POLICY "Users can insert own project artifacts" ON run_artifacts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = run_artifacts.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can update artifacts for their own projects
CREATE POLICY "Users can update own project artifacts" ON run_artifacts
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = run_artifacts.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can delete artifacts for their own projects
CREATE POLICY "Users can delete own project artifacts" ON run_artifacts
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = run_artifacts.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON run_artifacts TO authenticated;

-- Grant read permissions to anon (if needed later)
GRANT SELECT ON run_artifacts TO anon;

-- Add comment explaining the table
COMMENT ON TABLE run_artifacts IS 'Stores phase outputs for each generation run, enabling phase-based regeneration';
COMMENT ON COLUMN run_artifacts.phase IS 'Phase name: genesis, characters, worldbuilding, outlining, advanced_planning, drafting, polish';
COMMENT ON COLUMN run_artifacts.artifact_type IS 'Type of artifact: narrative_possibility, characters, worldbuilding, outline, advanced_planning, draft_scene_N, polished_scene_N';
