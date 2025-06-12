
import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-prompt-improvements.ts';
import '@/ai/flows/prompt-quality-analysis.ts';
import '@/ai/flows/judge-llm-evaluation-flow.ts';
import '@/ai/flows/suggest-recursive-prompt-improvements.ts';
import '@/ai/flows/analyze-eval-problem-categories.ts';
import '@/ai/flows/analyze-judgment-discrepancy.ts'; 
import '@/ai/flows/analyze-summarization-problems.ts';
import '@/ai/flows/test-anthropic-connection-flow.ts'; // Added new flow

    
