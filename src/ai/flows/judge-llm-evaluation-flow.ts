
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

// Zod schema for the input to the flow and prompt
const JudgeLlmEvaluationInputSchema = z.object({
  fullPromptText: z.string().describe(
    "The complete text provided to the LLM, which includes the content to be evaluated and detailed descriptions of the evaluation parameters and their labels."
  ),
  evaluationParameterIds: z.array(z.string()).describe(
    "An array of the IDs of the evaluation parameters that the LLM should provide judgments for. This helps the LLM focus on the required output."
  ),
});
export type JudgeLlmEvaluationInput = z.infer<typeof JudgeLlmEvaluationInputSchema>;

// This is the TypeScript type for the FINAL output of the exported async function.
// The client component expects this Record<string, string> structure.
export type JudgeLlmEvaluationOutput = Record<string, string>;

// This is the Zod schema for what the LLM is specifically asked to output.
// It's an array of objects, which is easier for Gemini to handle with response_schema.
const LlmOutputArrayItemSchema = z.object({
  parameterId: z.string().describe("The ID of an evaluation parameter."),
  chosenLabel: z.string().describe("The name of the label chosen by the LLM for this parameter.")
});
const LlmOutputArraySchema = z.array(LlmOutputArrayItemSchema)
  .describe("An array of objects, where each object contains an evaluation_parameter_id and the chosen_label_name for it.");


// This is the ASYNC function that client components will import and call.
export async function judgeLlmEvaluation(
  input: JudgeLlmEvaluationInput
): Promise<JudgeLlmEvaluationOutput> {
  // This function calls the Genkit flow, which will return an array.
  const llmOutputArray = await internalJudgeLlmEvaluationFlow(input);

  // Transform the array into the Record<string, string> format expected by the client.
  const finalOutput: JudgeLlmEvaluationOutput = {};
  if (llmOutputArray) {
    for (const item of llmOutputArray) {
      if (item && typeof item.parameterId === 'string' && typeof item.chosenLabel === 'string') {
        finalOutput[item.parameterId] = item.chosenLabel;
      } else {
        console.warn('judgeLlmEvaluation: Received an invalid item in LlmOutputArray:', item);
      }
    }
  } else {
     console.warn('judgeLlmEvaluation: LlmOutputArray was null or undefined.');
  }
  return finalOutput;
}

const handlebarsPrompt = `
You are an expert evaluator. Analyze the following text based on the evaluation criteria and labels described within it.
The text to evaluate is:
\`\`\`text
{{{fullPromptText}}}
\`\`\`

After your analysis, provide a JSON array as your response. Each object in the array must have exactly two keys: "parameterId" and "chosenLabel".
- "parameterId" must be one of the evaluation parameter IDs listed below.
- "chosenLabel" must be the name of the single most appropriate label you have chosen for that parameter, based on your analysis of the text against the criteria for that parameter.

The evaluation parameter IDs you MUST provide judgments for are:
{{#each evaluationParameterIds}}
- {{this}}
{{/each}}

Your entire response must be ONLY the JSON array, with no other surrounding text or explanations.
Example of the expected JSON array format:
[
  { "parameterId": "param1_id", "chosenLabel": "Correct" },
  { "parameterId": "param2_id", "chosenLabel": "Partially_Incorrect" }
]
`;

const judgePrompt = ai.definePrompt({
  name: 'judgeLlmEvaluationPrompt',
  input: { schema: JudgeLlmEvaluationInputSchema },
  output: { schema: LlmOutputArraySchema }, // LLM is asked to output this array structure
  prompt: handlebarsPrompt,
  config: {
    temperature: 0.3,
  }
});

// This is the Genkit flow definition. It is NOT exported.
// It now returns an array of objects.
const internalJudgeLlmEvaluationFlow = ai.defineFlow(
  {
    name: 'internalJudgeLlmEvaluationFlow',
    inputSchema: JudgeLlmEvaluationInputSchema,
    outputSchema: LlmOutputArraySchema, // Flow's output schema matches the LLM's output
  },
  async (input) => {
    console.log('internalJudgeLlmEvaluationFlow received input:', JSON.stringify(input, null, 2));

    const { output, usage } = await judgePrompt(input);

    if (!output) {
      console.error('LLM did not return a parsable output matching the LlmOutputArraySchema.');
      // Return empty array or throw, depending on desired error handling.
      // For now, let's allow it to proceed and the transformation step will handle a null/undefined output.
      return [];
    }
    
    console.log('internalJudgeLlmEvaluationFlow LLM usage:', usage);
    console.log('internalJudgeLlmEvaluationFlow LLM output (array):', JSON.stringify(output, null, 2));
    return output; // This is an array e.g. [{parameterId: 'id1', chosenLabel: 'labelA'}]
  }
);

// Ensure ONLY async functions and types are exported.
// The Zod schema objects (JudgeLlmEvaluationInputSchema, LlmOutputArraySchema) are local constants.
// The Genkit flow object (internalJudgeLlmEvaluationFlow) is not exported.
    
