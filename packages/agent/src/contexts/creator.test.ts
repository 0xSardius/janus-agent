import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCreatorState,
  generateTokenConcept,
  generateTokenConceptFallback,
  generateImage,
  regenerateImage,
  getNextPendingToken,
  peekNextPendingToken,
  clearPendingTokens,
  getPendingCount,
  getRecentGenerations,
  getUsedConcepts,
  type CreatorState,
} from "./creator.js";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK LLM AND IMAGE MODULES
// ═══════════════════════════════════════════════════════════════════════════

vi.mock("../ai/llm.js", () => ({
  generateTokenConcept: vi.fn().mockResolvedValue({
    name: "Super Doge",
    symbol: "SDOGE",
    description: "The super evolution of Doge",
    imagePrompt: "A buff doge wearing a cape",
    reasoning: "Doge derivatives always get traction",
  }),
}));

vi.mock("../ai/image.js", () => ({
  generateTokenLogo: vi.fn().mockResolvedValue({
    url: "https://fal.ai/output/image123.png",
    width: 512,
    height: 512,
    contentType: "image/png",
  }),
  imageUrlToBase64: vi.fn().mockResolvedValue("data:image/png;base64,mockbase64data"),
}));

import { generateTokenConcept as llmGenerate } from "../ai/llm.js";
import { generateTokenLogo, imageUrlToBase64 } from "../ai/image.js";

// ═══════════════════════════════════════════════════════════════════════════
// STATE CREATION
// ═══════════════════════════════════════════════════════════════════════════

