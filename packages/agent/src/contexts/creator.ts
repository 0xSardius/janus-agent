import type { TokenMetadata } from "../types.js";
import {
  generateTokenConcept as generateConceptWithLLM,
  type IterationType,
  type TokenConcept,
} from "../ai/llm.js";
import {
  generateTokenLogo,
  imageUrlToBase64,
  type GeneratedImage,
} from "../ai/image.js";

// Re-export IterationType for external use
export type { IterationType };

// ═══════════════════════════════════════════════════════════════════════════
// CREATOR STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface CreatorState {
  pendingTokens: TokenMetadata[];
  generatedImages: Map<string, string>;
  generationHistory: Array<{
    concept: string;
    result: TokenMetadata;
    llmConcept?: TokenConcept;
    timestamp: number;
  }>;
}

export function createCreatorState(): CreatorState {
  return {
    pendingTokens: [],
    generatedImages: new Map(),
    generationHistory: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export interface GenerationConfig {
  baseConcept: string;
  iterationType: IterationType;
  style?: "meme" | "abstract" | "mascot" | "logo";
  generateImage?: boolean;
  recentSuccessfulTokens?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN CONCEPT GENERATION (LLM-powered)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a creative token concept using Claude
 */
export async function generateTokenConcept(
  state: CreatorState,
  config: GenerationConfig
): Promise<TokenMetadata> {
  const {
    baseConcept,
    iterationType,
    style = "meme",
    generateImage = true,
    recentSuccessfulTokens = [],
  } = config;

  console.log(`[Creator] Generating concept for "${baseConcept}" (${iterationType})`);

  // Generate concept with LLM
  const llmConcept = await generateConceptWithLLM(
    baseConcept,
    iterationType,
    recentSuccessfulTokens
  );

  console.log(`[Creator] LLM generated: ${llmConcept.name} ($${llmConcept.symbol})`);
  console.log(`[Creator] Reasoning: ${llmConcept.reasoning}`);

  // Generate image if requested
  let base64Image: string | undefined;
  if (generateImage) {
    try {
      console.log(`[Creator] Generating image...`);
      const image = await generateTokenLogo(llmConcept.name, llmConcept.imagePrompt);
      base64Image = await imageUrlToBase64(image.url);
      state.generatedImages.set(llmConcept.name, base64Image);
      console.log(`[Creator] Image generated successfully`);
    } catch (error) {
      console.error(`[Creator] Image generation failed:`, error);
      // Continue without image - not a blocker
    }
  }

  const metadata: TokenMetadata = {
    name: llmConcept.name,
    symbol: llmConcept.symbol.toUpperCase().slice(0, 6),
    description: llmConcept.description,
    base64Image,
    style,
  };

  // Track generation history
  state.generationHistory.push({
    concept: baseConcept,
    result: metadata,
    llmConcept,
    timestamp: Date.now(),
  });

  state.pendingTokens.push(metadata);

  return metadata;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION (Fal.ai powered)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a token image using Fal.ai
 */
export async function generateImage(
  state: CreatorState,
  name: string,
  imagePrompt: string,
  style: "meme" | "abstract" | "mascot" | "logo" = "meme"
): Promise<string | null> {
  // Check if we already have an image for this name
  const existing = state.generatedImages.get(name);
  if (existing) return existing;

  try {
    const image = await generateTokenLogo(name, imagePrompt);
    const base64 = await imageUrlToBase64(image.url);
    state.generatedImages.set(name, base64);
    return base64;
  } catch (error) {
    console.error(`[Creator] Image generation failed for "${name}":`, error);
    return null;
  }
}

/**
 * Regenerate image for an existing token concept
 */
export async function regenerateImage(
  state: CreatorState,
  tokenName: string,
  imagePrompt: string
): Promise<string | null> {
  // Clear existing image
  state.generatedImages.delete(tokenName);
  return generateImage(state, tokenName, imagePrompt);
}

// ═══════════════════════════════════════════════════════════════════════════
// PENDING TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get pending token ready for launch
 */
export function getNextPendingToken(state: CreatorState): TokenMetadata | null {
  return state.pendingTokens.shift() || null;
}

/**
 * Peek at the next pending token without removing it
 */
export function peekNextPendingToken(state: CreatorState): TokenMetadata | null {
  return state.pendingTokens[0] || null;
}

/**
 * Clear all pending tokens
 */
export function clearPendingTokens(state: CreatorState): void {
  state.pendingTokens = [];
}

/**
 * Get count of pending tokens
 */
export function getPendingCount(state: CreatorState): number {
  return state.pendingTokens.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION HISTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get recent generation history
 */
export function getRecentGenerations(
  state: CreatorState,
  limit: number = 10
): CreatorState["generationHistory"] {
  return state.generationHistory.slice(-limit);
}

/**
 * Get concepts we've already generated (to avoid repetition)
 */
export function getUsedConcepts(state: CreatorState): Set<string> {
  return new Set(state.generationHistory.map((h) => h.concept.toLowerCase()));
}

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK PATTERN-BASED GENERATION
// Used when LLM is unavailable or for testing
// ═══════════════════════════════════════════════════════════════════════════

export async function generateTokenConceptFallback(
  state: CreatorState,
  config: GenerationConfig
): Promise<TokenMetadata> {
  const { baseConcept, iterationType, style = "meme" } = config;

  // Simple pattern-based generation as fallback
  const generated = applyIterationPattern(baseConcept, iterationType);

  const metadata: TokenMetadata = {
    name: generated.name,
    symbol: generated.symbol.slice(0, 6).toUpperCase(),
    description: generated.description,
    style,
  };

  state.generationHistory.push({
    concept: baseConcept,
    result: metadata,
    timestamp: Date.now(),
  });

  state.pendingTokens.push(metadata);

  return metadata;
}

function applyIterationPattern(
  concept: string,
  type: IterationType
): { name: string; symbol: string; description: string } {
  const conceptUpper = concept.toUpperCase();
  const conceptTitle = concept.charAt(0).toUpperCase() + concept.slice(1);

  switch (type) {
    case "derivative": {
      const prefixes = ["Super", "Mega", "Baby", "Based", "Giga"];
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      return {
        name: `${prefix} ${conceptTitle}`,
        symbol: `${prefix.charAt(0)}${conceptUpper.slice(0, 4)}`,
        description: `${prefix} ${conceptTitle} - the ${prefix.toLowerCase()} evolution of ${concept}`,
      };
    }

    case "mashup": {
      const mashups = ["Cat", "Dog", "Frog", "AI", "Moon"];
      const mashup = mashups[Math.floor(Math.random() * mashups.length)];
      return {
        name: `${conceptTitle}${mashup}`,
        symbol: `${conceptUpper.slice(0, 3)}${mashup.toUpperCase().slice(0, 2)}`,
        description: `When ${concept} meets ${mashup.toLowerCase()} - the ultimate crossover`,
      };
    }

    case "meta":
      return {
        name: `${conceptTitle} Coin`,
        symbol: `$${conceptUpper.slice(0, 4)}`,
        description: `The official ${concept} token. Not the other one. This one.`,
      };

    case "contrarian": {
      const opposites: Record<string, string> = {
        bull: "bear", up: "down", moon: "earth", rich: "poor", win: "lose",
      };
      const opposite = opposites[concept.toLowerCase()] || `Anti${conceptTitle}`;
      return {
        name: opposite.charAt(0).toUpperCase() + opposite.slice(1),
        symbol: opposite.toUpperCase().slice(0, 5),
        description: `The contrarian play. When everyone zigs, we zag.`,
      };
    }

    default:
      return {
        name: conceptTitle,
        symbol: conceptUpper.slice(0, 5),
        description: `${conceptTitle} - riding the wave`,
      };
  }
}
