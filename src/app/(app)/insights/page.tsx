
'use client';

import { useState, type FormEvent, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrainCircuit, Wand2, Send, Loader2, AlertTriangle, FileText, Copy, Lightbulb, ListChecks, Save, Trash2, HelpCircle, Users, Info, PanelLeftClose, PanelRightOpen } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, query, orderBy, type Timestamp, addDoc, deleteDoc, serverTimestamp, type FieldValue } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import {
  suggestRecursivePromptImprovements,
  type SuggestRecursivePromptImprovementsInput,
  type SuggestRecursivePromptImprovementsOutput,
  type MismatchDetail
} from '@/ai/flows/suggest-recursive-prompt-improvements';
import {
  analyzeEvalProblemCategories,
  type AnalyzeEvalProblemCategoriesInput,
  type AnalyzeEvalProblemCategoriesOutput,
  type ProblemCategory,
} from '@/ai/flows/analyze-eval-problem-categories';
import {
  analyzeSummarizationProblems,
  type AnalyzeSummarizationProblemsInput,
  type AnalyzeSummarizationProblemsOutput as UserIntentAnalysisOutput,
  type UserIntentCategory,
} from '@/ai/flows/analyze-summarization-problems';
import type { EvalParameterForPrompts, CategorizationLabelForPrompts } from '@/app/(app)/prompts/page';
import type { ProductParameterForPrompts } from '@/app/(app)/prompts/page';
import type { SummarizationDefinition } from '@/app/(app)/evaluation-parameters/page';


interface EvalRunResultItemForInsights {
  inputData: Record<string, any>;
  judgeLlmOutput: Record<string, { chosenLabel?: string; generatedSummary?: string; rationale?: string; error?: string }>;
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
  selectedSummarizationDefIds?: string[];
  promptId: string;
  promptVersionId: string;
}

interface StoredAnalysisDataForFirestore {
  analysisName: string;
  createdAt: FieldValue;
  analysisType: 'evaluation' | 'summarization';
  targetEvalParamId?: string;
  targetEvalParamName?: string;
  desiredTargetLabel?: string;
  targetSummarizationDefId?: string;
  targetSummarizationDefName?: string;
  problemCategories: ProblemCategory[] | UserIntentCategory[];
  overallSummary?: string;
  sourceDataCount: number;
  productContext?: string;
}

interface StoredAnalysis extends Omit<StoredAnalysisDataForFirestore, 'createdAt' | 'problemCategories' | 'overallSummary' | 'sourceDataCount' | 'productContext'> {
  id: string;
  createdAt: Timestamp;
  sourceDataCount: number;
  productContext?: string;
}

interface StoredAnalysisWithDetails extends StoredAnalysis {
    problemCategories: ProblemCategory[] | UserIntentCategory[];
    overallSummary?: string;
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
      selectedSummarizationDefIds: data.selectedSummarizationDefIds as string[] || [],
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
    }));
};

const fetchAllSummarizationDefs = async (userId: string | null): Promise<SummarizationDefinition[]> => {
  if (!userId) return [];
  const defsCollectionRef = collection(db, 'users', userId, 'summarizationDefinitions');
  const q = query(defsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name || 'Unnamed Definition',
      definition: data.definition || '',
      example: data.example || '',
    } as SummarizationDefinition;
  });
};

const fetchStoredAnalysesForRun = async (userId: string | null, runId: string | null): Promise<StoredAnalysis[]> => {
    if (!userId || !runId) return [];
    const analysesCollectionRef = collection(db, 'users', userId, 'evaluationRuns', runId, 'storedAnalyses');
    const q = query(analysesCollectionRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            analysisName: data.analysisName,
            createdAt: data.createdAt as Timestamp,
            analysisType: data.analysisType || 'evaluation', 
            targetEvalParamId: data.targetEvalParamId,
            targetEvalParamName: data.targetEvalParamName,
            desiredTargetLabel: data.desiredTargetLabel,
            targetSummarizationDefId: data.targetSummarizationDefId,
            targetSummarizationDefName: data.targetSummarizationDefName,
            sourceDataCount: data.sourceDataCount || data.mismatchCountAnalyzed || 0, 
            productContext: data.productContext,
        } as StoredAnalysis;
    });
};

const fetchSingleStoredAnalysisDetails = async (userId: string | null, runId: string | null, analysisId: string | null): Promise<StoredAnalysisWithDetails | null> => {
    if (!userId || !runId || !analysisId) return null;
    const analysisDocRef = doc(db, 'users', userId, 'evaluationRuns', runId, 'storedAnalyses', analysisId);
    const docSnap = await getDoc(analysisDocRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            analysisName: data.analysisName,
            createdAt: data.createdAt as Timestamp,
            analysisType: data.analysisType || 'evaluation',
            targetEvalParamId: data.targetEvalParamId,
            targetEvalParamName: data.targetEvalParamName,
            desiredTargetLabel: data.desiredTargetLabel,
            targetSummarizationDefId: data.targetSummarizationDefId,
            targetSummarizationDefName: data.targetSummarizationDefName,
            problemCategories: data.problemCategories as ProblemCategory[] | UserIntentCategory[],
            overallSummary: data.overallSummary as string | undefined,
            sourceDataCount: data.sourceDataCount || data.mismatchCountAnalyzed || 0,
            productContext: data.productContext,
        } as StoredAnalysisWithDetails;
    }
    return null;
}


