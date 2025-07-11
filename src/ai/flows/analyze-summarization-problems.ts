
'use server';
/**
 * @fileOverview A Genkit flow that analyzes generated summaries to categorize
 * underlying user intents or themes. It now supports batching for large inputs.
 *
 * - analyzeSummarizationProblems - A function that takes generated summaries and context,
 *   then returns categorized user intents with counts and examples.
 * - AnalyzeSummarizationProblemsInput - The input type.
 * - AnalyzeSummarizationProblemsOutput - The output type.
 * - UserIntentCategory - Represents a categorized user intent.
 */

import {ai} from '@/ai/genkit';
import { z } from 'genkit';

// Input Schema
const GeneratedSummaryDetailSchema = z.object({
  inputData: z.record(z.string(), z.any()).describe("The input parameters for the row that produced this summary."),
  generatedSummary: z.string().describe("The actual summary text generated by the LLM, reflecting a user interaction."),
});

const AnalyzeSummarizationProblemsInputSchema = z.object({
  generatedSummaryDetails: z.array(GeneratedSummaryDetailSchema).describe("An array of objects, each detailing a specific input and its generated summary."),
  targetSummarizationDefinitionName: z.string().optional().describe("The name of the summarization definition that was used to generate these summaries (for context, if available)."),
  targetSummarizationDefinitionText: z.string().optional().describe("The full definition text of the target summarization task (for context, if available)."),
  inputSchemaDescription: z.string().optional().describe("A textual description of the schema for input parameters (e.g., field names, types, descriptions) that were available as inputs to the original prompt, which generated the summary."), // Renamed from productSchemaDescription
  productContext: z.string().optional().describe("A brief description of the AI product or its primary goal, e.g., 'Customer service chatbot for e-commerce site', 'Tool to summarize meeting transcripts'. This helps interpret user intents from summaries."),
});
export type AnalyzeSummarizationProblemsInput = z.infer<typeof AnalyzeSummarizationProblemsInputSchema>;

// Output Schema
const UserIntentCategorySchema = z.object({
  categoryName: z.string().describe("A concise, descriptive name for the identified user intent category (e.g., 'Order Tracking Inquiry', 'Refund Request', 'Feature Usage Question')."),
  description: z.string().describe("A brief explanation of what this user intent category entails, based on the summaries."),
  count: z.number().int().describe("The number of provided summary details that fall into this user intent category. This should be a positive integer."),
  exampleSummaryIllustratingIntent: z.object({
      inputData: z.string().describe("The input parameters for the row, formatted as a JSON string."),
      generatedSummary: z.string().describe("The generated summary that illustrates this user intent."),
    }).optional().describe("One example GeneratedSummaryDetail from the input that clearly illustrates this user intent category. Include this if possible. Its 'inputData' field MUST be a JSON string representation of the original input data object.")
});
export type UserIntentCategory = z.infer<typeof UserIntentCategorySchema>;

const AnalyzeSummarizationProblemsOutputSchema = z.object({
  userIntentCategories: z.array(UserIntentCategorySchema).describe("An array of identified user intent categories, each with a name, description, count of occurrences, and an optional example summary."),
  overallSummaryOfUserIntents: z.string().optional().describe("A brief overall summary of the key user intents identified from the summaries, if applicable.")
});
export type AnalyzeSummarizationProblemsOutput = z.infer<typeof AnalyzeSummarizationProblemsOutputSchema>;


export async function analyzeSummarizationProblems(
  input: AnalyzeSummarizationProblemsInput
): Promise<AnalyzeSummarizationProblemsOutput> {
  return internalAnalyzeUserIntentsFromSummariesFlow(input);
}

