
'use server';
/**
 * @fileOverview A Genkit flow to test a connection to a Google AI model (e.g., Gemini via Vertex AI).
 *
 * - testGoogleAIConnection - A function that attempts to generate text using a specified Google AI model.
 * - TestGoogleAIConnectionInput - The input type.
 * - TestGoogleAIConnectionOutput - The output type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const TestGoogleAIConnectionInputSchema = z.object({
  modelId: z.string().describe("The full Genkit model identifier for a Google AI model, e.g., 'googleai/gemini-1.5-pro-latest'."),
  testPrompt: z.string().default("Hello Gemini, please respond with a short friendly greeting and mention your model name if you know it.").describe("A simple prompt to send to the model."),
});
export type TestGoogleAIConnectionInput = z.infer<typeof TestGoogleAIConnectionInputSchema>;

const TestGoogleAIConnectionOutputSchema = z.object({
  success: z.boolean().describe("Whether the connection and generation attempt was successful."),
  responseText: z.string().optional().describe("The text response from the model if successful."),
  error: z.string().optional().describe("Any error message if the attempt failed."),
  modelUsed: z.string().optional().describe("The model ID that was actually used or attempted."),
  usage: z.any().optional().describe("Usage information from the LLM call, if available.")
});
export type TestGoogleAIConnectionOutput = z.infer<typeof TestGoogleAIConnectionOutputSchema>;

export async function testGoogleAIConnection(
  input: TestGoogleAIConnectionInput
): Promise<TestGoogleAIConnectionOutput> {
  return internalTestGoogleAIConnectionFlow(input);
}

const internalTestGoogleAIConnectionFlow = ai.defineFlow(
  {
    name: 'internalTestGoogleAIConnectionFlow',
    inputSchema: TestGoogleAIConnectionInputSchema,
    outputSchema: TestGoogleAIConnectionOutputSchema,
  },
  async (input) => {
    try {
      console.log(`Attempting to test Google AI connection with model: ${input.modelId}`);
      const response = await ai.generate({
        model: input.modelId, // This should be the fully qualified Genkit model ID like 'googleai/gemini-1.5-pro-latest'
        prompt: input.testPrompt,
        config: { temperature: 0.7 }, // Using a slightly higher temp for more varied test responses
      });

      const text = response.text;
      const usage = response.usage;
      const modelUsed = response.candidates[0]?.model;
      const finishReason = response.candidates[0]?.finishReason;

      console.log('Google AI Test call successful. Response:', text, 'Usage:', usage, 'Finish Reason:', finishReason, 'Model Used:', modelUsed);
      return {
        success: true,
        responseText: text,
        modelUsed: modelUsed || input.modelId, // Fallback to input.modelId if not present on candidate
        usage: usage,
      };
    } catch (error: any) {
      console.error(`Error testing Google AI connection with model ${input.modelId}:`, error);
      
      let errorMessage = 'An unknown error occurred during the Google AI test.';
      if (error.message) {
        errorMessage = error.message;
      }

      // Check for common error patterns with Google AI / Vertex AI
      if (input.modelId.startsWith('googleai/') && error.message) {
        if (error.message.includes('NOT_FOUND') || error.message.includes('Model not found')) {
          errorMessage = `Model '${input.modelId}' not found by Genkit for Google AI.

Possible reasons:
1. GOOGLE_API_KEY / ADC: Ensure the GOOGLE_API_KEY environment variable is correctly set OR Application Default Credentials (ADC) are configured in the Next.js server environment where Genkit is running.
2. Model Name: Double-check if '${input.modelId}' (e.g., 'googleai/gemini-1.5-pro-latest') is a valid identifier for Google AI models in Genkit.
3. API Key/Permissions: The API key might be invalid or lack permissions for this specific model or the Vertex AI API might not be enabled in your Google Cloud project.
4. Plugin Issue: There could be an issue with the '@genkit-ai/googleai' plugin itself.

Original error: ${error.message}`;
        } else if (error.message.includes('PERMISSION_DENIED') || error.message.includes('Vertex AI API has not been used')) {
             errorMessage = `Permission denied for model '${input.modelId}'.

Possible reasons:
1. Vertex AI API Not Enabled: Ensure the Vertex AI API is enabled in your Google Cloud project.
2. Billing Not Enabled: Billing must be enabled for the Google Cloud project.
3. Credentials Scope: Your GOOGLE_API_KEY or ADC might lack permissions for Vertex AI or the specific model.
4. Project Mismatch: Ensure the Genkit plugin is configured for the correct Google Cloud project if using ADC.

Original error: ${error.message}`;
        } else if (error.message.includes('API key not valid')) {
            errorMessage = `The GOOGLE_API_KEY provided is not valid for model '${input.modelId}'. Please check the key and its restrictions.

Original error: ${error.message}`;
        }
      }
      
      if (error.cause && typeof error.cause === 'object' && error.cause !== null && 'message' in error.cause && errorMessage !== error.message) {
         errorMessage += ` (Cause: ${error.cause.message})`;
      }
      if (error.details && errorMessage !== error.message) {
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

