import { anthropic } from "@ai-sdk/anthropic";
import { generateText, generateObject } from "ai";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// MODEL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export function getModel(modelId: string = DEFAULT_MODEL) {
  return anthropic(modelId);
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN CONCEPT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export const TokenConceptSchema = z.object({
  name: z.string().describe("Creative token name, 2-4 words max"),
  symbol: z.string().max(6).describe("Token symbol, 3-6 uppercase letters"),
  description: z.string().describe("Catchy description, 1-2 sentences"),
  imagePrompt: z.string().describe("Detailed prompt for generating the token logo image"),
  reasoning: z.string().describe("Brief explanation of why this concept could work"),
});

export type TokenConcept = z.infer<typeof TokenConceptSchema>;

export type IterationType = "derivative" | "mashup" | "meta" | "contrarian";

const ITERATION_PROMPTS: Record<IterationType, string> = {
  derivative: `Create a variation that builds on the original concept. Add a fun prefix/suffix or evolution (like "Baby X", "Super X", "X 2.0"). Keep the core appeal but make it fresh.`,

  mashup: `Combine the concept with another trending crypto/meme theme. Create an unexpected but fun crossover (like combining with AI, cats, frogs, space, food, etc).`,

  meta: `Create a self-aware, ironic take on the concept. Make it meta-humorous - acknowledge it's a meme token while being genuinely entertaining.`,

  contrarian: `Create an opposite or contrarian take. If the original is bullish, go bearish. If it's cute, go edgy. Subvert expectations in a clever way.`,
};

export async function generateTokenConcept(
  baseConcept: string,
  iterationType: IterationType,
  recentSuccessfulTokens: string[] = []
): Promise<TokenConcept> {
  const recentContext = recentSuccessfulTokens.length > 0
    ? `\n\nRecently successful tokens for reference: ${recentSuccessfulTokens.join(", ")}`
    : "";

  const { object } = await generateObject({
    model: getModel(),
    schema: TokenConceptSchema,
    prompt: `You are a creative meme token generator for Flaunch on Base. Your goal is to create viral, memorable token concepts that could capture attention and trading volume.

BASE CONCEPT: "${baseConcept}"

ITERATION STYLE: ${iterationType}
${ITERATION_PROMPTS[iterationType]}
${recentContext}

Requirements:
- Name should be catchy, memorable, and easy to say
- Symbol should be 3-6 uppercase letters, ideally pronounceable
- Description should be punchy and shareable
- Image prompt should describe a simple, iconic logo that works at small sizes
- Think like a meme creator, not a corporate marketer

Generate a token concept that could realistically go viral on crypto Twitter.`,
    temperature: 0.9, // Higher creativity
  });

  return object;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONCEPT EXTRACTION FROM TOKENS
// ═══════════════════════════════════════════════════════════════════════════

export const ExtractedConceptsSchema = z.object({
  concepts: z.array(z.object({
    concept: z.string().describe("The core concept or theme"),
    strength: z.number().min(0).max(1).describe("How strong/trending this concept is"),
    relatedTokens: z.array(z.string()).describe("Token symbols that use this concept"),
  })),
  emergingThemes: z.array(z.string()).describe("New themes that might be emerging"),
});

export type ExtractedConcepts = z.infer<typeof ExtractedConceptsSchema>;

export async function extractConceptsFromTokens(
  tokens: Array<{ symbol: string; name: string; volumeETH: string }>
): Promise<ExtractedConcepts> {
  const tokenList = tokens
    .map((t) => `${t.symbol}: "${t.name}" (${t.volumeETH} ETH volume)`)
    .join("\n");

  const { object } = await generateObject({
    model: getModel(),
    schema: ExtractedConceptsSchema,
    prompt: `Analyze these recently launched meme tokens on Flaunch and extract the trending concepts and themes:

${tokenList}

Identify:
1. Core concepts that appear across multiple tokens (animals, AI, emotions, memes, etc)
2. How strong each concept is based on volume and frequency
3. Any emerging themes that might be worth exploring

Focus on actionable concepts that could inspire new token launches.`,
    temperature: 0.3, // Lower for analysis
  });

  return object;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONCEPT SCORING ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export const ConceptAnalysisSchema = z.object({
  viralPotential: z.number().min(0).max(1).describe("Likelihood of going viral"),
  timingScore: z.number().min(0).max(1).describe("How well-timed this concept is"),
  saturationRisk: z.number().min(0).max(1).describe("Risk of market saturation"),
  overallScore: z.number().min(0).max(1).describe("Combined score"),
  recommendation: z.enum(["strong_launch", "launch", "wait", "skip"]),
  reasoning: z.string(),
});

export type ConceptAnalysis = z.infer<typeof ConceptAnalysisSchema>;

export async function analyzeConceptPotential(
  concept: string,
  marketContext: {
    recentLaunches: number;
    topPerformers: string[];
    hourlyVolume: string;
  }
): Promise<ConceptAnalysis> {
  const { object } = await generateObject({
    model: getModel(),
    schema: ConceptAnalysisSchema,
    prompt: `Analyze this meme token concept for launch potential:

CONCEPT: "${concept}"

MARKET CONTEXT:
- Recent launches (last hour): ${marketContext.recentLaunches}
- Top performing tokens: ${marketContext.topPerformers.join(", ")}
- Hourly volume: ${marketContext.hourlyVolume} ETH

Evaluate:
1. Viral potential - could this capture attention?
2. Timing - is the market receptive right now?
3. Saturation - is this concept overdone?

Be realistic but not overly conservative. Meme tokens are speculative by nature.`,
    temperature: 0.5,
  });

  return object;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE TEXT GENERATION (for descriptions, etc)
// ═══════════════════════════════════════════════════════════════════════════

export async function generateText_(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: getModel(),
    prompt,
    temperature: 0.7,
  });

  return text;
}