const handlebarsBatchAnalysisPrompt = `
You are an expert AI Product Analyst specializing in uncovering user intents from summaries of user interactions.
Your task is to analyze a set of AI-generated summaries. These summaries reflect original user interactions with an AI product.
Your goal is to identify common user intents, themes, or goals expressed through these interactions, as captured by the summaries. This analysis will help understand *why* users are interacting with the product.

Context about the AI Product (if provided):
{{#if productContext}}
- Product Context/Goal: {{{productContext}}}
{{else}}
- (No specific product context provided, infer from summaries and input data schema)
{{/if}}

{{#if inputSchemaDescription}}
- Input Parameters Schema (inputs to the original product that led to these summaries):
{{{inputSchemaDescription}}}
{{/if}}

{{#if targetSummarizationDefinitionName}}
- Original Summarization Task Name (that generated these summaries): "{{targetSummarizationDefinitionName}}"
{{/if}}
{{#if targetSummarizationDefinitionText}}
- Original Summarization Task Definition:
  \`\`\`
  {{{targetSummarizationDefinitionText}}}
  \`\`\`
{{/if}}

Generated Summary Details (reflecting user interactions for THIS BATCH):
{{#each generatedSummaryDetails}}
Summary Example:
  - Input Data Provided to AI: {{{json inputData}}}
  - Generated Summary of Interaction: "{{generatedSummary}}"
---
{{/each}}

Instructions:
1.  Carefully review all the provided generated summaries for THIS BATCH and any context about the product or original summarization task.
2.  For each summary, try to understand what the *original user* was trying to achieve or communicate.
3.  Identify common themes, patterns, or underlying goals. These are your "user intent categories."
    Examples of user intent categories could be:
    - "User is seeking information about their order status."
    - "User is requesting assistance with a technical problem."
    - "User is expressing dissatisfaction with a service/product."
    - "User is trying to make a purchase or new booking."
    - "User is providing feedback."
4.  Group the summaries into these distinct user intent categories. A single summary should ideally belong to one primary category.
5.  For each category, provide:
    - 'categoryName': A concise name for the user intent category.
    - 'description': A brief explanation of this intent category.
    - 'count': The number of summary instances *in this batch* that reflect this intent. This should be a positive integer.
    - 'exampleSummaryIllustratingIntent': (Optional, but highly recommended) Select one GeneratedSummaryDetail from the input that clearly illustrates this user intent. If you include an example, its 'inputData' field MUST be a JSON string.

Your entire response must be ONLY a JSON object matching the output schema, with no other surrounding text or explanations.
The output schema expects a 'userIntentCategories' array and an optional 'overallSummaryOfUserIntents' (though for a single batch, an overall summary might be less critical, focus on accurate categories and counts for the batch).
Ensure the 'count' for each category accurately reflects how many of the provided summary examples fit that category *within this batch*.
`;

const batchAnalysisPrompt = ai.definePrompt({
  name: 'analyzeUserIntentsFromSummariesBatchPrompt',
  input: {schema: AnalyzeSummarizationProblemsInputSchema},
  output: {schema: AnalyzeSummarizationProblemsOutputSchema},
  prompt: handlebarsBatchAnalysisPrompt,
  config: {
    temperature: 0.6,
  },
});

// Schema for the aggregation prompt input
const AggregationPromptInputSchema = z.object({
  allBatchedCategories: z.array(UserIntentCategorySchema).describe("An array of all user intent categories collected from individual batch analyses."),
  productContext: z.string().optional().describe("The original product context, if provided."),
  inputSchemaDescription: z.string().optional(), 
  targetSummarizationDefinitionName: z.string().optional(),
  targetSummarizationDefinitionText: z.string().optional(),
});

