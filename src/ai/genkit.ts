
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { anthropic } from 'genkitx-anthropic';

export const ai = genkit({
  plugins: [
    googleAI(),
    anthropic()
  ],
  model: 'googleai/gemini-1.5-pro-latest', // Default model, can be overridden in specific calls
});
