
'use client';

// ... (all existing imports)
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, AlertTriangle, Loader2, ArrowLeft, CheckCircle, XCircle, Clock, Zap, DatabaseZap, Wand2, MessageSquareQuote, Filter as FilterIcon, FileSearch, BarChart3, Database, Cog, FileText as FileTextIcon } from "lucide-react"; 
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// ScrollArea import is no longer strictly needed for this specific dialog fix, but kept for other potential uses.
import { ScrollArea } from '@/components/ui/scroll-area'; 

import { db, storage } from '@/lib/firebase';
import { doc, getDoc, getDocs, updateDoc, Timestamp, type DocumentData, collection, writeBatch, serverTimestamp, type FieldValue, query, orderBy, deleteField } from 'firebase/firestore';
import { ref as storageRef, getBlob } from 'firebase/storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { judgeLlmEvaluation, type JudgeLlmEvaluationInput } from '@/ai/flows/judge-llm-evaluation-flow';
import { suggestRecursivePromptImprovements, type SuggestRecursivePromptImprovementsInput, type SuggestRecursivePromptImprovementsOutput, type MismatchDetail } from '@/ai/flows/suggest-recursive-prompt-improvements';
import { analyzeJudgmentDiscrepancy, type AnalyzeJudgmentDiscrepancyInput, type AnalyzeJudgmentDiscrepancyOutput } from '@/ai/flows/analyze-judgment-discrepancy';
import * as XLSX from 'xlsx';
import { Badge } from '@/components/ui/badge';

import { RunHeaderCard } from '@/components/run-details/RunHeaderCard';
import { RunProgressAndLogs } from '@/components/run-details/RunProgressAndLogs';
import { DatasetSampleTable } from '@/components/run-details/DatasetSampleTable';
import { RunConfigTab } from '@/components/run-details/RunConfigTab';
import { ResultsTableTab } from '@/components/run-details/ResultsTableTab';
import { ImprovementSuggestionDialog } from '@/components/run-details/ImprovementSuggestionDialog';
import { QuestionJudgmentDialog } from '@/components/run-details/QuestionJudgmentDialog';
import { MetricsBreakdownTab } from '@/components/run-details/MetricsBreakdownTab'; 

// Constants for prompt construction, mirroring those in prompts/page.tsx
const FIXED_CRITERIA_HEADER = "--- DETAILED INSTRUCTIONS & CRITERIA ---";
const FIXED_CRITERIA_INSTRUCTIONS_PART = `
Your task is to analyze the provided input data and then perform two types of tasks:
1.  **Evaluation Labeling**: For each specified Evaluation Parameter, choose the most appropriate label based on its definition and the input data.
2.  **Summarization**: For each specified Summarization Task, generate a concise summary based on its definition and the input data.
`;


export interface EvalRunResultItem {
  inputData: Record<string, any>;
  judgeLlmOutput: Record<string, { chosenLabel?: string | null; generatedSummary?: string | null; rationale?: string | null; error?: string }>;
  groundTruth?: Record<string, string>;
  originalIndex?: number; // Added for sorting results from subcollection
}

export interface EvalRun {
  id: string;
  name: string;
  runType: 'Product' | 'GroundTruth'; 
  status: 'Completed' | 'Running' | 'Pending' | 'Failed' | 'Processing' | 'DataPreviewed';
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp;
  datasetId: string;
  datasetName?: string;
  datasetVersionId?: string;
  datasetVersionNumber?: number;
  modelConnectorId: string;
  modelConnectorName?: string;
  modelConnectorProvider?: string;
  modelConnectorConfigString?: string;
  modelIdentifierForGenkit?: string;
  promptId: string;
  promptName?: string;
  promptVersionId?: string;
  promptVersionNumber?: number;
  selectedEvalParamIds: string[];
  selectedEvalParamNames?: string[];
  selectedSummarizationDefIds?: string[];
  selectedSummarizationDefNames?: string[];
  selectedContextDocumentIds?: string[];
  selectedVisibleInputParamNames?: string[]; 
  runOnNRows: number;
  concurrencyLimit?: number;
  progress?: number;
  results?: EvalRunResultItem[]; // Kept for backward compatibility with old runs
  previewedDatasetSample?: Array<Record<string, any>>;
  totalRowsInDataset?: number;
  summaryMetrics?: Record<string, any>;
  errorMessage?: string;
  userId?: string;
  firstRowFullPrompt?: string; 
}

// New specific type for update payloads to handle FieldValue types correctly
interface EvalRunUpdatePayload {
  id: string;
  status?: 'Completed' | 'Running' | 'Pending' | 'Failed' | 'Processing' | 'DataPreviewed';
  updatedAt?: FieldValue;
  completedAt?: FieldValue;
  progress?: number;
  results?: EvalRunResultItem[] | FieldValue;
  previewedDatasetSample?: Array<Record<string, any>> | FieldValue;
  totalRowsInDataset?: number | FieldValue;
  errorMessage?: string | FieldValue;
  firstRowFullPrompt?: string;
}

export interface DatasetVersionConfig {
    storagePath?: string;
    columnMapping?: Record<string, string>; 
    groundTruthMapping?: Record<string, string>; 
    selectedSheetName?: string | null;
}

export interface EvalParamLabelForAnalysis {
    name: string;
    definition: string;
    example?: string;
}
export interface EvalParamDetailForPrompt {
  id: string;
  name: string;
  definition: string;
  labels: EvalParamLabelForAnalysis[];
  requiresRationale?: boolean;
}
export interface SummarizationDefDetailForPrompt {
    id: string;
    name: string;
    definition: string;
    example?: string;
}

export interface QuestioningItemContext {
  rowIndex: number;
  inputData: Record<string, any>;
  paramId: string;
  paramName: string;
  paramDefinition: string;
  paramLabels?: EvalParamLabelForAnalysis[];
  judgeLlmOutput: { chosenLabel: string; rationale?: string | null; error?: string };
  groundTruthLabel?: string;
}

export interface ParameterChartData {
  parameterId: string;
  parameterName: string;
  data: Array<{ labelName: string; count: number; percentage?: number }>;
  accuracy?: number;
  totalCompared?: number;
}

export interface InputParameterForSchema { 
  id: string;
  name: string;
  type: string;
  definition: string;
  options?: string[];
}

export interface ContextDocumentDisplayDetail {
    id: string;
    name: string;
    fileName: string;
}

export type FilterValueMatchMismatch = 'all' | 'match' | 'mismatch';
export type FilterValueSelectedLabel = string | 'all';
export interface ParamFilterState {
  matchMismatch: FilterValueMatchMismatch;
  selectedLabel: FilterValueSelectedLabel;
}
export type AllFilterStates = Record<string, ParamFilterState>;


const sanitizeDataForFirestore = (data: any): any => {
  if (Array.isArray(data)) {
    return data.map(item => sanitizeDataForFirestore(item));
  } else if (data !== null && typeof data === 'object') {
    const sanitizedObject: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = data[key];
        if (value === undefined) {
          sanitizedObject[key] = null; 
        } else {
          sanitizedObject[key] = sanitizeDataForFirestore(value);
        }
      }
    }
    return sanitizedObject;
  }
  return data;
};

let staticAddLog: (message: string, type?: 'info' | 'error') => void = () => {};

const fetchEvalRunDetails = async (userId: string | null, runId: string): Promise<EvalRun | null> => {
  if (!userId) return null;
  const runDocRef = doc(db, 'users', userId, 'evaluationRuns', runId);
  const runDocSnap = await getDoc(runDocRef);
  if (runDocSnap.exists()) {
    return { id: runDocSnap.id, ...runDocSnap.data() } as EvalRun;
  }
  return null;
};

// New function to fetch results from the subcollection
const fetchRunResults = async (userId: string | null, runId: string): Promise<EvalRunResultItem[]> => {
    if (!userId) return [];
    staticAddLog(`Fetching results from subcollection for run ${runId}...`);
    const resultsCollectionRef = collection(db, 'users', userId, 'evaluationRuns', runId, 'results');
    const q = query(resultsCollectionRef, orderBy('originalIndex', 'asc')); 
    try {
        const snapshot = await getDocs(q);
        staticAddLog(`Fetched ${snapshot.size} result documents from subcollection.`);
        return snapshot.docs.map(doc => doc.data() as EvalRunResultItem);
    } catch (error) {
        // Firestore creates single-field indexes automatically. If this fails, it's likely a permissions issue.
        console.error("Error fetching run results subcollection. This might require a manual index in Firestore if you've changed the query, or it could be a permissions issue.", error);
        toast({
            title: "Error Fetching Results",
            description: "Could not fetch results from the subcollection. Check console for details.",
            variant: "destructive"
        });
        return [];
    }
};

