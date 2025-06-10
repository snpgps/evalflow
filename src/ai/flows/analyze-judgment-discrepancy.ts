
'use server';
/**
 * @fileOverview A Genkit flow that analyzes a specific LLM judgment based on user questions,
 * ground truth, and the original context. It aims to justify the original judgment or
 * identify reasons for potential misjudgment.
 *
 * - analyzeJudgmentDiscrepancy - Function to trigger the analysis.
 * - AnalyzeJudgmentDiscrepancyInput - Input schema for the flow.
 * - AnalyzeJudgmentDiscrepancyOutput - Output schema for the flow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EvaluationParameterLabelSchema = z.object({
  name: z.string().describe("The name of the label."),
  definition: z.string().describe("The definition of the label."),
  example: z.string().optional().describe("An illustrative example for this label."),
});

// REMOVED export from const
const AnalyzeJudgmentDiscrepancyInputSchema = z.object({
  inputData: z.record(z.string(), z.any()).describe("The original input data provided to the product for the specific row being analyzed, as a JSON object string or a well-formatted string representation."),
  evaluationParameterName: z.string().describe("The name of the evaluation parameter for which the judgment is being questioned."),
  evaluationParameterDefinition: z.string().describe("The definition of this evaluation parameter."),
  evaluationParameterLabels: z.array(EvaluationParameterLabelSchema).optional().describe("The list of available categorization labels for this evaluation parameter, including their names, definitions, and examples."),
  judgeLlmChosenLabel: z.string().describe("The label chosen by the original Judge LLM for this parameter and row."),
  judgeLlmRationale: z.string().optional().describe("The rationale provided by the original Judge LLM for its choice, if any."),
  groundTruthLabel: z.string().optional().describe("The ground truth label for this parameter and row, if available."),
  userQuestion: z.string().describe("The user's question or reasoning explaining why they doubt the original Judge LLM's judgment."),
  originalPromptTemplate: z.string().describe("The full text of the prompt template that was originally used to instruct the Judge LLM."),
});
export type AnalyzeJudgmentDiscrepancyInput = z.infer<typeof AnalyzeJudgmentDiscrepancyInputSchema>;

// REMOVED export from const
const AnalyzeJudgmentDiscrepancyOutputSchema = z.object({
  analysis: z.string().describe("A detailed analysis. This should first try to explain or justify the original Judge LLM's decision based on the provided context. Then, it should address the user's question and the ground truth. If the original judgment seems incorrect or questionable after considering all inputs, this analysis should explain why."),
  agreesWithUserConcern: z.boolean().describe("A boolean indicating whether, after full analysis, the model leans towards agreeing with the user's concern that the original judgment might be flawed or requires re-evaluation."),
  potentialFailureReasons: z.string().optional().describe("If the original judgment is deemed potentially flawed, this field should list possible reasons (e.g., 'Ambiguity in prompt regarding X', 'Judge LLM may have overlooked Y in input data', 'Evaluation parameter definition could be clearer on Z')."),
});
export type AnalyzeJudgmentDiscrepancyOutput = z.infer<typeof AnalyzeJudgmentDiscrepancyOutputSchema>;


export async function analyzeJudgmentDiscrepancy(
  input: AnalyzeJudgmentDiscrepancyInput
): Promise<AnalyzeJudgmentDiscrepancyOutput> {
  return internalAnalyzeJudgmentDiscrepancyFlow(input);
}

const handlebarsPrompt = `
You are an expert AI Evaluation Analyst. Your task is to review a specific judgment made by a "Judge LLM" and provide a detailed analysis.
You will be given the original input data, details about the evaluation parameter, the Judge LLM's output, any ground truth, the user's specific question or concern about the judgment, and the original prompt template used to guide the Judge LLM.

Your goal is to:
1.  Understand and explain the original Judge LLM's decision.
2.  Address the user's concern and the ground truth.
3.  Determine if the original judgment was reasonable or potentially flawed.
4.  If potentially flawed, identify possible reasons for the misjudgment.

Here is the information:

**1. Context of the Original Judgment:**
   - **Input Data provided to the Product (that the Judge LLM evaluated):**
     \`\`\`json
     {{{json inputData}}}
     \`\`\`
   - **Original Prompt Template used for the Judge LLM:**
     \`\`\`text
     {{{originalPromptTemplate}}}
     \`\`\`

**2. Evaluation Parameter Details:**
   - Name: "{{evaluationParameterName}}"
   - Definition: "{{evaluationParameterDefinition}}"
   {{#if evaluationParameterLabels.length}}
   - Available Labels:
     {{#each evaluationParameterLabels}}
     - Label Name: "{{this.name}}"
       Definition: "{{this.definition}}"
       {{#if this.example}}Example: "{{this.example}}"{{/if}}
     {{/each}}
   {{else}}
   - (No specific categorization labels were provided for this parameter)
   {{/if}}

**3. Original Judge LLM's Output:**
   - Chosen Label for "{{evaluationParameterName}}": "{{judgeLlmChosenLabel}}"
   {{#if judgeLlmRationale}}
   - Judge LLM's Rationale: "{{judgeLlmRationale}}"
   {{else}}
   - Judge LLM's Rationale: (Not provided)
   {{/if}}

**4. Ground Truth (if available):**
   {{#if groundTruthLabel}}
   - Ground Truth Label for "{{evaluationParameterName}}": "{{groundTruthLabel}}"
   {{else}}
   - Ground Truth Label: (Not available for this item)
   {{/if}}

**5. User's Question/Concern:**
   - "{{userQuestion}}"

**Your Task - Provide a JSON response with the following fields:**
   - "analysis": (String) Provide a comprehensive analysis.
     - Start by trying to understand and articulate the reasoning behind the Judge LLM's chosenLabel, considering the inputData, its own rationale (if any), the prompt template, and the evaluation parameter definition & labels.
     - Then, critically assess this judgment in light of the userQuestion and the groundTruthLabel (if available).
     - Explain whether the user's concern seems valid and why.
     - If you find the original judgment to be potentially flawed or questionable, elaborate on the discrepancies.
   - "agreesWithUserConcern": (Boolean) Based on your full analysis, do you lean towards agreeing with the user's stated concern that the original judgment might be problematic or incorrect?
   - "potentialFailureReasons": (String, Optional) If 'agreesWithUserConcern' is true or if your analysis reveals clear issues with the original judgment, list concise potential reasons for the failure. Examples:
     - "Prompt lacks clarity on how to handle cases like X."
     - "Evaluation parameter definition is ambiguous regarding Y."
     - "Judge LLM might have misinterpreted Z from the input data."
     - "The provided labels might not sufficiently cover this specific scenario."

Carefully consider all provided information. Your response must be ONLY a JSON object matching the output schema, with no other surrounding text or explanations.
Focus on being objective and helpful in pinpointing the source of the discrepancy.
`;

const analysisGenkitPrompt = ai.definePrompt({
  name: 'analyzeJudgmentDiscrepancyPrompt',
  input: {schema: AnalyzeJudgmentDiscrepancyInputSchema},
  output: {schema: AnalyzeJudgmentDiscrepancyOutputSchema},
  prompt: handlebarsPrompt,
  config: {
    temperature: 0.4, // Encourage analytical and somewhat deterministic responses
  },
});

const internalAnalyzeJudgmentDiscrepancyFlow = ai.defineFlow(
  {
    name: 'internalAnalyzeJudgmentDiscrepancyFlow',
    inputSchema: AnalyzeJudgmentDiscrepancyInputSchema,
    outputSchema: AnalyzeJudgmentDiscrepancyOutputSchema,
  },
  async (input) => {
    // console.log("analyzeJudgmentDiscrepancyFlow input:", JSON.stringify(input, null, 2));
    const { output, usage } = await analysisGenkitPrompt(input);
    if (!output) {
      throw new Error('The LLM did not return a parsable output for judgment discrepancy analysis.');
    }
    // console.log('analyzeJudgmentDiscrepancyFlow LLM usage:', usage);
    // console.log('analyzeJudgmentDiscrepancyFlow LLM output:', JSON.stringify(output, null, 2));
    return output!;
  }
);

    
