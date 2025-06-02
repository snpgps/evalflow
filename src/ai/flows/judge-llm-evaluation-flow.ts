
'use server';
/**
 * @fileOverview A Genkit flow that uses an LLM to judge an input against evaluation parameters,
 * potentially including a rationale for some parameters.
 *
 * - judgeLlmEvaluation - A function that takes a full prompt, evaluation parameter details,
 *   and a list of parameters requiring rationale, then calls an LLM to get a structured evaluation.
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
    "An array of the IDs of all evaluation parameters that the LLM should provide judgments for."
  ),
  parameterIdsRequiringRationale: z.array(z.string()).optional().describe(
    "An optional array of evaluation parameter IDs for which a 'rationale' field is mandatory in the output object for that parameter."
  ),
});
export type JudgeLlmEvaluationInput = z.infer<typeof JudgeLlmEvaluationInputSchema>;

// This is the TypeScript type for the FINAL output of the exported async function.
// The client component expects this structure.
export type JudgeLlmEvaluationOutput = Record<string, { chosenLabel: string; rationale?: string }>;

// This is the Zod schema for what the LLM is specifically asked to output.
// It's an array of objects.
const LlmOutputArrayItemSchema = z.object({
  parameterId: z.string().describe("The ID of an evaluation parameter."),
  chosenLabel: z.string().describe("The name of the label chosen by the LLM for this parameter."),
  rationale: z.string().optional().describe("An optional explanation for the chosen label, especially if requested for this parameter.")
});
const LlmOutputArraySchema = z.array(LlmOutputArrayItemSchema)
  .describe("An array of objects, where each object contains an evaluation_parameter_id, the chosen_label_name, and an optional rationale.");


// This is the ASYNC function that client components will import and call.
export async function judgeLlmEvaluation(
  input: JudgeLlmEvaluationInput
): Promise<JudgeLlmEvaluationOutput> {
  const llmOutputArray = await internalJudgeLlmEvaluationFlow(input);

  const finalOutput: JudgeLlmEvaluationOutput = {};
  if (llmOutputArray) {
    for (const item of llmOutputArray) {
      if (item && typeof item.parameterId === 'string' && typeof item.chosenLabel === 'string') {
        finalOutput[item.parameterId] = {
          chosenLabel: item.chosenLabel,
          rationale: item.rationale, // Will be undefined if not present
        };
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

After your analysis, provide a JSON array as your response. Each object in the array must have at least two keys: "parameterId" and "chosenLabel".
- "parameterId" must be one of the evaluation parameter IDs listed below.
- "chosenLabel" must be the name of the single most appropriate label you have chosen for that parameter, based on your analysis of the text against the criteria for that parameter.

{{#if parameterIdsRequiringRationale.length}}
For the following parameter IDs, you MUST also include a "rationale" field in the corresponding JSON object, explaining your reasoning for the chosen label:
{{#each parameterIdsRequiringRationale}}
- {{this}}
{{/each}}
For other parameter IDs, the "rationale" field is optional.
{{else}}
The "rationale" field is optional for all parameters.
{{/if}}

The evaluation parameter IDs you MUST provide judgments for are:
{{#each evaluationParameterIds}}
- {{this}}
{{/each}}

Your entire response must be ONLY the JSON array, with no other surrounding text or explanations.
Example of the expected JSON array format:
[
  { "parameterId": "param1_id", "chosenLabel": "Correct" },
  { "parameterId": "param2_id_needs_rationale", "chosenLabel": "Partially_Incorrect", "rationale": "The user mentioned X, but missed Y." },
  { "parameterId": "param3_id", "chosenLabel": "Effective", "rationale": "This part was very clear." }
]
`;

const judgePrompt = ai.definePrompt({
  name: 'judgeLlmEvaluationPrompt',
  input: { schema: JudgeLlmEvaluationInputSchema },
  output: { schema: LlmOutputArraySchema },
  prompt: handlebarsPrompt,
  config: {
    temperature: 0.3,
  }
});

// This is the Genkit flow definition. It is NOT exported.
const internalJudgeLlmEvaluationFlow = ai.defineFlow(
  {
    name: 'internalJudgeLlmEvaluationFlow',
    inputSchema: JudgeLlmEvaluationInputSchema,
    outputSchema: LlmOutputArraySchema,
  },
  async (input) => {
    console.log('internalJudgeLlmEvaluationFlow received input:', JSON.stringify(input, null, 2));

    const { output, usage } = await judgePrompt(input);

    if (!output) {
      console.error('LLM did not return a parsable output matching the LlmOutputArraySchema.');
      return [];
    }
    
    console.log('internalJudgeLlmEvaluationFlow LLM usage:', usage);
    console.log('internalJudgeLlmEvaluationFlow LLM output (array):', JSON.stringify(output, null, 2));
    return output;
  }
);
    
