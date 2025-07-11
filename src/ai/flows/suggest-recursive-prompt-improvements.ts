
'use server';
/**
 * @fileOverview A Genkit flow that suggests improvements to a prompt template
 * based on mismatches in a ground truth evaluation run.
 *
 * - suggestRecursivePromptImprovements - A function that takes the original prompt,
 *   mismatch details, and optional schemas, then suggests an improved prompt.
 * - SuggestRecursivePromptImprovementsInput - The input type.
 * - SuggestRecursivePromptImprovementsOutput - The output type (suggested prompt and reasoning).
 */

import {ai} from '@/ai/genkit';
import { z } from 'genkit'; 

const MismatchDetailSchema = z.object({
  inputData: z.record(z.string(), z.any()).describe("The input parameters for the row that had a mismatch."),
  evaluationParameterName: z.string().describe("The name of the evaluation parameter where the mismatch occurred."),
  evaluationParameterDefinition: z.string().describe("The definition of the evaluation parameter."),
  llmChosenLabel: z.string().describe("The label incorrectly chosen by the LLM."),
  groundTruthLabel: z.string().describe("The correct ground truth label."),
  llmRationale: z.string().optional().describe("The LLM's rationale for its choice, if provided."),
});
export type MismatchDetail = z.infer<typeof MismatchDetailSchema>;

const SuggestRecursivePromptImprovementsInputSchema = z.object({
  originalPromptTemplate: z.string().describe("The original prompt template text that was used in the evaluation."),
  mismatchDetails: z.array(MismatchDetailSchema).describe("An array of objects, each detailing a specific instance where the LLM's output did not match the ground truth."),
  inputParametersSchema: z.string().optional().describe("A JSON string or textual description of the schema for input parameters (e.g., field names, types, descriptions)."), // Renamed from productParametersSchema
  evaluationParametersSchema: z.string().optional().describe("A JSON string or textual description of all evaluation parameters and their labels that were part of the evaluation setup."),
});
export type SuggestRecursivePromptImprovementsInput = z.infer<typeof SuggestRecursivePromptImprovementsInputSchema>;

const SuggestRecursivePromptImprovementsOutputSchema = z.object({
  suggestedPromptTemplate: z.string().describe("The full text of the suggested, improved prompt template."),
  reasoning: z.string().describe("A step-by-step explanation of why the suggested changes were made, referencing specific mismatches or patterns observed."),
});
export type SuggestRecursivePromptImprovementsOutput = z.infer<typeof SuggestRecursivePromptImprovementsOutputSchema>;

export async function suggestRecursivePromptImprovements(
  input: SuggestRecursivePromptImprovementsInput
): Promise<SuggestRecursivePromptImprovementsOutput> {
  return internalSuggestRecursivePromptImprovementsFlow(input);
}

const handlebarsPrompt = `
You are an expert Prompt Engineer tasked with improving an existing prompt template based on its performance in a ground truth evaluation.
Your goal is to refine the prompt to minimize the mismatches observed.

Here is the original prompt template that was used:
<OriginalPromptTemplate>
{{{originalPromptTemplate}}}
</OriginalPromptTemplate>

Here are details of the mismatches from the evaluation run where the LLM's output did not match the ground truth:
<MismatchDetails>
{{#each mismatchDetails}}
- Mismatch for Evaluation Parameter: "{{evaluationParameterName}}"
  - Parameter Definition: "{{evaluationParameterDefinition}}"
  - Input Data: {{json inputData}}
  - LLM's Incorrect Label: "{{llmChosenLabel}}"
  - Correct Ground Truth Label: "{{groundTruthLabel}}"
  {{#if llmRationale}}
  - LLM's Rationale for Incorrect Choice: "{{llmRationale}}"
  {{/if}}
{{/each}}
</MismatchDetails>

{{#if inputParametersSchema}}
For context, here is the schema of input parameters that can be used in the prompt template:
<InputParametersSchema>
{{{inputParametersSchema}}}
</InputParametersSchema>
{{/if}}

{{#if evaluationParametersSchema}}
And here is the schema of all evaluation parameters (including their labels) that the LLM was judging against:
<EvaluationParametersSchema>
{{{evaluationParametersSchema}}}
</EvaluationParametersSchema>
{{/if}}

Based on all this information, please provide:
1.  A 'suggestedPromptTemplate': The full text of the revised prompt template. Make specific, targeted changes to address the identified mismatches. Consider clarity, specificity, instructions, and how the LLM might misinterpret the original prompt. Aim to make the prompt more robust.
2.  A 'reasoning': A detailed explanation for each significant change you made to the prompt, linking it back to the observed mismatches or general prompt engineering best practices. Explain how your suggested changes are intended to prevent similar mismatches in the future.

Focus on incremental but impactful improvements. Do not completely rewrite the prompt unless absolutely necessary.
Your entire response must be ONLY the JSON object matching the output schema, with no other surrounding text or explanations.
`;

const suggestionPrompt = ai.definePrompt({
  name: 'suggestRecursivePromptImprovementsPrompt',
  input: {schema: SuggestRecursivePromptImprovementsInputSchema},
  output: {schema: SuggestRecursivePromptImprovementsOutputSchema},
  prompt: handlebarsPrompt,
  config: {
    temperature: 0.4,
  },
});

const internalSuggestRecursivePromptImprovementsFlow = ai.defineFlow(
  {
    name: 'internalSuggestRecursivePromptImprovementsFlow',
    inputSchema: SuggestRecursivePromptImprovementsInputSchema,
    outputSchema: SuggestRecursivePromptImprovementsOutputSchema,
  },
  async (input) => {
    try {
      const { output, usage } = await suggestionPrompt(input);
      if (!output) {
        console.error('LLM did not return a parsable output for prompt improvement suggestions. Usage:', usage);
        return {
          suggestedPromptTemplate: "// Error: LLM did not return parsable output for prompt suggestions. Original prompt was:\n" + input.originalPromptTemplate,
          reasoning: "Failed to generate suggestions due to LLM output parsing error or empty response. Usage data (if available): " + JSON.stringify(usage)
        };
      }
      return output;
    } catch (error: any) {
      console.error('Error in internalSuggestRecursivePromptImprovementsFlow:', error);
      return {
        suggestedPromptTemplate: `// Error executing prompt improvement flow: ${error.message || 'Unknown error'}. Original prompt was:\n` + input.originalPromptTemplate,
        reasoning: `Flow execution error: ${error.message || 'Unknown error'}.`
      };
    }
  }
);
