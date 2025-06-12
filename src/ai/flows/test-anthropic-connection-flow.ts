
'use server';
/**
 * @fileOverview A Genkit flow to test a connection to an Anthropic model.
 *
 * - testAnthropicConnection - A function that attempts to generate text using a specified Anthropic model.
 * - TestAnthropicConnectionInput - The input type.
 * - TestAnthropicConnectionOutput - The output type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const TestAnthropicConnectionInputSchema = z.object({
  modelId: z.string().describe("The full Genkit model identifier for an Anthropic model, e.g., 'anthropic/claude-3-haiku-20240307'."),
  testPrompt: z.string().default("Hello Claude, please respond with a short friendly greeting if you are there.").describe("A simple prompt to send to the model."),
});
export type TestAnthropicConnectionInput = z.infer<typeof TestAnthropicConnectionInputSchema>;

const TestAnthropicConnectionOutputSchema = z.object({
  success: z.boolean().describe("Whether the connection and generation attempt was successful."),
  responseText: z.string().optional().describe("The text response from the model if successful."),
  error: z.string().optional().describe("Any error message if the attempt failed."),
  modelUsed: z.string().optional().describe("The model ID that was actually used or attempted."),
  usage: z.any().optional().describe("Usage information from the LLM call, if available.")
});
export type TestAnthropicConnectionOutput = z.infer<typeof TestAnthropicConnectionOutputSchema>;

export async function testAnthropicConnection(
  input: TestAnthropicConnectionInput
): Promise<TestAnthropicConnectionOutput> {
  return internalTestAnthropicConnectionFlow(input);
}

const internalTestAnthropicConnectionFlow = ai.defineFlow(
  {
    name: 'internalTestAnthropicConnectionFlow',
    inputSchema: TestAnthropicConnectionInputSchema,
    outputSchema: TestAnthropicConnectionOutputSchema,
  },
  async (input) => {
    // Check if the model is Anthropic and if the plugin is conceptually disabled
    if (input.modelId.startsWith('anthropic/')) {
      const anthropicPluginErrorMessage = "Anthropic plugin is currently not active due to package installation issues. Please resolve the '@genkit-ai/anthropic' package problem to enable Anthropic model tests.";
      console.warn(`Test for Anthropic model ${input.modelId} skipped: ${anthropicPluginErrorMessage}`);
      return {
        success: false,
        error: anthropicPluginErrorMessage,
        modelUsed: input.modelId,
      };
    }

    try {
      console.log(`Attempting to test connection with model: ${input.modelId}`);
      const { text, usage, finishReason, model } = await ai.generate({
        model: input.modelId,
        prompt: input.testPrompt,
        config: { temperature: 0.3 }, // Simple config for a test
      });

      console.log('Test call successful. Response:', text, 'Usage:', usage, 'Finish Reason:', finishReason);
      return {
        success: true,
        responseText: text,
        modelUsed: model,
        usage: usage,
      };
    } catch (error: any) {
      console.error(`Error testing connection with model ${input.modelId}:`, error);
      return {
        success: false,
        error: error.message || 'An unknown error occurred during the test.',
        modelUsed: input.modelId,
      };
    }
  }
);

