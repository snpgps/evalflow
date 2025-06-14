
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai'; // Import OpenAI

// Initialize Anthropic client globally
let anthropicClientInstance: Anthropic | undefined;
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "WARN: ANTHROPIC_API_KEY is not set in the environment. " +
    "The Anthropic client will not be initialized. Ensure this key is configured in your deployment environment (e.g., Netlify)."
  );
} else {
  try {
    anthropicClientInstance = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  } catch (e: any) {
    console.error("ERROR: Failed to initialize Anthropic client:", e.message);
  }
}
export const anthropicClient = anthropicClientInstance;

// Initialize OpenAI client globally
let openAIClientInstance: OpenAI | undefined;
if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "WARN: OPENAI_API_KEY is not set in the environment. " +
    "The OpenAI client will not be initialized. Ensure this key is configured in your deployment environment (e.g., Netlify)."
  );
} else {
  try {
    openAIClientInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  } catch (e: any) {
    console.error("ERROR: Failed to initialize OpenAI client:", e.message);
  }
}
export const openAIClient = openAIClientInstance;

export const ai = genkit({
  plugins: [
    googleAI(), // Google AI client initialization might also depend on GOOGLE_API_KEY or ADC setup.
                // Genkit's googleAI plugin usually handles this, but ensure your Google Cloud environment/auth is correct for Netlify.
    // openai(), // Removed OpenAI Genkit plugin
    // anthropic() // Do not add anthropic here as per instructions
  ],
  model: 'googleai/gemini-1.5-pro-latest', // Default model, can be overridden in specific calls
});