describe("createCreatorState", () => {
  it("should create initial state with empty collections", () => {
    const state = createCreatorState();

    expect(state.pendingTokens).toEqual([]);
    expect(state.generatedImages).toBeInstanceOf(Map);
    expect(state.generatedImages.size).toBe(0);
    expect(state.generationHistory).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateTokenConcept (LLM-POWERED)
// ═══════════════════════════════════════════════════════════════════════════

describe("generateTokenConcept", () => {
  let state: CreatorState;

  beforeEach(() => {
    state = createCreatorState();
    vi.clearAllMocks();
  });

  it("should generate concept using LLM and image", async () => {
    const result = await generateTokenConcept(state, {
      baseConcept: "doge",
      iterationType: "derivative",
    });

    expect(result.name).toBe("Super Doge");
    expect(result.symbol).toBe("SDOGE");
    expect(result.description).toBe("The super evolution of Doge");
    expect(result.base64Image).toBe("data:image/png;base64,mockbase64data");
    expect(result.style).toBe("meme"); // default
  });

  it("should call LLM with correct parameters", async () => {
    await generateTokenConcept(state, {
      baseConcept: "pepe",
      iterationType: "mashup",
      recentSuccessfulTokens: ["DOGE", "SHIB"],
    });

    expect(llmGenerate).toHaveBeenCalledWith("pepe", "mashup", ["DOGE", "SHIB"]);
  });

  it("should generate image using LLM's imagePrompt", async () => {
    await generateTokenConcept(state, {
      baseConcept: "cat",
      iterationType: "derivative",
    });

    expect(generateTokenLogo).toHaveBeenCalledWith(
      "Super Doge",
      "A buff doge wearing a cape"
    );
  });

  it("should continue without image when image generation fails", async () => {
    vi.mocked(generateTokenLogo).mockRejectedValueOnce(new Error("Fal.ai rate limited"));

    const result = await generateTokenConcept(state, {
      baseConcept: "cat",
      iterationType: "derivative",
    });

    expect(result.name).toBe("Super Doge");
    expect(result.base64Image).toBeUndefined();
  });

  it("should continue without image when base64 conversion fails", async () => {
    vi.mocked(imageUrlToBase64).mockRejectedValueOnce(new Error("Download failed"));

    const result = await generateTokenConcept(state, {
      baseConcept: "frog",
      iterationType: "meta",
    });

    expect(result.name).toBe("Super Doge");
    expect(result.base64Image).toBeUndefined();
  });

  it("should skip image generation when generateImage=false", async () => {
    const result = await generateTokenConcept(state, {
      baseConcept: "moon",
      iterationType: "contrarian",
      generateImage: false,
    });

    expect(generateTokenLogo).not.toHaveBeenCalled();
    expect(result.base64Image).toBeUndefined();
  });

  it("should use custom style when provided", async () => {
    const result = await generateTokenConcept(state, {
      baseConcept: "ai",
      iterationType: "derivative",
      style: "abstract",
    });

    expect(result.style).toBe("abstract");
  });

  it("should truncate symbol to 6 characters uppercase", async () => {
    vi.mocked(llmGenerate).mockResolvedValueOnce({
      name: "Long Name Token",
      symbol: "longersymbol",
      description: "Test",
      imagePrompt: "Test",
      reasoning: "Test",
    });

    const result = await generateTokenConcept(state, {
      baseConcept: "test",
      iterationType: "derivative",
    });

    expect(result.symbol).toBe("LONGER");
    expect(result.symbol.length).toBeLessThanOrEqual(6);
  });

  // ─── STATE UPDATES ─────────────────────────────────────────────────────

  it("should add to generation history", async () => {
    await generateTokenConcept(state, {
      baseConcept: "doge",
      iterationType: "derivative",
    });

    expect(state.generationHistory).toHaveLength(1);
    expect(state.generationHistory[0].concept).toBe("doge");
    expect(state.generationHistory[0].result.name).toBe("Super Doge");
    expect(state.generationHistory[0].llmConcept).toBeDefined();
    expect(state.generationHistory[0].timestamp).toBeGreaterThan(0);
  });

  it("should add to pending tokens", async () => {
    await generateTokenConcept(state, {
      baseConcept: "doge",
      iterationType: "derivative",
    });

    expect(state.pendingTokens).toHaveLength(1);
    expect(state.pendingTokens[0].name).toBe("Super Doge");
  });

  it("should store generated image in cache", async () => {
    await generateTokenConcept(state, {
      baseConcept: "cat",
      iterationType: "mashup",
    });

    expect(state.generatedImages.has("Super Doge")).toBe(true);
  });

  it("should propagate LLM errors", async () => {
    vi.mocked(llmGenerate).mockRejectedValueOnce(new Error("Anthropic API key invalid"));

    await expect(
      generateTokenConcept(state, {
        baseConcept: "test",
        iterationType: "derivative",
      })
    ).rejects.toThrow("Anthropic API key invalid");

    // State should not be updated on LLM failure
    expect(state.generationHistory).toHaveLength(0);
    expect(state.pendingTokens).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateTokenConceptFallback (PATTERN-BASED)
// ═══════════════════════════════════════════════════════════════════════════

describe("generateTokenConceptFallback", () => {
  let state: CreatorState;

  beforeEach(() => {
    state = createCreatorState();
  });

  it("should generate derivative concept with prefix", async () => {
    const result = await generateTokenConceptFallback(state, {
      baseConcept: "doge",
      iterationType: "derivative",
    });

    // Pattern: {Prefix} Doge
    expect(result.name).toMatch(/^(Super|Mega|Baby|Based|Giga) Doge$/);
    expect(result.symbol.length).toBeLessThanOrEqual(6);
    expect(result.description).toContain("doge");
  });

  it("should generate mashup concept", async () => {
    const result = await generateTokenConceptFallback(state, {
      baseConcept: "pepe",
      iterationType: "mashup",
    });

    // Pattern: Pepe{Mashup}
    expect(result.name).toMatch(/^Pepe(Cat|Dog|Frog|AI|Moon)$/);
    expect(result.description).toContain("meets");
  });

  it("should generate meta concept", async () => {
    const result = await generateTokenConceptFallback(state, {
      baseConcept: "moon",
      iterationType: "meta",
    });

    expect(result.name).toBe("Moon Coin");
    expect(result.description).toContain("official");
  });

  it("should generate contrarian concept with known opposite", async () => {
    const result = await generateTokenConceptFallback(state, {
      baseConcept: "bull",
      iterationType: "contrarian",
    });

    expect(result.name).toBe("Bear");
    expect(result.description).toContain("contrarian");
  });

  it("should generate contrarian with Anti- prefix for unknown concepts", async () => {
    const result = await generateTokenConceptFallback(state, {
      baseConcept: "pickle",
      iterationType: "contrarian",
    });

    expect(result.name).toBe("AntiPickle");
  });

  it("should add to generation history without llmConcept", async () => {
    await generateTokenConceptFallback(state, {
      baseConcept: "test",
      iterationType: "derivative",
    });

    expect(state.generationHistory).toHaveLength(1);
    expect(state.generationHistory[0].llmConcept).toBeUndefined();
  });

  it("should add to pending tokens", async () => {
    await generateTokenConceptFallback(state, {
      baseConcept: "test",
      iterationType: "meta",
    });

    expect(state.pendingTokens).toHaveLength(1);
  });

  it("should respect custom style", async () => {
    const result = await generateTokenConceptFallback(state, {
      baseConcept: "test",
      iterationType: "derivative",
      style: "logo",
    });

    expect(result.style).toBe("logo");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateImage (STANDALONE)
// ═══════════════════════════════════════════════════════════════════════════

describe("generateImage", () => {
  let state: CreatorState;

  beforeEach(() => {
    state = createCreatorState();
    vi.clearAllMocks();
  });

  it("should generate and return base64 image", async () => {
    const result = await generateImage(state, "Test Token", "a cute test token");

    expect(result).toBe("data:image/png;base64,mockbase64data");
    expect(generateTokenLogo).toHaveBeenCalledWith("Test Token", "a cute test token");
  });

  it("should cache generated images", async () => {
    await generateImage(state, "Cached Token", "prompt");

    expect(state.generatedImages.get("Cached Token")).toBe("data:image/png;base64,mockbase64data");
  });

  it("should return cached image without regenerating", async () => {
    state.generatedImages.set("Already Cached", "data:image/png;base64,existing");

    const result = await generateImage(state, "Already Cached", "new prompt");

    expect(result).toBe("data:image/png;base64,existing");
    expect(generateTokenLogo).not.toHaveBeenCalled();
  });

  it("should return null when image generation fails", async () => {
    vi.mocked(generateTokenLogo).mockRejectedValueOnce(new Error("quota exceeded"));

    const result = await generateImage(state, "Fail Token", "prompt");

    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// regenerateImage
// ═══════════════════════════════════════════════════════════════════════════

describe("regenerateImage", () => {
  let state: CreatorState;

  beforeEach(() => {
    state = createCreatorState();
    vi.clearAllMocks();
  });

  it("should clear existing cache before regenerating", async () => {
    state.generatedImages.set("Old Token", "data:image/png;base64,old");

    await regenerateImage(state, "Old Token", "new prompt");

    // Should have called generateTokenLogo (cache was cleared)
    expect(generateTokenLogo).toHaveBeenCalled();
    expect(state.generatedImages.get("Old Token")).toBe("data:image/png;base64,mockbase64data");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PENDING TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

describe("Pending token management", () => {
  let state: CreatorState;

  beforeEach(() => {
    state = createCreatorState();
    state.pendingTokens.push(
      { name: "Token A", symbol: "TKNA", description: "First", style: "meme" },
      { name: "Token B", symbol: "TKNB", description: "Second", style: "meme" }
    );
  });

  it("getNextPendingToken should return and remove first token", () => {
    const token = getNextPendingToken(state);

    expect(token?.name).toBe("Token A");
    expect(state.pendingTokens).toHaveLength(1);
    expect(state.pendingTokens[0].name).toBe("Token B");
  });

  it("getNextPendingToken should return null when empty", () => {
    state.pendingTokens = [];
    const token = getNextPendingToken(state);
    expect(token).toBeNull();
  });

  it("peekNextPendingToken should return first without removing", () => {
    const token = peekNextPendingToken(state);

    expect(token?.name).toBe("Token A");
    expect(state.pendingTokens).toHaveLength(2);
  });

  it("peekNextPendingToken should return null when empty", () => {
    state.pendingTokens = [];
    const token = peekNextPendingToken(state);
    expect(token).toBeNull();
  });

  it("clearPendingTokens should remove all", () => {
    clearPendingTokens(state);
    expect(state.pendingTokens).toHaveLength(0);
  });

  it("getPendingCount should return correct count", () => {
    expect(getPendingCount(state)).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION HISTORY
// ═══════════════════════════════════════════════════════════════════════════

describe("Generation history", () => {
  let state: CreatorState;

  beforeEach(() => {
    state = createCreatorState();
    for (let i = 0; i < 15; i++) {
      state.generationHistory.push({
        concept: `concept-${i}`,
        result: { name: `Token ${i}`, symbol: `T${i}`, description: `Desc ${i}`, style: "meme" },
        timestamp: Date.now() - (15 - i) * 1000,
      });
    }
  });

  it("getRecentGenerations should return last N entries", () => {
    const recent = getRecentGenerations(state, 5);
    expect(recent).toHaveLength(5);
    expect(recent[0].concept).toBe("concept-10");
    expect(recent[4].concept).toBe("concept-14");
  });

  it("getRecentGenerations should default to 10", () => {
    const recent = getRecentGenerations(state);
    expect(recent).toHaveLength(10);
  });

  it("getUsedConcepts should return lowercase set", () => {
    state.generationHistory = [
      { concept: "Doge", result: {} as any, timestamp: 1 },
      { concept: "PEPE", result: {} as any, timestamp: 2 },
      { concept: "doge", result: {} as any, timestamp: 3 }, // duplicate
    ];

    const used = getUsedConcepts(state);

    expect(used.has("doge")).toBe(true);
    expect(used.has("pepe")).toBe(true);
    expect(used.size).toBe(2); // "doge" deduped
  });
});
