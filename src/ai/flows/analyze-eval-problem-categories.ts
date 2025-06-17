
'use server';
/**
 * @fileOverview A Genkit flow that analyzes evaluation run mismatches to categorize
 * underlying problems preventing a desired outcome.
 *
 * - analyzeEvalProblemCategories - A function that takes mismatch details and context,
 *   then returns categorized problems with counts.
 * - AnalyzeEvalProblemCategoriesInput - The input type.
 * - AnalyzeEvalProblemCategoriesOutput - The output type.
 * - ProblemCategory - Represents a categorized problem.
 */

import {ai} from '@/ai/genkit';
import { z } from 'genkit';
import type { MismatchDetail } from './suggest-recursive-prompt-improvements'; 

// Input Schema
const AnalyzeEvalProblemCategoriesInputSchema = z.object({
  mismatchDetails: z.array(
    z.object({ 
      inputData: z.record(z.string(), z.any()).describe("The input parameters for the row that had a mismatch."),
      evaluationParameterName: z.string().describe("The name of the evaluation parameter where the mismatch occurred."),
      evaluationParameterDefinition: z.string().describe("The definition of the evaluation parameter."),
      llmChosenLabel: z.string().describe("The label incorrectly chosen by the LLM."),
      groundTruthLabel: z.string().describe("The correct (desired) ground truth label."),
      llmRationale: z.string().optional().describe("The LLM's rationale for its choice, if provided."),
    })
  ).describe("An array of objects, each detailing a specific instance where the LLM's output did not match the desired target label."),
  targetEvaluationParameterName: z.string().describe("The name of the evaluation parameter that is being analyzed."),
  targetEvaluationParameterDefinition: z.string().describe("The definition of the target evaluation parameter."),
  desiredTargetLabel: z.string().describe("The specific label the user wants the AI product to achieve more often for the target parameter."),
  inputSchemaDescription: z.string().optional().describe("A textual description of the schema for input parameters (e.g., field names, types, descriptions) that were available as inputs to the original prompt."),
});
export type AnalyzeEvalProblemCategoriesInput = z.infer<typeof AnalyzeEvalProblemCategoriesInputSchema>;

// Output Schema
const ProblemCategorySchema = z.object({
  categoryName: z.string().describe("A concise, descriptive name for the identified problem category (e.g., 'User Query Ambiguity', 'LLM Missed Key Context', 'Insufficient Empathy Cues')."),
  description: z.string().describe("A brief explanation of what this problem category entails and why it leads to the undesired LLM output."),
  count: z.number().int().describe("The number of provided mismatch details that fall into this problem category. This should be a positive integer (e.g., 1, 2, 3...)."),
  exampleMismatch: z.object({
      inputData: z.string().describe("The input parameters for the row that had a mismatch, formatted as a JSON string."),
      evaluationParameterName: z.string(),
      evaluationParameterDefinition: z.string(),
      llmChosenLabel: z.string(),
      groundTruthLabel: z.string(), 
      llmRationale: z.string().optional(),
    }).optional().describe("One example MismatchDetail from the input that clearly illustrates this problem category. Include this if possible. Its 'inputData' field MUST be a JSON string representation of the original input data object for that mismatch.")
});
export type ProblemCategory = z.infer<typeof ProblemCategorySchema>;

const AnalyzeEvalProblemCategoriesOutputSchema = z.object({
  problemCategories: z.array(ProblemCategorySchema).describe("An array of identified problem categories, each with a name, description, count of occurrences, and an optional example mismatch."),
  overallSummary: z.string().optional().describe("A brief overall summary of the key issues identified, if applicable.")
});
export type AnalyzeEvalProblemCategoriesOutput = z.infer<typeof AnalyzeEvalProblemCategoriesOutputSchema>;


export async function analyzeEvalProblemCategories(
  input: AnalyzeEvalProblemCategoriesInput
): Promise<AnalyzeEvalProblemCategoriesOutput> {
  return internalAnalyzeEvalProblemCategoriesFlow(input);
}

