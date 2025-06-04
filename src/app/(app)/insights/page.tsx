
'use client';

import { useState, type FormEvent, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrainCircuit, Wand2, Send, Loader2, AlertTriangle, FileText, Copy } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, query, orderBy, type Timestamp } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import {
  suggestRecursivePromptImprovements,
  type SuggestRecursivePromptImprovementsInput,
  type SuggestRecursivePromptImprovementsOutput,
  type MismatchDetail
} from '@/ai/flows/suggest-recursive-prompt-improvements';
import type { EvalParameterForPrompts, CategorizationLabelForPrompts } from '@/app/(app)/prompts/page'; // Re-using type
import type { ProductParameterForPrompts } from '@/app/(app)/prompts/page'; // Re-using type


interface EvalRunResultItemForInsights {
  inputData: Record<string, any>;
  judgeLlmOutput: Record<string, { chosenLabel: string; rationale?: string; error?: string }>;
  groundTruth?: Record<string, string>;
}

interface EvalRunSummary {
  id: string;
  name: string;
  status: string;
  createdAt: Timestamp;
}

interface EvalRunDetailFromDB {
  id: string;
  name: string;
  results?: EvalRunResultItemForInsights[];
  selectedEvalParamIds: string[];
  promptId: string;
  promptVersionId: string;
  // Add other fields if needed for context, e.g. datasetId, datasetVersionId
}

const fetchEvalRunsList = async (userId: string | null): Promise<EvalRunSummary[]> => {
  if (!userId) return [];
  const runsCollectionRef = collection(db, 'users', userId, 'evaluationRuns');
  const q = query(runsCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    name: docSnap.data().name as string,
    status: docSnap.data().status as string,
    createdAt: docSnap.data().createdAt as Timestamp,
  }));
};

const fetchFullEvalRunDetails = async (userId: string | null, runId: string | null): Promise<EvalRunDetailFromDB | null> => {
  if (!userId || !runId) return null;
  const runDocRef = doc(db, 'users', userId, 'evaluationRuns', runId);
  const runDocSnap = await getDoc(runDocRef);
  if (runDocSnap.exists()) {
    const data = runDocSnap.data();
    return {
      id: runDocSnap.id,
      name: data.name,
      results: data.results as EvalRunResultItemForInsights[] || [],
      selectedEvalParamIds: data.selectedEvalParamIds as string[] || [],
      promptId: data.promptId,
      promptVersionId: data.promptVersionId,
    } as EvalRunDetailFromDB;
  }
  return null;
};

const fetchOriginalPromptText = async (userId: string | null, promptId: string | null, versionId: string | null): Promise<string | null> => {
  if (!userId || !promptId || !versionId) return null;
  const versionDocRef = doc(db, 'users', userId, 'promptTemplates', promptId, 'versions', versionId);
  const versionDocSnap = await getDoc(versionDocRef);
  return versionDocSnap.exists() ? (versionDocSnap.data()?.template as string) : null;
};

const fetchAllEvalParamsDetails = async (userId: string | null): Promise<EvalParameterForPrompts[]> => {
  if (!userId) return [];
  const evalParamsCollectionRef = collection(db, 'users', userId, 'evaluationParameters');
  const q = query(evalParamsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name || 'Unnamed Eval Param',
      definition: data.definition || '',
      categorizationLabels: data.categorizationLabels?.map((l: any) => ({ name: l.name, definition: l.definition, example: l.example })) || [],
      requiresRationale: data.requiresRationale || false,
    };
  });
};

const fetchAllProductParamsSchema = async (userId: string | null): Promise<ProductParameterForPrompts[]> => {
    if (!userId) return [];
    const paramsCollectionRef = collection(db, 'users', userId, 'productParameters');
    const q = query(paramsCollectionRef, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name as string,
        description: docSnap.data().description as string,
        // No need for type or options for schema string here
    }));
};


