/**
 * Qdrant Memory Service for MANOE
 * Provides vector memory storage for characters, worldbuilding, and scenes
 * 
 * Features:
 * - Character profile storage and semantic search
 * - Worldbuilding element storage (geography, cultures, rules)
 * - Scene storage for continuity
 * - Multiple embedding provider support (OpenAI, Gemini, local)
 */

import { Service } from "@tsed/di";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";

/**
 * Embedding provider types
 */
export enum EmbeddingProvider {
  OPENAI = "openai",
  GEMINI = "gemini",
  LOCAL = "local",
}

/**
 * Embedding provider info
 */
export interface EmbeddingProviderInfo {
  providerType: EmbeddingProvider;
  modelName: string;
  dimension: number;
}

/**
 * Search result structure
 */
export interface SearchResult<T> {
  id: string;
  score: number;
  payload: T;
}

/**
 * Character payload
 */
export interface CharacterPayload {
  projectId: string;
  character: Record<string, unknown>;
  name: string;
  createdAt: string;
  [key: string]: unknown;
}

/**
 * Worldbuilding payload
 */
export interface WorldbuildingPayload {
  projectId: string;
  elementType: string;
  element: Record<string, unknown>;
  createdAt: string;
  [key: string]: unknown;
}

/**
 * Scene payload
 */
export interface ScenePayload {
  projectId: string;
  sceneNumber: number;
  scene: Record<string, unknown>;
  createdAt: string;
  [key: string]: unknown;
}

@Service()
export class QdrantMemoryService {
  private client: QdrantClient | null = null;
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;
  private embeddingProvider: EmbeddingProvider = EmbeddingProvider.LOCAL;
  private embeddingDimension: number = 384;
  private embeddingModel: string = "all-MiniLM-L6-v2";

  // Collection names
  private readonly COLLECTION_CHARACTERS = "manoe_characters";
  private readonly COLLECTION_WORLDBUILDING = "manoe_worldbuilding";
  private readonly COLLECTION_SCENES = "manoe_scenes";

