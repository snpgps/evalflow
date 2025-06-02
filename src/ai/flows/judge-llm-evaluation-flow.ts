
'use server';
/**
 * @fileOverview A Genkit flow that uses an LLM to judge an input against evaluation parameters.
 *
 * - judgeLlmEvaluation - A function that takes a full prompt and evaluation parameter details,
 *   then calls an LLM to get a structured evaluation.
 * - JudgeLlmEvaluationInput - The input type for the judgeLlmEvaluation function.
 * - JudgeLlmEvaluationOutput - The return type (structured evaluation) for the judgeLlmEvaluation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Defines the structure of individual evaluation parameters passed to the flow
const EvaluationParameterSchema = z.object({
  id: z.string().describe("The unique ID of the evaluation parameter."),
  name: z.string().describe("The human-readable name of the evaluation parameter."),
  definition: z.string().describe("The detailed definition of what this parameter measures."),
  labels: z.array(z.object({
    name: z.string().describe("The name of a possible label for this parameter."),
    definition: z.string().optional().describe("The definition of this specific label."),
    example: z.string().optional().describe("An example illustrating this label."),
  })).describe("A list of possible labels that can be chosen for this parameter.")
});

export const JudgeLlmEvaluationInputSchema = z.object({
  fullPromptText: z.string().describe(
    "The complete text provided to the LLM, which includes the content to be evaluated and detailed descriptions of the evaluation parameters and their labels."
  ),
  evaluationParameterIds: z.array(z.string()).describe(
    "An array of the IDs of the evaluation parameters that the LLM should provide judgments for. This helps the LLM focus on the required output keys."
  ),
});
export type JudgeLlmEvaluationInput = z.infer<typeof JudgeLlmEvaluationInputSchema>;

// The output is a record (object) where keys are evaluation parameter IDs
// and values are the chosen label names for those parameters.
export const JudgeLlmEvaluationOutputSchema = z.record(
    z.string().describe("The ID of an evaluation parameter."),
    z.string().describe("The name of the label chosen by the LLM for this parameter.")
).describe("A JSON object mapping evaluation parameter IDs to their chosen label names.");
export type JudgeLlmEvaluationOutput = z.infer<typeof JudgeLlmEvaluationOutputSchema>;


// This is the ASYNC function that client components will import and call.
export async function judgeLlmEvaluation(
  input: JudgeLlmEvaluationInput
): Promise<JudgeLlmEvaluationOutput> {
  // This function calls the Genkit flow.
  return internalJudgeLlmEvaluationFlow(input);
}

const handlebarsPrompt = `
You are an expert evaluator. Analyze the following text based on the evaluation criteria and labels described within it.
The text to evaluate is:
\`\`\`text
{{{fullPromptText}}}
\`\`\`

After your analysis, provide a JSON object as your response.
This JSON object must map each of the following evaluation parameter IDs to the name of the single most appropriate label you have chosen for it, based on your analysis of the text against the criteria for that parameter.

The evaluation parameter IDs you MUST provide judgments for are:
{{#each evaluationParameterIds}}
- {{this}}
{{/each}}

Your entire response must be ONLY the JSON object, with no other surrounding text or explanations.
For example, if an evaluation parameter has ID "param1_id" and you choose the label "Correct", your response for that parameter within the JSON object would be: "param1_id": "Correct".
`;

const judgePrompt = ai.definePrompt({
  name: 'judgeLlmEvaluationPrompt',
  input: { schema: JudgeLlmEvaluationInputSchema },
  output: { schema: JudgeLlmEvaluationOutputSchema },
  prompt: handlebarsPrompt,
  config: { // Example configuration, adjust as needed
    temperature: 0.3, // Lower temperature for more deterministic evaluation
  }
});

// This is the Genkit flow definition. It is NOT exported.
// Renamed to internalJudgeLlmEvaluationFlow to make it distinct.
const internalJudgeLlmEvaluationFlow = ai.defineFlow(
  {
    name: 'judgeLlmEvaluationFlow', // Keep original Genkit flow name for registry
    inputSchema: JudgeLlmEvaluationInputSchema,
    outputSchema: JudgeLlmEvaluationOutputSchema,
  },
  async (input) => {
    // Log the input to the flow for debugging (optional)
    console.log('judgeLlmEvaluationFlow received input:', JSON.stringify(input, null, 2));

    const { output, usage } = await judgePrompt(input);

    if (!output) {
      console.error('LLM did not return a parsable output matching the schema.');
      // Consider throwing a more specific error or returning a default/error structure
      // if your application needs to handle this gracefully upstream.
      throw new Error('LLM evaluation failed to return structured output.');
    }
    
    console.log('judgeLlmEvaluationFlow LLM usage:', usage);
    console.log('judgeLlmEvaluationFlow LLM output:', JSON.stringify(output, null, 2));
    return output; // Output is already validated against JudgeLlmEvaluationOutputSchema by ai.definePrompt
  }
);

// Ensure ONLY async functions and types/schemas are exported.
// The constant 'internalJudgeLlmEvaluationFlow' (the Genkit flow object) is not exported.

    