const fetchDatasetVersionConfig = async (userId: string | null, datasetId: string, versionId: string): Promise<DatasetVersionConfig | null> => {
    if (!userId) return null;
    const versionDocRef = doc(db, 'users', userId, 'datasets', datasetId, 'versions', versionId);
    const versionDocSnap = await getDoc(versionDocRef);
    if (versionDocSnap.exists()) {
        const data = versionDocSnap.data();
        return {
            storagePath: data.storagePath,
            columnMapping: data.columnMapping,
            groundTruthMapping: data.groundTruthMapping,
            selectedSheetName: data.selectedSheetName,
        };
    }
    return null;
};

const fetchPromptVersionText = async (userId: string | null, promptId: string, versionId: string): Promise<string | null> => {
  if (!userId) return null;
  const versionDocRef = doc(db, 'users', userId, 'promptTemplates', promptId, 'versions', versionId);
  const versionDocSnap = await getDoc(versionDocRef);
  if (versionDocSnap.exists()) {
    const templateData = versionDocSnap.data()?.template;
    if (typeof templateData === 'string') {
      try {
        const parsedTemplate = JSON.parse(templateData);
        // New JSON structure: { system: "...", input: "..." }
        if (parsedTemplate && typeof parsedTemplate.system === 'string' && typeof parsedTemplate.input === 'string') {
          return `${parsedTemplate.system}\n\n${parsedTemplate.input}`;
        } else { 
          return templateData; 
        }
      } catch (e) {
        // If JSON.parse fails, it's an old plain text template
        return templateData;
      }
    }
    return null; 
  }
  return null;
};


const fetchEvaluationParameterDetailsForPrompt = async (userId: string | null, paramIds: string[]): Promise<EvalParamDetailForPrompt[]> => {
  if (!userId || !paramIds || paramIds.length === 0) {
    return [];
  }
  const details: EvalParamDetailForPrompt[] = [];
  const evalParamsCollectionRef = collection(db, 'users', userId, 'evaluationParameters');

  for (const paramId of paramIds) {
    const paramDocRef = doc(evalParamsCollectionRef, paramId);
    const paramDocSnap = await getDoc(paramDocRef);
    if (paramDocSnap.exists()) {
      const data = paramDocSnap.data();
      details.push({
        id: paramDocSnap.id,
        name: data.name,
        definition: data.definition,
        labels: (data.categorizationLabels || []).map((l: any) => ({ name: l.name, definition: l.definition, example: l.example})),
        requiresRationale: data.requiresRationale || false,
      });
    } else {
         staticAddLog(`Evaluation parameter with ID ${paramId} not found for user ${userId}.`, "error");
    }
  }
  return details;
};

const fetchSummarizationDefDetailsForPrompt = async (userId: string | null, defIds: string[]): Promise<SummarizationDefDetailForPrompt[]> => {
    if (!userId || !defIds || !defIds || defIds.length === 0) return [];
    const details: SummarizationDefDetailForPrompt[] = [];
    const defsCollectionRef = collection(db, 'users', userId, 'summarizationDefinitions');
    for (const defId of defIds) {
        const defDocRef = doc(defsCollectionRef, defId);
        const defDocSnap = await getDoc(defDocRef);
        if (defDocSnap.exists()) {
            const data = defDocSnap.data();
            details.push({ id: defDocSnap.id, name: data.name, definition: data.definition, example: data.example });
        } else {
            staticAddLog(`Summarization definition with ID ${defId} not found for user ${userId}.`, "error");
        }
    }
    return details;
};

const fetchInputParametersForSchema = async (userId: string | null): Promise<InputParameterForSchema[]> => { 
  if (!userId) return [];
  const paramsCollectionRef = collection(db, 'users', userId, 'inputParameters'); 
  const q = query(paramsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name,
      type: data.type,
      definition: data.definition,
      options: data.options,
    } as InputParameterForSchema;
  });
};

const fetchContextDocumentDetailsForRun = async (userId: string | null, docIds: string[]): Promise<ContextDocumentDisplayDetail[]> => {
    if (!userId || !docIds || !docIds || docIds.length === 0) return [];
    const details: ContextDocumentDisplayDetail[] = [];
    const contextDocsCollectionRef = collection(db, 'users', userId, 'contextDocuments');
    for (const docId of docIds) {
        const docRef = doc(contextDocsCollectionRef, docId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            details.push({ id: docSnap.id, name: data.name, fileName: data.fileName });
        } else {
            staticAddLog(`Context document with ID ${docId} not found for user ${userId}.`, "error");
        }
    }
    return details;
};


