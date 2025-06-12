
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
// import {anthropic} from '@genkit-ai/anthropic'; // Commented out due to installation issues

export const ai = genkit({
  plugins: [
    googleAI(),
    // anthropic() // Commented out due to installation issues
  ],
  model: 'googleai/gemini-1.5-pro-latest', // Default model, can be overridden in specific calls
});
