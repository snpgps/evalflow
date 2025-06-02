'use client';

import { useState, type FormEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lightbulb, BrainCircuit, Wand2, FileQuestion, Send } from "lucide-react";
import { analyzePromptQuality, type AnalyzePromptQualityInput, type AnalyzePromptQualityOutput } from '@/ai/flows/prompt-quality-analysis';
import { suggestPromptImprovements, type SuggestPromptImprovementsInput, type SuggestPromptImprovementsOutput } from '@/ai/flows/suggest-prompt-improvements';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

export default function AiInsightsPage() {
  const [isLoadingQuality, setIsLoadingQuality] = useState(false);
  const [qualityAnalysisResult, setQualityAnalysisResult] = useState<AnalyzePromptQualityOutput | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);

  const [evalResultsPQ, setEvalResultsPQ] = useState('');
  const [productSchemaPQ, setProductSchemaPQ] = useState('');
  const [evalParamsPQ, setEvalParamsPQ] = useState('');
  const [promptTemplatePQ, setPromptTemplatePQ] = useState('');

  const [isLoadingImprovements, setIsLoadingImprovements] = useState(false);
  const [improvementsResult, setImprovementsResult] = useState<SuggestPromptImprovementsOutput | null>(null);
  const [improvementsError, setImprovementsError] = useState<string | null>(null);
  
  const [promptTemplateSI, setPromptTemplateSI] = useState('');
  const [evalResultsSI, setEvalResultsSI] = useState('');

  const handleQualityAnalysisSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoadingQuality(true);
    setQualityAnalysisResult(null);
    setQualityError(null);
    try {
      const input: AnalyzePromptQualityInput = {
        evalResults: evalResultsPQ,
        productParametersSchema: productSchemaPQ,
        evaluationParameters: evalParamsPQ,
        promptTemplate: promptTemplatePQ,
      };
      const result = await analyzePromptQuality(input);
      setQualityAnalysisResult(result);
    } catch (error) {
      console.error("Error analyzing prompt quality:", error);
      setQualityError((error as Error).message || "Failed to analyze prompt quality.");
    } finally {
      setIsLoadingQuality(false);
    }
  };

  const handleImprovementsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoadingImprovements(true);
    setImprovementsResult(null);
    setImprovementsError(null);
    try {
      const input: SuggestPromptImprovementsInput = {
        promptTemplate: promptTemplateSI,
        evalResults: evalResultsSI,
      };
      const result = await suggestPromptImprovements(input);
      setImprovementsResult(result);
    } catch (error) {
      console.error("Error suggesting prompt improvements:", error);
      setImprovementsError((error as Error).message || "Failed to suggest prompt improvements.");
    } finally {
      setIsLoadingImprovements(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Lightbulb className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">AI-Powered Insights &amp; Analysis</CardTitle>
              <CardDescription>Leverage AI to understand prompt performance and get suggestions for improvement.</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="quality-analysis">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="quality-analysis"><BrainCircuit className="mr-2 h-4 w-4" />Prompt Quality Analysis</TabsTrigger>
          <TabsTrigger value="suggest-improvements"><Wand2 className="mr-2 h-4 w-4" />Suggest Prompt Improvements</TabsTrigger>
        </TabsList>

        <TabsContent value="quality-analysis">
          <Card>
            <CardHeader>
              <CardTitle>Analyze Prompt Quality</CardTitle>
              <CardDescription>Input data from an eval run to identify patterns, insights about prompt effectiveness, and influential parameters.</CardDescription>
            </CardHeader>
            <form onSubmit={handleQualityAnalysisSubmit}>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="evalResultsPQ">Eval Results (JSON)</Label>
                  <Textarea id="evalResultsPQ" value={evalResultsPQ} onChange={e => setEvalResultsPQ(e.target.value)} placeholder="Paste JSON data of evaluation run results..." rows={5} required />
                </div>
                <div>
                  <Label htmlFor="productSchemaPQ">Product Parameters Schema (JSON/Text)</Label>
                  <Textarea id="productSchemaPQ" value={productSchemaPQ} onChange={e => setProductSchemaPQ(e.target.value)} placeholder="Describe your product parameters schema..." rows={3} required />
                </div>
                <div>
                  <Label htmlFor="evalParamsPQ">Evaluation Parameters (JSON/Text)</Label>
                  <Textarea id="evalParamsPQ" value={evalParamsPQ} onChange={e => setEvalParamsPQ(e.target.value)} placeholder="Describe your evaluation parameters..." rows={3} required />
                </div>
                <div>
                  <Label htmlFor="promptTemplatePQ">Prompt Template Used</Label>
                  <Textarea id="promptTemplatePQ" value={promptTemplatePQ} onChange={e => setPromptTemplatePQ(e.target.value)} placeholder="Paste the prompt template used in the eval run..." rows={3} required />
                </div>
                <Button type="submit" disabled={isLoadingQuality}>
                  {isLoadingQuality ? <BrainCircuit className="mr-2 h-4 w-4 animate-pulse" /> : <Send className="mr-2 h-4 w-4" />}
                  {isLoadingQuality ? 'Analyzing...' : 'Analyze Quality'}
                </Button>
              </CardContent>
            </form>
            {isLoadingQuality && (
              <CardContent>
                <Skeleton className="h-8 w-1/4 mb-2" />
                <Skeleton className="h-20 w-full mb-4" />
                <Skeleton className="h-8 w-1/4 mb-2" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            )}
            {qualityError && (
              <CardContent>
                <Alert variant="destructive">
                  <FileQuestion className="h-4 w-4" />
                  <AlertTitle>Analysis Error</AlertTitle>
                  <AlertDescription>{qualityError}</AlertDescription>
                </Alert>
              </CardContent>
            )}
            {qualityAnalysisResult && (
              <CardContent className="space-y-4 pt-6 border-t">
                <h3 className="text-lg font-semibold">Analysis Results:</h3>
                <Card>
                  <CardHeader><CardTitle className="text-md">Insights</CardTitle></CardHeader>
                  <CardContent><pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">{qualityAnalysisResult.insights}</pre></CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-md">Recommendations</CardTitle></CardHeader>
                  <CardContent><pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">{qualityAnalysisResult.recommendations}</pre></CardContent>
                </Card>
              </CardContent>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="suggest-improvements">
          <Card>
            <CardHeader>
              <CardTitle>Suggest Prompt Improvements</CardTitle>
              <CardDescription>Provide a prompt template and its evaluation results to get AI-powered suggestions for improvement.</CardDescription>
            </CardHeader>
            <form onSubmit={handleImprovementsSubmit}>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="promptTemplateSI">Prompt Template</Label>
                  <Textarea id="promptTemplateSI" value={promptTemplateSI} onChange={e => setPromptTemplateSI(e.target.value)} placeholder="Paste the prompt template you want to improve..." rows={5} required />
                </div>
                <div>
                  <Label htmlFor="evalResultsSI">Evaluation Results (JSON)</Label>
                  <Textarea id="evalResultsSI" value={evalResultsSI} onChange={e => setEvalResultsSI(e.target.value)} placeholder="Paste JSON data of evaluation results for this prompt..." rows={5} required />
                </div>
                <Button type="submit" disabled={isLoadingImprovements}>
                  {isLoadingImprovements ? <Wand2 className="mr-2 h-4 w-4 animate-pulse" /> : <Send className="mr-2 h-4 w-4" />}
                  {isLoadingImprovements ? 'Generating...' : 'Get Suggestions'}
                </Button>
              </CardContent>
            </form>
            {isLoadingImprovements && (
               <CardContent>
                <Skeleton className="h-8 w-1/4 mb-2" />
                <Skeleton className="h-20 w-full mb-4" />
                <Skeleton className="h-8 w-1/4 mb-2" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            )}
            {improvementsError && (
              <CardContent>
                <Alert variant="destructive">
                  <FileQuestion className="h-4 w-4" />
                  <AlertTitle>Suggestion Error</AlertTitle>
                  <AlertDescription>{improvementsError}</AlertDescription>
                </Alert>
              </CardContent>
            )}
            {improvementsResult && (
              <CardContent className="space-y-4 pt-6 border-t">
                <h3 className="text-lg font-semibold">Improvement Suggestions:</h3>
                <Card>
                  <CardHeader><CardTitle className="text-md">Suggested Improvements</CardTitle></CardHeader>
                  <CardContent><pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">{improvementsResult.suggestedImprovements}</pre></CardContent>
                </Card>
                 <Card>
                  <CardHeader><CardTitle className="text-md">Reasoning</CardTitle></CardHeader>
                  <CardContent><pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">{improvementsResult.reasoning}</pre></CardContent>
                </Card>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