const handlebarsAggregationPrompt = `
You are an expert AI Product Analyst. You have received multiple sets of user intent categories. Each set was derived by analyzing a different batch of user interaction summaries, but all summaries are from the same AI product and for the same overall summarization task.
Your goal is to consolidate these potentially redundant or overlapping categories from the different batches into a single, final, coherent list of user intent categories.

{{#if productContext}}
Product Context/Goal: {{{productContext}}}
{{/if}}
{{#if inputSchemaDescription}}
Input Parameters Schema (used by the original product):
{{{inputSchemaDescription}}}
{{/if}}
{{#if targetSummarizationDefinitionName}}
Original Summarization Task Name: "{{targetSummarizationDefinitionName}}"
{{/if}}
{{#if targetSummarizationDefinitionText}}
Original Summarization Task Definition:
{{{targetSummarizationDefinitionText}}}
{{/if}}

Input: Batched User Intent Categories:
Each item below is a user intent category identified from a specific batch of summaries.
{{#each allBatchedCategories}}
--- BATCH CATEGORY START ---
Identified Category Name: "{{this.categoryName}}"
Category Description: "{{this.description}}"
Count from its batch: {{this.count}}
{{#if this.exampleSummaryIllustratingIntent}}
Example Summary from batch: "{{this.exampleSummaryIllustratingIntent.generatedSummary}}"
(Input data for this example: {{{json this.exampleSummaryIllustratingIntent.inputData}}})
{{/if}}
--- BATCH CATEGORY END ---
{{/each}}

Your Task:
1.  Review all "Batched User Intent Categories" provided above.
2.  Identify categories from different batches that represent the same underlying user intent.
3.  Merge these similar categories. Create a new, canonical \`categoryName\` and \`description\` for each merged group.
4.  Sum the \`count\` values from all batched categories that contribute to a final merged category. This final count should reflect the total occurrences across all original summaries.
5.  For each final merged category, if examples were provided in the batched categories, select *one* \`exampleSummaryIllustratingIntent\` (including its \`inputData\` and \`generatedSummary\`) from the inputs that best illustrates the consolidated intent. Its 'inputData' field MUST be a JSON string. If multiple examples are good, choose one. If no relevant example was provided in the batches for a merged category, you may omit this field for the final category.
6.  Provide an \`overallSummaryOfUserIntents\` based on your final, consolidated list.

Your entire response must be ONLY a JSON object matching the specified output schema, which includes 'userIntentCategories' (an array of your final, merged categories) and 'overallSummaryOfUserIntents'.
Do not invent new intents not supported by the batched data. Focus on merging and refining.
The \`count\` in your final output must be the sum of counts from the source batch categories.
`;

const aggregationAnalysisPrompt = ai.definePrompt({
  name: 'aggregateUserIntentsPrompt',
  input: { schema: AggregationPromptInputSchema },
  output: { schema: AnalyzeSummarizationProblemsOutputSchema },
  prompt: handlebarsAggregationPrompt,
  config: {
    temperature: 0.5, 
  },
});

const BATCH_SIZE = 30; 

