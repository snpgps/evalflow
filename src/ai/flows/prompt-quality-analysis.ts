'use server';

/**
 * @fileOverview An AI agent that analyzes the results of eval runs to identify patterns and insights about prompt quality.
 *
 * - analyzePromptQuality - A function that handles the prompt quality analysis process.
 * - AnalyzePromptQualityInput - The input type for the analyzePromptQuality function.
 * - AnalyzePromptQualityOutput - The return type for the analyzePromptQuality function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzePromptQualityInputSchema = z.object({
  evalResults: z
    .string()
    .describe(
      'A string containing the results of an eval run, including model outputs, ground truth labels, and evaluation metrics.'
    ),
  productParametersSchema: z
    .string()
    .describe(
      'A string representing the schema of the product parameters used in the eval run, including field names, types, and descriptions.'
    ),
  evaluationParameters: z
    .string()
    .describe(
      'A string describing the evaluation parameters used in the eval run, including names, definitions, and examples.'
    ),
  promptTemplate: z
    .string()
    .describe('The prompt template used in the eval run.'),
});
export type AnalyzePromptQualityInput = z.infer<typeof AnalyzePromptQualityInputSchema>;

const AnalyzePromptQualityOutputSchema = z.object({
  insights: z
    .string()
    .describe(
      'A detailed analysis of the eval run results, including patterns, insights about prompt quality, and identification of parameters contributing most to successful outcomes.'
    ),
  recommendations:
    z.string().describe('Actionable recommendations for improving prompt quality based on the analysis.'),
});
export type AnalyzePromptQualityOutput = z.infer<typeof AnalyzePromptQualityOutputSchema>;

export async function analyzePromptQuality(input: AnalyzePromptQualityInput): Promise<AnalyzePromptQualityOutput> {
  return analyzePromptQualityFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzePromptQualityPrompt',
  input: {schema: AnalyzePromptQualityInputSchema},
  output: {schema: AnalyzePromptQualityOutputSchema},
  prompt: `You are an AI assistant specialized in analyzing the quality of prompts used in AI model evaluations (evals).

  You are provided with the results of an eval run, the schema of the product parameters used, the evaluation parameters, and the prompt template.
  Your goal is to identify patterns and insights about prompt quality and determine which parameters contribute most to successful outcomes.

  Eval Results: {{{evalResults}}}
  Product Parameter Schema: {{{productParametersSchema}}}
  Evaluation Parameters: {{{evaluationParameters}}}
  Prompt Template: {{{promptTemplate}}}

  Based on this information, provide a detailed analysis of the eval run results and actionable recommendations for improving prompt quality.
  The analysis should include:
  - Key factors that made prompts effective or ineffective.
  - Identification of the most influential parameters affecting the model performance.
  - Patterns observed in the model outputs and their correlation with prompt variations.

  Output the insights and recommendations in a structured and well-organized manner.
  `,
});

const analyzePromptQualityFlow = ai.defineFlow(
  {
    name: 'analyzePromptQualityFlow',
    inputSchema: AnalyzePromptQualityInputSchema,
    outputSchema: AnalyzePromptQualityOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
