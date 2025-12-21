import { Controller, Get, Post, Put, Delete, PathParams, BodyParams, QueryParams } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { JobQueueService } from "../services/JobQueueService";
import { SupabaseService } from "../services/SupabaseService";
import { StoryProjectDTO, ProjectResponseDTO, NarrativePossibilityDTO } from "../models/ProjectModels";

@Controller("/project")
@Tags("Project")
@Description("Project management endpoints")
export class ProjectController {
  @Inject()
  private jobQueueService: JobQueueService;

  @Inject()
  private supabaseService: SupabaseService;

  @Post("/init")
  @Summary("Initialize a new narrative project")
  @Description("Creates a new project and triggers the Genesis phase with the Architect agent")
  @Returns(201, ProjectResponseDTO)
  async initProject(@BodyParams() body: StoryProjectDTO): Promise<ProjectResponseDTO> {
    // Create project in Supabase
    const project = await this.supabaseService.createProject({
      seed_idea: body.seedIdea,
      moral_compass: body.moralCompass,
      target_audience: body.targetAudience,
      theme_core: body.themeCore,
      status: "genesis",
    });

    // Enqueue Genesis job
    await this.jobQueueService.enqueueJob({
      jobId: `genesis-${project.id}`,
      projectId: project.id,
      phase: "genesis",
      inputData: {
        seed_idea: body.seedIdea,
        moral_compass: body.moralCompass,
        target_audience: body.targetAudience,
        theme_core: body.themeCore,
        tone_style_references: body.toneStyleReferences,
        custom_moral_system: body.customMoralSystem,
      },
    });

    return {
      id: project.id,
      status: "genesis",
      message: "Project initialized. Genesis phase started.",
      createdAt: project.created_at,
    };
  }

  @Get("/:id")
  @Summary("Get project details")
  @Description("Retrieve project status and details")
  @Returns(200, ProjectResponseDTO)
  async getProject(@PathParams("id") id: string): Promise<ProjectResponseDTO> {
    const project = await this.supabaseService.getProject(id);
    
    if (!project) {
      throw new Error("Project not found");
    }

    return {
      id: project.id,
      status: project.status,
      seedIdea: project.seed_idea,
      moralCompass: project.moral_compass,
      targetAudience: project.target_audience,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    };
  }

    @Get("/:id/narrative")
    @Summary("Get narrative possibility")
    @Description("Retrieve the generated narrative possibility for a project")
    @Returns(200, NarrativePossibilityDTO)
    async getNarrativePossibility(@PathParams("id") id: string): Promise<NarrativePossibilityDTO | null> {
      return await this.supabaseService.getNarrativePossibility(id) as NarrativePossibilityDTO | null;
    }

  @Post("/:id/approve")
  @Summary("Approve current phase and proceed")
  @Description("Approve the current phase output and trigger the next phase")
  @Returns(200, ProjectResponseDTO)
  async approvePhase(
    @PathParams("id") id: string,
    @BodyParams("phase") phase: string
  ): Promise<ProjectResponseDTO> {
    const project = await this.supabaseService.getProject(id);
    
    if (!project) {
      throw new Error("Project not found");
    }

    // Determine next phase
    const phaseOrder = ["genesis", "characters", "outlining", "drafting", "critique", "completed"];
    const currentIndex = phaseOrder.indexOf(project.status);
    const nextPhase = phaseOrder[currentIndex + 1];

    if (!nextPhase || nextPhase === "completed") {
      return {
        id: project.id,
        status: "completed",
        message: "Project completed!",
      };
    }

    // Update project status
    await this.supabaseService.updateProjectStatus(id, nextPhase);

    // Enqueue next phase job
    await this.jobQueueService.enqueueJob({
      jobId: `${nextPhase}-${id}`,
      projectId: id,
      phase: nextPhase,
      inputData: await this._getPhaseInputData(id, nextPhase),
    });

    return {
      id: project.id,
      status: nextPhase,
      message: `Phase approved. ${nextPhase} phase started.`,
    };
  }

  @Get("/")
  @Summary("List all projects")
  @Description("Get a paginated list of all projects")
  async listProjects(
    @QueryParams("page") page: number = 1,
    @QueryParams("limit") limit: number = 10
  ): Promise<{ projects: ProjectResponseDTO[]; total: number }> {
    const { projects, total } = await this.supabaseService.listProjects(page, limit);
    
    return {
      projects: projects.map((p) => ({
        id: p.id,
        status: p.status,
        seedIdea: p.seed_idea,
        moralCompass: p.moral_compass,
        createdAt: p.created_at,
      })),
      total,
    };
  }

  @Delete("/:id")
  @Summary("Delete a project")
  @Description("Delete a project and all associated data")
  @Returns(200)
  async deleteProject(@PathParams("id") id: string): Promise<{ success: boolean }> {
    await this.supabaseService.deleteProject(id);
    return { success: true };
  }

  private async _getPhaseInputData(projectId: string, phase: string): Promise<Record<string, unknown>> {
    const project = await this.supabaseService.getProject(projectId);
    
    switch (phase) {
      case "characters":
        const narrative = await this.supabaseService.getNarrativePossibility(projectId);
        return {
          narrative_possibility: narrative,
          moral_compass: project?.moral_compass,
          target_audience: project?.target_audience,
        };
      case "outlining":
        const characters = await this.supabaseService.getCharacters(projectId);
        const narrativeForOutline = await this.supabaseService.getNarrativePossibility(projectId);
        return {
          narrative_possibility: narrativeForOutline,
          characters,
          moral_compass: project?.moral_compass,
        };
      case "drafting":
        const outline = await this.supabaseService.getOutline(projectId);
        return {
          outline,
          moral_compass: project?.moral_compass,
        };
      case "critique":
        const drafts = await this.supabaseService.getDrafts(projectId);
        return {
          drafts,
          moral_compass: project?.moral_compass,
        };
      default:
        return {};
    }
  }
}
