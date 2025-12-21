-- Create characters table for storing generated character profiles
CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    archetype TEXT,
    core_motivation TEXT,
    inner_trap TEXT,
    psychological_wound TEXT,
    coping_mechanism TEXT,
    deepest_fear TEXT,
    breaking_point TEXT,
    occupation_role TEXT,
    affiliations TEXT[],
    visual_signature TEXT,
    public_goal TEXT,
    hidden_goal TEXT,
    defining_moment TEXT,
    family_background TEXT,
    special_skill TEXT,
    quirks TEXT[],
    moral_stance TEXT,
    potential_arc TEXT,
    qdrant_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);
CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);

-- Enable Row Level Security for characters
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see characters for their own projects
CREATE POLICY "Users can view own project characters" ON characters
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = characters.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can insert characters for their own projects
CREATE POLICY "Users can insert own project characters" ON characters
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = characters.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create worldbuilding table for storing worldbuilding elements
CREATE TABLE IF NOT EXISTS worldbuilding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    element_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    attributes JSONB,
    qdrant_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worldbuilding_project_id ON worldbuilding(project_id);
CREATE INDEX IF NOT EXISTS idx_worldbuilding_element_type ON worldbuilding(element_type);

-- Enable Row Level Security for worldbuilding
ALTER TABLE worldbuilding ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see worldbuilding for their own projects
CREATE POLICY "Users can view own project worldbuilding" ON worldbuilding
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = worldbuilding.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can insert worldbuilding for their own projects
CREATE POLICY "Users can insert own project worldbuilding" ON worldbuilding
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = worldbuilding.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create outlines table for storing plot outlines
CREATE TABLE IF NOT EXISTS outlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    structure_type TEXT NOT NULL,
    total_scenes INTEGER NOT NULL,
    target_word_count INTEGER,
    scenes JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outlines_project_id ON outlines(project_id);

-- Enable Row Level Security for outlines
ALTER TABLE outlines ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see outlines for their own projects
CREATE POLICY "Users can view own project outlines" ON outlines
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = outlines.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can insert outlines for their own projects
CREATE POLICY "Users can insert own project outlines" ON outlines
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = outlines.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create drafts table for storing scene drafts
CREATE TABLE IF NOT EXISTS drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    title TEXT,
    setting_description TEXT,
    sensory_details JSONB,
    narrative_content TEXT NOT NULL,
    dialogue_entries JSONB,
    subtext_layer TEXT,
    emotional_shift TEXT,
    word_count INTEGER,
    show_dont_tell_ratio DECIMAL(3,2),
    status TEXT DEFAULT 'draft',
    revision_count INTEGER DEFAULT 0,
    qdrant_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_project_id ON drafts(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drafts_project_scene ON drafts(project_id, scene_number);

-- Enable Row Level Security for drafts
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see drafts for their own projects
CREATE POLICY "Users can view own project drafts" ON drafts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = drafts.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can insert drafts for their own projects
CREATE POLICY "Users can insert own project drafts" ON drafts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = drafts.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can update drafts for their own projects
CREATE POLICY "Users can update own project drafts" ON drafts
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = drafts.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create trigger to auto-update updated_at for drafts
DROP TRIGGER IF EXISTS update_drafts_updated_at ON drafts;
CREATE TRIGGER update_drafts_updated_at
    BEFORE UPDATE ON drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create critiques table for storing critic feedback
CREATE TABLE IF NOT EXISTS critiques (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    overall_score DECIMAL(3,1) NOT NULL,
    approved BOOLEAN NOT NULL DEFAULT FALSE,
    feedback_items JSONB NOT NULL,
    strengths TEXT[],
    weaknesses TEXT[],
    revision_required BOOLEAN NOT NULL DEFAULT TRUE,
    revision_focus TEXT[],
    creative_risk_assessment TEXT,
    psychological_alignment TEXT,
    complexity_assessment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_critiques_project_id ON critiques(project_id);
CREATE INDEX IF NOT EXISTS idx_critiques_draft_id ON critiques(draft_id);

-- Enable Row Level Security for critiques
ALTER TABLE critiques ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see critiques for their own projects
CREATE POLICY "Users can view own project critiques" ON critiques
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = critiques.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can insert critiques for their own projects
CREATE POLICY "Users can insert own project critiques" ON critiques
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = critiques.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Grant permissions to authenticated users
GRANT SELECT, INSERT ON characters TO authenticated;
GRANT SELECT, INSERT ON worldbuilding TO authenticated;
GRANT SELECT, INSERT ON outlines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON drafts TO authenticated;
GRANT SELECT, INSERT ON critiques TO authenticated;

-- Grant read permissions to anon (if needed later)
GRANT SELECT ON characters TO anon;
GRANT SELECT ON worldbuilding TO anon;
GRANT SELECT ON outlines TO anon;
GRANT SELECT ON drafts TO anon;
GRANT SELECT ON critiques TO anon;