// Main Page Component
export default function RunDetailsPage() {
  const reactParams = useParams();
  const runId = reactParams.runId as string;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null); 
  const [isLoadingUserId, setIsLoadingUserId] = useState<boolean>(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  const [simulationLog, setSimulationLog] = useState<string[]>([]);
  const [isPreviewDataLoading, setIsPreviewDataLoading] = useState<boolean>(false);
  const [previewDataError, setPreviewDataError] = useState<string | null>(null);
  const [metricsBreakdownData, setMetricsBreakdownData] = useState<ParameterChartData[]>([]);

  const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState<boolean>(false);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState<boolean>(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionResult, setSuggestionResult] = useState<SuggestRecursivePromptImprovementsOutput | null>(null);

  const [isQuestionDialogVisible, setIsQuestionDialogVisible] = useState<boolean>(false);
  const [questioningItemData, setQuestioningItemData] = useState<QuestioningItemContext | null>(null);
  const [userQuestionText, setUserQuestionText] = useState<string>('');
  const [judgmentAnalysisResult, setJudgmentAnalysisResult] = useState<AnalyzeJudgmentDiscrepancyOutput | null>(null);
  const [isAnalyzingJudgment, setIsAnalyzingJudgment] = useState<boolean>(false);
  const [judgmentAnalysisError, setJudgmentAnalysisError] = useState<string | null>(null);

  const [filterStates, setFilterStates] = useState<AllFilterStates>({});

  const [isFullPromptDialogVisible, setIsFullPromptDialogVisible] = useState<boolean>(false);


  const formatTimestamp = (timestamp?: Timestamp, includeTime: boolean = false): string => {
    if (!timestamp) return 'N/A';
    return includeTime ? timestamp.toDate().toLocaleString() : timestamp.toDate().toLocaleDateString();
  };

  const getStatusBadge = (status?: EvalRun['status']): JSX.Element => {
    if (!status) return <Badge variant="outline" className="text-base">Unknown</Badge>;
    switch (status) {
      case 'Completed': return <Badge variant="default" className="text-base bg-green-500 hover:bg-green-600"><CheckCircle className="mr-1.5 h-4 w-4" />Completed</Badge>;
      case 'Running': return <Badge variant="default" className="text-base bg-blue-500 hover:bg-blue-600"><Clock className="mr-1.5 h-4 w-4 animate-spin" />Running</Badge>;
      case 'Processing': return <Badge variant="default" className="text-base bg-purple-500 hover:bg-purple-600"><Zap className="mr-1.5 h-4 w-4 animate-pulse" />Processing</Badge>;
      case 'Pending': return <Badge variant="secondary" className="text-base"><Clock className="mr-1.5 h-4 w-4" />Pending</Badge>;
      case 'DataPreviewed': return <Badge variant="outline" className="text-base border-blue-500 text-blue-600"><DatabaseZap className="mr-1.5 h-4 w-4" />Data Previewed</Badge>;
      case 'Failed': return <Badge variant="destructive" className="text-base"><XCircle className="mr-1.5 h-4 w-4" />Failed</Badge>;
      default: return <Badge variant="outline" className="text-base">{status}</Badge>;
    }
  };

  const addLog = useCallback((message: string, type: 'info' | 'error' = 'info'): void => {
    const logEntry = `${new Date().toLocaleTimeString()}: ${type === 'error' ? 'ERROR: ' : ''}${message}`;
    if (type === 'error') { console.error(logEntry); } else { console.log(logEntry); }
    setSimulationLog(prev => [...prev, logEntry].slice(-100));
  }, []);
  
  useEffect(() => {
    staticAddLog = addLog;
  }, [addLog]);


  useEffect(() => {
    const storedProjectId = localStorage.getItem('currentUserId'); 
    setCurrentUserId(storedProjectId || null);
    setIsLoadingUserId(false);
  }, []);

  const { data: runDetails, isLoading: isLoadingRunDetails, error: fetchRunError, refetch: refetchRunDetails } = useQuery<EvalRun | null, Error>({
    queryKey: ['evalRunDetails', currentUserId, runId],
    queryFn: () => fetchEvalRunDetails(currentUserId, runId),
    enabled: !!currentUserId && !!runId && !isLoadingUserId,
    refetchInterval: (query) => { const data = query.state.data as EvalRun | null; return (data?.status === 'Running' || data?.status === 'Processing') ? 5000 : false; },
  });

  const { data: runResults, isLoading: isLoadingRunResults, error: fetchRunResultsError } = useQuery<EvalRunResultItem[], Error>({
    queryKey: ['evalRunResults', currentUserId, runId],
    queryFn: () => fetchRunResults(currentUserId, runId),
    enabled: !!runDetails && runDetails.status === 'Completed' && (!runDetails.results || runDetails.results.length === 0),
    refetchOnWindowFocus: false,
  });

  const effectiveRunDetails = useMemo(() => {
    if (!runDetails) return null;
    // Prioritize results from subcollection if available, otherwise use embedded for backward compatibility
    const effectiveResults = runResults && runResults.length > 0 ? runResults : (runDetails.results || []);
    return {
        ...runDetails,
        results: effectiveResults,
    };
  }, [runDetails, runResults]);

  const { data: promptTemplateTextForRun, isLoading: isLoadingPromptTemplate } = useQuery<string | null, Error>({
    queryKey: ['promptTemplateTextForRun', currentUserId, runDetails?.promptId, runDetails?.promptVersionId],
    queryFn: () => {
      if (!currentUserId || !runDetails?.promptId || !runDetails?.promptVersionId) return null;
      return fetchPromptVersionText(currentUserId, runDetails.promptId, runDetails.promptVersionId);
    },
    enabled: !!currentUserId && !!runDetails?.promptId && !!runDetails?.promptVersionId,
  });


  const { data: evalParamDetailsForLLM = [], isLoading: isLoadingEvalParamsForLLMHook } = useQuery<EvalParamDetailForPrompt[], Error>({
    queryKey: ['evalParamDetailsForLLM', currentUserId, runDetails?.selectedEvalParamIds?.join(',')],
    queryFn: async () => {
      if (!currentUserId || !runDetails?.selectedEvalParamIds || runDetails.selectedEvalParamIds.length === 0) return [];
      staticAddLog("Fetching evaluation parameter details for LLM/UI...");
      const details = await fetchEvaluationParameterDetailsForPrompt(currentUserId, runDetails.selectedEvalParamIds);
      staticAddLog(`Fetched ${details.length} evaluation parameter details.`);
      return details;
    },
    enabled: !!currentUserId && !!runDetails?.selectedEvalParamIds && runDetails.selectedEvalParamIds.length > 0,
  });

  const { data: summarizationDefDetailsForLLM = [], isLoading: isLoadingSummarizationDefsForLLMHook } = useQuery<SummarizationDefDetailForPrompt[], Error>({
    queryKey: ['summarizationDefDetailsForLLM', currentUserId, runDetails?.selectedSummarizationDefIds?.join(',')],
    queryFn: async () => {
        if (!currentUserId || !runDetails?.selectedSummarizationDefIds || !runDetails.selectedSummarizationDefIds || runDetails.selectedSummarizationDefIds.length === 0) return [];
        staticAddLog("Fetching summarization definition details for LLM/UI...");
        const details = await fetchSummarizationDefDetailsForPrompt(currentUserId, runDetails.selectedSummarizationDefIds);
        staticAddLog(`Fetched ${details.length} summarization definition details.`);
        return details;
    },
    enabled: !!currentUserId && !!runDetails?.selectedSummarizationDefIds && runDetails.selectedSummarizationDefIds.length > 0,
  });

 useEffect(() => {
    if (evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0) {
      setFilterStates(prevFilters => {
        const nextFiltersState: AllFilterStates = { ...prevFilters };
        let filtersChanged = false;
        evalParamDetailsForLLM.forEach(param => { if (!nextFiltersState[param.id]) { nextFiltersState[param.id] = { matchMismatch: 'all', selectedLabel: 'all' }; filtersChanged = true; } });
        Object.keys(nextFiltersState).forEach(paramId => { if (!evalParamDetailsForLLM.find(ep => ep.id === paramId)) { delete nextFiltersState[paramId]; filtersChanged = true; } });
        return filtersChanged ? nextFiltersState : prevFilters;
      });
    } else if ((!evalParamDetailsForLLM || evalParamDetailsForLLM.length === 0) && Object.keys(filterStates).length > 0) { setFilterStates({}); }
  }, [evalParamDetailsForLLM, filterStates]);


  const { data: selectedContextDocDetails = [], isLoading: isLoadingSelectedContextDocs } = useQuery<ContextDocumentDisplayDetail[], Error>({
    queryKey: ['selectedContextDocDetails', currentUserId, runDetails?.selectedContextDocumentIds?.join(',')],
    queryFn: () => { if (!currentUserId || !runDetails?.selectedContextDocumentIds || !runDetails.selectedContextDocumentIds || runDetails.selectedContextDocumentIds.length === 0) return []; return fetchContextDocumentDetailsForRun(currentUserId, runDetails.selectedContextDocumentIds); },
    enabled: !!currentUserId && !!runDetails?.selectedContextDocumentIds && runDetails.selectedContextDocumentIds.length > 0,
  });

  const updateRunMutation = useMutation<void, Error, EvalRunUpdatePayload>({
    mutationFn: async (updatePayload) => {
      if (!currentUserId) throw new Error("Project not selected.");
      const { id, ...dataToUpdate } = updatePayload;
      const payloadWithTimestamp: Record<string, any> = {
        ...dataToUpdate,
        updatedAt: serverTimestamp(),
      };
      
      const runDocRef = doc(db, 'users', currentUserId, 'evaluationRuns', id);
      await updateDoc(runDocRef, payloadWithTimestamp);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evalRunDetails', currentUserId, runId] });
      queryClient.invalidateQueries({ queryKey: ['evalRuns', currentUserId] });
    },
    onError: (error) => {
      toast({ title: "Error updating run", description: error.message, variant: "destructive" });
      if(runDetails?.status === 'Processing' || runDetails?.status === 'Running') {
        const errorUpdatePayload: EvalRunUpdatePayload = {
            id: runId,
            status: 'Failed',
            errorMessage: `Update during run failed: ${error.message}`
        };
        updateRunMutation.mutate(errorUpdatePayload);
      }
      if(isPreviewDataLoading) setIsPreviewDataLoading(false);
    }
  });

  useEffect(() => {
    if (effectiveRunDetails?.results && effectiveRunDetails.results.length > 0 && evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0) {
      const newComputedMetrics: ParameterChartData[] = evalParamDetailsForLLM.map(paramDetail => {
        const labelCounts: Record<string, number> = {};
        if (paramDetail.labels && Array.isArray(paramDetail.labels)) {
          paramDetail.labels.forEach(label => { if (label && typeof label.name === 'string') labelCounts[label.name] = 0; });
        }
        labelCounts['ERROR_PROCESSING_ROW'] = 0;
        let correctCountForParam = 0;
        let totalComparedForParam = 0;
        let totalLabelsForParam = 0;

        effectiveRunDetails.results!.forEach(resultItem => {
          if (resultItem.judgeLlmOutput && typeof resultItem.judgeLlmOutput === 'object') {
            const llmOutputForParam = resultItem.judgeLlmOutput[paramDetail.id];
            if (llmOutputForParam?.chosenLabel && typeof llmOutputForParam.chosenLabel === 'string') {
              const chosenLabel = llmOutputForParam.chosenLabel;
              labelCounts[chosenLabel] = (labelCounts[chosenLabel] || 0) + 1;
              if (!llmOutputForParam.error) {
                totalLabelsForParam++;
              }
              if (effectiveRunDetails.runType === 'GroundTruth' && resultItem.groundTruth && !llmOutputForParam.error) {
                const gtLabel = resultItem.groundTruth[paramDetail.id];
                if (gtLabel !== undefined && gtLabel !== null && String(gtLabel).trim() !== '') {
                  totalComparedForParam++;
                  if (String(chosenLabel).trim().toLowerCase() === String(gtLabel).trim().toLowerCase()) {
                    correctCountForParam++;
                  }
                }
              }
            } else if (llmOutputForParam?.error) {
              labelCounts['ERROR_PROCESSING_ROW'] = (labelCounts['ERROR_PROCESSING_ROW'] || 0) + 1;
            }
          }
        });

        const chartDataEntries = Object.entries(labelCounts).map(([labelName, count]) => {
          const percentage = totalLabelsForParam > 0 && labelName !== 'ERROR_PROCESSING_ROW'
            ? (count / totalLabelsForParam) * 100
            : undefined;
          return { labelName, count, percentage };
        }).filter(item => item.count > 0 || (paramDetail.labels && paramDetail.labels.some(l => l.name === item.labelName)) || item.labelName === 'ERROR_PROCESSING_ROW');

        const paramAccuracy = effectiveRunDetails.runType === 'GroundTruth' && totalComparedForParam > 0 ? (correctCountForParam / totalComparedForParam) * 100 : undefined;
        return {
          parameterId: paramDetail.id,
          parameterName: paramDetail.name,
          data: chartDataEntries.sort((a, b) => b.count - a.count),
          accuracy: paramAccuracy,
          totalCompared: effectiveRunDetails.runType === 'GroundTruth' ? totalComparedForParam : undefined,
        };
      });
      if (JSON.stringify(newComputedMetrics) !== JSON.stringify(metricsBreakdownData)) {
        setMetricsBreakdownData(newComputedMetrics);
      }
    } else {
      if (metricsBreakdownData.length > 0) {
        setMetricsBreakdownData([]);
      }
    }
  }, [effectiveRunDetails, evalParamDetailsForLLM, metricsBreakdownData]);

  const fetchAndParseFullDataset = useCallback(async (
    userId: string, 
    run: EvalRun
  ): Promise<Array<Record<string, any>>> => {
      if (!run || !userId || !run.datasetId || !run.datasetVersionId) {
          throw new Error("Dataset configuration is missing in run details.");
      }
      
      staticAddLog("Data Processing: Fetching dataset version config...");
      const versionConfig = await fetchDatasetVersionConfig(userId, run.datasetId, run.datasetVersionId);
      if (!versionConfig || !versionConfig.storagePath || !versionConfig.columnMapping) {
          throw new Error("Dataset version config (storage path or mapping) is incomplete.");
      }

      staticAddLog(`Data Processing: Downloading file from ${versionConfig.storagePath}...`);
      const fileRef = storageRef(storage, versionConfig.storagePath);
      const blob = await getBlob(fileRef);

      let parsedRows: Array<Record<string, any>> = [];
      const fileName = versionConfig.storagePath.split('/').pop()?.toLowerCase() || '';
      if (fileName.endsWith('.xlsx')) {
          const arrayBuffer = await blob.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const sheetName = versionConfig.selectedSheetName || workbook.SheetNames[0];
          if (!sheetName || !workbook.Sheets[sheetName]) {
              throw new Error(`Sheet "${sheetName || 'default'}" not found in Excel file.`);
          }
          parsedRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
      } else if (fileName.endsWith('.csv')) {
          const text = await blob.text();
          const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
          if (lines.length < 1) return []; // Empty or header-only file
          const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
          for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
              const rowObject: Record<string, any> = {};
              headers.forEach((header, index) => { rowObject[header] = values[index] || ""; });
              parsedRows.push(rowObject);
          }
      } else {
          throw new Error("Unsupported file type for processing.");
      }

      staticAddLog(`Data Processing: Parsed ${parsedRows.length} total rows from file.`);
      
      const actualRowsToProcess = run.runOnNRows > 0 ? parsedRows.slice(0, run.runOnNRows) : parsedRows;
      
      staticAddLog(`Data Processing: Mapping ${actualRowsToProcess.length} rows based on config...`);
      const mappedData: Array<Record<string, any>> = [];
      const inputParamToOriginalColMap = versionConfig.columnMapping;
      const evalParamIdToGtColMap = versionConfig.groundTruthMapping || {};

      actualRowsToProcess.forEach((originalRow) => {
          const mappedRow: Record<string, any> = {};
          let rowHasAnyMappedData = false;
          const normalizedOriginalRowKeys: Record<string, string> = {};
          Object.keys(originalRow).forEach(key => { normalizedOriginalRowKeys[String(key).trim().toLowerCase()] = key; });

          for (const inputParamName in inputParamToOriginalColMap) {
              const mappedOriginalColName = inputParamToOriginalColMap[inputParamName];
              const normalizedMappedOriginalColName = String(mappedOriginalColName).trim().toLowerCase();
              const actualKeyInOriginalRow = normalizedOriginalRowKeys[normalizedMappedOriginalColName];
              if (actualKeyInOriginalRow !== undefined) {
                  mappedRow[inputParamName] = originalRow[actualKeyInOriginalRow];
                  rowHasAnyMappedData = true;
              } else {
                  mappedRow[inputParamName] = undefined;
              }
          }
          
          if (run.runType === 'GroundTruth') {
              for (const evalParamId in evalParamIdToGtColMap) {
                  const mappedGtColName = evalParamIdToGtColMap[evalParamId];
                  const normalizedMappedGtColName = String(mappedGtColName).trim().toLowerCase();
                  const actualKeyInOriginalRowForGt = normalizedOriginalRowKeys[normalizedMappedGtColName];
                  if (actualKeyInOriginalRowForGt !== undefined) {
                      mappedRow[`_gt_${evalParamId}`] = originalRow[actualKeyInOriginalRowForGt];
                      rowHasAnyMappedData = true;
                  } else {
                      mappedRow[`_gt_${evalParamId}`] = undefined;
                  }
              }
          }
          if (rowHasAnyMappedData) {
              mappedData.push(mappedRow);
          }
      });

      staticAddLog(`Data Processing: Final mapped row count is ${mappedData.length}.`);
      return mappedData;
  }, []);

  const handleFetchAndPreviewData = useCallback(async (): Promise<void> => {
      if (!runDetails || !currentUserId) {
        toast({ title: "Configuration Missing", description: "Cannot fetch data without run details.", variant: "destructive" });
        return;
      }
      setIsPreviewDataLoading(true); setPreviewDataError(null); setSimulationLog([]); addLog("Data Preview: Start.");
      try {
        const fullMappedData = await fetchAndParseFullDataset(currentUserId, runDetails);
        if (fullMappedData.length === 0) {
            addLog("Data Preview: No data rows found after parsing and mapping.");
            updateRunMutation.mutate({ id: runId, previewedDatasetSample: [], totalRowsInDataset: 0, status: 'DataPreviewed' });
            toast({ title: "No Data", description: "Parsed file contained no data rows or no data could be mapped." });
            return;
        }

        const uiPreviewSample = fullMappedData.slice(0, 10);
        const sanitizedPreview = sanitizeDataForFirestore(uiPreviewSample);
        
        updateRunMutation.mutate({
            id: runId,
            previewedDatasetSample: sanitizedPreview,
            totalRowsInDataset: fullMappedData.length,
            status: 'DataPreviewed',
            results: [],
            errorMessage: deleteField(),
        });
        toast({ title: "Data Preview Ready", description: `${fullMappedData.length} rows fetched and ready for processing.` });
      } catch (error: any) {
        addLog(`Data Preview: Error: ${error.message}`, "error");
        setPreviewDataError(error.message);
        toast({ title: "Preview Error", description: error.message, variant: "destructive" });
        updateRunMutation.mutate({ id: runId, status: 'Failed', errorMessage: `Data preview failed: ${error.message}` });
      } finally {
        setIsPreviewDataLoading(false);
      }
  }, [currentUserId, runId, runDetails, updateRunMutation, addLog, fetchAndParseFullDataset]);


  const simulateRunExecution = useCallback(async (): Promise<void> => {
    const hasEvalParams = evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0; const hasSummarizationDefs = summarizationDefDetailsForLLM && summarizationDefDetailsForLLM.length > 0;
    if (!runDetails || !currentUserId || !runDetails.promptId || !runDetails.promptVersionId || (!hasEvalParams && !hasSummarizationDefs) ) { const errorMsg = "Missing config or no eval/summarization params."; toast({ title: "Cannot start", description: errorMsg, variant: "destructive" }); addLog(errorMsg, "error"); return; }
    
    updateRunMutation.mutate({ id: runId, status: 'Processing', progress: 0, results: [], firstRowFullPrompt: runDetails.firstRowFullPrompt || '' }); 
    setSimulationLog([]); addLog("LLM task init.");
    try {
      addLog("Fetching and parsing full dataset for execution...");
      const datasetToProcess = await fetchAndParseFullDataset(currentUserId, runDetails);
      if (!datasetToProcess || datasetToProcess.length === 0) {
        throw new Error("No data could be processed from the dataset file after parsing and mapping.");
      }
      
      const fetchedPromptTemplateString = await fetchPromptVersionText(currentUserId, runDetails.promptId, runDetails.promptVersionId);
      if (!fetchedPromptTemplateString) throw new Error("Failed to fetch prompt template.");
      addLog(`Fetched prompt (v${runDetails.promptVersionNumber}).`); if(hasEvalParams) addLog(`Using ${evalParamDetailsForLLM.length} eval params.`); if(hasSummarizationDefs) addLog(`Using ${summarizationDefDetailsForLLM.length} summarization defs.`);
      if (runDetails.modelConnectorProvider === 'Anthropic' || runDetails.modelConnectorProvider === 'OpenAI') { addLog(`Using direct ${runDetails.modelConnectorProvider} client via config: ${runDetails.modelConnectorConfigString || 'N/A'}`); } else if(runDetails.modelIdentifierForGenkit) { addLog(`Using Genkit model: ${runDetails.modelIdentifierForGenkit}`); } else { addLog(`Warn: No Genkit model ID. Using Genkit default.`); }
      const rowsToProcess = datasetToProcess.length; const effectiveConcurrencyLimit = Math.max(1, runDetails.concurrencyLimit || 3); addLog(`Starting LLM tasks for ${rowsToProcess} rows with concurrency: ${effectiveConcurrencyLimit}.`);
      const parameterIdsRequiringRationale = hasEvalParams ? evalParamDetailsForLLM.filter(ep => ep.requiresRationale).map(ep => ep.id) : [];
      
      let firstRowPromptAlreadySet = !!runDetails.firstRowFullPrompt;

      for (let batchStartIndex = 0; batchStartIndex < rowsToProcess; batchStartIndex += effectiveConcurrencyLimit) {
        const batchEndIndex = Math.min(batchStartIndex + effectiveConcurrencyLimit, rowsToProcess); const currentBatchRows = datasetToProcess.slice(batchStartIndex, batchEndIndex); addLog(`Batch: Rows ${batchStartIndex + 1}-${batchEndIndex}. Size: ${currentBatchRows.length}.`);
        const batchPromises = currentBatchRows.map(async (rawRowFromPreview, indexInBatch) => {
          const overallRowIndex = batchStartIndex + indexInBatch; const inputDataForRow: Record<string, any> = {}; const groundTruthDataForRow: Record<string, string> = {};
          for (const key in rawRowFromPreview) { if (key.startsWith('_gt_')) { groundTruthDataForRow[key.substring('_gt_'.length)] = String(rawRowFromPreview[key]); } else { inputDataForRow[key] = rawRowFromPreview[key]; } }
          
          let userEditablePromptPart = fetchedPromptTemplateString; 
          for (const inputParamName in inputDataForRow) { userEditablePromptPart = userEditablePromptPart.replace(new RegExp(`{{${inputParamName}}}`, 'g'), String(inputDataForRow[inputParamName] === null || inputDataForRow[inputParamName] === undefined ? "" : inputDataForRow[inputParamName])); }
          
          let structuredCriteriaTextForLLM = ""; 
          if (hasEvalParams) { structuredCriteriaTextForLLM += "\n"; evalParamDetailsForLLM.forEach(ep => { structuredCriteriaTextForLLM += `Parameter ID: ${ep.id}\nParameter Name: ${ep.name}\nDefinition: ${ep.definition}\n`; if (ep.requiresRationale) structuredCriteriaTextForLLM += `IMPORTANT: For this parameter (${ep.name}), you MUST include a 'rationale'.\n`; if (ep.labels && ep.labels.length > 0) { structuredCriteriaTextForLLM += "Labels:\n"; ep.labels.forEach(label => { structuredCriteriaTextForLLM += `  - "${label.name}": ${label.definition || 'No def.'} ${label.example ? `(e.g., "${label.example}")` : ''}\n`; }); } else { structuredCriteriaTextForLLM += " (No specific labels)\n"; } structuredCriteriaTextForLLM += "\n"; }); }
          if (hasSummarizationDefs) { structuredCriteriaTextForLLM += "\n"; summarizationDefDetailsForLLM.forEach(sd => { structuredCriteriaTextForLLM += `Summarization Task ID: ${sd.id}\nTask Name: ${sd.name}\nDefinition: ${sd.definition}\n`; if (sd.example) structuredCriteriaTextForLLM += `Example Hint: "${sd.example}"\n`; structuredCriteriaTextForLLM += "Provide summary.\n\n"; }); }
          
          const fullPromptForLLM = userEditablePromptPart + "\n\n" + FIXED_CRITERIA_HEADER + FIXED_CRITERIA_INSTRUCTIONS_PART + structuredCriteriaTextForLLM;
          
          if (overallRowIndex === 0 && !firstRowPromptAlreadySet) {
             updateRunMutation.mutate({ id: runId, firstRowFullPrompt: fullPromptForLLM });
             firstRowPromptAlreadySet = true;
          }
          const genkitInput: JudgeLlmEvaluationInput = { fullPromptText: fullPromptForLLM, evaluationParameterIds: hasEvalParams ? evalParamDetailsForLLM.map(ep => ep.id) : [], summarizationParameterIds: hasSummarizationDefs ? summarizationDefDetailsForLLM.map(sd => sd.id) : [], parameterIdsRequiringRationale: parameterIdsRequiringRationale, modelName: runDetails.modelIdentifierForGenkit || undefined, modelConnectorProvider: runDetails.modelConnectorProvider, modelConnectorConfigString: runDetails.modelConnectorConfigString, };
          const resultShell: EvalRunResultItem = { inputData: inputDataForRow, judgeLlmOutput: {}, originalIndex: overallRowIndex }; if (runDetails.runType === 'GroundTruth' && Object.keys(groundTruthDataForRow).length > 0) { resultShell.groundTruth = groundTruthDataForRow; }
          
          try {
            addLog(`Sending row ${overallRowIndex + 1} to Judge LLM (Provider: ${runDetails.modelConnectorProvider || 'Genkit Default'})...`);
            let judgeOutput = await judgeLlmEvaluation(genkitInput);

            const initialAttemptFailed = Object.values(judgeOutput).some(
                (output: any) => output?.error || 
                                 (output?.chosenLabel && typeof output.chosenLabel === 'string' && output.chosenLabel.startsWith('ERROR_')) ||
                                 (output?.generatedSummary && typeof output.generatedSummary === 'string' && output.generatedSummary.startsWith('ERROR:'))
            );

            if (initialAttemptFailed) {
                addLog(`Initial attempt for row ${overallRowIndex + 1} failed. Retrying once...`);
                try {
                    judgeOutput = await judgeLlmEvaluation(genkitInput); // Retry
                    
                    const retryAttemptFailed = Object.values(judgeOutput).some(
                        (output: any) => output?.error ||
                                         (output?.chosenLabel && typeof output.chosenLabel === 'string' && output.chosenLabel.startsWith('ERROR_')) ||
                                         (output?.generatedSummary && typeof output.generatedSummary === 'string' && output.generatedSummary.startsWith('ERROR:'))
                    );

                    if (retryAttemptFailed) {
                        addLog(`Retry for row ${overallRowIndex + 1} also failed. Storing error result.`, "error");
                    } else {
                        addLog(`Row ${overallRowIndex + 1} retry successful.`);
                    }
                } catch (retryFlowError: any) {
                    addLog(`Exception during retry for row ${overallRowIndex + 1}: ${retryFlowError.message}`, "error");
                    const errorOutputForAllParamsRetry: Record<string, { chosenLabel?: string | null; generatedSummary?: string | null; error?: string }> = {};
                    (runDetails.selectedEvalParamIds || []).forEach(paramId => {
                        errorOutputForAllParamsRetry[paramId] = { chosenLabel: 'ERROR_PROCESSING_ROW', error: `Retry flow exception: ${retryFlowError.message || 'Unknown LLM error.'}` };
                    });
                    (runDetails.selectedSummarizationDefIds || []).forEach(paramId => {
                        errorOutputForAllParamsRetry[paramId] = { generatedSummary: 'ERROR: LLM processing exception after retry.', error: `Retry flow exception: ${retryFlowError.message || 'Unknown LLM error.'}` };
                    });
                    judgeOutput = errorOutputForAllParamsRetry;
                }
            } else {
                addLog(`Row ${overallRowIndex + 1} responded successfully on first attempt.`);
            }
            resultShell.judgeLlmOutput = judgeOutput;

          } catch(flowError: any) { // Catch unhandled exceptions from the first call
            addLog(`Unhandled exception in Judge LLM flow for row ${overallRowIndex + 1} (initial attempt): ${flowError.message}`, "error");
            const errorOutputForAllParamsInitial: Record<string, { chosenLabel?: string | null; generatedSummary?: string | null; error?: string }> = {};
            (runDetails.selectedEvalParamIds || []).forEach(paramId => {
                errorOutputForAllParamsInitial[paramId] = { chosenLabel: 'ERROR_PROCESSING_ROW', error: `Initial flow exception: ${flowError.message || 'Unknown LLM error.'}` };
            });
            (runDetails.selectedSummarizationDefIds || []).forEach(paramId => {
                errorOutputForAllParamsInitial[paramId] = { generatedSummary: 'ERROR: LLM processing exception.', error: `Initial flow exception: ${flowError.message || 'Unknown LLM error.'}` };
            });
            resultShell.judgeLlmOutput = errorOutputForAllParamsInitial;
          }
          return resultShell;
        });
        
        const settledBatchResults = await Promise.all(batchPromises);
        const batchForFirestore = writeBatch(db);
        settledBatchResults.forEach(resultItem => {
          if (!currentUserId) return;
          const resultDocRef = doc(collection(db, 'users', currentUserId, 'evaluationRuns', runId, 'results'));
          batchForFirestore.set(resultDocRef, sanitizeDataForFirestore(resultItem));
        });
        
        await batchForFirestore.commit();
        addLog(`Batch ${batchStartIndex + 1}-${batchEndIndex} results committed to subcollection.`);

        const currentProgress = Math.round(((batchEndIndex) / rowsToProcess) * 100);
        const updateData: EvalRunUpdatePayload = {
             id: runId,
             progress: currentProgress, 
             status: (batchEndIndex) === rowsToProcess ? 'Completed' : 'Processing'
        };
        updateRunMutation.mutate(updateData);
      }
      addLog("LLM tasks complete.");
      updateRunMutation.mutate({ 
          id: runId, 
          status: 'Completed',
          progress: 100, 
          completedAt: serverTimestamp(),
          previewedDatasetSample: deleteField(),
          totalRowsInDataset: deleteField(),
      });
      toast({ title: "LLM Tasks Complete", description: `Run "${runDetails.name}" processed ${rowsToProcess} rows.` });
    } catch (error: any) { addLog(`Error during LLM tasks: ${error.message}`, "error"); console.error("LLM Task Error: ", error); toast({ title: "LLM Error", description: error.message, variant: "destructive" }); updateRunMutation.mutate({ id: runId, status: 'Failed', errorMessage: `LLM task failed: ${error.message}`, previewedDatasetSample: deleteField() }); }
  }, [currentUserId, runId, runDetails, updateRunMutation, evalParamDetailsForLLM, summarizationDefDetailsForLLM, addLog, fetchAndParseFullDataset]);

  const handleDownloadResults = useCallback((): void => {
    if (!effectiveRunDetails || !effectiveRunDetails.results || effectiveRunDetails.results.length === 0) {
      toast({ title: "No Results", description: "No results to download.", variant: "destructive" });
      return;
    }

    try {
      const dataForExcel: any[] = [];
      const inputDataKeys = new Set<string>();
      
      // Safely collect all possible input data keys
      effectiveRunDetails.results.forEach(item => {
        if (item && item.inputData) {
          Object.keys(item.inputData).forEach(key => inputDataKeys.add(key));
        }
      });
      const sortedInputDataKeys = Array.from(inputDataKeys).sort();

      effectiveRunDetails.results.forEach(item => {
        const row: Record<string, any> = {};
        
        // Safely add all input data columns
        sortedInputDataKeys.forEach(key => {
          row[key] = item.inputData?.[key] !== undefined && item.inputData?.[key] !== null ? String(item.inputData[key]) : '';
        });

        // Add evaluation parameter columns
        if (Array.isArray(evalParamDetailsForLLM)) {
          evalParamDetailsForLLM.forEach(paramDetail => {
            const output = item.judgeLlmOutput?.[paramDetail.id];
            row[`${String(paramDetail.name)} - LLM Label`] = output?.chosenLabel || (output?.error ? 'ERROR' : 'N/A');
            if (effectiveRunDetails.runType === 'GroundTruth') {
              const gtValue = item.groundTruth?.[paramDetail.id]; // Safe access
              row[`${String(paramDetail.name)} - Ground Truth`] = gtValue !== undefined && gtValue !== null ? String(gtValue) : 'N/A';
              const llmLabel = output?.chosenLabel;
              row[`${String(paramDetail.name)} - Match`] = (llmLabel && gtValue !== undefined && gtValue !== null && !output?.error && String(llmLabel).trim().toLowerCase() === String(gtValue).trim().toLowerCase()) ? 'Yes' : 'No';
            }
            row[`${String(paramDetail.name)} - LLM Rationale`] = output?.rationale || '';
            if (output?.error) row[`${String(paramDetail.name)} - LLM Error`] = output.error;
          });
        }

        // Add summarization definition columns
        if (Array.isArray(summarizationDefDetailsForLLM)) {
          summarizationDefDetailsForLLM.forEach(summDefDetail => {
            const output = item.judgeLlmOutput?.[summDefDetail.id];
            const summaryText = output?.generatedSummary || (output?.error ? `ERROR: ${output.error}` : 'N/A');
            row[`${String(summDefDetail.name)} - LLM Summary`] = summaryText;
            if (output?.error) row[`${String(summDefDetail.name)} - LLM Error`] = output.error;
          });
        }
        dataForExcel.push(row);
      });
      
      if (dataForExcel.length === 0) {
        toast({ title: "No Data to Export", description: "After processing, no data was available for export.", variant: "default" });
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Eval Results");
      const fileName = `eval_run_${effectiveRunDetails.name.replace(/\s+/g, '_')}_${effectiveRunDetails.id.substring(0, 8)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast({ title: "Download Started", description: `Results downloading as ${fileName}.` });

    } catch (error: any) {
      console.error("Error generating Excel file:", error);
      toast({ title: "Download Error", description: `Failed to generate Excel file: ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  }, [effectiveRunDetails, evalParamDetailsForLLM, summarizationDefDetailsForLLM]);

  const { data: inputParametersForSchema = [] } = useQuery<InputParameterForSchema[], Error>({ queryKey: ['inputParametersForSchema', currentUserId], queryFn: () => fetchInputParametersForSchema(currentUserId), enabled: !!currentUserId && (isSuggestionDialogOpen || isQuestionDialogVisible) });

  const handleSuggestImprovementsClick = useCallback(async (): Promise<void> => {
    if (!effectiveRunDetails || !currentUserId || !effectiveRunDetails.promptId || !effectiveRunDetails.promptVersionId || !evalParamDetailsForLLM || evalParamDetailsForLLM.length === 0 || !effectiveRunDetails.results) { toast({ title: "Cannot Suggest", description: "Missing data for Ground Truth comparison.", variant: "destructive" }); return; }
    setIsLoadingSuggestion(true); setSuggestionError(null); setSuggestionResult(null); setIsSuggestionDialogOpen(true);
    try {
      const originalPromptTemplate = await fetchPromptVersionText(currentUserId, effectiveRunDetails.promptId, effectiveRunDetails.promptVersionId); if (!originalPromptTemplate) throw new Error("Failed to fetch original prompt.");
      const mismatchDetails: MismatchDetail[] = [];
      effectiveRunDetails.results.forEach(item => {
        evalParamDetailsForLLM.forEach(paramDetail => {
          const llmOutput = item.judgeLlmOutput[paramDetail.id];
          const gtLabel = item.groundTruth ? item.groundTruth[paramDetail.id] : undefined;
          if (gtLabel !== undefined && llmOutput && llmOutput.chosenLabel && !llmOutput?.error && String(llmOutput.chosenLabel).trim().toLowerCase() !== String(gtLabel).trim().toLowerCase()) {
            mismatchDetails.push({
              inputData: item.inputData,
              evaluationParameterName: paramDetail.name,
              evaluationParameterDefinition: paramDetail.definition,
              llmChosenLabel: llmOutput.chosenLabel,
              groundTruthLabel: gtLabel,
              llmRationale: llmOutput.rationale ?? undefined,
            });
          }
        });
      });
      if (mismatchDetails.length === 0) { setSuggestionError("No mismatches found."); setIsLoadingSuggestion(false); return; }
      const inputParamsSchemaString = inputParametersForSchema.length > 0 ? "Input Parameters:\n" + inputParametersForSchema.map(p => `- ${p.name} (${p.type}): ${p.definition}${p.options ? ` Options: [${p.options.join(', ')}]` : ''}`).join("\n") : "No input params.";
      const evalParamsSchemaString = "Evaluation Parameters Used:\n" + evalParamDetailsForLLM.map(ep => { let schema = `- ID: ${ep.id}, Name: ${ep.name}\n  Definition: ${ep.definition}\n`; if (ep.requiresRationale) schema += `  (Requires Rationale)\n`; if (ep.labels && ep.labels.length > 0) { schema += `  Labels:\n` + ep.labels.map(l => `    - "${l.name}": ${l.definition} ${l.example ? `(e.g., "${l.example}")` : ''}`).join("\n"); } return schema; }).join("\n\n");
      const flowInput: SuggestRecursivePromptImprovementsInput = { originalPromptTemplate, mismatchDetails, inputParametersSchema: inputParamsSchemaString, evaluationParametersSchema: evalParamsSchemaString, };
      const result = await suggestRecursivePromptImprovements(flowInput); setSuggestionResult(result);
    } catch (error: any) { console.error("Error suggesting improvements:", error); setSuggestionError(error.message || "Failed to get suggestions."); } finally { setIsLoadingSuggestion(false); }
  }, [currentUserId, effectiveRunDetails, evalParamDetailsForLLM, inputParametersForSchema]);

  const handleOpenQuestionDialog = useCallback((item: EvalRunResultItem, paramId: string, rowIndex: number): void => {
    const paramDetail = evalParamDetailsForLLM.find(p => p.id === paramId); const outputData = item.judgeLlmOutput[paramId];
    if (!paramDetail || !outputData || typeof outputData.chosenLabel !== 'string') { console.error("Invalid data for question dialog.", paramDetail, outputData); toast({ title: "Internal Error", description: "Cannot open question dialog.", variant: "destructive" }); return; }
    setQuestioningItemData({ rowIndex, inputData: item.inputData, paramId: paramId, paramName: paramDetail.name, paramDefinition: paramDetail.definition, paramLabels: paramDetail.labels, judgeLlmOutput: { chosenLabel: outputData.chosenLabel, rationale: outputData.rationale, error: outputData.error, }, groundTruthLabel: item.groundTruth ? item.groundTruth[paramId] : undefined, });
    setUserQuestionText(''); setJudgmentAnalysisResult(null); setJudgmentAnalysisError(null); setIsQuestionDialogVisible(true);
  }, [evalParamDetailsForLLM]);

  const handleSubmitQuestionAnalysis = useCallback(async (): Promise<void> => {
    if (!questioningItemData || !currentUserId || !effectiveRunDetails?.promptId || !effectiveRunDetails?.promptVersionId) { setJudgmentAnalysisError("Missing data for analysis."); return; }
    setIsAnalyzingJudgment(true); setJudgmentAnalysisError(null); setJudgmentAnalysisResult(null);
    try {
      const originalPromptTemplate = await fetchPromptVersionText(currentUserId, effectiveRunDetails.promptId, effectiveRunDetails.promptVersionId); if (!originalPromptTemplate) throw new Error("Failed to fetch original prompt.");
      const inputForFlow: AnalyzeJudgmentDiscrepancyInput = { inputData: questioningItemData.inputData, evaluationParameterName: questioningItemData.paramName, evaluationParameterDefinition: questioningItemData.paramDefinition, evaluationParameterLabels: questioningItemData.paramLabels, judgeLlmChosenLabel: questioningItemData.judgeLlmOutput.chosenLabel, judgeLlmRationale: questioningItemData.judgeLlmOutput.rationale ?? undefined, groundTruthLabel: questioningItemData.groundTruthLabel, userQuestion: userQuestionText, originalPromptTemplate: originalPromptTemplate, };
      const analysisOutput = await analyzeJudgmentDiscrepancy(inputForFlow); setJudgmentAnalysisResult(analysisOutput);
    } catch (error: any) { console.error("Error analyzing judgment:", error); setJudgmentAnalysisError(error.message || "Failed to get analysis."); } finally { setIsAnalyzingJudgment(false); }
  }, [currentUserId, effectiveRunDetails, questioningItemData, userQuestionText]);

  const hasMismatches = useMemo((): boolean => { if (effectiveRunDetails?.runType !== 'GroundTruth' || !effectiveRunDetails.results || !evalParamDetailsForLLM) return false; return effectiveRunDetails.results.some(item => evalParamDetailsForLLM.some(paramDetail => { const llmOutput = item.judgeLlmOutput[paramDetail.id]; const gtLabel = item.groundTruth ? item.groundTruth[paramDetail.id] : undefined; return gtLabel !== undefined && llmOutput && llmOutput.chosenLabel && !llmOutput?.error && String(llmOutput.chosenLabel).trim().toLowerCase() !== String(gtLabel).trim().toLowerCase(); }) ); }, [effectiveRunDetails, evalParamDetailsForLLM]);

  const handleFilterChange = useCallback((paramId: string, filterType: 'matchMismatch' | 'label', value: FilterValueMatchMismatch | FilterValueSelectedLabel): void => {
    setFilterStates(prev => { const currentParamState = prev[paramId] || { matchMismatch: 'all', selectedLabel: 'all' }; return { ...prev, [paramId]: { ...currentParamState, [filterType]: value, } }; });
  }, []);

  const filteredResultsToDisplay = useMemo((): EvalRunResultItem[] => {
    if (!effectiveRunDetails?.results) return [];
    if (Object.keys(filterStates).length === 0 || !evalParamDetailsForLLM || evalParamDetailsForLLM.length === 0) {
      return effectiveRunDetails.results;
    }

    return effectiveRunDetails.results.filter(item => {
      for (const paramId in filterStates) {
        if (!evalParamDetailsForLLM.find(ep => ep.id === paramId)) {
          continue; 
        }

        const currentParamFilters = filterStates[paramId];
        const llmOutput = item.judgeLlmOutput?.[paramId];

        let passesGtFilter = true;
        if (effectiveRunDetails.runType === 'GroundTruth' && currentParamFilters.matchMismatch !== 'all') {
          const gtDbValue = item.groundTruth?.[paramId];
          const hasValidLlmOutputForComparison = llmOutput && typeof llmOutput.chosenLabel === 'string' && !llmOutput.error;
          const hasValidGtForComparison = gtDbValue !== undefined && gtDbValue !== null && String(gtDbValue).trim() !== '';

          if (!hasValidLlmOutputForComparison || !hasValidGtForComparison) {
            passesGtFilter = false; 
          } else {
            const isMatch = String(llmOutput!.chosenLabel).trim().toLowerCase() === String(gtDbValue).trim().toLowerCase();
            if ((currentParamFilters.matchMismatch === 'match' && !isMatch) || (currentParamFilters.matchMismatch === 'mismatch' && isMatch)) {
              passesGtFilter = false;
            }
          }
        }
        if (!passesGtFilter) return false;

        let passesLabelFilter = true;
        if (currentParamFilters.selectedLabel !== 'all') {
          const hasValidLlmOutputForLabelFilter = llmOutput && typeof llmOutput.chosenLabel === 'string' && !llmOutput.error;
          if (!hasValidLlmOutputForLabelFilter) {
            passesLabelFilter = false; 
          } else {
            const labelMatches = String(llmOutput!.chosenLabel).trim().toLowerCase() === String(currentParamFilters.selectedLabel).toLowerCase();
            if (!labelMatches) {
              passesLabelFilter = false;
            }
          }
        }
        if (!passesLabelFilter) return false;
      }
      return true; 
    });
  }, [effectiveRunDetails?.results, effectiveRunDetails?.runType, filterStates, evalParamDetailsForLLM]);



  const displayedPreviewData: Array<Record<string, any>> = runDetails?.previewedDatasetSample || [];
  const previewTableHeaders: string[] = displayedPreviewData.length > 0 ? Object.keys(displayedPreviewData[0]).filter(k => !k.startsWith('_gt_')) : [];
  const isRunTerminal: boolean = runDetails?.status === 'Completed' || false;
  const canFetchData: boolean = runDetails?.status === 'Pending' || runDetails?.status === 'Failed' || runDetails?.status === 'DataPreviewed';
  const isRunReadyForProcessing_flag: boolean = runDetails?.status === 'DataPreviewed' || (runDetails?.status === 'Failed');
  const dependenciesLoadedForRunStart_flag: boolean = !isLoadingRunDetails && !isLoadingEvalParamsForLLMHook && !isLoadingSummarizationDefsForLLMHook;
  const hasParamsOrDefsForRunStart_flag: boolean = (evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0) || (summarizationDefDetailsForLLM && summarizationDefDetailsForLLM.length > 0);
  const canStartLLMTask: boolean = isRunReadyForProcessing_flag && dependenciesLoadedForRunStart_flag && hasParamsOrDefsForRunStart_flag;
  const hasResultsForDownload_flag: boolean = effectiveRunDetails?.status === 'Completed' && Array.isArray(effectiveRunDetails.results) && effectiveRunDetails.results.length > 0;
  const canDownloadResults: boolean = hasResultsForDownload_flag;
  const canSuggestImprovements: boolean = effectiveRunDetails?.status === 'Completed' && effectiveRunDetails.runType === 'GroundTruth' && !!effectiveRunDetails?.results && Array.isArray(effectiveRunDetails.results) && effectiveRunDetails.results.length > 0 && hasMismatches && evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0;
  const showProgressArea = isPreviewDataLoading || (runDetails?.status === 'Running' || runDetails?.status === 'Processing') || runDetails?.errorMessage || simulationLog.length > 0 || previewDataError;


  if (isLoadingUserId) { return ( <div className="space-y-6 p-4 md:p-6"> <Skeleton className="h-12 w-full md:w-1/3 mb-4" /> <Skeleton className="h-24 w-full mb-6" /> <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6"> <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /> <Skeleton className="h-32 w-full" /> </div> <Skeleton className="h-96 w-full" /> </div> ); }
  if (!currentUserId) { return <Card className="m-4 md:m-6"><CardContent className="p-6 text-center text-muted-foreground">Please select a project.</CardContent></Card>; }
  if ((isLoadingRunDetails || isLoadingRunResults) && !!currentUserId) { return ( <div className="space-y-6 p-4 md:p-6"> <Skeleton className="h-12 w-full md:w-1/3 mb-4" /> <Skeleton className="h-24 w-full mb-6" /> <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6"> <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /> <Skeleton className="h-32 w-full" /> </div> <Skeleton className="h-96 w-full" /> </div> ); }
  if (fetchRunError || fetchRunResultsError) { return ( <Card className="shadow-lg m-4 md:m-6"> <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Run Details</CardTitle></CardHeader> <CardContent><p>{fetchRunError?.message || fetchRunResultsError?.message}</p><Link href="/runs"><Button variant="outline" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Runs</Button></Link></CardContent> </Card> ); }
  if (!runDetails || !effectiveRunDetails) { return ( <Card className="shadow-lg m-4 md:m-6"> <CardHeader><CardTitle className="flex items-center"><AlertTriangle className="mr-2 h-6 w-6 text-destructive"/>Run Not Found</CardTitle></CardHeader> <CardContent><p>Run with ID "{runId}" not found.</p><Link href="/runs"><Button variant="outline" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Runs</Button></Link></CardContent> </Card> ); }

  const pageJSX = (
    <div className="space-y-6 p-4 md:p-0">
      <RunHeaderCard
        runDetails={effectiveRunDetails}
        isPreviewDataLoading={isPreviewDataLoading}
        canFetchData={canFetchData}
        isRunTerminal={isRunTerminal}
        canStartLLMTask={canStartLLMTask}
        isLoadingEvalParamsForLLMHook={isLoadingEvalParamsForLLMHook}
        isLoadingSummarizationDefsForLLMHook={isLoadingSummarizationDefsForLLMHook}
        canSuggestImprovements={canSuggestImprovements}
        onFetchAndPreviewData={handleFetchAndPreviewData}
        onSimulateRunExecution={simulateRunExecution}
        onSuggestImprovementsClick={handleSuggestImprovementsClick}
        isLoadingSuggestion={isLoadingSuggestion}
        formatTimestamp={formatTimestamp}
        getStatusBadge={getStatusBadge}
        onShowFullPromptClick={() => setIsFullPromptDialogVisible(true)} 
        canShowFullPrompt={!!effectiveRunDetails.firstRowFullPrompt} 
        isLoadingPromptTemplate={isLoadingPromptTemplate}
      />

      {showProgressArea && (
        <RunProgressAndLogs
            runDetails={effectiveRunDetails}
            isPreviewDataLoading={isPreviewDataLoading}
            isLoadingEvalParamsForLLMHook={isLoadingEvalParamsForLLMHook}
            isLoadingSummarizationDefsForLLMHook={isLoadingSummarizationDefsForLLMHook}
            simulationLog={simulationLog}
            previewDataError={previewDataError}
        />
      )}
      
      <Tabs defaultValue="results">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-4">
          <TabsTrigger value="results"><FileSearch className="mr-2 h-4 w-4" />Results</TabsTrigger>
          <TabsTrigger value="metrics"><BarChart3 className="mr-2 h-4 w-4" />Metrics Breakdown</TabsTrigger>
          <TabsTrigger value="preview"><Database className="mr-2 h-4 w-4" />Dataset Preview</TabsTrigger>
          <TabsTrigger value="config"><Cog className="mr-2 h-4 w-4" />Run Configuration</TabsTrigger>
        </TabsList>
        
        <TabsContent value="results">
          <ResultsTableTab
            runDetails={effectiveRunDetails}
            filteredResultsToDisplay={filteredResultsToDisplay}
            evalParamDetailsForLLM={evalParamDetailsForLLM}
            summarizationDefDetailsForLLM={summarizationDefDetailsForLLM}
            filterStates={filterStates}
            onFilterChange={handleFilterChange}
            onOpenQuestionDialog={handleOpenQuestionDialog}
            onDownloadResults={handleDownloadResults}
            canDownloadResults={canDownloadResults}
            promptTemplateText={promptTemplateTextForRun}
          />
        </TabsContent>
        <TabsContent value="metrics">
          <MetricsBreakdownTab runDetails={effectiveRunDetails} metricsBreakdownData={metricsBreakdownData} />
        </TabsContent>
         <TabsContent value="preview">
           <DatasetSampleTable displayedPreviewData={displayedPreviewData} previewTableHeaders={previewTableHeaders} runDetails={effectiveRunDetails} />
        </TabsContent>
        <TabsContent value="config">
          <RunConfigTab
            runDetails={effectiveRunDetails}
            evalParamDetailsForLLM={evalParamDetailsForLLM}
            summarizationDefDetailsForLLM={summarizationDefDetailsForLLM}
            selectedContextDocDetails={selectedContextDocDetails}
            isLoadingSelectedContextDocs={isLoadingSelectedContextDocs}
          />
        </TabsContent>
      </Tabs>

      <ImprovementSuggestionDialog
        isOpen={isSuggestionDialogOpen}
        onOpenChange={setIsSuggestionDialogOpen}
        isLoading={isLoadingSuggestion}
        error={suggestionError}
        result={suggestionResult}
      />
      <QuestionJudgmentDialog
        isOpen={isQuestionDialogVisible}
        onOpenChange={setIsQuestionDialogVisible}
        itemData={questioningItemData}
        userQuestion={userQuestionText}
        onUserQuestionChange={setUserQuestionText}
        analysisResult={judgmentAnalysisResult}
        isAnalyzing={isAnalyzingJudgment}
        analysisError={judgmentAnalysisError}
        onSubmitAnalysis={handleSubmitQuestionAnalysis}
        runDetails={effectiveRunDetails}
      />
       {isFullPromptDialogVisible && (
        <Dialog open={isFullPromptDialogVisible} onOpenChange={setIsFullPromptDialogVisible}>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
                    <DialogTitle className="flex items-center"><FileTextIcon className="mr-2 h-5 w-5 text-primary" />Full Prompt for First Row</DialogTitle>
                    <DialogDescription>
                        This is the complete prompt that was sent to the Judge LLM for the first row of your dataset,
                        including filled input parameters and appended evaluation/summarization criteria.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow min-h-0 overflow-y-auto px-6 py-4">
                   <div className="border rounded-md bg-muted/10 p-4">
                       <pre className="text-xs whitespace-pre-wrap">
                           {effectiveRunDetails.firstRowFullPrompt || (isLoadingPromptTemplate && !effectiveRunDetails.firstRowFullPrompt ? "Loading prompt template..." : "Prompt for the first row was not saved or is not available for this run.")}
                       </pre>
                   </div>
                </div>
                <DialogFooter className="p-6 pt-4 border-t mt-auto flex-shrink-0">
                    <Button onClick={() => setIsFullPromptDialogVisible(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}
    </div>
  );
  return pageJSX;
}
