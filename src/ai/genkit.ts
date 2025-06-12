import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {anthropic} from '@genkit-ai/anthropic'; // Updated import

export const ai = genkit({
  plugins: [
    googleAI(),
    anthropic() // Initialize Anthropic plugin
  ],
  model: 'googleai/gemini-1.5-pro-latest', // Default model, can be overridden in specific calls
});
