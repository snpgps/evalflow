
'use server';
/**
 * @fileOverview A MOCK Genkit-like flow for judging an evaluation.
 * This is a CLIENT-SIDE MOCK and does NOT represent a real Genkit flow execution.
 * It simulates the output of a Judge LLM.
 */

import { z } from 'genkit';

// Simulate the kind of structured output we expect from a Judge LLM
// where keys are evaluation parameter IDs and values are the chosen label names.
export interface JudgeEvaluationOutput extends Record<string, string> {}

export interface EvaluationParameterDetail {
  id: string;
  name: string;
  labels: Array<{ name: string; definition?: string; example?: string }>;
}

export interface JudgeEvaluationInput {
  fullPrompt: string; // The fully constructed prompt sent to the (mock) Judge LLM
  evaluationParameterDetails: EvaluationParameterDetail[]; // Details of eval params to guide mock response
  // In a real scenario, this would also include modelConnectorConfig, etc.
}

// Mock function to simulate a Judge LLM's structured response
export async function judgeEvaluationFlow(
  input: JudgeEvaluationInput
): Promise<JudgeEvaluationOutput> {
  console.log('Mock Judge LLM Flow called with prompt:', input.fullPrompt);

  // Simulate a delay
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

  const mockResults: JudgeEvaluationOutput = {};

  input.evaluationParameterDetails.forEach(param => {
    if (param.labels && param.labels.length > 0) {
      // Randomly pick one of the available labels for this parameter
      const randomIndex = Math.floor(Math.random() * param.labels.length);
      mockResults[param.id] = param.labels[randomIndex].name;
    } else {
      // If no labels, provide a generic mock value
      mockResults[param.id] = 'Mocked_NoLabels_Positive';
    }
  });

  console.log('Mock Judge LLM Flow responding with:', mockResults);
  return mockResults;
}
