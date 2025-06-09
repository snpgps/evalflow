
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
import type { MismatchDetail } from './suggest-recursive-prompt-improvements'; // Re-using this type

// Input Schema
const AnalyzeEvalProblemCategoriesInputSchema = z.object({
  mismatchDetails: z.array(
    z.object({ // Re-defining MismatchDetail inline for clarity in this flow's schema
      inputData: z.record(z.string(), z.any()).describe("The product parameters input for the row that had a mismatch."),
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
  productSchemaDescription: z.string().optional().describe("A textual description of the schema for product parameters (e.g., field names, types, descriptions) that were available as inputs to the original product prompt."),
});
export type AnalyzeEvalProblemCategoriesInput = z.infer<typeof AnalyzeEvalProblemCategoriesInputSchema>;

// Output Schema
const ProblemCategorySchema = z.object({
  categoryName: z.string().describe("A concise, descriptive name for the identified problem category (e.g., 'User Query Ambiguity', 'LLM Missed Key Context', 'Insufficient Empathy Cues')."),
  description: z.string().describe("A brief explanation of what this problem category entails and why it leads to the undesired LLM output."),
  count: z.number().int().positive().describe("The number of provided mismatch details that fall into this problem category."),
  exampleMismatch: z.object({ // Including a MismatchDetail-like structure for the example
      inputData: z.record(z.string(), z.any()),
      evaluationParameterName: z.string(),
      evaluationParameterDefinition: z.string(),
      llmChosenLabel: z.string(),
      groundTruthLabel: z.string(), // This is the desired target label
      llmRationale: z.string().optional(),
    }).optional().describe("One example MismatchDetail from the input that clearly illustrates this problem category. Include this if possible.")
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

{{#if productSchemaDescription}}
- Product Input Parameters Schema (used in the original prompt):
{{{productSchemaDescription}}}
{{/if}}

Mismatch Details (where LLM output != Desired Target Label):
{{#each mismatchDetails}}
Mismatch Example {{add @index 1}}:
  - Input Data Provided to Product: {{json inputData}}
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
    - 'count': The number of mismatch instances that fall into this category.
    - 'exampleMismatch': (Optional, but highly recommended) Select one Mismatch Detail from the input that best exemplifies this category.

Your entire response must be ONLY a JSON object matching the output schema, with no other surrounding text or explanations.
The output schema expects a 'problemCategories' array and an optional 'overallSummary'.
Ensure the 'count' for each category accurately reflects how many of the provided mismatch examples fit that category.
The sum of 'count' across all categories should ideally be close to the total number of mismatchDetails provided, but it's okay if some don't fit neatly or if there's minor overlap if an LLM explains why.
`;

// Helper for Handlebars to increment index
const Handlebars = require('handlebars');
Handlebars.registerHelper('add', function (a: any, b: any) {
  return Number(a) + Number(b);
});
Handlebars.registerHelper('json', function(context: any) {
    return JSON.stringify(context, null, 2);
});


const analysisPrompt = ai.definePrompt({
  name: 'analyzeEvalProblemCategoriesPrompt',
  input: {schema: AnalyzeEvalProblemCategoriesInputSchema},
  output: {schema: AnalyzeEvalProblemCategoriesOutputSchema},
  prompt: handlebarsPrompt,
  config: {
    temperature: 0.5, // Allow for some creative categorization but not too random
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
    const { output, usage } = await analysisPrompt(input);
    if (!output) {
      throw new Error('The LLM did not return a parsable output for problem category analysis.');
    }
    console.log('internalAnalyzeEvalProblemCategoriesFlow LLM usage:', usage);
    console.log('internalAnalyzeEvalProblemCategoriesFlow LLM output:', JSON.stringify(output, null, 2));
    return output!;
  }
);
