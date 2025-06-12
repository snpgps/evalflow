
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
      // Check for specific error structures, like Genkit's internal errors
      let errorMessage = 'An unknown error occurred during the test.';
      if (error.message) {
        errorMessage = error.message;
      }
      if (error.cause && typeof error.cause === 'object' && error.cause !== null && 'message' in error.cause) {
         errorMessage += ` (Cause: ${error.cause.message})`;
      }
      if (error.details) {
        errorMessage += ` (Details: ${JSON.stringify(error.details)})`;
      }
      
      return {
        success: false,
        error: errorMessage,
        modelUsed: input.modelId,
      };
    }
  }
);