export default function IterativePromptImproverPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);

  const [currentProductPrompt, setCurrentProductPrompt] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [targetEvalParamId, setTargetEvalParamId] = useState<string | null>(null);
  const [desiredTargetLabel, setDesiredTargetLabel] = useState<string | null>(null);

  const [mismatchDisplayData, setMismatchDisplayData] = useState<any[]>([]);
  const [mismatchDetailsForFlow, setMismatchDetailsForFlow] = useState<MismatchDetail[]>([]);
  
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [suggestionResult, setSuggestionResult] = useState<SuggestRecursivePromptImprovementsOutput | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    setCurrentUserId(storedUserId || null);
    setIsLoadingUserId(false);
  }, []);

  const { data: evalRunsList = [], isLoading: isLoadingRunsList } = useQuery<EvalRunSummary[], Error>({
    queryKey: ['evalRunsListForInsights', currentUserId],
    queryFn: () => fetchEvalRunsList(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const { data: selectedEvalRunDetails, isLoading: isLoadingSelectedRunDetails } = useQuery<EvalRunDetailFromDB | null, Error>({
    queryKey: ['selectedEvalRunDetailsForInsights', currentUserId, selectedRunId],
    queryFn: () => fetchFullEvalRunDetails(currentUserId, selectedRunId),
    enabled: !!currentUserId && !!selectedRunId,
    onSuccess: (data) => {
      if (data?.promptId && data.promptVersionId) {
        // Prefill currentProductPrompt if not already manually set
        // This logic could be refined if user has already typed something.
        if (!currentProductPrompt) {
             fetchOriginalPromptText(currentUserId, data.promptId, data.promptVersionId)
                .then(text => { if(text) setCurrentProductPrompt(text); });
        }
      }
      // Reset subsequent selections if run changes
      setTargetEvalParamId(null);
      setDesiredTargetLabel(null);
      setMismatchDisplayData([]);
      setMismatchDetailsForFlow([]);
    }
  });

  const { data: allEvalParamsDetails = [], isLoading: isLoadingAllEvalParams } = useQuery<EvalParameterForPrompts[], Error>({
    queryKey: ['allEvalParamsDetailsForInsights', currentUserId],
    queryFn: () => fetchAllEvalParamsDetails(currentUserId),
    enabled: !!currentUserId,
  });
  
  const { data: allProductParams = [], isLoading: isLoadingAllProductParams } = useQuery<ProductParameterForPrompts[], Error>({
      queryKey: ['allProductParamsForInsightsSchema', currentUserId],
      queryFn: () => fetchAllProductParamsSchema(currentUserId),
      enabled: !!currentUserId,
  });

  const productParametersSchemaText = useMemo(() => {
    if (!allProductParams || allProductParams.length === 0) return "No product parameters defined.";
    return "Product Parameters Schema:\n" + allProductParams.map(p => `- ${p.name}: ${p.description || 'No definition'}`).join("\n");
  }, [allProductParams]);

  const evaluationParametersSchemaText = useMemo(() => {
    if (!allEvalParamsDetails || allEvalParamsDetails.length === 0) return "No evaluation parameters defined.";
     return "Full Evaluation Parameters Schema:\n" + allEvalParamsDetails.map(ep => {
        let schema = `- ID: ${ep.id}, Name: ${ep.name}\n  Definition: ${ep.definition}\n`;
        if (ep.requiresRationale) schema += `  (Requires Rationale)\n`;
        if (ep.categorizationLabels && ep.categorizationLabels.length > 0) {
            schema += `  Labels:\n` + ep.categorizationLabels.map(l => `    - "${l.name}": ${l.definition} ${l.example ? `(e.g., "${l.example}")` : ''}`).join("\n");
        }
        return schema;
    }).join("\n\n");
  }, [allEvalParamsDetails]);


  const availableEvalParamsForSelectedRun = useMemo(() => {
    if (!selectedEvalRunDetails || !allEvalParamsDetails) return [];
    return allEvalParamsDetails.filter(ep => selectedEvalRunDetails.selectedEvalParamIds.includes(ep.id));
  }, [selectedEvalRunDetails, allEvalParamsDetails]);

  const availableLabelsForSelectedParam = useMemo(() => {
    if (!targetEvalParamId || !availableEvalParamsForSelectedRun) return [];
    const param = availableEvalParamsForSelectedRun.find(ep => ep.id === targetEvalParamId);
    return param?.categorizationLabels || [];
  }, [targetEvalParamId, availableEvalParamsForSelectedRun]);


  useEffect(() => {
    if (selectedEvalRunDetails && targetEvalParamId && desiredTargetLabel && allEvalParamsDetails.length > 0) {
      const currentParamDetails = allEvalParamsDetails.find(p => p.id === targetEvalParamId);
      if (!currentParamDetails) {
        if (mismatchDisplayData.length > 0) setMismatchDisplayData([]);
        if (mismatchDetailsForFlow.length > 0) setMismatchDetailsForFlow([]);
        return;
      }

      const newMismatchesForDisplay: any[] = [];
      const newMismatchesForFlow: MismatchDetail[] = [];

      selectedEvalRunDetails.results?.forEach(item => {
        const llmOutput = item.judgeLlmOutput?.[targetEvalParamId];
        if (llmOutput && llmOutput.chosenLabel !== desiredTargetLabel && !llmOutput.error) {
          if (newMismatchesForDisplay.length < 5) { // Limit display to 5 for UI
            newMismatchesForDisplay.push({
              inputData: item.inputData,
              llmChosenLabel: llmOutput.chosenLabel,
              llmRationale: llmOutput.rationale,
              desiredTargetLabel: desiredTargetLabel,
            });
          }
          newMismatchesForFlow.push({
            inputData: item.inputData,
            evaluationParameterName: currentParamDetails.name,
            evaluationParameterDefinition: currentParamDetails.definition,
            llmChosenLabel: llmOutput.chosenLabel,
            groundTruthLabel: desiredTargetLabel, // User's target is the "ground truth" for improvement
            llmRationale: llmOutput.rationale,
          });
        }
      });
      
      if (JSON.stringify(newMismatchesForDisplay) !== JSON.stringify(mismatchDisplayData)) {
        setMismatchDisplayData(newMismatchesForDisplay);
      }
      if (JSON.stringify(newMismatchesForFlow) !== JSON.stringify(mismatchDetailsForFlow)) {
        setMismatchDetailsForFlow(newMismatchesForFlow);
      }

    } else {
      if (mismatchDisplayData.length > 0) setMismatchDisplayData([]);
      if (mismatchDetailsForFlow.length > 0) setMismatchDetailsForFlow([]);
    }
  }, [selectedEvalRunDetails, targetEvalParamId, desiredTargetLabel, allEvalParamsDetails, mismatchDisplayData, mismatchDetailsForFlow]);


  const handleSuggestImprovements = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentProductPrompt.trim()) {
      toast({ title: "Input Error", description: "Please provide your current product prompt.", variant: "destructive" }); return;
    }
    if (mismatchDetailsForFlow.length === 0) {
      toast({ title: "No Mismatches", description: "No rows found where the LLM output differs from your desired target label for the selected parameter. Nothing to improve based on this specific goal!", variant: "default" }); return;
    }

    setIsLoadingSuggestion(true);
    setSuggestionResult(null);
    setSuggestionError(null);

    try {
      const input: SuggestRecursivePromptImprovementsInput = {
        originalPromptTemplate: currentProductPrompt,
        mismatchDetails: mismatchDetailsForFlow,
        productParametersSchema: productParametersSchemaText,
        evaluationParametersSchema: evaluationParametersSchemaText,
      };
      const result = await suggestRecursivePromptImprovements(input);
      setSuggestionResult(result);
      toast({ title: "Suggestions Generated!", description: "Review the suggested prompt and reasoning below." });
    } catch (error) {
      console.error("Error suggesting prompt improvements:", error);
      const errorMessage = (error as Error).message || "Failed to get suggestions.";
      setSuggestionError(errorMessage);
      toast({ title: "Suggestion Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoadingSuggestion(false);
    }
  };

  const handleRunSelectChange = (runId: string) => {
    setSelectedRunId(runId);
    // Reset subsequent fields when run changes
    setTargetEvalParamId(null);
    setDesiredTargetLabel(null);
    setSuggestionResult(null);
    setSuggestionError(null);
  };

  const handleParamSelectChange = (paramId: string) => {
    setTargetEvalParamId(paramId);
    setDesiredTargetLabel(null); // Reset label when param changes
    setSuggestionResult(null);
    setSuggestionError(null);
  };
  
  const handleLabelSelectChange = (label: string) => {
    setDesiredTargetLabel(label);
    setSuggestionResult(null);
    setSuggestionError(null);
  };

  if (isLoadingUserId) {
    return <div className="p-6"><Skeleton className="h-screen w-full"/></div>;
  }
  if (!currentUserId) {
    return <Card className="m-4"><CardContent className="p-6 text-center text-muted-foreground">Please log in to use the Iterative Prompt Improver.</CardContent></Card>;
  }

  return (
    <div className="space-y-6 p-4 md:p-0">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Wand2 className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-xl md:text-2xl font-headline">Iterative Prompt Improver</CardTitle>
              <CardDescription>Improve your product's prompt to achieve a desired outcome for a specific evaluation parameter, based on an existing evaluation run.</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <form onSubmit={handleSuggestImprovements}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. Define Your Goal</CardTitle>
            <CardDescription>Provide your current prompt and specify which evaluation parameter you want to improve towards a target label.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="currentProductPrompt" className="font-semibold">Your Current Product Prompt</Label>
              <Textarea
                id="currentProductPrompt"
                value={currentProductPrompt}
                onChange={e => setCurrentProductPrompt(e.target.value)}
                placeholder="Paste or type your existing product prompt template here..."
                rows={8}
                required
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="evalRunSelect" className="font-semibold">Evaluation Run to Analyze</Label>
                <Select value={selectedRunId || ''} onValueChange={handleRunSelectChange} required>
                  <SelectTrigger id="evalRunSelect" disabled={isLoadingRunsList}>
                    <SelectValue placeholder={isLoadingRunsList ? "Loading runs..." : "Select an Eval Run"} />
                  </SelectTrigger>
                  <SelectContent>
                    {evalRunsList.map(run => (
                      <SelectItem key={run.id} value={run.id}>{run.name} ({new Date(run.createdAt.toDate()).toLocaleDateString()})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="targetEvalParamSelect" className="font-semibold">Target Evaluation Parameter</Label>
                <Select
                  value={targetEvalParamId || ''}
                  onValueChange={handleParamSelectChange}
                  required
                  disabled={!selectedRunId || isLoadingSelectedRunDetails || isLoadingAllEvalParams || availableEvalParamsForSelectedRun.length === 0}
                >
                  <SelectTrigger id="targetEvalParamSelect">
                    <SelectValue placeholder={
                      !selectedRunId ? "Select a run first" :
                      isLoadingSelectedRunDetails || isLoadingAllEvalParams ? "Loading params..." :
                      availableEvalParamsForSelectedRun.length === 0 ? "No params in run" :
                      "Select Target Parameter"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEvalParamsForSelectedRun.map(param => (
                      <SelectItem key={param.id} value={param.id}>{param.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="desiredTargetLabelSelect" className="font-semibold">Desired Target Label</Label>
                <Select
                  value={desiredTargetLabel || ''}
                  onValueChange={handleLabelSelectChange}
                  required
                  disabled={!targetEvalParamId || availableLabelsForSelectedParam.length === 0}
                >
                  <SelectTrigger id="desiredTargetLabelSelect">
                    <SelectValue placeholder={
                        !targetEvalParamId ? "Select a parameter first" :
                        availableLabelsForSelectedParam.length === 0 ? "No labels for param" :
                        "Select Desired Label"
                    }/>
                  </SelectTrigger>
                  <SelectContent>
                    {availableLabelsForSelectedParam.map(label => (
                      <SelectItem key={label.name} value={label.name}>{label.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {mismatchDisplayData.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">2. Review Mismatches (Auto-Generated for AI)</CardTitle>
              <CardDescription>
                Showing up to 5 examples from the run where the LLM's output for <strong className="text-primary">{allEvalParamsDetails.find(p=>p.id===targetEvalParamId)?.name || 'the selected parameter'}</strong> did not match your desired label: <strong className="text-primary">{desiredTargetLabel}</strong>.
                The AI will use these examples to suggest improvements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
              {mismatchDisplayData.map((mismatch, index) => (
                <Card key={index} className="p-3 bg-muted/50 text-xs">
                  <p className="font-semibold mb-1">Example Mismatch #{index + 1}</p>
                  <div className="space-y-1">
                    <div><strong>Input Data:</strong> <pre className="whitespace-pre-wrap bg-background p-1 rounded-sm text-[10px]">{JSON.stringify(mismatch.inputData, null, 2)}</pre></div>
                    <div><strong>LLM Chose:</strong> <span className="font-medium">{mismatch.llmChosenLabel}</span></div>
                    {mismatch.llmRationale && <div><strong>LLM Rationale:</strong> <span className="italic">{mismatch.llmRationale}</span></div>}
                    <div><strong>Desired Label:</strong> <span className="font-medium text-green-600">{mismatch.desiredTargetLabel}</span></div>
                  </div>
                </Card>
              ))}
            </CardContent>
          </Card>
        )}
         {selectedEvalRunDetails && targetEvalParamId && desiredTargetLabel && mismatchDisplayData.length === 0 && !isLoadingSelectedRunDetails && (
             <Card className="mt-6"><CardContent className="pt-6 text-center text-muted-foreground">No rows found in the selected run where the LLM's output for &quot;{allEvalParamsDetails.find(p=>p.id===targetEvalParamId)?.name}&quot; differs from your desired label &quot;{desiredTargetLabel}&quot;.</CardContent></Card>
         )}


        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">3. Get Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              type="submit"
              disabled={isLoadingSuggestion || !currentProductPrompt.trim() || !selectedRunId || !targetEvalParamId || !desiredTargetLabel || mismatchDetailsForFlow.length === 0}
              className="w-full sm:w-auto"
            >
              {isLoadingSuggestion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
              {isLoadingSuggestion ? 'Generating Suggestions...' : 'Suggest Prompt Improvements'}
            </Button>
          </CardContent>

          {isLoadingSuggestion && (
            <CardFooter className="flex flex-col items-start space-y-4 pt-6 border-t">
              <Skeleton className="h-8 w-1/4 mb-2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-8 w-1/4 mt-4 mb-2" />
              <Skeleton className="h-20 w-full" />
            </CardFooter>
          )}

          {suggestionError && !isLoadingSuggestion && (
            <CardFooter className="pt-6 border-t">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Suggestion Error</AlertTitle>
                <AlertDescription>{suggestionError}</AlertDescription>
              </Alert>
            </CardFooter>
          )}

          {suggestionResult && !isLoadingSuggestion && (
            <CardFooter className="flex flex-col items-start space-y-4 pt-6 border-t">
              <div>
                <Label htmlFor="suggestedPromptTemplate" className="text-base font-semibold flex justify-between items-center w-full">
                  Suggested New Prompt Template
                  <Button type="button" variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(suggestionResult.suggestedPromptTemplate)}>
                    <Copy className="mr-2 h-3 w-3"/>Copy
                  </Button>
                </Label>
                <Textarea id="suggestedPromptTemplate" value={suggestionResult.suggestedPromptTemplate} readOnly rows={10} className="font-mono text-sm mt-1 bg-muted/30"/>
              </div>
              <div>
                <Label htmlFor="reasoning" className="text-base font-semibold">Reasoning for Changes</Label>
                <Textarea id="reasoning" value={suggestionResult.reasoning} readOnly rows={6} className="mt-1 bg-muted/30"/>
              </div>
               <Alert>
                <FileText className="h-4 w-4"/>
                <AlertTitle>Next Steps</AlertTitle>
                <AlertDescription>
                  Review the suggestion. If you like it, copy the new template and either create a new prompt version or update an existing one on the &quot;Prompts&quot; page. Then, create a new evaluation run using the improved prompt.
                </AlertDescription>
              </Alert>
            </CardFooter>
          )}
        </Card>
      </form>
    </div>
  );
}

    

    