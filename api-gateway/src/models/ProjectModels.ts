import { Property, Required, Enum, CollectionOf, Description } from "@tsed/schema";

export enum MoralCompass {
  ETHICAL = "Ethical",
  UNETHICAL = "Unethical",
  AMORAL = "Amoral",
  AMBIGUOUS = "Ambiguous",
  USER_DEFINED = "UserDefined",
}

export class StoryProjectDTO {
  @Required()
  @Description("The 'What If?' question or initial concept that sparks the story")
  seedIdea: string;

  @Required()
  @Enum(MoralCompass)
  @Description("Ethical framework that influences theme and style")
  moralCompass: MoralCompass;

  @Required()
  @Description("Intended audience (age group, genre preferences, sensibilities)")
  targetAudience: string;

  @CollectionOf(String)
  @Description("2-3 core themes to explore")
  themeCore?: string[];

  @CollectionOf(String)
  @Description("Style references (e.g., 'Palahniuk-esque cynicism')")
  toneStyleReferences?: string[];

  @Description("Required if moralCompass is USER_DEFINED")
  customMoralSystem?: string;
}

export class ProjectResponseDTO {
  @Required()
  id: string;

  @Required()
  status: string;

  @Property()
  message?: string;

  @Property()
  seedIdea?: string;

  @Property()
  moralCompass?: string;

  @Property()
  targetAudience?: string;

  @Property()
  createdAt?: string;

  @Property()
  updatedAt?: string;
}

export class NarrativePossibilityDTO {
  @Required()
  @Description("Brief summary of the plot")
  plotSummary: string;

  @Required()
  @Description("Description of the story setting")
  settingDescription: string;

  @Required()
  @Description("Central conflict of the story")
  mainConflict: string;

  @CollectionOf(String)
  @Description("Character types needed for the story")
  potentialCharacters: string[];

  @CollectionOf(String)
  @Description("Potential plot twists or turns")
  possibleTwists?: string[];

  @CollectionOf(String)
  @Description("Themes to be explored")
  thematicElements: string[];

  @Required()
  @Description("How the moral compass will be applied")
  moralCompassApplication: string;
}

export class CharacterProfileDTO {
  @Required()
  name: string;

  @Required()
  archetype: string;

  @Required()
  coreMotivation: string;

  @Required()
  innerTrap: string;

  @Required()
  psychologicalWound: string;

  @Required()
  copingMechanism: string;

  @Required()
  deepestFear: string;

  @Required()
  breakingPoint: string;

  @Required()
  occupationRole: string;

  @CollectionOf(String)
  affiliations?: string[];

  @Required()
  visualSignature: string;

  @Required()
  publicGoal: string;

  @Property()
  hiddenGoal?: string;

  @Required()
  definingMoment: string;

  @Property()
  familyBackground?: string;

  @Property()
  specialSkill?: string;

  @CollectionOf(String)
  quirks?: string[];

  @Required()
  moralStance: string;

  @Required()
  potentialArc: string;
}

export class SceneOutlineDTO {
  @Required()
  sceneNumber: number;

  @Required()
  title: string;

  @Required()
  setting: string;

  @CollectionOf(String)
  charactersPresent: string[];

  @Required()
  conflictType: string;

  @Required()
  conflictDescription: string;

  @Required()
  emotionalBeat: {
    initialState: string;
    climax: string;
    finalState: string;
  };

  @Required()
  subtextLayer: string;

  @Required()
  plotAdvancement: string;

  @Property()
  characterDevelopment?: string;

  @Property()
  estimatedWordCount?: number;
}

export class SceneDraftDTO {
  @Required()
  sceneNumber: number;

  @Required()
  title: string;

  @Required()
  settingDescription: string;

  @Required()
  sensoryDetails: {
    sight: string[];
    sound: string[];
    smell: string[];
    taste: string[];
    touch: string[];
    internal: string[];
  };

  @Required()
  narrativeContent: string;

  @CollectionOf(Object)
  dialogueEntries?: Array<{
    speaker: string;
    spokenText: string;
    subtext: string;
    actionBeat?: string;
  }>;

  @Required()
  subtextLayer: string;

  @Required()
  emotionalShift: string;

  @Required()
  wordCount: number;

  @Required()
  showDontTellRatio: number;
}

export class SceneCritiqueDTO {
  @Required()
  sceneNumber: number;

  @Required()
  overallScore: number;

  @Required()
  approved: boolean;

  @CollectionOf(Object)
  feedbackItems: Array<{
    category: string;
    score: number;
    feedback: string;
    suggestions: string[];
    lineReferences?: number[];
  }>;

  @CollectionOf(String)
  strengths: string[];

  @CollectionOf(String)
  weaknesses: string[];

  @Required()
  revisionRequired: boolean;

  @CollectionOf(String)
  revisionFocus?: string[];

  @Required()
  creativeRiskAssessment: string;

  @Required()
  psychologicalAlignment: string;

  @Required()
  complexityAssessment: string;
}