  /**
   * Connect to Qdrant and initialize embedding provider
   * 
   * @param openaiApiKey - OpenAI API key for embeddings (highest priority)
   * @param geminiApiKey - Gemini API key for embeddings (second priority)
   * @param preferLocal - If true, use local embeddings even if API keys available
   */
  async connect(
    openaiApiKey?: string,
    geminiApiKey?: string,
    preferLocal: boolean = false
  ): Promise<void> {
    const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
    const qdrantApiKey = process.env.QDRANT_API_KEY;

    this.client = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });

    // Initialize embedding provider
    if (!preferLocal && openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
      this.embeddingProvider = EmbeddingProvider.OPENAI;
      this.embeddingDimension = 1536;
      this.embeddingModel = "text-embedding-3-small";
      console.log("Qdrant Memory: Using OpenAI embeddings (1536 dimensions)");
    } else if (!preferLocal && geminiApiKey) {
      this.geminiClient = new GoogleGenerativeAI(geminiApiKey);
      this.embeddingProvider = EmbeddingProvider.GEMINI;
      this.embeddingDimension = 768;
      this.embeddingModel = "embedding-001";
      console.log("Qdrant Memory: Using Gemini embeddings (768 dimensions)");
    } else {
      this.embeddingProvider = EmbeddingProvider.LOCAL;
      this.embeddingDimension = 384;
      this.embeddingModel = "all-MiniLM-L6-v2";
      console.log("Qdrant Memory: Using local embeddings (384 dimensions)");
    }

    // Ensure collections exist
    await this.ensureCollections();

    console.log(`Qdrant Memory connected to ${qdrantUrl}`);
  }

  /**
   * Get embedding provider info
   */
  get providerInfo(): EmbeddingProviderInfo {
    return {
      providerType: this.embeddingProvider,
      modelName: this.embeddingModel,
      dimension: this.embeddingDimension,
    };
  }

  /**
   * Ensure all required collections exist with correct dimensions
   * If a collection exists with wrong dimensions, recreate it
   */
  private async ensureCollections(): Promise<void> {
    if (!this.client) return;

    const collections = [
      this.COLLECTION_CHARACTERS,
      this.COLLECTION_WORLDBUILDING,
      this.COLLECTION_SCENES,
    ];

    for (const collectionName of collections) {
      try {
        const collectionInfo = await this.client.getCollection(collectionName);
        
        // Check if the collection has the correct dimension
        // The vectors config can be either a single config or named vectors
        const vectorsConfig = collectionInfo.config?.params?.vectors;
        let existingDimension: number | undefined;
        
        if (vectorsConfig && typeof vectorsConfig === "object") {
          if ("size" in vectorsConfig) {
            // Single vector config
            existingDimension = vectorsConfig.size as number;
          }
        }
        
        if (existingDimension && existingDimension !== this.embeddingDimension) {
          console.log(
            `Qdrant collection ${collectionName} has dimension ${existingDimension}, ` +
            `but current embedding provider uses ${this.embeddingDimension}. Recreating collection...`
          );
          
          // Delete and recreate the collection with correct dimensions
          await this.client.deleteCollection(collectionName);
          await this.client.createCollection(collectionName, {
            vectors: {
              size: this.embeddingDimension,
              distance: "Cosine",
            },
          });
          console.log(`Recreated Qdrant collection: ${collectionName} with ${this.embeddingDimension} dimensions`);
        } else {
          console.log(`Qdrant collection ${collectionName} exists with correct dimensions (${this.embeddingDimension})`);
        }
      } catch (error) {
        // Collection doesn't exist, create it
        await this.client.createCollection(collectionName, {
          vectors: {
            size: this.embeddingDimension,
            distance: "Cosine",
          },
        });
        console.log(`Created Qdrant collection: ${collectionName} with ${this.embeddingDimension} dimensions`);
      }
    }
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (this.embeddingProvider === EmbeddingProvider.OPENAI && this.openaiClient) {
      const response = await this.openaiClient.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    } else if (this.embeddingProvider === EmbeddingProvider.GEMINI && this.geminiClient) {
      const model = this.geminiClient.getGenerativeModel({ model: "embedding-001" });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } else {
      // Local embeddings - return random vector for now
      // In production, use a local embedding model like fastembed
      return Array.from({ length: this.embeddingDimension }, () => Math.random() - 0.5);
    }
  }

  /**
   * Store a character in Qdrant
   */
  async storeCharacter(
    projectId: string,
    character: Record<string, unknown>
  ): Promise<string> {
    if (!this.client) throw new Error("Qdrant client not connected");

    const characterName = String(character.name ?? "Unknown");
    const characterText = this.characterToText(character);
    const embedding = await this.generateEmbedding(characterText);

    const pointId = uuidv4();
    const payload: CharacterPayload = {
      projectId,
      character,
      name: characterName,
      createdAt: new Date().toISOString(),
    };

    await this.client.upsert(this.COLLECTION_CHARACTERS, {
      points: [
        {
          id: pointId,
          vector: embedding,
          payload: payload as Record<string, unknown>,
        },
      ],
    });

    return pointId;
  }

  /**
   * Search for characters by semantic similarity
   */
  async searchCharacters(
    projectId: string,
    query: string,
    limit: number = 3
  ): Promise<SearchResult<CharacterPayload>[]> {
    if (!this.client) return [];

    const queryEmbedding = await this.generateEmbedding(query);

    const results = await this.client.search(this.COLLECTION_CHARACTERS, {
      vector: queryEmbedding,
      limit,
      filter: {
        must: [{ key: "projectId", match: { value: projectId } }],
      },
    });

    return results.map((result) => ({
      id: String(result.id),
      score: result.score,
      payload: result.payload as CharacterPayload,
    }));
  }

  /**
   * Get all characters for a project
   */
  async getProjectCharacters(projectId: string): Promise<CharacterPayload[]> {
    if (!this.client) return [];

    const results = await this.client.scroll(this.COLLECTION_CHARACTERS, {
      filter: {
        must: [{ key: "projectId", match: { value: projectId } }],
      },
      limit: 100,
    });

    return results.points.map((point) => point.payload as CharacterPayload);
  }

  /**
   * Store worldbuilding element in Qdrant
   */
  async storeWorldbuilding(
    projectId: string,
    elementType: string,
    element: Record<string, unknown>
  ): Promise<string> {
    if (!this.client) throw new Error("Qdrant client not connected");

    const elementText = this.worldbuildingToText(elementType, element);
    const embedding = await this.generateEmbedding(elementText);

    const pointId = uuidv4();
    const payload: WorldbuildingPayload = {
      projectId,
      elementType,
      element,
      createdAt: new Date().toISOString(),
    };

    await this.client.upsert(this.COLLECTION_WORLDBUILDING, {
      points: [
        {
          id: pointId,
          vector: embedding,
          payload: payload as Record<string, unknown>,
        },
      ],
    });

    return pointId;
  }

  /**
   * Search for worldbuilding elements by semantic similarity
   */
  async searchWorldbuilding(
    projectId: string,
    query: string,
    limit: number = 5
  ): Promise<SearchResult<WorldbuildingPayload>[]> {
    if (!this.client) return [];

    const queryEmbedding = await this.generateEmbedding(query);

    const results = await this.client.search(this.COLLECTION_WORLDBUILDING, {
      vector: queryEmbedding,
      limit,
      filter: {
        must: [{ key: "projectId", match: { value: projectId } }],
      },
    });

    return results.map((result) => ({
      id: String(result.id),
      score: result.score,
      payload: result.payload as WorldbuildingPayload,
    }));
  }

  /**
   * Store a scene in Qdrant
   */
  async storeScene(
    projectId: string,
    sceneNumber: number,
    scene: Record<string, unknown>
  ): Promise<string> {
    if (!this.client) throw new Error("Qdrant client not connected");

    const sceneText = this.sceneToText(scene);
    const embedding = await this.generateEmbedding(sceneText);

    const pointId = uuidv4();
    const payload: ScenePayload = {
      projectId,
      sceneNumber,
      scene,
      createdAt: new Date().toISOString(),
    };

    await this.client.upsert(this.COLLECTION_SCENES, {
      points: [
        {
          id: pointId,
          vector: embedding,
          payload: payload as Record<string, unknown>,
        },
      ],
    });

    return pointId;
  }

  /**
   * Search for scenes by semantic similarity
   */
  async searchScenes(
    projectId: string,
    query: string,
    limit: number = 2
  ): Promise<SearchResult<ScenePayload>[]> {
    if (!this.client) return [];

    const queryEmbedding = await this.generateEmbedding(query);

    const results = await this.client.search(this.COLLECTION_SCENES, {
      vector: queryEmbedding,
      limit,
      filter: {
        must: [{ key: "projectId", match: { value: projectId } }],
      },
    });

    return results.map((result) => ({
      id: String(result.id),
      score: result.score,
      payload: result.payload as ScenePayload,
    }));
  }

  /**
   * Delete all data for a project
   */
  async deleteProjectData(projectId: string): Promise<void> {
    if (!this.client) return;

    const collections = [
      this.COLLECTION_CHARACTERS,
      this.COLLECTION_WORLDBUILDING,
      this.COLLECTION_SCENES,
    ];

    for (const collection of collections) {
      await this.client.delete(collection, {
        filter: {
          must: [{ key: "projectId", match: { value: projectId } }],
        },
      });
    }
  }

  /**
   * Convert character to searchable text
   */
  private characterToText(character: Record<string, unknown>): string {
    const parts: string[] = [];
    
    if (character.name) parts.push(`Name: ${character.name}`);
    if (character.archetype) parts.push(`Archetype: ${character.archetype}`);
    if (character.role) parts.push(`Role: ${character.role}`);
    if (character.coreMotivation) parts.push(`Motivation: ${character.coreMotivation}`);
    if (character.psychologicalWound) parts.push(`Wound: ${character.psychologicalWound}`);
    if (character.innerTrap) parts.push(`Inner Trap: ${character.innerTrap}`);
    if (character.backstory) parts.push(`Backstory: ${character.backstory}`);
    if (character.visualSignature) parts.push(`Visual: ${character.visualSignature}`);

    return parts.join(". ");
  }

  /**
   * Convert worldbuilding element to searchable text
   */
  private worldbuildingToText(
    elementType: string,
    element: Record<string, unknown>
  ): string {
    const parts: string[] = [`Type: ${elementType}`];

    if (element.name) parts.push(`Name: ${element.name}`);
    if (element.description) parts.push(`Description: ${element.description}`);
    if (element.location) parts.push(`Location: ${element.location}`);
    if (element.significance) parts.push(`Significance: ${element.significance}`);

    return parts.join(". ");
  }

  /**
   * Convert scene to searchable text
   */
  private sceneToText(scene: Record<string, unknown>): string {
    const parts: string[] = [];

    if (scene.sceneNumber) parts.push(`Scene ${scene.sceneNumber}`);
    if (scene.title) parts.push(`Title: ${scene.title}`);
    if (scene.setting) parts.push(`Setting: ${scene.setting}`);
    if (scene.summary) parts.push(`Summary: ${scene.summary}`);
    if (scene.content) {
      const content = String(scene.content);
      parts.push(`Content: ${content.substring(0, 500)}`);
    }

    return parts.join(". ");
  }

  /**
   * Disconnect from Qdrant
   */
  async disconnect(): Promise<void> {
    this.client = null;
    this.openaiClient = null;
    this.geminiClient = null;
  }
}