const handlebarsPrompt = `
You are an expert AI Product Analyst. Your task is to analyze a set of "mismatches" from an AI model evaluation.
A mismatch occurs when the model's output for a specific 'Target Evaluation Parameter' did not align with the 'Desired Target Label'.
Your goal is to identify the underlying problems or reasons for these mismatches, categorize them, and count how many instances fall into each category.
This analysis will help the product creator understand what to fix in their AI product (e.g., prompt, model, context) to achieve the desired target label more often.

Context:
- Target Evaluation Parameter Name: "{{targetEvaluationParameterName}}"
- Target Evaluation Parameter Definition: "{{targetEvaluationParameterDefinition}}"
- Desired Target Label for this parameter: "{{desiredTargetLabel}}"

{{#if inputSchemaDescription}}
- Input Parameters Schema (used in the original prompt):
{{{inputSchemaDescription}}}
{{/if}}

Mismatch Details (where LLM output != Desired Target Label):
{{#each mismatchDetails}}
Mismatch Example:
  - Input Data Provided to Product: {{{json inputData}}}
  - LLM's Actual Chosen Label for "{{../targetEvaluationParameterName}}": "{{llmChosenLabel}}"
  - LLM's Rationale (if any): "{{llmRationale}}"
  - (User's Desired Label was: "{{../desiredTargetLabel}}")
---
{{/each}}

Instructions:
1.  Carefully review all the provided mismatch details.
2.  For each mismatch, try to understand *why* the LLM chose its label instead of the '{{desiredTargetLabel}}'. Consider the user's input, the LLM's rationale (if any), and the definition of the '{{targetEvaluationParameterName}}'.
3.  Identify common themes, patterns, or root causes for these deviations. These are your "problem categories".
    Examples of problem categories could be:
    - "User input lacked sufficient detail for the AI to infer [aspect related to desired label]."
    - "The AI model appears to have misinterpreted [specific part of user input or parameter definition]."
    - "The prompt might not clearly instruct the AI on how to handle cases requiring [characteristic of desired label]."
    - "LLM focused too much on [X] and missed [Y] leading to the wrong label."
    - "User's request was ambiguous regarding [aspect needed for desired label]."
4.  Group the mismatches into these distinct problem categories. A single mismatch should ideally belong to one primary category.
5.  For each category, provide:
    - 'categoryName': A concise name for the problem category.
    - 'description': A brief explanation of this problem category.
    - 'count': The number of mismatch instances that fall into this category. This should be a positive integer.
    - 'exampleMismatch': (Optional, but highly recommended) Select one MismatchDetail from the input that clearly illustrates this problem category. If you include an exampleMismatch, its 'inputData' field MUST be a JSON string representation of the original input data object for that mismatch.

Your entire response must be ONLY a JSON object matching the output schema, with no other surrounding text or explanations.
The output schema expects a 'problemCategories' array and an optional 'overallSummary'.
Ensure the 'count' for each category accurately reflects how many of the provided mismatch examples fit that category.
The sum of 'count' across all categories should ideally be close to the total number of mismatchDetails provided, but it's okay if some don't fit neatly or if there's minor overlap if an LLM explains why.
`;

const analysisPrompt = ai.definePrompt({
  name: 'analyzeEvalProblemCategoriesPrompt',
  input: {schema: AnalyzeEvalProblemCategoriesInputSchema},
  output: {schema: AnalyzeEvalProblemCategoriesOutputSchema},
  prompt: handlebarsPrompt,
  config: {
    temperature: 0.5, 
  },
});

const internalAnalyzeEvalProblemCategoriesFlow = ai.defineFlow(
  {
    name: 'internalAnalyzeEvalProblemCategoriesFlow',
    inputSchema: AnalyzeEvalProblemCategoriesInputSchema,
    outputSchema: AnalyzeEvalProblemCategoriesOutputSchema,
  },
  async (input) => {
    if (!input.mismatchDetails || input.mismatchDetails.length === 0) {
        return { problemCategories: [], overallSummary: "No mismatches provided to analyze." };
    }

    try {
      const { output, usage } = await analysisPrompt(input);
      if (!output) {
        console.error('LLM did not return a parsable output for problem category analysis. Usage:', usage);
        return { 
            problemCategories: [], 
            overallSummary: "Error: The AI model did not return a parsable output for problem category analysis. Usage data (if available): " + JSON.stringify(usage) 
        };
      }
      console.log('internalAnalyzeEvalProblemCategoriesFlow LLM usage:', usage);
      console.log('internalAnalyzeEvalProblemCategoriesFlow LLM output:', JSON.stringify(output, null, 2));
      return output;
    } catch (error: any) {
        console.error('Error in internalAnalyzeEvalProblemCategoriesFlow:', error);
        return {
            problemCategories: [],
            overallSummary: `Error executing problem category analysis flow: ${error.message || 'Unknown error'}. Check server logs.`
        };
    }
  }
);
