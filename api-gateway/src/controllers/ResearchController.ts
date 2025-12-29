import { Controller, Get, PathParams, QueryParams, $log } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { SupabaseService, ResearchHistoryItem } from "../services/SupabaseService";

interface ResearchHistoryResponse {
  success: boolean;
  research: ResearchHistoryItem[];
  error?: string;
}

interface ResearchDetailResponse {
  success: boolean;
  research?: ResearchHistoryItem;
  error?: string;
}

@Controller("/research")
@Tags("Research")
@Description("Research history endpoints for Eternal Memory feature")
export class ResearchController {
  @Inject()
  private supabaseService: SupabaseService;

  @Get("/history")
  @Summary("Get research history")
  @Description("Retrieve past research results stored for Eternal Memory reuse")
  @Returns(200)
  async getResearchHistory(
    @QueryParams("limit") limit: number = 20
  ): Promise<ResearchHistoryResponse> {
    try {
      const research = await this.supabaseService.getResearchHistory(limit);
      return {
        success: true,
        research,
      };
    } catch (error) {
      $log.error("[ResearchController] Error getting research history:", error);
      return {
        success: false,
        research: [],
        error: error instanceof Error ? error.message : "Failed to load research history",
      };
    }
  }

  @Get("/:id")
  @Summary("Get research result by ID")
  @Description("Retrieve a specific research result by its ID")
  @Returns(200)
  async getResearchResult(
    @PathParams("id") id: string
  ): Promise<ResearchDetailResponse> {
    try {
      const research = await this.supabaseService.getResearchResult(id);
      if (!research) {
        return {
          success: false,
          error: "Research result not found",
        };
      }
      return {
        success: true,
        research,
      };
    } catch (error) {
      $log.error("[ResearchController] Error getting research result:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load research result",
      };
    }
  }
}
