import { fal } from "@fal-ai/client";

// ═══════════════════════════════════════════════════════════════════════════
// FAL.AI CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Configure fal client with API key from environment
fal.config({
  credentials: process.env.FAL_KEY,
});

// Model options - Flux Schnell is fast and cheap, good for meme tokens
const FLUX_SCHNELL = "fal-ai/flux/schnell";
const FLUX_DEV = "fal-ai/flux/dev"; // Higher quality, slower

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ImageGenerationOptions {
  prompt: string;
  style?: "meme" | "logo" | "mascot" | "abstract";
  size?: "square" | "portrait" | "landscape";
  highQuality?: boolean;
}

export interface GeneratedImage {
  url: string;
  base64?: string;
  width: number;
  height: number;
  contentType: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE PREFIXES
// ═══════════════════════════════════════════════════════════════════════════

const STYLE_PREFIXES: Record<string, string> = {
  meme: "Meme-style digital art, bold colors, simple shapes, humorous, crypto/web3 aesthetic, ",
  logo: "Minimalist token logo, clean vector style, iconic, memorable, works at small sizes, ",
  mascot: "Cute cartoon mascot character, friendly, expressive, crypto token style, ",
  abstract: "Abstract digital art, vibrant colors, geometric patterns, modern crypto aesthetic, ",
};

const SIZE_MAP: Record<string, { width: number; height: number }> = {
  square: { width: 512, height: 512 },
  portrait: { width: 512, height: 768 },
  landscape: { width: 768, height: 512 },
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GENERATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function generateTokenImage(
  options: ImageGenerationOptions
): Promise<GeneratedImage> {
  const {
    prompt,
    style = "meme",
    size = "square",
    highQuality = false,
  } = options;

  // Build the full prompt with style prefix
  const stylePrefix = STYLE_PREFIXES[style] || STYLE_PREFIXES.meme;
  const fullPrompt = `${stylePrefix}${prompt}`;

  // Get dimensions
  const dimensions = SIZE_MAP[size] || SIZE_MAP.square;

  // Choose model based on quality preference
  const model = highQuality ? FLUX_DEV : FLUX_SCHNELL;

  try {
    const result = await fal.subscribe(model, {
      input: {
        prompt: fullPrompt,
        image_size: dimensions,
        num_inference_steps: highQuality ? 28 : 4, // Schnell uses 4 steps
        num_images: 1,
        enable_safety_checker: true,
      },
      logs: false,
    });

    // Extract the image from the result
    const image = result.data.images?.[0];

    if (!image) {
      throw new Error("No image generated");
    }

    return {
      url: image.url,
      width: image.width || dimensions.width,
      height: image.height || dimensions.height,
      contentType: image.content_type || "image/jpeg",
    };
  } catch (error) {
    console.error("Image generation failed:", error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a token logo from a token name and description
 */
export async function generateTokenLogo(
  tokenName: string,
  imagePrompt: string
): Promise<GeneratedImage> {
  return generateTokenImage({
    prompt: `${imagePrompt}. For a crypto token called "${tokenName}".`,
    style: "logo",
    size: "square",
    highQuality: false, // Use fast generation for iteration
  });
}

/**
 * Generate a meme-style token image
 */
export async function generateMemeImage(
  tokenName: string,
  description: string
): Promise<GeneratedImage> {
  return generateTokenImage({
    prompt: `${description}. Meme token "${tokenName}" logo.`,
    style: "meme",
    size: "square",
    highQuality: false,
  });
}

/**
 * Download image and convert to base64 for IPFS upload
 */
export async function imageUrlToBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${base64}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GENERATION (for A/B testing concepts)
// ═══════════════════════════════════════════════════════════════════════════

export async function generateImageVariations(
  prompt: string,
  count: number = 3
): Promise<GeneratedImage[]> {
  // Generate multiple images in parallel
  const promises = Array.from({ length: count }, () =>
    generateTokenImage({
      prompt,
      style: "meme",
      size: "square",
    })
  );

  return Promise.all(promises);
}
