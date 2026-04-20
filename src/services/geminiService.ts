import { GoogleGenAI, Type } from "@google/genai";
import { waitForRateLimit, reportRateLimitError } from './rateLimitService';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface KeywordData {
  keyword: string;
  trendScore: number;
  competition: "Low" | "Medium" | "High";
  potentialDownloads: number;
  monthlyTrend: number[];
}

export interface RankedKeywordData {
  rank: number;
  keyword: string;
  demand: "High" | "Very High" | "Extreme";
  searchVolume: number;
  trendDirection: "up" | "down" | "stable";
}

export async function getTrendingKeywords(niche: string, platform: string): Promise<KeywordData[]> {
  const currentDate = new Date();
  const currentMonth = currentDate.toLocaleString('id-ID', { month: 'long' });
  const currentYear = currentDate.getFullYear();

  await waitForRateLimit();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert data analyst for microstock platforms. 
      Using the Google Search tool, you MUST find REAL, ACTUAL data from contributor portals, microstock keyword research tools, or official trend reports for "${niche}" on the platform "${platform}" for ${currentMonth} ${currentYear}. DO NOT GUESS OR MAKE UP DATA.
      
      Analyze the actual search volume, contributor insights, and buyer demand.
      Generate a list of 20 highly trending keywords or concepts related to "${niche}" that are genuinely in high demand and have the highest download potential right now based on your research.
      
      For each keyword, provide:
      - The keyword itself (can be a short phrase).
      - A trend score from 0 to 100 indicating current popularity based on real-time search trends.
      - Competition level (Low, Medium, High) on ${platform}.
      - Estimated potential monthly downloads based on current demand.
      - A monthly trend array containing 6 numbers (0-100) representing the trend score over the last 6 months leading up to ${currentMonth} ${currentYear}.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              keyword: { type: Type.STRING },
              trendScore: { type: Type.NUMBER },
              competition: { type: Type.STRING },
              potentialDownloads: { type: Type.NUMBER },
              monthlyTrend: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER }
              }
            },
            required: ["keyword", "trendScore", "competition", "potentialDownloads", "monthlyTrend"]
          }
        }
      }
    });

    const data = JSON.parse(response.text || "[]");
    return data;
  } catch (e: any) {
    if (e.status === 429 || e.message?.includes('429') || e.message?.includes('quota') || e.message?.includes('Too Many Requests')) {
      reportRateLimitError();
    }
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}

export async function getRankedKeywords(timeframe: 'week' | 'month' | 'year', platform: string): Promise<RankedKeywordData[]> {
  const currentDate = new Date();
  const currentMonth = currentDate.toLocaleString('id-ID', { month: 'long' });
  const currentYear = currentDate.getFullYear();
  
  let timeContext = "";
  if (timeframe === 'week') timeContext = "this current week";
  else if (timeframe === 'month') timeContext = `this current month (${currentMonth} ${currentYear})`;
  else timeContext = `this current year (${currentYear})`;

  await waitForRateLimit();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert data analyst for microstock platforms. 
      Using the Google Search tool, you MUST find REAL, ACTUAL data from contributor portals, microstock keyword research tools, or official trend reports on the absolute top most searched and highest demand keywords across ALL categories on the platform "${platform}" for ${timeContext}. DO NOT GUESS OR MAKE UP DATA.
      
      Analyze the actual search volume, contributor insights, and buyer demand.
      Generate a ranked list of the top 60 keywords that are genuinely dominating the market and have the highest search volume and demand based on your research.
      
      For each keyword, provide:
      - The rank (1 to 60).
      - The keyword itself.
      - Demand level ("High", "Very High", "Extreme").
      - Estimated search volume for the given timeframe.
      - Trend direction ("up", "down", "stable") compared to the previous period.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              rank: { type: Type.NUMBER },
              keyword: { type: Type.STRING },
              demand: { type: Type.STRING },
              searchVolume: { type: Type.NUMBER },
              trendDirection: { type: Type.STRING }
            },
            required: ["rank", "keyword", "demand", "searchVolume", "trendDirection"]
          }
        }
      }
    });

    const data = JSON.parse(response.text || "[]");
    return data.sort((a: RankedKeywordData, b: RankedKeywordData) => a.rank - b.rank);
  } catch (e: any) {
    if (e.status === 429 || e.message?.includes('429') || e.message?.includes('quota') || e.message?.includes('Too Many Requests')) {
      reportRateLimitError();
    }
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}