const internalAnalyzeUserIntentsFromSummariesFlow = ai.defineFlow(
  {
    name: 'internalAnalyzeUserIntentsFromSummariesFlow',
    inputSchema: AnalyzeSummarizationProblemsInputSchema,
    outputSchema: AnalyzeSummarizationProblemsOutputSchema,
  },
  async (input): Promise<AnalyzeSummarizationProblemsOutput> => {
    try { 
      if (!input || !input.generatedSummaryDetails || input.generatedSummaryDetails.length === 0) {
          return { userIntentCategories: [], overallSummaryOfUserIntents: "No summaries provided to analyze user intents." };
      }

      const allSummaries = input.generatedSummaryDetails;

      if (allSummaries.length <= BATCH_SIZE) {
        try {
          const { output, usage } = await batchAnalysisPrompt(input);
          if (!output) {
            console.error('LLM did not return a parsable output for single batch user intent analysis. Usage:', usage ? JSON.stringify(usage).substring(0, 100) : 'N/A');
            return {
                userIntentCategories: [],
                overallSummaryOfUserIntents: "Error: The AI model did not return a parsable output for user intent analysis."
            };
          }
          return output;
        } catch (error: any) {
            console.error('Error in single batch internalAnalyzeUserIntentsFromSummariesFlow:', error);
            return {
                userIntentCategories: [],
                overallSummaryOfUserIntents: `Error executing user intent analysis flow: ${error.message || 'Unknown error'}.`
            };
        }
      } else {
        const collectedBatchedCategories: UserIntentCategory[] = [];
        let totalSummariesProcessedInBatches = 0;

        for (let i = 0; i < allSummaries.length; i += BATCH_SIZE) {
          const batchSummaries = allSummaries.slice(i, Math.min(i + BATCH_SIZE, allSummaries.length));
          const batchInput: AnalyzeSummarizationProblemsInput = {
            ...input,
            generatedSummaryDetails: batchSummaries,
          };
          try {
            console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(allSummaries.length / BATCH_SIZE)} for user intent analysis.`);
            const { output: batchOutput, usage: batchUsage } = await batchAnalysisPrompt(batchInput);
            if (batchOutput && batchOutput.userIntentCategories) {
              collectedBatchedCategories.push(...batchOutput.userIntentCategories);
              totalSummariesProcessedInBatches += batchSummaries.length;
            } else {
              console.warn(`Batch ${Math.floor(i / BATCH_SIZE) + 1} returned no parsable categories. Usage:`, batchUsage ? JSON.stringify(batchUsage).substring(0,100) : 'N/A');
            }
          } catch (batchError: any) {
            console.error(`Error processing batch ${Math.floor(i / BATCH_SIZE) + 1} for user intent analysis:`, batchError);
          }
        }

        if (collectedBatchedCategories.length === 0 && totalSummariesProcessedInBatches === 0 && allSummaries.length > 0) {
            return { userIntentCategories: [], overallSummaryOfUserIntents: "No user intent categories could be derived. All batches might have failed or returned empty. Check server logs." };
        }
         if (collectedBatchedCategories.length === 0 && allSummaries.length > 0) {
            return { userIntentCategories: [], overallSummaryOfUserIntents: "No distinct user intent categories were identified from the provided summaries after batch processing." };
        }

        console.log(`All ${Math.ceil(allSummaries.length / BATCH_SIZE)} batches processed. Starting aggregation of ${collectedBatchedCategories.length} categories from ${totalSummariesProcessedInBatches} summaries.`);
        try {
          const aggregationInput: z.infer<typeof AggregationPromptInputSchema> = {
            allBatchedCategories: collectedBatchedCategories,
            productContext: input.productContext,
            inputSchemaDescription: input.inputSchemaDescription, 
            targetSummarizationDefinitionName: input.targetSummarizationDefinitionName,
            targetSummarizationDefinitionText: input.targetSummarizationDefinitionText,
          };
          const { output: finalOutput, usage: aggregationUsage } = await aggregationAnalysisPrompt(aggregationInput);
          if (!finalOutput) {
            console.error('Aggregation step for user intents returned no parsable output. Usage:', aggregationUsage ? JSON.stringify(aggregationUsage).substring(0,100) : 'N/A');
            return {
                userIntentCategories: [],
                overallSummaryOfUserIntents: "Failed to aggregate batched user intent categories. The LLM did not return a parsable output for aggregation."
            };
          }
          console.log("Aggregation complete for user intent analysis.");
          return finalOutput;
        } catch (aggregationError: any) {
          console.error('Error in aggregation step for user intents:', aggregationError);
          return {
              userIntentCategories: [],
              overallSummaryOfUserIntents: `Error during aggregation of user intent categories: ${aggregationError.message || 'Unknown aggregation error'}.`
          };
        }
      }
    } catch (flowError: any) {
        console.error('Top-level unhandled error in internalAnalyzeUserIntentsFromSummariesFlow:', flowError);
        return {
            userIntentCategories: [],
            overallSummaryOfUserIntents: `Critical flow error: ${flowError.message || 'An unexpected internal server error occurred'}.`
        };
    }
  }
);
