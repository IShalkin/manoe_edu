import { Controller, Get, PathParams, QueryParams } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { SupabaseService } from "../services/SupabaseService";

@Controller("/memory")
@Tags("Memory")
@Description("Vector memory retrieval endpoints")
export class MemoryController {
  @Inject()
  private supabaseService: SupabaseService;

  @Get("/characters/:projectId")
  @Summary("Get project characters")
  @Description("Retrieve all character profiles for a project")
  async getCharacters(
    @PathParams("projectId") projectId: string
  ): Promise<{ characters: unknown[]; count: number }> {
    const characters = await this.supabaseService.getCharacters(projectId);
    return {
      characters,
      count: characters.length,
    };
  }

  @Get("/characters/:projectId/search")
  @Summary("Search characters")
  @Description("Search characters by semantic similarity")
  async searchCharacters(
    @PathParams("projectId") projectId: string,
    @QueryParams("query") query: string,
    @QueryParams("limit") limit: number = 5
  ): Promise<{ results: unknown[] }> {
    // This would call Qdrant through the orchestrator
    // For now, return from Supabase with basic filtering
    const characters = await this.supabaseService.getCharacters(projectId);
    const filtered = characters.filter((c: { name?: string; archetype?: string }) => 
      c.name?.toLowerCase().includes(query.toLowerCase()) ||
      c.archetype?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, limit);
    
    return { results: filtered };
  }

  @Get("/worldbuilding/:projectId")
  @Summary("Get worldbuilding elements")
  @Description("Retrieve all worldbuilding elements for a project")
  async getWorldbuilding(
    @PathParams("projectId") projectId: string,
    @QueryParams("type") elementType?: string
  ): Promise<{ elements: unknown[]; count: number }> {
    const elements = await this.supabaseService.getWorldbuilding(projectId, elementType);
    return {
      elements,
      count: elements.length,
    };
  }

  @Get("/scenes/:projectId")
  @Summary("Get project scenes")
  @Description("Retrieve all scene drafts for a project")
  async getScenes(
    @PathParams("projectId") projectId: string
  ): Promise<{ scenes: unknown[]; count: number }> {
    const drafts = await this.supabaseService.getDrafts(projectId);
    return {
      scenes: drafts,
      count: drafts.length,
    };
  }

  @Get("/scenes/:projectId/:sceneNumber")
  @Summary("Get specific scene")
  @Description("Retrieve a specific scene draft")
  async getScene(
    @PathParams("projectId") projectId: string,
    @PathParams("sceneNumber") sceneNumber: number
  ): Promise<unknown> {
    const drafts = await this.supabaseService.getDrafts(projectId);
    const scene = drafts.find((d: { scene_number: number }) => d.scene_number === sceneNumber);
    
    if (!scene) {
      throw new Error(`Scene ${sceneNumber} not found`);
    }
    
    return scene;
  }

  @Get("/outline/:projectId")
  @Summary("Get plot outline")
  @Description("Retrieve the plot outline for a project")
  async getOutline(
    @PathParams("projectId") projectId: string
  ): Promise<unknown> {
    const outline = await this.supabaseService.getOutline(projectId);
    
    if (!outline) {
      throw new Error("Outline not found");
    }
    
    return outline;
  }

  @Get("/critiques/:projectId")
  @Summary("Get scene critiques")
  @Description("Retrieve all critiques for a project")
  async getCritiques(
    @PathParams("projectId") projectId: string
  ): Promise<{ critiques: unknown[]; count: number }> {
    const critiques = await this.supabaseService.getCritiques(projectId);
    return {
      critiques,
      count: critiques.length,
    };
  }

  @Get("/audit/:projectId")
  @Summary("Get audit logs")
  @Description("Retrieve agent audit logs for a project")
  async getAuditLogs(
    @PathParams("projectId") projectId: string,
    @QueryParams("agent") agentName?: string,
    @QueryParams("limit") limit: number = 50
  ): Promise<{ logs: unknown[]; count: number }> {
    const logs = await this.supabaseService.getAuditLogs(projectId, agentName, limit);
    return {
      logs,
      count: logs.length,
    };
  }
}
