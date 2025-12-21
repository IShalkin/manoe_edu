import { Controller, Post, PathParams, BodyParams, Get } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { JobQueueService } from "../services/JobQueueService";
import { SupabaseService } from "../services/SupabaseService";

@Controller("/generate")
@Tags("Generation")
@Description("Narrative generation endpoints")
export class GenerationController {
  @Inject()
  private jobQueueService: JobQueueService;

  @Inject()
  private supabaseService: SupabaseService;

  @Post("/characters/:projectId")
  @Summary("Generate character profiles")
  @Description("Trigger character generation for a project")
  @Returns(202)
  async generateCharacters(
    @PathParams("projectId") projectId: string,
    @BodyParams() options?: { regenerate?: boolean }
  ): Promise<{ jobId: string; message: string }> {
    const project = await this.supabaseService.getProject(projectId);
    
    if (!project) {
      throw new Error("Project not found");
    }

    const narrative = await this.supabaseService.getNarrativePossibility(projectId);
    
    if (!narrative) {
      throw new Error("Narrative possibility not found. Complete Genesis phase first.");
    }

    const jobId = `characters-${projectId}-${Date.now()}`;
    
    await this.jobQueueService.enqueueJob({
      jobId,
      projectId,
      phase: "characters",
      inputData: {
        narrative_possibility: narrative,
        moral_compass: project.moral_compass,
        target_audience: project.target_audience,
        regenerate: options?.regenerate || false,
      },
    });

    await this.supabaseService.updateProjectStatus(projectId, "characters");

    return {
      jobId,
      message: "Character generation started",
    };
  }

  @Post("/outline/:projectId")
  @Summary("Generate plot outline")
  @Description("Trigger plot outline generation for a project")
  @Returns(202)
  async generateOutline(
    @PathParams("projectId") projectId: string,
    @BodyParams() options?: {
      preferredStructure?: string;
      targetWordCount?: number;
      estimatedScenes?: number;
    }
  ): Promise<{ jobId: string; message: string }> {
    const project = await this.supabaseService.getProject(projectId);
    
    if (!project) {
      throw new Error("Project not found");
    }

    const narrative = await this.supabaseService.getNarrativePossibility(projectId);
    const characters = await this.supabaseService.getCharacters(projectId);

    if (!narrative || characters.length === 0) {
      throw new Error("Narrative and characters required. Complete previous phases first.");
    }

    const jobId = `outline-${projectId}-${Date.now()}`;

    await this.jobQueueService.enqueueJob({
      jobId,
      projectId,
      phase: "outlining",
      inputData: {
        narrative_possibility: narrative,
        characters,
        moral_compass: project.moral_compass,
        preferred_structure: options?.preferredStructure || "ThreeAct",
        target_word_count: options?.targetWordCount || 50000,
        estimated_scenes: options?.estimatedScenes || 20,
      },
    });

    await this.supabaseService.updateProjectStatus(projectId, "outlining");

    return {
      jobId,
      message: "Outline generation started",
    };
  }

  @Post("/draft/:projectId")
  @Summary("Generate narrative draft")
  @Description("Trigger draft generation for a specific scene or all scenes")
  @Returns(202)
  async generateDraft(
    @PathParams("projectId") projectId: string,
    @BodyParams() options?: {
      sceneNumber?: number;
      allScenes?: boolean;
    }
  ): Promise<{ jobId: string; message: string }> {
    const project = await this.supabaseService.getProject(projectId);
    
    if (!project) {
      throw new Error("Project not found");
    }

    const outline = await this.supabaseService.getOutline(projectId);

    if (!outline) {
      throw new Error("Outline required. Complete outlining phase first.");
    }

    const jobId = `draft-${projectId}-${Date.now()}`;

        if (options?.allScenes) {
          // Queue all scenes
          for (const scene of outline.scenes as Array<{ scene_number: number }>) {
            await this.jobQueueService.enqueueJob({
              jobId: `${jobId}-scene-${scene.scene_number}`,
          projectId,
          phase: "drafting",
          inputData: {
            scene,
            moral_compass: project.moral_compass,
          },
        });
      }
        } else {
          // Queue single scene
          const sceneNumber = options?.sceneNumber || 1;
          const scenes = outline.scenes as Array<{ scene_number: number }>;
          const scene = scenes.find((s) => s.scene_number === sceneNumber);
      
      if (!scene) {
        throw new Error(`Scene ${sceneNumber} not found in outline`);
      }

      await this.jobQueueService.enqueueJob({
        jobId,
        projectId,
        phase: "drafting",
        inputData: {
          scene,
          moral_compass: project.moral_compass,
        },
      });
    }

    await this.supabaseService.updateProjectStatus(projectId, "drafting");

    return {
      jobId,
      message: options?.allScenes 
        ? `Draft generation started for all ${outline.scenes.length} scenes`
        : `Draft generation started for scene ${options?.sceneNumber || 1}`,
    };
  }

  @Post("/critique/:projectId")
  @Summary("Request critique for drafts")
  @Description("Trigger critique generation for scene drafts")
  @Returns(202)
  async requestCritique(
    @PathParams("projectId") projectId: string,
    @BodyParams() options?: {
      sceneNumber?: number;
      allScenes?: boolean;
    }
  ): Promise<{ jobId: string; message: string }> {
    const project = await this.supabaseService.getProject(projectId);
    
    if (!project) {
      throw new Error("Project not found");
    }

    const drafts = await this.supabaseService.getDrafts(projectId);

    if (drafts.length === 0) {
      throw new Error("No drafts found. Complete drafting phase first.");
    }

    const jobId = `critique-${projectId}-${Date.now()}`;

    if (options?.allScenes) {
      for (const draft of drafts) {
        await this.jobQueueService.enqueueJob({
          jobId: `${jobId}-scene-${draft.scene_number}`,
          projectId,
          phase: "critique",
          inputData: {
            draft,
            moral_compass: project.moral_compass,
          },
        });
      }
    } else {
      const sceneNumber = options?.sceneNumber || 1;
      const draft = drafts.find((d: { scene_number: number }) => d.scene_number === sceneNumber);
      
      if (!draft) {
        throw new Error(`Draft for scene ${sceneNumber} not found`);
      }

      await this.jobQueueService.enqueueJob({
        jobId,
        projectId,
        phase: "critique",
        inputData: {
          draft,
          moral_compass: project.moral_compass,
        },
      });
    }

    await this.supabaseService.updateProjectStatus(projectId, "critique");

    return {
      jobId,
      message: options?.allScenes
        ? `Critique requested for all ${drafts.length} drafts`
        : `Critique requested for scene ${options?.sceneNumber || 1}`,
    };
  }

  @Get("/status/:jobId")
  @Summary("Get job status")
  @Description("Check the status of a generation job")
  async getJobStatus(
    @PathParams("jobId") jobId: string
  ): Promise<{ status: string; result?: unknown }> {
    const status = await this.jobQueueService.getJobStatus(jobId);
    return status;
  }

  @Get("/queue/stats")
  @Summary("Get queue statistics")
  @Description("Get current job queue statistics")
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    return await this.jobQueueService.getQueueStats();
  }
}
