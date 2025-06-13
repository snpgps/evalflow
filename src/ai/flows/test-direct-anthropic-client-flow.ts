
'use server';
/**
 * @fileOverview A Genkit flow to test a direct connection to an Anthropic model using the globally configured client.
 *
 * - testDirectAnthropicClient - A function that attempts to generate text using a specified Anthropic model via the direct client.
 * - TestDirectAnthropicClientInput - The input type.
 * - TestDirectAnthropicClientOutput - The output type.
 */

import { anthropicClient } from '@/ai/genkit'; // Using the global client
import { ai } from '@/ai/genkit'; // For ai.defineFlow and Zod from Genkit
import { z } from 'genkit';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

const TestDirectAnthropicClientInputSchema = z.object({
  modelName: z.string().describe("The Anthropic model name, e.g., 'claude-3-opus-20240229'."),
  testPrompt: z.string().default("Hello Claude, please respond with a short friendly greeting if you are there.").describe("A simple prompt to send to the model."),
});
export type TestDirectAnthropicClientInput = z.infer<typeof TestDirectAnthropicClientInputSchema>;

const TestDirectAnthropicClientOutputSchema = z.object({
  success: z.boolean().describe("Whether the connection and generation attempt was successful."),
  responseText: z.string().optional().describe("The text response from the model if successful."),
  error: z.string().optional().describe("Any error message if the attempt failed."),
  modelUsed: z.string().optional().describe("The model name that was actually used or attempted."),
  // Usage for direct client calls is often part of the response object itself, not a separate field like Genkit's `usage`.
  // We can extract tokens if needed, but keeping it simple for now.
});
export type TestDirectAnthropicClientOutput = z.infer<typeof TestDirectAnthropicClientOutputSchema>;

export async function testDirectAnthropicClient(
  input: TestDirectAnthropicClientInput
): Promise<TestDirectAnthropicClientOutput> {
  return internalTestDirectAnthropicClientFlow(input);
}

const internalTestDirectAnthropicClientFlow = ai.defineFlow(
  {
    name: 'internalTestDirectAnthropicClientFlow',
    inputSchema: TestDirectAnthropicClientInputSchema,
    outputSchema: TestDirectAnthropicClientOutputSchema,
  },
  async (input) => {
    try {
      console.log(`Attempting direct Anthropic client test with model: ${input.modelName}`);
      if (!anthropicClient) {
        throw new Error("Anthropic client is not initialized in src/ai/genkit.ts. Check ANTHROPIC_API_KEY environment variable and server restart.");
      }

      const messages: MessageParam[] = [{ role: 'user', content: input.testPrompt }];
      
      const response = await anthropicClient.messages.create({
        model: input.modelName,
        messages: messages,
        max_tokens: 256, // Reasonable max for a test prompt
        temperature: 0.3,
      });
      
      const responseText = response.content[0].text;
      console.log('Direct Anthropic client test successful. Response:', responseText);
      return {
        success: true,
        responseText: responseText,
        modelUsed: input.modelName,
        // Anthropic SDK v4+ usage (input_tokens, output_tokens) is in `response.usage`
        // For simplicity in this test, we're not explicitly including it in TestDirectAnthropicClientOutputSchema
      };
    } catch (error: any) {
      console.error(`Error testing direct Anthropic client with model ${input.modelName}:`, error);
      
      let errorMessage = 'An unknown error occurred during the direct Anthropic client test.';
      if (error.message) {
        errorMessage = error.message;
      }
      
      // Common error patterns for direct Anthropic client
      if (error.status === 401) {
        errorMessage = `AuthenticationError: Invalid API key. Ensure ANTHROPIC_API_KEY is correct and the server was restarted. Original: ${error.message}`;
      } else if (error.status === 403) {
        errorMessage = `PermissionDeniedError: API key might lack permissions for model '${input.modelName}' or the API. Original: ${error.message}`;
      } else if (error.status === 404) {
        errorMessage = `NotFoundError: Model '${input.modelName}' not found by Anthropic API or invalid API endpoint. Original: ${error.message}`;
      } else if (error.name === 'AnthropicAPIError') {
         errorMessage = `AnthropicAPIError: ${error.message} (Status: ${error.status || 'N/A'}, Type: ${error.type || 'N/A'})`;
      }

      return {
        success: false,
        error: errorMessage,
        modelUsed: input.modelName,
      };
    }
  }
);