export default function AiInsightsPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);
  const queryClient = useQueryClient();

  const [currentProductPrompt, setCurrentProductPrompt] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  
  const [analysisType, setAnalysisType] = useState<'evaluation' | 'summarization'>('evaluation');
  const [targetEvalParamId, setTargetEvalParamId] = useState<string | null>(null);
  const [desiredTargetLabel, setDesiredTargetLabel] = useState<string | null>(null);
  const [selectedSummarizationDefId, setSelectedSummarizationDefId] = useState<string | null>(null);
  const [productContextForAnalysis, setProductContextForAnalysis] = useState(''); 
  
  const [mismatchDisplayData, setMismatchDisplayData] = useState<any[]>([]);
  const [mismatchDetailsForFlow, setMismatchDetailsForFlow] = useState<MismatchDetail[]>([]);
  const [summariesForDisplay, setSummariesForDisplay] = useState<Array<{inputData: Record<string, any>, generatedSummary: string}>>([]);
  const [summariesForFlow, setSummariesForFlow] = useState<Array<{inputData: Record<string, any>, generatedSummary: string}>>([]);
  
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [suggestionResult, setSuggestionResult] = useState<SuggestRecursivePromptImprovementsOutput | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  const [isLoadingProblemAnalysis, setIsLoadingProblemAnalysis] = useState(false);
  const [problemAnalysisResult, setProblemAnalysisResult] = useState<AnalyzeEvalProblemCategoriesOutput | UserIntentAnalysisOutput | null>(null);
  const [problemAnalysisError, setProblemAnalysisError] = useState<string | null>(null);
  const [viewingSavedAnalysisId, setViewingSavedAnalysisId] = useState<string | null>(null);


  const [isSaveAnalysisDialogOpen, setIsSaveAnalysisDialogOpen] = useState(false);
  const [analysisNameToSave, setAnalysisNameToSave] = useState('');


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
  });

  const { data: storedAnalyses = [], isLoading: isLoadingStoredAnalyses } = useQuery<StoredAnalysis[], Error>({
    queryKey: ['storedAnalysesForRun', currentUserId, selectedRunId],
    queryFn: () => fetchStoredAnalysesForRun(currentUserId, selectedRunId),
    enabled: !!currentUserId && !!selectedRunId,
  });

  const getSelectedPromptContext = () => {
    if (selectedEvalRunDetails) {
      return {
        promptId: selectedEvalRunDetails.promptId,
        versionId: selectedEvalRunDetails.promptVersionId,
      };
    }
    return { promptId: null, versionId: null };
  };

  useEffect(() => {
    if (selectedEvalRunDetails) {
      const { promptId, versionId } = getSelectedPromptContext();
      if (promptId && versionId) {
         fetchOriginalPromptText(currentUserId, promptId, versionId)
            .then(text => { if(text) setCurrentProductPrompt(text); });
      }
      setTargetEvalParamId(null);
      setDesiredTargetLabel(null);
      setSelectedSummarizationDefId(null);
      setProductContextForAnalysis(''); 
      setMismatchDisplayData([]);
      setMismatchDetailsForFlow([]);
      setSummariesForDisplay([]);
      setSummariesForFlow([]);
      setSuggestionResult(null);
      setProblemAnalysisResult(null);
      setViewingSavedAnalysisId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [selectedEvalRunDetails, currentUserId]);


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

  const { data: allSummarizationDefs = [], isLoading: isLoadingAllSummarizationDefs } = useQuery<SummarizationDefinition[], Error>({
    queryKey: ['allSummarizationDefsForInsights', currentUserId],
    queryFn: () => fetchAllSummarizationDefs(currentUserId),
    enabled: !!currentUserId,
  });

  const productParametersSchemaText = useMemo(() => {
    if (!allProductParams || allProductParams.length === 0) return "No product parameters defined.";
    return "Product Parameters Schema:\n" + allProductParams.map(p => `- ${p.name}: ${p.description || 'No definition'}`).join("\n");
  }, [allProductParams]);

  const evaluationParametersSchemaText = useMemo(() => {
    if (!allEvalParamsDetails || allEvalParamsDetails.length === 0) return "No evaluation parameters defined.";
     return "Full Evaluation Parameters Schema (all available to project):\n" + allEvalParamsDetails.map(ep => {
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

  const availableSummarizationDefsForSelectedRun = useMemo(() => {
    if (!selectedEvalRunDetails || !allSummarizationDefs || !selectedEvalRunDetails.selectedSummarizationDefIds) return [];
    return allSummarizationDefs.filter(sd => selectedEvalRunDetails.selectedSummarizationDefIds!.includes(sd.id));
  }, [selectedEvalRunDetails, allSummarizationDefs]);


  const availableLabelsForSelectedParam = useMemo(() => {
    if (!targetEvalParamId || !availableEvalParamsForSelectedRun) return [];
    const param = availableEvalParamsForSelectedRun.find(ep => ep.id === targetEvalParamId);
    return param?.categorizationLabels || [];
  }, [targetEvalParamId, availableEvalParamsForSelectedRun]);


  useEffect(() => {
    if (analysisType === 'evaluation') {
        if (selectedEvalRunDetails && targetEvalParamId && desiredTargetLabel && allEvalParamsDetails.length > 0) {
            const currentEvalParamDetails = allEvalParamsDetails.find(p => p.id === targetEvalParamId);
            if (!currentEvalParamDetails) {
                if (mismatchDisplayData.length > 0) setMismatchDisplayData([]);
                if (mismatchDetailsForFlow.length > 0) setMismatchDetailsForFlow([]);
                return;
            }
            const newMismatchesForDisplay: any[] = [];
            const newMismatchesForFlow: MismatchDetail[] = [];
            selectedEvalRunDetails.results?.forEach(item => {
                const llmOutput = item.judgeLlmOutput?.[targetEvalParamId];

                if (llmOutput && typeof llmOutput.chosenLabel === 'string' && llmOutput.chosenLabel !== desiredTargetLabel && !llmOutput.error) {
                    if (newMismatchesForDisplay.length < 5) { 
                        newMismatchesForDisplay.push({ inputData: item.inputData, llmChosenLabel: llmOutput.chosenLabel, llmRationale: llmOutput.rationale, desiredTargetLabel: desiredTargetLabel });
                    }
                    newMismatchesForFlow.push({ inputData: item.inputData, evaluationParameterName: currentEvalParamDetails.name, evaluationParameterDefinition: currentEvalParamDetails.definition, llmChosenLabel: llmOutput.chosenLabel, groundTruthLabel: desiredTargetLabel, llmRationale: llmOutput.rationale });
                }
            });
            if (JSON.stringify(newMismatchesForDisplay) !== JSON.stringify(mismatchDisplayData)) { setMismatchDisplayData(newMismatchesForDisplay); }
            if (JSON.stringify(newMismatchesForFlow) !== JSON.stringify(mismatchDetailsForFlow)) { setMismatchDetailsForFlow(newMismatchesForFlow); }
        } else {
            if (mismatchDisplayData.length > 0) setMismatchDisplayData([]);
            if (mismatchDetailsForFlow.length > 0) setMismatchDetailsForFlow([]);
        }
        if (summariesForDisplay.length > 0) setSummariesForDisplay([]);
        if (summariesForFlow.length > 0) setSummariesForFlow([]);

    } else if (analysisType === 'summarization') {
        if (selectedEvalRunDetails && selectedSummarizationDefId && allSummarizationDefs.length > 0) {
            const currentSummarizationDef = allSummarizationDefs.find(d => d.id === selectedSummarizationDefId);
            if (!currentSummarizationDef) {
                if (summariesForDisplay.length > 0) setSummariesForDisplay([]);
                if (summariesForFlow.length > 0) setSummariesForFlow([]);
                return;
            }
            const newSummariesForDisplayData: Array<{inputData: Record<string, any>, generatedSummary: string}> = [];
            const newSummariesForFlowData: Array<{inputData: Record<string, any>, generatedSummary: string}> = [];

            selectedEvalRunDetails.results?.forEach(item => {
                const llmSummaryOutput = item.judgeLlmOutput?.[selectedSummarizationDefId];
                if (llmSummaryOutput && llmSummaryOutput.generatedSummary && !llmSummaryOutput.error) {
                    const summaryDetail = { inputData: item.inputData, generatedSummary: llmSummaryOutput.generatedSummary };
                    if (newSummariesForDisplayData.length < 5) { newSummariesForDisplayData.push(summaryDetail); }
                    newSummariesForFlowData.push(summaryDetail);
                }
            });
            if (JSON.stringify(newSummariesForDisplayData) !== JSON.stringify(summariesForDisplay)) { setSummariesForDisplay(newSummariesForDisplayData); }
            if (JSON.stringify(newSummariesForFlowData) !== JSON.stringify(summariesForFlow)) { setSummariesForFlow(newSummariesForFlowData); }
        } else {
            if (summariesForDisplay.length > 0) setSummariesForDisplay([]);
            if (summariesForFlow.length > 0) setSummariesForFlow([]);
        }
        if (mismatchDisplayData.length > 0) setMismatchDisplayData([]);
        if (mismatchDetailsForFlow.length > 0) setMismatchDetailsForFlow([]);
    }
  }, [
      analysisType, selectedEvalRunDetails, targetEvalParamId, desiredTargetLabel, allEvalParamsDetails,
      mismatchDisplayData, mismatchDetailsForFlow, selectedSummarizationDefId, allSummarizationDefs,
      summariesForDisplay, summariesForFlow
  ]);


  const handleSuggestImprovements = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentProductPrompt.trim()) { toast({ title: "Input Error", description: "Please provide your current product prompt.", variant: "destructive" }); return; }
    if (mismatchDetailsForFlow.length === 0) { toast({ title: "No Mismatches", description: "No rows found where the LLM output differs from your desired target label.", variant: "default" }); return; }
    setIsLoadingSuggestion(true); setSuggestionResult(null); setSuggestionError(null);
    try {
      const input: SuggestRecursivePromptImprovementsInput = { originalPromptTemplate: currentProductPrompt, mismatchDetails: mismatchDetailsForFlow, productParametersSchema: productParametersSchemaText, evaluationParametersSchema: evaluationParametersSchemaText };
      const result = await suggestRecursivePromptImprovements(input); setSuggestionResult(result); toast({ title: "Suggestions Generated!", description: "Review the suggested prompt and reasoning below." });
    } catch (error) { console.error("Error suggesting prompt improvements:", error); const errorMessage = (error as Error).message || "Failed to get suggestions."; setSuggestionError(errorMessage); toast({ title: "Suggestion Error", description: errorMessage, variant: "destructive" });
    } finally { setIsLoadingSuggestion(false); }
  };

  const handleAnalyzeProblems = async (e: FormEvent) => {
    e.preventDefault();
    setViewingSavedAnalysisId(null);
    setProblemAnalysisResult(null);
    setProblemAnalysisError(null);

    if (analysisType === 'evaluation') {
        if (mismatchDetailsForFlow.length === 0) { toast({ title: "No Mismatches", description: "No rows found where the LLM output differs from your desired target label.", variant: "default" }); return; }
        const currentEvalParam = allEvalParamsDetails.find(p => p.id === targetEvalParamId);
        if (!currentEvalParam || !desiredTargetLabel) { toast({ title: "Input Error", description: "Target evaluation parameter or desired label not fully selected.", variant: "destructive"}); return; }
        setIsLoadingProblemAnalysis(true);
        try {
            const input: AnalyzeEvalProblemCategoriesInput = { mismatchDetails: mismatchDetailsForFlow, targetEvaluationParameterName: currentEvalParam.name, targetEvaluationParameterDefinition: currentEvalParam.definition, desiredTargetLabel: desiredTargetLabel, productSchemaDescription: productParametersSchemaText };
            const result = await analyzeEvalProblemCategories(input);
            setProblemAnalysisResult(result);
            toast({ title: "Problem Analysis Complete!", description: "Review the categorized problems below." });
        } catch (error) { console.error("Error analyzing eval problems:", error); const errorMessage = (error as Error).message || "Failed to analyze problems."; setProblemAnalysisError(errorMessage); toast({ title: "Analysis Error", description: errorMessage, variant: "destructive" });
        } finally { setIsLoadingProblemAnalysis(false); }
    } else if (analysisType === 'summarization') {
        if (summariesForFlow.length === 0) { toast({ title: "No Summaries", description: "No generated summaries found for the selected definition in this run.", variant: "default" }); return; }
        const currentSummarizationDef = allSummarizationDefs.find(d => d.id === selectedSummarizationDefId);
        if (!currentSummarizationDef) { toast({ title: "Input Error", description: "Target summarization definition not selected.", variant: "destructive"}); return; }
        setIsLoadingProblemAnalysis(true);
        try {
            const input: AnalyzeSummarizationProblemsInput = {
                generatedSummaryDetails: summariesForFlow,
                targetSummarizationDefinitionName: currentSummarizationDef.name,
                targetSummarizationDefinitionText: currentSummarizationDef.definition,
                productSchemaDescription: productParametersSchemaText,
                productContext: productContextForAnalysis.trim() || undefined 
            };
            const result = await analyzeSummarizationProblems(input);
            setProblemAnalysisResult(result);
            toast({ title: "User Intent Analysis Complete!", description: "Review the categorized user intents below." });
        } catch (error) { console.error("Error analyzing user intents from summaries:", error); const errorMessage = (error as Error).message || "Failed to analyze summaries for intents."; setProblemAnalysisError(errorMessage); toast({ title: "Analysis Error", description: errorMessage, variant: "destructive" });
        } finally { setIsLoadingProblemAnalysis(false); }
    }
  };

  const saveAnalysisMutation = useMutation<void, Error, StoredAnalysisDataForFirestore>({
    mutationFn: async (analysisData) => {
      if (!currentUserId || !selectedRunId) throw new Error("User or Run ID missing.");
      await addDoc(collection(db, 'users', currentUserId, 'evaluationRuns', selectedRunId, 'storedAnalyses'), analysisData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storedAnalysesForRun', currentUserId, selectedRunId] });
      toast({ title: "Success", description: "Analysis saved successfully." });
      setIsSaveAnalysisDialogOpen(false);
      setAnalysisNameToSave('');
    },
    onError: (error) => {
      toast({ title: "Error Saving Analysis", description: error.message, variant: "destructive" });
    }
  });

  const deleteStoredAnalysisMutation = useMutation<void, Error, string>({
    mutationFn: async (analysisId) => {
        if (!currentUserId || !selectedRunId) throw new Error("User or Run ID missing.");
        await deleteDoc(doc(db, 'users', currentUserId, 'evaluationRuns', selectedRunId, 'storedAnalyses', analysisId));
    },
    onSuccess: (_data, deletedAnalysisId) => {
        queryClient.invalidateQueries({queryKey: ['storedAnalysesForRun', currentUserId, selectedRunId]});
        toast({title: "Success", description: "Saved analysis deleted."});
        if (viewingSavedAnalysisId === deletedAnalysisId) { 
            setProblemAnalysisResult(null); 
            setViewingSavedAnalysisId(null);
        }
    },
    onError: (error) => {
        toast({title: "Error Deleting Analysis", description: error.message, variant: "destructive"});
    }
  });


  const handleSaveCurrentAnalysis = () => {
    if (!problemAnalysisResult) {
      toast({ title: "No Analysis", description: "Generate an analysis first before saving.", variant: "destructive" }); return;
    }
    let defaultName = "Analysis";
    if (analysisType === 'evaluation' && targetEvalParamId && desiredTargetLabel) {
        const currentEvalParam = allEvalParamsDetails.find(p => p.id === targetEvalParamId);
        if (currentEvalParam) defaultName = `Eval Analysis for ${currentEvalParam.name} - Label: ${desiredTargetLabel}`;
    } else if (analysisType === 'summarization' && selectedSummarizationDefId) {
        const currentDef = allSummarizationDefs.find(d => d.id === selectedSummarizationDefId);
        if (currentDef) defaultName = `User Intent Analysis for ${currentDef.name}`;
    }
    setAnalysisNameToSave(`${defaultName} - ${new Date().toLocaleDateString()}`);
    setIsSaveAnalysisDialogOpen(true);
  };

  const confirmSaveAnalysis = (e: FormEvent) => {
    e.preventDefault();
    if (!analysisNameToSave.trim()) {
      toast({ title: "Name Required", description: "Please provide a name for this analysis.", variant: "destructive" }); return;
    }
    if (!problemAnalysisResult) return;

    const categoriesToSave = 'problemCategories' in problemAnalysisResult ? problemAnalysisResult.problemCategories : ('userIntentCategories' in problemAnalysisResult ? problemAnalysisResult.userIntentCategories : []);

    let overallSummaryToSave: string | undefined = undefined;
    if ('overallSummary' in problemAnalysisResult && problemAnalysisResult.overallSummary) {
      overallSummaryToSave = problemAnalysisResult.overallSummary;
    } else if ('overallSummaryOfUserIntents' in problemAnalysisResult && problemAnalysisResult.overallSummaryOfUserIntents) {
      overallSummaryToSave = problemAnalysisResult.overallSummaryOfUserIntents;
    }


    const dataToSave: Partial<StoredAnalysisDataForFirestore> & Pick<StoredAnalysisDataForFirestore, 'analysisName' | 'createdAt' | 'analysisType' | 'problemCategories' | 'sourceDataCount'> = {
      analysisName: analysisNameToSave.trim(),
      createdAt: serverTimestamp(),
      analysisType: analysisType,
      problemCategories: categoriesToSave,
      sourceDataCount: analysisType === 'evaluation' ? mismatchDetailsForFlow.length : summariesForFlow.length,
      overallSummary: overallSummaryToSave,
    };
    

    if (analysisType === 'evaluation' && targetEvalParamId && desiredTargetLabel) {
        const currentEvalParam = allEvalParamsDetails.find(p => p.id === targetEvalParamId);
        if (!currentEvalParam) { toast({title: "Error", description: "Cannot save: target eval param details missing."}); return; }
        dataToSave.targetEvalParamId = targetEvalParamId;
        dataToSave.targetEvalParamName = currentEvalParam.name;
        dataToSave.desiredTargetLabel = desiredTargetLabel;
    } else if (analysisType === 'summarization' && selectedSummarizationDefId) {
        const currentDef = allSummarizationDefs.find(d => d.id === selectedSummarizationDefId);
        if (!currentDef) { toast({title: "Error", description: "Cannot save: target summarization def details missing."}); return; }
        dataToSave.targetSummarizationDefId = selectedSummarizationDefId;
        dataToSave.targetSummarizationDefName = currentDef.name;
        dataToSave.productContext = productContextForAnalysis.trim() || undefined;
    } else {
         toast({title: "Error", description: "Cannot save: target configuration missing for the selected analysis type."}); return;
    }
    

    saveAnalysisMutation.mutate(dataToSave as StoredAnalysisDataForFirestore);
  };

  const handleViewStoredAnalysis = async (analysisId: string) => {
    setViewingSavedAnalysisId(analysisId);
    setProblemAnalysisResult(null); 
    setProblemAnalysisError(null);
    try {
        const fullAnalysis = await fetchSingleStoredAnalysisDetails(currentUserId, selectedRunId, analysisId);
        if (fullAnalysis) {
            setAnalysisType(fullAnalysis.analysisType); 
            if (fullAnalysis.analysisType === 'evaluation') {
                setTargetEvalParamId(fullAnalysis.targetEvalParamId || null);
                setDesiredTargetLabel(fullAnalysis.desiredTargetLabel || null);
                setSelectedSummarizationDefId(null); 
                setProductContextForAnalysis('');
            } else if (fullAnalysis.analysisType === 'summarization') {
                setSelectedSummarizationDefId(fullAnalysis.targetSummarizationDefId || null);
                setTargetEvalParamId(null); 
                setDesiredTargetLabel(null);
                setProductContextForAnalysis(fullAnalysis.productContext || '');
            }
            
            let resultToSet: AnalyzeEvalProblemCategoriesOutput | UserIntentAnalysisOutput;
            if (fullAnalysis.analysisType === 'evaluation') {
                resultToSet = {
                    problemCategories: fullAnalysis.problemCategories as ProblemCategory[],
                    overallSummary: fullAnalysis.overallSummary
                };
            } else { // analysisType === 'summarization'
                resultToSet = {
                    userIntentCategories: fullAnalysis.problemCategories as UserIntentCategory[],
                    overallSummaryOfUserIntents: fullAnalysis.overallSummary
                };
            }
            
            setProblemAnalysisResult(resultToSet);

            toast({title: "Viewing Saved Analysis", description: `Displaying "${fullAnalysis.analysisName}".`});
        } else {
            toast({title: "Error", description: "Could not load details for the saved analysis.", variant: "destructive"});
            setViewingSavedAnalysisId(null);
        }
    } catch (error: any) {
        toast({title: "Error Loading Analysis", description: error.message, variant: "destructive"});
        setViewingSavedAnalysisId(null);
    }
  };

  const handleDeleteStoredAnalysis = (analysisId: string) => {
    if (confirm("Are you sure you want to delete this saved analysis?")) {
      deleteStoredAnalysisMutation.mutate(analysisId);
    }
  };


  const handleRunSelectChange = (runId: string) => {
    setSelectedRunId(runId);
    setCurrentProductPrompt(''); 
    setTargetEvalParamId(null);
    setDesiredTargetLabel(null);
    setSelectedSummarizationDefId(null);
    setProductContextForAnalysis('');
    setSuggestionResult(null); setSuggestionError(null);
    setProblemAnalysisResult(null); setProblemAnalysisError(null);
    setViewingSavedAnalysisId(null);
    setAnalysisType('evaluation'); 
  };

  const handleAnalysisTypeChange = (newType: 'evaluation' | 'summarization') => {
    setAnalysisType(newType);
    setTargetEvalParamId(null);
    setDesiredTargetLabel(null);
    setSelectedSummarizationDefId(null);
    setMismatchDisplayData([]);
    setMismatchDetailsForFlow([]);
    setSummariesForDisplay([]);
    setSummariesForFlow([]);
    setProblemAnalysisResult(null);
    setProblemAnalysisError(null);
    setViewingSavedAnalysisId(null);
  };

  
  const handleParamSelectChange = (paramId: string) => { 
    setTargetEvalParamId(paramId);
    setDesiredTargetLabel(null); 
    setProblemAnalysisResult(null); setProblemAnalysisError(null);
    setViewingSavedAnalysisId(null);
  };
  
  const handleLabelSelectChange = (label: string) => { 
    setDesiredTargetLabel(label);
    setProblemAnalysisResult(null); setProblemAnalysisError(null);
    setViewingSavedAnalysisId(null);
  };

  const handleSummarizationDefSelectChange = (defId: string) => { 
    setSelectedSummarizationDefId(defId);
    setProblemAnalysisResult(null); setProblemAnalysisError(null);
    setViewingSavedAnalysisId(null);
  };


  if (isLoadingUserId) return <div className="p-6"><Skeleton className="h-screen w-full"/></div>;
  if (!currentUserId) return <Card className="m-4"><CardContent className="p-6 text-center text-muted-foreground">Please log in to use AI Insights.</CardContent></Card>;

  const sharedInputSelectionHeaderUI = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label htmlFor="evalRunSelectCommon" className="font-semibold">Evaluation Run to Analyze</Label>
        <Select value={selectedRunId || ''} onValueChange={handleRunSelectChange} required>
          <SelectTrigger id="evalRunSelectCommon" disabled={isLoadingRunsList}>
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
        <Label htmlFor="analysisTypeSelect" className="font-semibold">Type of Analysis</Label>
        <Select value={analysisType} onValueChange={handleAnalysisTypeChange as (value: string) => void} required disabled={!selectedRunId}>
            <SelectTrigger id="analysisTypeSelect">
                <SelectValue placeholder="Select analysis type" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="evaluation">Eval Parameter Problem Analysis</SelectItem>
                <SelectItem value="summarization">User Intent Analysis (from Summaries)</SelectItem>
            </SelectContent>
        </Select>
      </div>
    </div>
  );

  const evaluationParameterInputsUI = analysisType === 'evaluation' && (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <div>
        <Label htmlFor="targetEvalParamSelectCommon" className="font-semibold">Target Evaluation Parameter</Label>
        <Select value={targetEvalParamId || ''} onValueChange={handleParamSelectChange} required disabled={!selectedRunId || isLoadingSelectedRunDetails || isLoadingAllEvalParams || availableEvalParamsForSelectedRun.length === 0}>
          <SelectTrigger id="targetEvalParamSelectCommon">
            <SelectValue placeholder={!selectedRunId ? "Select a run first" : isLoadingSelectedRunDetails || isLoadingAllEvalParams ? "Loading params..." : availableEvalParamsForSelectedRun.length === 0 ? "No eval params in run" : "Select Target Parameter"} />
          </SelectTrigger>
          <SelectContent>
            {availableEvalParamsForSelectedRun.map(param => (<SelectItem key={param.id} value={param.id}>{param.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="desiredTargetLabelSelectCommon" className="font-semibold">Desired Target Label</Label>
        <Select value={desiredTargetLabel || ''} onValueChange={handleLabelSelectChange} required disabled={!targetEvalParamId || availableLabelsForSelectedParam.length === 0}>
          <SelectTrigger id="desiredTargetLabelSelectCommon">
            <SelectValue placeholder={!targetEvalParamId ? "Select a parameter first" : availableLabelsForSelectedParam.length === 0 ? "No labels for param" : "Select Desired Label"} />
          </SelectTrigger>
          <SelectContent>
            {availableLabelsForSelectedParam.map(label => (<SelectItem key={label.name} value={label.name}>{label.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
  
  const summarizationDefinitionInputUI = analysisType === 'summarization' && (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <div>
        <Label htmlFor="targetSummarizationDefSelect" className="font-semibold">Target Summarization Definition</Label>
        <Select value={selectedSummarizationDefId || ''} onValueChange={handleSummarizationDefSelectChange} required disabled={!selectedRunId || isLoadingSelectedRunDetails || isLoadingAllSummarizationDefs || availableSummarizationDefsForSelectedRun.length === 0}>
          <SelectTrigger id="targetSummarizationDefSelect">
            <SelectValue placeholder={!selectedRunId ? "Select a run first" : isLoadingSelectedRunDetails || isLoadingAllSummarizationDefs ? "Loading definitions..." : availableSummarizationDefsForSelectedRun.length === 0 ? "No summarization defs in run" : "Select Target Summarization Definition"} />
          </SelectTrigger>
          <SelectContent>
            {availableSummarizationDefsForSelectedRun.map(def => (<SelectItem key={def.id} value={def.id}>{def.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="productContextForAnalysis">Product Context (Optional)</Label>
        <Input 
            id="productContextForAnalysis" 
            value={productContextForAnalysis} 
            onChange={(e) => setProductContextForAnalysis(e.target.value)}
            placeholder="e.g., E-commerce customer support bot" 
            disabled={!selectedRunId}
        />
        <p className="text-xs text-muted-foreground mt-1">Briefly describe the product to help the AI understand user intents.</p>
      </div>
    </div>
  );

  const mismatchReviewUI = analysisType === 'evaluation' && (
    <>
    {mismatchDisplayData.length > 0 && (
      <Card className="mt-6">
        <CardHeader> <CardTitle className="text-lg">Review Mismatches (Context for AI)</CardTitle> <CardDescription> Showing up to 5 examples from the run where the LLM's output for <strong className="text-primary">{allEvalParamsDetails.find(p=>p.id===targetEvalParamId)?.name || 'the selected parameter'}</strong> did not match your desired label: <strong className="text-primary">{desiredTargetLabel}</strong>. The AI will use these. </CardDescription> </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto"> {mismatchDisplayData.map((mismatch, index) => ( <Card key={`mismatch-display-${index}`} className="p-3 bg-muted/50 text-xs"> <p className="font-semibold mb-1">Example Mismatch #{index + 1}</p> <div className="space-y-1"> <div><strong>Input Data:</strong> <pre className="whitespace-pre-wrap bg-background p-1 rounded-sm text-[10px]">{JSON.stringify(mismatch.inputData, null, 2)}</pre></div> <div><strong>LLM Chose:</strong> <span className="font-medium">{mismatch.llmChosenLabel}</span></div> {mismatch.llmRationale && <div><strong>LLM Rationale:</strong> <span className="italic">{mismatch.llmRationale}</span></div>} <div><strong>Desired Label:</strong> <span className="font-medium text-green-600">{mismatch.desiredTargetLabel}</span></div> </div> </Card> ))} </CardContent>
      </Card>
    )}
     {selectedEvalRunDetails && targetEvalParamId && desiredTargetLabel && mismatchDisplayData.length === 0 && !isLoadingSelectedRunDetails && ( <Card className="mt-6"><CardContent className="pt-6 text-center text-muted-foreground">No rows found in the selected run where the LLM's output for &quot;{allEvalParamsDetails.find(p=>p.id===targetEvalParamId)?.name}&quot; differs from your desired label &quot;{desiredTargetLabel}&quot;.</CardContent></Card> )}
    </>
  );

  const summaryReviewUI = analysisType === 'summarization' && (
    <>
    {summariesForDisplay.length > 0 && (
      <Card className="mt-6">
        <CardHeader> <CardTitle className="text-lg">Review Generated Summaries (Context for AI)</CardTitle> <CardDescription> Showing up to 5 examples of generated summaries for <strong className="text-primary">{allSummarizationDefs.find(d=>d.id===selectedSummarizationDefId)?.name || 'the selected definition'}</strong>. The AI will use these for intent analysis. </CardDescription> </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto"> {summariesForDisplay.map((summaryItem, index) => ( <Card key={`summary-display-${index}`} className="p-3 bg-muted/50 text-xs"> <p className="font-semibold mb-1">Example Summary #{index + 1}</p> <div className="space-y-1"> <div><strong>Input Data (that led to summary):</strong> <pre className="whitespace-pre-wrap bg-background p-1 rounded-sm text-[10px]">{JSON.stringify(summaryItem.inputData, null, 2)}</pre></div> <div><strong>Generated Summary:</strong> <p className="whitespace-pre-wrap bg-background p-1 rounded-sm text-[10px]">{summaryItem.generatedSummary}</p></div> </div> </Card> ))} </CardContent>
      </Card>
    )}
     {selectedEvalRunDetails && selectedSummarizationDefId && summariesForDisplay.length === 0 && !isLoadingSelectedRunDetails && ( <Card className="mt-6"><CardContent className="pt-6 text-center text-muted-foreground">No generated summaries found in the selected run for &quot;{allSummarizationDefs.find(d=>d.id===selectedSummarizationDefId)?.name}&quot;.</CardContent></Card> )}
    </>
  );


  return (
    <div className="space-y-6 p-4 md:p-0">
      <Card className="shadow-lg"> <CardHeader> <div className="flex items-center gap-3"> <Lightbulb className="h-7 w-7 text-primary" /> <div> <CardTitle className="text-xl md:text-2xl font-headline">AI-Powered Insights & Improvements</CardTitle> <CardDescription>Use AI to analyze evaluation runs, understand problem areas or user intents, and get suggestions to improve your prompts.</CardDescription> </div> </div> </CardHeader> </Card>
      <Tabs defaultValue="problem_analyzer" className="w-full">
        <TabsList className="grid w-full grid-cols-2"> <TabsTrigger value="prompt_improver"> <Wand2 className="mr-2 h-4 w-4" /> Iterative Prompt Improver</TabsTrigger> <TabsTrigger value="problem_analyzer"> <ListChecks className="mr-2 h-4 w-4" /> Insights from Evals</TabsTrigger> </TabsList>
        
        <TabsContent value="prompt_improver" className="mt-6">
          <form onSubmit={handleSuggestImprovements} className="space-y-6">
            <Card> <CardHeader> <CardTitle className="text-lg">1. Provide Your Current Prompt</CardTitle> </CardHeader> <CardContent> <div> <Label htmlFor="currentProductPrompt" className="font-semibold">Your Current Product Prompt</Label> <Textarea id="currentProductPrompt" value={currentProductPrompt} onChange={e => setCurrentProductPrompt(e.target.value)} placeholder="Paste or type your existing product prompt template here..." rows={8} required className="font-mono text-sm" /> </div> </CardContent> </Card>
            <Card>
                <CardHeader> <CardTitle className="text-lg">Target Your Analysis (for Prompt Improvement)</CardTitle> <CardDescription>Select an evaluation run, the specific parameter, and the label you wanted the AI to choose more often. This focuses the improvement suggestions.</CardDescription> </CardHeader>
                <CardContent className="space-y-4">
                    {sharedInputSelectionHeaderUI}
                    {analysisType === 'evaluation' ? evaluationParameterInputsUI : <Alert variant="default" className="mt-4"><Info className="h-4 w-4" /><AlertTitle>Note</AlertTitle><AlertDescription>Prompt improvement currently focuses on evaluation parameter mismatches. Please select "Eval Parameter Problem Analysis" type above to enable target selection.</AlertDescription></Alert>}
                </CardContent>
            </Card>
            {analysisType === 'evaluation' && mismatchReviewUI}
            <Card className="mt-6">
              <CardHeader> <CardTitle className="text-lg">3. Get Prompt Suggestions</CardTitle> </CardHeader>
              <CardContent> <Button type="submit" disabled={isLoadingSuggestion || analysisType !== 'evaluation' || !currentProductPrompt.trim() || !selectedRunId || !targetEvalParamId || !desiredTargetLabel || mismatchDetailsForFlow.length === 0} className="w-full sm:w-auto"> {isLoadingSuggestion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />} {isLoadingSuggestion ? 'Generating Suggestions...' : 'Suggest Prompt Improvements'} </Button> </CardContent>
              {isLoadingSuggestion && ( <CardFooter className="flex flex-col items-start space-y-4 pt-6 border-t"> <Skeleton className="h-8 w-1/4 mb-2" /> <Skeleton className="h-24 w-full" /> <Skeleton className="h-8 w-1/4 mt-4 mb-2" /> <Skeleton className="h-20 w-full" /> </CardFooter> )}
              {suggestionError && !isLoadingSuggestion && ( <CardFooter className="pt-6 border-t"> <Alert variant="destructive"> <AlertTriangle className="h-4 w-4" /> <AlertTitle>Suggestion Error</AlertTitle> <AlertDescription>{suggestionError}</AlertDescription> </Alert> </CardFooter> )}
              {suggestionResult && !isLoadingSuggestion && ( <CardFooter className="flex flex-col items-start space-y-4 pt-6 border-t"> <div> <Label htmlFor="suggestedPromptTemplate" className="text-base font-semibold flex justify-between items-center w-full"> Suggested New Prompt Template <Button type="button" variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(suggestionResult.suggestedPromptTemplate)}> <Copy className="mr-2 h-3 w-3"/>Copy </Button> </Label> <Textarea id="suggestedPromptTemplate" value={suggestionResult.suggestedPromptTemplate} readOnly rows={10} className="font-mono text-sm mt-1 bg-muted/30"/> </div> <div> <Label htmlFor="reasoning" className="text-base font-semibold">Reasoning for Changes</Label> <Textarea id="reasoning" value={suggestionResult.reasoning} readOnly rows={6} className="mt-1 bg-muted/30"/> </div> <Alert> <FileText className="h-4 w-4"/> <AlertTitle>Next Steps</AlertTitle> <AlertDescription> Review the suggestion. If you like it, copy the new template and either create a new prompt version or update an existing one on the &quot;Prompts&quot; page. Then, create a new evaluation run using the improved prompt. </AlertDescription> </Alert> </CardFooter> )}
            </Card>
          </form>
        </TabsContent>
        
        <TabsContent value="problem_analyzer" className="mt-6">
          <div className="space-y-6">
            <Card>
                <CardHeader> <CardTitle className="text-lg">Target Your Analysis</CardTitle> <CardDescription>Select an evaluation run and specify the type of analysis: for an evaluation parameter or a summarization definition.</CardDescription> </CardHeader>
                <CardContent className="space-y-4">
                    {sharedInputSelectionHeaderUI}
                    {analysisType === 'evaluation' && evaluationParameterInputsUI}
                    {analysisType === 'summarization' && summarizationDefinitionInputUI}
                </CardContent>
            </Card>
            {analysisType === 'evaluation' && mismatchReviewUI}
            {analysisType === 'summarization' && summaryReviewUI}
            <Card className="mt-6">
              <CardHeader> <CardTitle className="text-lg">Analyze Problems / Intents</CardTitle> <CardDescription> {analysisType === 'evaluation' ? "Identify common problems from mismatches to understand why the desired outcome isn't being achieved." : "Identify common user intents from the generated summaries to understand user goals."} </CardDescription> </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button onClick={handleAnalyzeProblems} disabled={
                    isLoadingProblemAnalysis || 
                    !selectedRunId || 
                    (analysisType === 'evaluation' && (!targetEvalParamId || !desiredTargetLabel || mismatchDetailsForFlow.length === 0)) ||
                    (analysisType === 'summarization' && (!selectedSummarizationDefId || summariesForFlow.length === 0)) ||
                    viewingSavedAnalysisId !== null
                } className="w-full sm:w-auto"> {isLoadingProblemAnalysis ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (analysisType === 'evaluation' ? <ListChecks className="mr-2 h-4 w-4" /> : <Users className="mr-2 h-4 w-4" /> )} {isLoadingProblemAnalysis ? 'Analyzing...' : (analysisType === 'evaluation' ? 'Find Problem Categories' : 'Find User Intents')} </Button>
                <Button variant="outline" onClick={handleSaveCurrentAnalysis} disabled={!problemAnalysisResult || saveAnalysisMutation.isPending || viewingSavedAnalysisId !== null} className="w-full sm:w-auto"> <Save className="mr-2 h-4 w-4" /> Save Current Analysis </Button>
              </CardContent>
              {isLoadingProblemAnalysis && ( <CardFooter className="pt-6 border-t"> <div className="flex items-center space-x-2"> <Loader2 className="h-6 w-6 animate-spin text-primary" /> <p className="text-muted-foreground">AI is analyzing...</p> </div> </CardFooter> )}
              {problemAnalysisError && !isLoadingProblemAnalysis && ( <CardFooter className="pt-6 border-t"> <Alert variant="destructive"> <AlertTriangle className="h-4 w-4" /> <AlertTitle>Analysis Error</AlertTitle> <AlertDescription>{problemAnalysisError}</AlertDescription> </Alert> </CardFooter> )}
              {problemAnalysisResult && !isLoadingProblemAnalysis && (
                <CardFooter className="flex flex-col items-start space-y-4 pt-6 border-t">
                  <h3 className="text-lg font-semibold"> {viewingSavedAnalysisId ? `Details for Saved Analysis: "${storedAnalyses.find(sa => sa.id === viewingSavedAnalysisId)?.analysisName}"` : (analysisType === 'evaluation' ? "Identified Problem Categories:" : "Identified User Intent Categories:")} </h3>
                  {(('problemCategories' in problemAnalysisResult && problemAnalysisResult.problemCategories.length === 0) || ('userIntentCategories' in problemAnalysisResult && problemAnalysisResult.userIntentCategories.length === 0) ) && ( <p className="text-muted-foreground">The AI could not identify distinct categories.</p> )}
                  
                  {(('problemCategories' in problemAnalysisResult ? problemAnalysisResult.problemCategories : ('userIntentCategories' in problemAnalysisResult ? problemAnalysisResult.userIntentCategories : [])) as Array<ProblemCategory | UserIntentCategory>).map((category, index) => (
                     <Card key={`problem-intent-${index}`} className="w-full">
                       <CardHeader> <CardTitle className="text-md">{category.categoryName} <Badge variant="secondary" className="ml-2">{category.count} item(s)</Badge></CardTitle> <CardDescription>{category.description}</CardDescription> </CardHeader>
                       {analysisType === 'evaluation' && (category as ProblemCategory).exampleMismatch && (
                         <CardContent>
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value={`item-mismatch-${index}`}>
                                <AccordionTrigger className="text-xs py-2 hover:no-underline">View Example Mismatch Details</AccordionTrigger>
                                <AccordionContent>
                                  <div className="p-2 bg-muted/50 rounded-sm text-xs space-y-1 mt-1">
                                    <div><strong>Input:</strong> <pre className="whitespace-pre-wrap bg-background p-1 rounded-sm text-[10px]">{(category as ProblemCategory).exampleMismatch!.inputData}</pre></div>
                                    <div><strong>LLM Chose:</strong> {(category as ProblemCategory).exampleMismatch!.llmChosenLabel}</div>
                                    {(category as ProblemCategory).exampleMismatch!.llmRationale && <div><strong>LLM Rationale:</strong> <span className="italic">{(category as ProblemCategory).exampleMismatch!.llmRationale}</span></div>}
                                    <div><strong>Desired Label:</strong> {(category as ProblemCategory).exampleMismatch!.groundTruthLabel}</div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                         </CardContent>
                       )}
                       {analysisType === 'summarization' && (category as UserIntentCategory).exampleSummaryIllustratingIntent && (
                         <CardContent>
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value={`item-summary-${index}`}>
                                <AccordionTrigger className="text-xs py-2 hover:no-underline">View Example Summary Details</AccordionTrigger>
                                <AccordionContent>
                                   <div className="p-2 bg-muted/50 rounded-sm text-xs space-y-1 mt-1">
                                      <div><strong>Input:</strong> <pre className="whitespace-pre-wrap bg-background p-1 rounded-sm text-[10px]">{(category as UserIntentCategory).exampleSummaryIllustratingIntent!.inputData}</pre></div>
                                      <div><strong>Generated Summary:</strong> <p className="whitespace-pre-wrap bg-background p-1 rounded-sm text-[10px]">{(category as UserIntentCategory).exampleSummaryIllustratingIntent!.generatedSummary}</p></div>
                                   </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                         </CardContent>
                       )}
                     </Card>
                  ))}
                  {('overallSummary' in problemAnalysisResult && problemAnalysisResult.overallSummary) && ( <Alert className="mt-4"> <Lightbulb className="h-4 w-4" /> <AlertTitle>Overall Summary (Eval Param Problems)</AlertTitle> <AlertDescription>{problemAnalysisResult.overallSummary}</AlertDescription> </Alert> )}
                  {('overallSummaryOfUserIntents' in problemAnalysisResult && problemAnalysisResult.overallSummaryOfUserIntents) && ( <Alert className="mt-4"> <Lightbulb className="h-4 w-4" /> <AlertTitle>Overall Summary (User Intents)</AlertTitle> <AlertDescription>{problemAnalysisResult.overallSummaryOfUserIntents}</AlertDescription> </Alert> )}
                </CardFooter>
              )}
            </Card>

            {selectedRunId && (
            <Card className="mt-6">
                <CardHeader> <CardTitle className="text-lg">Previously Saved Analyses for this Run</CardTitle> <CardDescription>Review or delete analyses you've saved for <strong className="text-primary">{selectedEvalRunDetails?.name || "the current"}</strong> run.</CardDescription> </CardHeader>
                <CardContent>
                    {isLoadingStoredAnalyses && <Skeleton className="h-20 w-full" />}
                    {!isLoadingStoredAnalyses && storedAnalyses.length === 0 && ( <p className="text-muted-foreground">No analyses saved for this run yet.</p> )}
                    {!isLoadingStoredAnalyses && storedAnalyses.length > 0 && (
                        <div className="space-y-3">
                            {storedAnalyses.map(sa => (
                                <Card key={sa.id} className="p-3 bg-muted/50">
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0">
                                          <div className="font-semibold flex items-center flex-wrap gap-x-2">
                                              <span className="truncate">{sa.analysisName}</span>
                                              <Badge variant="outline" className="ml-1 text-xs shrink-0">{sa.analysisType === 'evaluation' ? 'Eval Param Problems' : 'User Intents'}</Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground break-words">
                                                Saved: {new Date(sa.createdAt.toDate()).toLocaleString()} | For: 
                                                {sa.analysisType === 'evaluation' && <span className="font-medium"> {sa.targetEvalParamName} - &quot;{sa.desiredTargetLabel}&quot;</span>}
                                                {sa.analysisType === 'summarization' && <span className="font-medium"> {sa.targetSummarizationDefName}</span>}
                                                ({sa.sourceDataCount} items analyzed)
                                            </div>
                                            {sa.analysisType === 'summarization' && sa.productContext && <p className="text-xs text-muted-foreground break-words">Product Context: <span className="italic">{sa.productContext}</span></p>}
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <Button variant="outline" size="sm" onClick={() => handleViewStoredAnalysis(sa.id)} disabled={viewingSavedAnalysisId === sa.id}>View</Button>
                                            <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleDeleteStoredAnalysis(sa.id)} disabled={deleteStoredAnalysisMutation.isPending && deleteStoredAnalysisMutation.variables === sa.id}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isSaveAnalysisDialogOpen} onOpenChange={setIsSaveAnalysisDialogOpen}>
        <DialogContent>
          <DialogHeader> <DialogTitle>Save Analysis</DialogTitle> <DialogDescription>Give this analysis a descriptive name so you can refer to it later.</DialogDescription> </DialogHeader>
          <form onSubmit={confirmSaveAnalysis} className="space-y-4 py-2">
            <div>
              <Label htmlFor="analysisName">Analysis Name</Label>
              <Input id="analysisName" value={analysisNameToSave} onChange={(e) => setAnalysisNameToSave(e.target.value)} placeholder="e.g., User Query Ambiguity - Run X" required />
            </div>
            <DialogFooter> <Button type="button" variant="outline" onClick={() => setIsSaveAnalysisDialogOpen(false)}>Cancel</Button> <Button type="submit" disabled={saveAnalysisMutation.isPending}> {saveAnalysisMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />} Save Analysis </Button> </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
    

    