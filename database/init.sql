-- MANOE Database Schema
-- PostgreSQL initialization script for Docker deployment

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Projects Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    seed_idea TEXT NOT NULL,
    moral_compass VARCHAR(50) NOT NULL,
    target_audience TEXT,
    theme_core TEXT[],
    tone_style_references TEXT[],
    custom_moral_system TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'genesis',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- =============================================================================
-- Narrative Possibilities Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS narrative_possibilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plot_summary TEXT NOT NULL,
    setting_description TEXT NOT NULL,
    main_conflict TEXT NOT NULL,
    potential_characters TEXT[],
    possible_twists TEXT[],
    thematic_elements TEXT[],
    moral_compass_application TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_narrative_possibilities_project ON narrative_possibilities(project_id);

-- =============================================================================
-- Characters Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    archetype VARCHAR(100),
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
    qdrant_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_characters_project ON characters(project_id);
CREATE INDEX idx_characters_name ON characters(name);

-- =============================================================================
-- Worldbuilding Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS worldbuilding (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    element_type VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    attributes JSONB,
    qdrant_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_worldbuilding_project ON worldbuilding(project_id);
CREATE INDEX idx_worldbuilding_type ON worldbuilding(element_type);

-- =============================================================================
-- Outlines Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS outlines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    structure_type VARCHAR(100) NOT NULL,
    total_scenes INTEGER NOT NULL,
    target_word_count INTEGER,
    scenes JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_outlines_project ON outlines(project_id);

-- =============================================================================
-- Drafts Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    title VARCHAR(255),
    setting_description TEXT,
    sensory_details JSONB,
    narrative_content TEXT NOT NULL,
    dialogue_entries JSONB,
    subtext_layer TEXT,
    emotional_shift TEXT,
    word_count INTEGER,
    show_dont_tell_ratio DECIMAL(3,2),
    status VARCHAR(50) DEFAULT 'draft',
    revision_count INTEGER DEFAULT 0,
    qdrant_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_drafts_project ON drafts(project_id);
CREATE UNIQUE INDEX idx_drafts_project_scene ON drafts(project_id, scene_number);

-- =============================================================================
-- Critiques Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS critiques (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_critiques_project ON critiques(project_id);
CREATE INDEX idx_critiques_draft ON critiques(draft_id);

-- =============================================================================
-- Audit Logs Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_name VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    token_usage JSONB,
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_project ON audit_logs(project_id);
CREATE INDEX idx_audit_logs_agent ON audit_logs(agent_name);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- =============================================================================
-- Users Table (optional, for multi-user support)
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(255),
    llm_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- =============================================================================
-- API Keys Table (for BYOK management)
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    encrypted_key TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_provider ON api_keys(provider);

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drafts_updated_at
    BEFORE UPDATE ON drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Research Results Table (for Eternal Memory / reusable research)
-- =============================================================================
CREATE TABLE IF NOT EXISTS research_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    seed_idea TEXT NOT NULL,
    target_audience TEXT,
    themes TEXT[],
    moral_compass VARCHAR(50),
    content TEXT NOT NULL,
    citations JSONB,
    search_results JSONB,
    web_searches JSONB,
    usage JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_research_results_project ON research_results(project_id);
CREATE INDEX idx_research_results_user ON research_results(user_id);
CREATE INDEX idx_research_results_created ON research_results(created_at DESC);
CREATE INDEX idx_research_results_seed_idea ON research_results USING gin(to_tsvector('english', seed_idea));

-- =============================================================================
-- Initial Data (optional)
-- =============================================================================

-- You can add initial seed data here if needed
