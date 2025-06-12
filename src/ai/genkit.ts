
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
// Removed Anthropic plugin import as it was causing npm install issues

export const ai = genkit({
  plugins: [
    googleAI(),
    // anthropic() // Anthropic plugin temporarily removed
  ],
  model: 'googleai/gemini-1.5-pro-latest', // Default model, can be overridden in specific calls
});
