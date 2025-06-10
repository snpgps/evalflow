
'use server';

/**
 * @fileOverview A flow that suggests improvements to prompt templates based on eval run results.
 *
 * - suggestPromptImprovements - A function that takes prompt template and eval results as input, and suggests improvements.
 * - SuggestPromptImprovementsInput - The input type for the suggestPromptImprovements function.
 * - SuggestPromptImprovementsOutput - The return type for the suggestPromptImprovements function.
 */

import {ai}from '@/ai/genkit';
import {z}from 'genkit';

const SuggestPromptImprovementsInputSchema = z.object({
  promptTemplate: z.string().describe('The prompt template to be improved.'),
  evalResults: z
    .string()
    .describe(
      'The eval results from previous runs, in JSON format. Include data such as accuracy metrics, per-parameter breakdown, confusion matrix.'
    ),
});
export type SuggestPromptImprovementsInput = z.infer<
  typeof SuggestPromptImprovementsInputSchema
>;

const SuggestPromptImprovementsOutputSchema = z.object({
  suggestedImprovements: z
    .string()
    .describe('The suggested improvements to the prompt template.'),
  reasoning: z.string().describe('The reasoning behind the suggested improvements.'),
});
export type SuggestPromptImprovementsOutput = z.infer<
  typeof SuggestPromptImprovementsOutputSchema
>;

export async function suggestPromptImprovements(
  input: SuggestPromptImprovementsInput
): Promise<SuggestPromptImprovementsOutput> {
  return suggestPromptImprovementsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestPromptImprovementsPrompt',
  input: {schema: SuggestPromptImprovementsInputSchema},
  output: {schema: SuggestPromptImprovementsOutputSchema},
  prompt: `You are an AI prompt optimization expert. Analyze the provided prompt template and evaluation results to suggest improvements to the prompt template.

Prompt Template:
{{promptTemplate}}

Evaluation Results:
{{evalResults}}

Based on the evaluation results, provide specific, actionable suggestions for improving the prompt template. Explain the reasoning behind each suggestion.

Output the suggested improvements and reasoning in a structured format.
`,
});

const suggestPromptImprovementsFlow = ai.defineFlow(
  {
    name: 'suggestPromptImprovementsFlow',
    inputSchema: SuggestPromptImprovementsInputSchema,
    outputSchema: SuggestPromptImprovementsOutputSchema,
  },
  async input => {
    try {
      const {output, usage} = await prompt(input);
      if (!output) {
        console.error('LLM did not return parsable output for prompt improvement suggestions. Usage:', usage);
        return {
          suggestedImprovements: "// Error: LLM did not return parsable output. Original prompt was:\n" + input.promptTemplate,
          reasoning: "No reasoning due to parsing error. Usage data (if available): " + JSON.stringify(usage)
        };
      }
      return output;
    } catch (error: any) {
      console.error('Error in suggestPromptImprovementsFlow:', error);
      return {
        suggestedImprovements: `// Error executing prompt improvement flow: ${error.message || 'Unknown error'}. Original prompt was:\n` + input.promptTemplate,
        reasoning: `Flow execution error: ${error.message || 'Unknown error'}.`
      };
    }
  }
);
