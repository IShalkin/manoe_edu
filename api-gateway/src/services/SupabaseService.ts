import { Service } from "@tsed/di";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

interface Project {
  id: string;
  user_id?: string;
  seed_idea: string;
  moral_compass: string;
  target_audience?: string;
  theme_core?: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface Character {
  id: string;
  project_id: string;
  name: string;
  archetype?: string;
  core_motivation?: string;
  inner_trap?: string;
  psychological_wound?: string;
  visual_signature?: string;
  qdrant_id?: string;
  created_at: string;
}

interface Outline {
  id: string;
  project_id: string;
  structure_type: string;
  scenes: unknown[];
  created_at: string;
}

interface Draft {
  id: string;
  project_id: string;
  scene_number: number;
  content: string;
  sensory_details?: unknown;
  subtext_layer?: string;
  emotional_shift?: string;
  status: string;
  revision_count: number;
  created_at: string;
}

interface AuditLog {
  id: string;
  project_id: string;
  agent_name: string;
  action: string;
  input_summary?: string;
  output_summary?: string;
  token_usage?: unknown;
  duration_ms?: number;
  created_at: string;
}

@Service()
export class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor() {
    this.connect();
  }

  private connect(): void {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn("Supabase credentials not configured");
      return;
    }

    this.client = createClient(supabaseUrl, supabaseKey);
    console.log("Connected to Supabase");
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error("Supabase client not initialized");
    }
    return this.client;
  }

  async healthCheck(): Promise<boolean> {
    const client = this.getClient();
    const { error } = await client.from("projects").select("id").limit(1);
    if (error) {
      throw new Error(`Supabase health check failed: ${error.message}`);
    }
    return true;
  }

  // ========================================================================
  // Project Operations
  // ========================================================================

  async createProject(data: Partial<Project>): Promise<Project> {
    const client = this.getClient();
    const { data: project, error } = await client
      .from("projects")
      .insert(data)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }

    return project;
  }

  async getProject(id: string): Promise<Project | null> {
    const client = this.getClient();
    const { data: project, error } = await client
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get project: ${error.message}`);
    }

    return project;
  }

  async updateProjectStatus(id: string, status: string): Promise<void> {
    const client = this.getClient();
    const { error } = await client
      .from("projects")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to update project status: ${error.message}`);
    }
  }

  async listProjects(
    page: number = 1,
    limit: number = 10
  ): Promise<{ projects: Project[]; total: number }> {
    const client = this.getClient();
    const offset = (page - 1) * limit;

    const { data: projects, error, count } = await client
      .from("projects")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to list projects: ${error.message}`);
    }

    return {
      projects: projects || [],
      total: count || 0,
    };
  }

  async deleteProject(id: string): Promise<void> {
    const client = this.getClient();
    const { error } = await client.from("projects").delete().eq("id", id);

    if (error) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  // ========================================================================
  // Narrative Possibility Operations
  // ========================================================================

  async getNarrativePossibility(projectId: string): Promise<unknown | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from("narrative_possibilities")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get narrative possibility: ${error.message}`);
    }

    return data;
  }

  async saveNarrativePossibility(
    projectId: string,
    narrative: unknown
  ): Promise<void> {
    const client = this.getClient();
    const { error } = await client.from("narrative_possibilities").upsert({
      project_id: projectId,
      ...narrative as object,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to save narrative possibility: ${error.message}`);
    }
  }

  // ========================================================================
  // Character Operations
  // ========================================================================

  async getCharacters(projectId: string): Promise<Character[]> {
    const client = this.getClient();
    const { data: characters, error } = await client
      .from("characters")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to get characters: ${error.message}`);
    }

    return characters || [];
  }

  async saveCharacter(projectId: string, character: Partial<Character>): Promise<Character> {
    const client = this.getClient();
    const { data, error } = await client
      .from("characters")
      .insert({
        project_id: projectId,
        ...character,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save character: ${error.message}`);
    }

    return data;
  }

  // ========================================================================
  // Worldbuilding Operations
  // ========================================================================

  async getWorldbuilding(
    projectId: string,
    elementType?: string
  ): Promise<unknown[]> {
    const client = this.getClient();
    let query = client
      .from("worldbuilding")
      .select("*")
      .eq("project_id", projectId);

    if (elementType) {
      query = query.eq("element_type", elementType);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to get worldbuilding: ${error.message}`);
    }

    return data || [];
  }

  // ========================================================================
  // Outline Operations
  // ========================================================================

  async getOutline(projectId: string): Promise<Outline | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from("outlines")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get outline: ${error.message}`);
    }

    return data;
  }

  async saveOutline(projectId: string, outline: Partial<Outline>): Promise<void> {
    const client = this.getClient();
    const { error } = await client.from("outlines").upsert({
      project_id: projectId,
      ...outline,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to save outline: ${error.message}`);
    }
  }

  // ========================================================================
  // Draft Operations
  // ========================================================================

  async getDrafts(projectId: string): Promise<Draft[]> {
    const client = this.getClient();
    const { data: drafts, error } = await client
      .from("drafts")
      .select("*")
      .eq("project_id", projectId)
      .order("scene_number", { ascending: true });

    if (error) {
      throw new Error(`Failed to get drafts: ${error.message}`);
    }

    return drafts || [];
  }

  async saveDraft(projectId: string, draft: Partial<Draft>): Promise<Draft> {
    const client = this.getClient();
    const { data, error } = await client
      .from("drafts")
      .upsert({
        project_id: projectId,
        ...draft,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save draft: ${error.message}`);
    }

    return data;
  }

  // ========================================================================
  // Critique Operations
  // ========================================================================

  async getCritiques(projectId: string): Promise<unknown[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from("critiques")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to get critiques: ${error.message}`);
    }

    return data || [];
  }

  // ========================================================================
  // Audit Log Operations
  // ========================================================================

  async getAuditLogs(
    projectId: string,
    agentName?: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    const client = this.getClient();
    let query = client
      .from("audit_logs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (agentName) {
      query = query.eq("agent_name", agentName);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }

    return data || [];
  }

  async saveAuditLog(log: Partial<AuditLog>): Promise<void> {
    const client = this.getClient();
    const { error } = await client.from("audit_logs").insert({
      ...log,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to save audit log: ${error.message}`);
    }
  }

  // ========================================================================
  // Run Artifact Operations (for StorytellerOrchestrator)
  // ========================================================================

  /**
   * Save a run artifact (narrative, characters, worldbuilding, outline, draft, etc.)
   */
  async saveRunArtifact(params: {
    runId: string;
    projectId: string;
    artifactType: string;
    content: unknown;
  }): Promise<void> {
    const client = this.getClient();
    const { error } = await client.from("run_artifacts").upsert({
      run_id: params.runId,
      project_id: params.projectId,
      artifact_type: params.artifactType,
      content: params.content,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to save run artifact: ${error.message}`);
    }
  }

  /**
   * Get run artifacts by run ID
   */
  async getRunArtifacts(runId: string): Promise<unknown[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from("run_artifacts")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to get run artifacts: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get a specific run artifact by type
   */
  async getRunArtifact(
    runId: string,
    artifactType: string
  ): Promise<unknown | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from("run_artifacts")
      .select("*")
      .eq("run_id", runId)
      .eq("artifact_type", artifactType)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get run artifact: ${error.message}`);
    }

    return data;
  }
}