export async function generatePrompts(keyword: string, count: number, platform: string, assetType: 'Image' | 'Video'): Promise<string[]> {
  await waitForRateLimit();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert AI prompt engineer and microstock contributor. 
      Using the Google Search tool, research current visual trends for the keyword "${keyword}" on "${platform}".
      
      Based on your research, generate exactly ${count} highly detailed, long, and descriptive prompts for generating ${assetType}s that would sell extremely well on ${platform} right now.
      
      CRITICAL INSTRUCTIONS FOR PROMPT QUALITY:
      1. Each prompt MUST be extremely detailed, clear, and professional (at least 50-80 words).
      2. Do NOT generate short, vague, or simple prompts.
      3. Use a structured formula for every prompt: 
         [Main Subject Description & Action] + [Environment/Background Details] + [Lighting Setup & Atmosphere] + [Camera Angle & Lens Details] + [Color Palette & Mood] + [Technical Specifications & Rendering Style].
      4. The prompts should be perfectly optimized for advanced AI generators (like Midjourney v6, DALL-E 3, or Sora).
      5. Include specific technical terms (e.g., "shot on 35mm lens", "f/1.8 aperture", "volumetric lighting", "Unreal Engine 5 render", "8k resolution", "hyper-realistic", "cinematic composition").
      
      Return ONLY a JSON array of strings, where each string is a single prompt. Do not include markdown formatting like \`\`\`json in the output.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const data = JSON.parse(response.text || "[]");
    return data;
  } catch (e: any) {
    if (e.status === 429 || e.message?.includes('429') || e.message?.includes('quota') || e.message?.includes('Too Many Requests')) {
      reportRateLimitError();
    }
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}

export interface HighLogoMetadata {
  title: string;
  category: string;
  description: string;
  tags: string[];
  price: number;
}

export async function generateHighLogoMetadata(base64Data: string, mimeType: string, maxRetries = 3): Promise<HighLogoMetadata | null> {
  const highLogoCategories = [
    "Abstract", "Animal", "Travel", "Sports", "Food", "Technology", "Real Estate", 
    "Health", "Fashion", "Beauty", "Organizations", "Financial", "Media", "Gaming", 
    "General", "Lettermark", "3D", "Monograms", "Handcrafted", "Negative space"
  ];

  let prompt = `You are an expert logo designer and SEO specialist for the platform highlogo.com. Analyze the provided logo image and generate highly optimized metadata to make this logo trend and appear on the home page.
  
CRITICAL INSTRUCTION FOR TONE:
Write in a highly natural, human-like, and engaging tone. DO NOT use robotic, stiff, or redundant phrasing. Avoid cliché AI words like "elevate", "seamless", "dynamic", "innovative", "synergize", or "perfect for". Vary your sentence structures so it reads like a real human designer pitching their work.

Requirements for High Logo:
1. Logo Title: Must be a maximum of 55 characters. Make it catchy, descriptive, and natural. Focus ONLY on the core subject, concept, or monogram. DO NOT mention background colors, secondary colors, or generic visual descriptors (e.g., "in Orange", "on white background"). Avoid generic suffixes like "Logo Design".
2. Category: Choose EXACTLY ONE category from this list: ${highLogoCategories.join(", ")}.
3. Description: Must be between 400 and 550 characters (ABSOLUTE MAXIMUM OF 600 CHARACTERS). Describe the logo concept, style, and potential brand identity organically. Do not repeat the title. Tell a brief story about the design's vibe. Make it sound 100% human-written to avoid AI detection. DO NOT EXCEED 600 CHARACTERS.
4. Tags: You MUST generate EXACTLY 10 tags (no more, no less). EACH tag MUST be a maximum of 14 characters long. Do not use multi-word tags if they exceed 14 characters.
5. Price (USD): Estimate a selling price between 200 and 300 USD based on the logo's quality and complexity.

Return the result in JSON format.`;

  const MAX_RATE_LIMIT_RETRIES = 5;
  let rateLimitRetries = 0;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    await waitForRateLimit();
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              description: { type: Type.STRING },
              tags: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              price: { type: Type.NUMBER }
            },
            required: ["title", "category", "description", "tags", "price"]
          }
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text) as HighLogoMetadata;
        
        // Ensure description is max 600 chars
        if (data.description.length > 600) {
          let truncated = data.description.substring(0, 595);
          const lastPeriod = truncated.lastIndexOf('.');
          if (lastPeriod > 400) {
            data.description = truncated.substring(0, lastPeriod + 1);
          } else {
            data.description = truncated.trim() + '...';
          }
        }

        // Ensure exactly 10 tags and max length 14
        data.tags = data.tags.map(tag => {
          let cleanTag = tag.trim().replace(/,/g, ''); // Remove any commas
          return cleanTag.length > 14 ? cleanTag.substring(0, 14).trim() : cleanTag;
        });
        
        if (data.tags.length > 10) {
          data.tags = data.tags.slice(0, 10);
        } else {
          const fallbacks = ["logo", "brand", "design", "icon", "vector", "art", "identity", "mark", "symbol", "badge"];
          let i = 0;
          while (data.tags.length < 10) {
            if (!data.tags.includes(fallbacks[i])) {
              data.tags.push(fallbacks[i]);
            }
            i = (i + 1) % fallbacks.length;
          }
        }

        // Ensure price is between 200 and 300
        data.price = Math.max(200, Math.min(300, data.price));

        return data;
      }
    } catch (error: any) {
      if (error.status === 429 || error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('Too Many Requests')) {
        if (rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
          reportRateLimitError();
          console.log(`Rate limit hit, retrying after wait... (Rate limit retry ${rateLimitRetries + 1}/${MAX_RATE_LIMIT_RETRIES})`);
          rateLimitRetries++;
          attempt--; // Don't count this as a standard failure attempt, just wait and retry
          continue;
        } else {
          console.error("Max rate limit retries reached. Aborting.");
        }
      }
      console.error(`Error generating High Logo metadata (attempt ${attempt + 1}):`, error);
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return null;
}
export interface AssetMetadata {
  adobeStock?: {
    title: string;
    category: string;
    keywords: string[];
    trendingProbability: number;
  };
  shutterstock?: {
    description: string;
    categories: string[];
    keywords: string[];
    trendingProbability: number;
    isIllustration: boolean;
  };
  dreamstime?: {
    title: string;
    description: string;
    categories: string[];
    keywords: string[];
    trendingProbability: number;
  };
  '123rf'?: {
    description: string;
    keywords: string[];
    country: string;
    trendingProbability: number;
  };
}

export async function generateAssetMetadata(base64Data: string, mimeType: string, targetPlatforms: string[] = ['adobe', 'shutterstock', 'dreamstime', '123rf'], maxRetries = 3): Promise<AssetMetadata | null> {
  const adobeCategories = [
    "Animals", "Buildings and Architecture", "Business", "Drinks", "Environment", 
    "States of Mind", "Food", "Graphic Resources", "Hobbies and Leisure", "Industry", 
    "Landscapes", "Lifestyle", "People", "Plants and Flowers", "Culture and Religion", 
    "Science", "Social Issues", "Sports", "Technology", "Transport", "Travel"
  ];

  const shutterCategories = [
    "Abstract", "Animals/Wildlife", "Arts", "Backgrounds/Textures", "Beauty/Fashion", 
    "Buildings/Landmarks", "Business/Finance", "Celebrities", "Education", "Food and Drink", 
    "Healthcare/Medical", "Holidays", "Industrial", "Interiors", "Miscellaneous", "Nature", 
    "Objects", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", 
    "Sports/Recreation", "Technology", "Transportation"
  ];

  const dreamstimeCategories = [
    "Abstract", "Animals", "Arts & Architecture", "Business", "Editorial", "Holidays", 
    "IT & C", "Illustrations & Clipart", "Industries", "Nature", "Objects", "People", 
    "Technology", "Travel"
  ];

  let prompt = `You are an expert microstock contributor and SEO specialist. Analyze the provided asset (image or video) and generate highly optimized metadata. Your goal is to make this asset rank on the first page of search results and maximize commercial viability.
  
CRITICAL ANTI-REJECTION RULES (MUST FOLLOW STRICTLY):
1. NO TRADEMARKS (Visible Trademark Rejection): DO NOT use any brand names, company names, logos, or specific product names (e.g., Apple, Nike, Porsche, iPhone, Sony, Coca-Cola, Lego). Describe everything generically (e.g., "generic smartphone", "sports car", "running shoes", "soda can", "plastic building blocks").
2. NO INTELLECTUAL PROPERTY (IP Rejection): DO NOT mention specific modern architecture, famous landmarks, copyrighted artwork, movies, characters, writing, or sheet music. Describe them as generic concepts (e.g., "modern city building", "abstract painting", "toy figure", "musical notes").
3. BANNED WORDS: DO NOT include the words "Editable stroke", "Vector", "eps", "svg", "shutterstock", "stock", "image", "photo", or "picture" anywhere in the title, description, or keywords.

Failure to follow these rules will result in the asset being REJECTED by Shutterstock and Adobe Stock for "Visible Trademark" or "Intellectual Property" violations.\n\n`;

  if (targetPlatforms.length > 1) {
    prompt += `CRITICAL: The metadata for the requested platforms MUST BE DIFFERENT. Each platform has different search algorithms and trending keywords. Do not copy-paste the same title/description or keywords across platforms.\n\n`;
  }

  if (targetPlatforms.includes('adobe')) {
    prompt += `Requirements for Adobe Stock:
  1. Title: Must be between 12 and 15 words. Use natural, flowing, and professional English. DO NOT use robotic style or over-repeat conjunctions like 'plus'. Focus on the core visual essence. Ensure it is highly relevant to buyers.
  2. Keywords: You MUST generate EXACTLY 50 highly relevant keywords that have the potential to trend on Adobe Stock. Rank the most important keywords first.
  3. Category: Choose EXACTLY ONE category from this list: ${adobeCategories.join(", ")}.
  4. Trending Probability: Estimate the percentage likelihood that this asset will trend on Adobe Stock. This value MUST BE 90 or higher (between 90 and 100).\n\n`;
  }

  if (targetPlatforms.includes('shutterstock')) {
    prompt += `Requirements for Shutterstock:
  1. Description: Must be between 12 and 15 words. Use natural, flowing, and professional English. DO NOT use robotic style or over-repeat conjunctions like 'plus'. Focus on the core visual essence. Ensure it is highly relevant to buyers. CRITICAL: MUST NOT CONTAIN ANY TRADEMARKS OR IP. DO NOT use the symbols "&", "/", or ":" in the description.
  2. Keywords: You MUST generate EXACTLY 50 highly relevant keywords that have the potential to trend on Shutterstock.${targetPlatforms.length > 1 ? ' Make them different from the other platforms.' : ''} Rank the most important keywords first. CRITICAL: DO NOT include trademarked names, IP, camera brands, or restricted spam words. DO NOT use hyphens ("-") in keywords (e.g., use "e commerce" instead of "e-commerce"). DO NOT include the words "iconset", "news", "ahad", "idul adha", "survivalism", "wallbox", "stomatologist", "auth", "sajadah", "toolset", "woodsball", "agrotech", "agrotechnology", "spellbook", "synergize", "al fitr", "ramadhan", "ringlight", "bowl of hygieia", or "sujud".
  3. Categories: Choose EXACTLY TWO categories from this list: ${shutterCategories.join(", ")}.
  4. Trending Probability: Estimate the percentage likelihood that this asset will trend on Shutterstock. This value MUST BE 90 or higher (between 90 and 100).
  5. Is Illustration: Determine if the asset is an illustration, vector, 3D render, or AI generated art (true) or a real photograph (false).\n\n`;
  }

  if (targetPlatforms.includes('dreamstime')) {
    prompt += `Requirements for Dreamstime:
  1. Title: Must be a concise, catchy title (around 5-8 words). Focus on the main subject.
  2. Description: Must be a detailed sentence (around 12-20 words). CRITICAL: The Title and Description MUST NOT BE IDENTICAL. The description must provide more context, action, or details than the title. If they are identical, Dreamstime will reject it.
  3. Keywords: You MUST generate EXACTLY 50 highly relevant keywords.
  4. Categories: Choose EXACTLY TWO categories from this list: ${dreamstimeCategories.join(", ")}.
  5. Trending Probability: Estimate the percentage likelihood that this asset will trend on Dreamstime. This value MUST BE 90 or higher.\n\n`;
  }

  if (targetPlatforms.includes('123rf')) {
    prompt += `Requirements for 123rf:
  1. Description: Must be between 12 and 15 words. Use natural, flowing, and professional English. Focus on the core visual essence. CRITICAL: MUST NOT CONTAIN ANY TRADEMARKS OR IP.
  2. Keywords: You MUST generate EXACTLY 50 highly relevant keywords.
  3. Country: Provide a 2-letter ISO country code (e.g., "US", "ID", "GB") that best represents the content or target market of the image.
  4. Trending Probability: Estimate the percentage likelihood that this asset will trend on 123rf. This value MUST BE 90 or higher.\n\n`;
  }

  prompt += `Return the result in JSON format.`;

  const schemaProperties: any = {};
  const schemaRequired: string[] = [];

  if (targetPlatforms.includes('adobe')) {
    schemaProperties.adobeStock = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        category: { type: Type.STRING },
        keywords: { 
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        trendingProbability: { type: Type.NUMBER }
      },
      required: ["title", "category", "keywords", "trendingProbability"]
    };
    schemaRequired.push("adobeStock");
  }

  if (targetPlatforms.includes('shutterstock')) {
    schemaProperties.shutterstock = {
      type: Type.OBJECT,
      properties: {
        description: { type: Type.STRING },
        categories: { 
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        keywords: { 
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        trendingProbability: { type: Type.NUMBER },
        isIllustration: { type: Type.BOOLEAN }
      },
      required: ["description", "categories", "keywords", "trendingProbability", "isIllustration"]
    };
    schemaRequired.push("shutterstock");
  }

  if (targetPlatforms.includes('dreamstime')) {
    schemaProperties.dreamstime = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        categories: { 
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        keywords: { 
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        trendingProbability: { type: Type.NUMBER }
      },
      required: ["title", "description", "categories", "keywords", "trendingProbability"]
    };
    schemaRequired.push("dreamstime");
  }

  if (targetPlatforms.includes('123rf')) {
    schemaProperties['123rf'] = {
      type: Type.OBJECT,
      properties: {
        description: { type: Type.STRING },
        keywords: { 
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        country: { type: Type.STRING },
        trendingProbability: { type: Type.NUMBER }
      },
      required: ["description", "keywords", "country", "trendingProbability"]
    };
    schemaRequired.push("123rf");
  }

  let lastError = null;
  let rateLimitRetries = 0;
  const MAX_RATE_LIMIT_RETRIES = 5;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await waitForRateLimit();
      const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: schemaProperties,
          required: schemaRequired
        }
      }
    });

      if (response.text) {
        const data = JSON.parse(response.text) as AssetMetadata;
        
        // Force the values to be at least 90 to satisfy the requirement without retrying
        if (data.adobeStock) {
          data.adobeStock.trendingProbability = Math.max(90, data.adobeStock.trendingProbability);
        }
        
        if (data.shutterstock) {
          data.shutterstock.trendingProbability = Math.max(90, data.shutterstock.trendingProbability);
          
          // Clean up Shutterstock description: remove &, /, :
          data.shutterstock.description = data.shutterstock.description
            .replace(/[&/:]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
            
          // Clean up Shutterstock keywords: remove hyphens, filter banned words
          const bannedKeywords = ['iconset', 'news', 'ahad', 'idul adha', 'survivalism', 'wallbox', 'stomatologist', 'auth', 'sajadah', 'toolset', 'woodsball', 'agrotech', 'agrotechnology', 'spellbook', 'synergize', 'al fitr', 'ramadhan', 'ringlight', 'bowl of hygieia', 'sujud'];
          data.shutterstock.keywords = data.shutterstock.keywords
            .map(kw => kw.replace(/-/g, ' ').replace(/\s+/g, ' ').trim())
            .filter(kw => {
              const lowerKw = kw.toLowerCase();
              return !bannedKeywords.includes(lowerKw) && lowerKw !== '';
            });
        }

        if (data.dreamstime) {
          data.dreamstime.trendingProbability = Math.max(90, data.dreamstime.trendingProbability);
          // Ensure title and description are not identical
          if (data.dreamstime.title.toLowerCase() === data.dreamstime.description.toLowerCase()) {
             data.dreamstime.description = data.dreamstime.description + " High quality, detailed view.";
          }
        }

        if (data['123rf']) {
          data['123rf'].trendingProbability = Math.max(90, data['123rf'].trendingProbability);
        }
        
        return data;
      }
    } catch (error: any) {
      if (error.status === 429 || error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('Too Many Requests')) {
        if (rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
          reportRateLimitError();
          console.log(`Rate limit hit, retrying after wait... (Rate limit retry ${rateLimitRetries + 1}/${MAX_RATE_LIMIT_RETRIES})`);
          rateLimitRetries++;
          attempt--; // Don't count this as a standard failure attempt, just wait and retry
          continue;
        } else {
          console.error("Max rate limit retries reached. Aborting.");
        }
      }
      console.error(`Error generating asset metadata (attempt ${attempt + 1}):`, error);
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return null;
}

