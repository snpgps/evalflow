
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai'; // Import OpenAI

// Initialize Anthropic client globally
export const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // Ensure ANTHROPIC_API_KEY is in your .env or .env.local
});

// Initialize OpenAI client globally
export const openAIClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure OPENAI_API_KEY is in your .env or .env.local
});

export const ai = genkit({
  plugins: [
    googleAI(),
    // openai(), // Removed OpenAI Genkit plugin
    // anthropic() // Do not add anthropic here as per instructions
  ],
  model: 'googleai/gemini-1.5-pro-latest', // Default model, can be overridden in specific calls
});

