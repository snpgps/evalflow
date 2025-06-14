
'use server';
/**
 * @fileOverview A flow to test a direct connection to an OpenAI model using the globally configured client.
 *
 * - testDirectOpenAIClient - A function that attempts to generate text using a specified OpenAI model via the direct client.
 * - TestDirectOpenAIClientInput - The input type.
 * - TestDirectOpenAIClientOutput - The output type.
 */

import { openAIClient } from '@/ai/genkit'; // Using the global client
import { ai } from '@/ai/genkit'; // For ai.defineFlow and Zod from Genkit
import { z } from 'genkit';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const TestDirectOpenAIClientInputSchema = z.object({
  modelName: z.string().describe("The OpenAI model name, e.g., 'gpt-3.5-turbo' or 'gpt-4o'."),
  testPrompt: z.string().default("Hello OpenAI, please respond with a short friendly greeting if you are there.").describe("A simple prompt to send to the model."),
});
export type TestDirectOpenAIClientInput = z.infer<typeof TestDirectOpenAIClientInputSchema>;

const TestDirectOpenAIClientOutputSchema = z.object({
  success: z.boolean().describe("Whether the connection and generation attempt was successful."),
  responseText: z.string().optional().describe("The text response from the model if successful."),
  error: z.string().optional().describe("Any error message if the attempt failed."),
  modelUsed: z.string().optional().describe("The model name that was actually used or attempted."),
  usage: z.any().optional().describe("Usage information from the LLM call, if available (e.g., token counts).")
});
export type TestDirectOpenAIClientOutput = z.infer<typeof TestDirectOpenAIClientOutputSchema>;

export async function testDirectOpenAIClient(
  input: TestDirectOpenAIClientInput
): Promise<TestDirectOpenAIClientOutput> {
  return internalTestDirectOpenAIClientFlow(input);
}

const internalTestDirectOpenAIClientFlow = ai.defineFlow(
  {
    name: 'internalTestDirectOpenAIClientFlow',
    inputSchema: TestDirectOpenAIClientInputSchema,
    outputSchema: TestDirectOpenAIClientOutputSchema,
  },
  async (input) => {
    try {
      console.log(`Attempting direct OpenAI client test with model: ${input.modelName}`);
      if (!openAIClient) {
        throw new Error("OpenAI client is not initialized in src/ai/genkit.ts. Check OPENAI_API_KEY environment variable and server restart.");
      }

      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: input.testPrompt }];
      
      const response = await openAIClient.chat.completions.create({
        model: input.modelName,
        messages: messages,
        max_tokens: 256, 
        temperature: 0.3,
      });
      
      const responseText = response.choices[0]?.message?.content;
      const usage = response.usage;

      if (responseText === null || responseText === undefined) {
        console.error('OpenAI response content is null or undefined. Full response:', JSON.stringify(response, null, 2).substring(0, 500));
        return {
          success: false,
          error: "OpenAI returned an empty response.",
          modelUsed: input.modelName,
          usage: usage,
        };
      }
      
      console.log('Direct OpenAI client test successful. Response:', responseText);
      return {
        success: true,
        responseText: responseText,
        modelUsed: input.modelName,
        usage: usage,
      };
    } catch (error: any) {
      console.error(`Error testing direct OpenAI client with model ${input.modelName}:`, error);
      
      let errorMessage = 'An unknown error occurred during the direct OpenAI client test.';
      if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
        // Handle structured API errors from OpenAI
        errorMessage = `OpenAI API Error: ${error.response.data.error.message} (Type: ${error.response.data.error.type || 'N/A'}, Code: ${error.response.data.error.code || 'N/A'})`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Common error patterns for OpenAI client
      if (error.status === 401) {
        errorMessage = `AuthenticationError: Invalid API key. Ensure OPENAI_API_KEY is correct and the server was restarted. Original: ${error.message}`;
      } else if (error.status === 403) {
        errorMessage = `PermissionDeniedError: API key might lack permissions for model '${input.modelName}' or the API. Original: ${error.message}`;
      } else if (error.status === 404) {
         errorMessage = `NotFoundError: Model '${input.modelName}' not found by OpenAI API or invalid API endpoint. Original: ${error.message}`;
      } else if (error.status === 429) {
        errorMessage = `RateLimitError: You have hit your rate limit or quota for the OpenAI API. Original: ${error.message}`;
      } else if (error.name === 'APIError') { // General OpenAI API error
         errorMessage = `OpenAI APIError: ${error.message} (Status: ${error.status || 'N/A'}, Type: ${error.type || 'N/A'})`;
      }


      return {
        success: false,
        error: errorMessage,
        modelUsed: input.modelName,
      };
    }
  }
);
