
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, AlertTriangle, Loader2, ArrowLeft, CheckCircle, XCircle, Clock, Zap, DatabaseZap, Wand2, MessageSquareQuote, Filter as FilterIcon, FileSearch } from "lucide-react";
import { Skeleton } from '@/components/ui/skeleton';

import { db, storage } from '@/lib/firebase';
import { doc, getDoc, getDocs, updateDoc, Timestamp, type DocumentData, collection, writeBatch, serverTimestamp, type FieldValue, query, orderBy } from 'firebase/firestore';
import { ref as storageRef, getBlob } from 'firebase/storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { judgeLlmEvaluation, type JudgeLlmEvaluationInput } from '@/ai/flows/judge-llm-evaluation-flow';
import { suggestRecursivePromptImprovements, type SuggestRecursivePromptImprovementsInput, type SuggestRecursivePromptImprovementsOutput, type MismatchDetail } from '@/ai/flows/suggest-recursive-prompt-improvements';
import { analyzeJudgmentDiscrepancy, type AnalyzeJudgmentDiscrepancyInput, type AnalyzeJudgmentDiscrepancyOutput } from '@/ai/flows/analyze-judgment-discrepancy';
import * as XLSX from 'xlsx';

import { RunHeaderCard } from '@/components/run-details/RunHeaderCard';
import { RunProgressAndLogs } from '@/components/run-details/RunProgressAndLogs';
import { RunSummaryCards } from '@/components/run-details/RunSummaryCards';
import { DatasetSampleTable } from '@/components/run-details/DatasetSampleTable';
import { RunConfigTab } from '@/components/run-details/RunConfigTab';
import { ResultsTableTab } from '@/components/run-details/ResultsTableTab';
import { MetricsBreakdownTab } from '@/components/run-details/MetricsBreakdownTab';
import { ImprovementSuggestionDialog } from '@/components/run-details/ImprovementSuggestionDialog';
import { QuestionJudgmentDialog } from '@/components/run-details/QuestionJudgmentDialog';
import { Badge } from '@/components/ui/badge';


// Interfaces - Exported for use in child components
export interface EvalRunResultItem {
  inputData: Record<string, any>;
  judgeLlmOutput: Record<string, { chosenLabel?: string; generatedSummary?: string; rationale?: string; error?: string }>;
  groundTruth?: Record<string, string>;
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
  runOnNRows: number;
  concurrencyLimit?: number;
  progress?: number;
  results?: EvalRunResultItem[];
  previewedDatasetSample?: Array<Record<string, any>>;
  summaryMetrics?: Record<string, any>;
  errorMessage?: string;
  userId?: string;
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


export interface ParameterChartData {
  parameterId: string;
  parameterName: string;
  data: Array<{ labelName: string; count: number }>;
  accuracy?: number;
  totalCompared?: number;
}

export interface ProductParameterForSchema {
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

export interface QuestioningItemContext {
    rowIndex: number;
    inputData: Record<string, any>;
    paramId: string;
    paramName: string;
    paramDefinition: string;
    paramLabels: EvalParamLabelForAnalysis[];
    judgeLlmOutput: { chosenLabel: string; rationale?: string; error?: string };
    groundTruthLabel?: string;
}

// Type for filter states
export type FilterValueMatchMismatch = 'all' | 'match' | 'mismatch';
export type FilterValueSelectedLabel = string | 'all';
export interface ParamFilterState {
  matchMismatch: FilterValueMatchMismatch;
  selectedLabel: FilterValueSelectedLabel;
}
export type AllFilterStates = Record<string, ParamFilterState>;


const MAX_ROWS_FOR_PROCESSING: number = 200;

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

const fetchEvalRunDetails = async (userId: string | null, runId: string): Promise<EvalRun | null> => {
  if (!userId) return null;
  const runDocRef = doc(db, 'users', userId, 'evaluationRuns', runId);
  const runDocSnap = await getDoc(runDocRef);
  if (runDocSnap.exists()) {
    return { id: runDocSnap.id, ...runDocSnap.data() } as EvalRun;
  }
  return null;
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
  return versionDocSnap.exists() ? (versionDocSnap.data()?.template as string) : null;
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
         console.warn(`Evaluation parameter with ID ${paramId} not found for user ${userId}.`);
    }
  }
  return details;
};

const fetchSummarizationDefDetailsForPrompt = async (userId: string | null, defIds: string[]): Promise<SummarizationDefDetailForPrompt[]> => {
    if (!userId || !defIds || defIds.length === 0) return [];
    const details: SummarizationDefDetailForPrompt[] = [];
    const defsCollectionRef = collection(db, 'users', userId, 'summarizationDefinitions');
    for (const defId of defIds) {
        const defDocRef = doc(defsCollectionRef, defId);
        const defDocSnap = await getDoc(defDocRef);
        if (defDocSnap.exists()) {
            const data = defDocSnap.data();
            details.push({ id: defDocSnap.id, name: data.name, definition: data.definition, example: data.example });
        } else {
            console.warn(`Summarization definition with ID ${defId} not found for user ${userId}.`);
        }
    }
    return details;
};

const fetchProductParametersForSchema = async (userId: string | null): Promise<ProductParameterForSchema[]> => {
  if (!userId) return [];
  const paramsCollectionRef = collection(db, 'users', userId, 'productParameters');
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
    } as ProductParameterForSchema;
  });
};

const fetchContextDocumentDetailsForRun = async (userId: string | null, docIds: string[]): Promise<ContextDocumentDisplayDetail[]> => {
    if (!userId || !docIds || docIds.length === 0) return [];
    const details: ContextDocumentDisplayDetail[] = [];
    const contextDocsCollectionRef = collection(db, 'users', userId, 'contextDocuments');
    for (const docId of docIds) {
        const docRef = doc(contextDocsCollectionRef, docId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            details.push({ id: docSnap.id, name: data.name, fileName: data.fileName });
        } else {
            console.warn(`Context document with ID ${docId} not found for user ${userId}.`);
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

  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    setCurrentUserId(storedUserId || null);
    setIsLoadingUserId(false);
  }, []);

  const addLog = (message: string, type: 'info' | 'error' = 'info'): void => {
    const logEntry = `${new Date().toLocaleTimeString()}: ${type === 'error' ? 'ERROR: ' : ''}${message}`;
    if (type === 'error') { console.error(logEntry); } else { console.log(logEntry); }
    setSimulationLog(prev => [...prev, logEntry].slice(-100));
  };

  const { data: runDetails, isLoading: isLoadingRunDetails, error: fetchRunError, refetch: refetchRunDetails } = useQuery<EvalRun | null, Error>({
    queryKey: ['evalRunDetails', currentUserId, runId],
    queryFn: () => fetchEvalRunDetails(currentUserId, runId),
    enabled: !!currentUserId && !!runId && !isLoadingUserId,
    refetchInterval: (query) => { const data = query.state.data as EvalRun | null; return (data?.status === 'Running' || data?.status === 'Processing') ? 5000 : false; },
  });

  const { data: evalParamDetailsForLLM = [], isLoading: isLoadingEvalParamsForLLMHook } = useQuery<EvalParamDetailForPrompt[], Error>({
    queryKey: ['evalParamDetailsForLLM', currentUserId, runDetails?.selectedEvalParamIds?.join(',')],
    queryFn: async () => {
      if (!currentUserId || !runDetails?.selectedEvalParamIds || runDetails.selectedEvalParamIds.length === 0) return [];
      addLog("Fetching evaluation parameter details for LLM/UI...");
      const details = await fetchEvaluationParameterDetailsForPrompt(currentUserId, runDetails.selectedEvalParamIds);
      addLog(`Fetched ${details.length} evaluation parameter details.`);
      return details;
    },
    enabled: !!currentUserId && !!runDetails?.selectedEvalParamIds && runDetails.selectedEvalParamIds.length > 0,
    staleTime: Infinity,
  });

  const { data: summarizationDefDetailsForLLM = [], isLoading: isLoadingSummarizationDefsForLLMHook } = useQuery<SummarizationDefDetailForPrompt[], Error>({
    queryKey: ['summarizationDefDetailsForLLM', currentUserId, runDetails?.selectedSummarizationDefIds?.join(',')],
    queryFn: async () => {
        if (!currentUserId || !runDetails?.selectedSummarizationDefIds || runDetails.selectedSummarizationDefIds.length === 0) return [];
        addLog("Fetching summarization definition details for LLM/UI...");
        const details = await fetchSummarizationDefDetailsForPrompt(currentUserId, runDetails.selectedSummarizationDefIds);
        addLog(`Fetched ${details.length} summarization definition details.`);
        return details;
    },
    enabled: !!currentUserId && !!runDetails?.selectedSummarizationDefIds && runDetails.selectedSummarizationDefIds.length > 0,
    staleTime: Infinity,
  });

  useEffect(() => {
    const hasEvalParams = evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0;
    if (hasEvalParams) {
      const newInitialFilters: AllFilterStates = {};
      evalParamDetailsForLLM.forEach(param => {
        newInitialFilters[param.id] = { matchMismatch: 'all', selectedLabel: 'all' };
      });
      if (JSON.stringify(filterStates) !== JSON.stringify(newInitialFilters)) {
        setFilterStates(newInitialFilters);
      }
    } else if (!hasEvalParams) {
      if (Object.keys(filterStates).length > 0) {
        setFilterStates({});
      }
    }
  }, [evalParamDetailsForLLM, runDetails?.runType]);


  const { data: selectedContextDocDetails = [], isLoading: isLoadingSelectedContextDocs } = useQuery<ContextDocumentDisplayDetail[], Error>({
    queryKey: ['selectedContextDocDetails', currentUserId, runDetails?.selectedContextDocumentIds?.join(',')],
    queryFn: () => { if (!currentUserId || !runDetails?.selectedContextDocumentIds || runDetails.selectedContextDocumentIds.length === 0) return []; return fetchContextDocumentDetailsForRun(currentUserId, runDetails.selectedContextDocumentIds); },
    enabled: !!currentUserId && !!runDetails?.selectedContextDocumentIds && runDetails.selectedContextDocumentIds.length > 0,
    staleTime: Infinity,
  });

  const updateRunMutation = useMutation<void, Error, Partial<Omit<EvalRun, 'updatedAt' | 'completedAt'>> & { id: string; updatedAt?: FieldValue; completedAt?: FieldValue } >({
    mutationFn: async (updatePayload) => {
      if (!currentUserId) throw new Error("User not identified.");
      const { id, ...dataFromPayload } = updatePayload; const updateForFirestore: Record<string, any> = {};
      for (const key in dataFromPayload) { if (Object.prototype.hasOwnProperty.call(dataFromPayload, key)) { const value = (dataFromPayload as any)[key]; if (value !== undefined) { updateForFirestore[key] = value; } } }
      updateForFirestore.updatedAt = serverTimestamp(); if (updatePayload.completedAt) { updateForFirestore.completedAt = updatePayload.completedAt; }
      const runDocRef = doc(db, 'users', currentUserId, 'evaluationRuns', id); await updateDoc(runDocRef, updateForFirestore);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['evalRunDetails', currentUserId, runId] }); queryClient.invalidateQueries({ queryKey: ['evalRuns', currentUserId] }); },
    onError: (error) => { toast({ title: "Error updating run", description: error.message, variant: "destructive" }); if(runDetails?.status === 'Processing' || runDetails?.status === 'Running') { const errorUpdatePayload: Partial<EvalRun> & { id: string } = { id: runId, status: 'Failed', errorMessage: `Update during run failed: ${error.message}` }; if (errorUpdatePayload.errorMessage === undefined) { errorUpdatePayload.errorMessage = "Undefined error occurred during update."; } updateRunMutation.mutate(errorUpdatePayload as any); } if(isPreviewDataLoading) setIsPreviewDataLoading(false); }
  });

  useEffect(() => {
    if (runDetails?.results && runDetails.results.length > 0 && evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0) {
      const newComputedMetrics: ParameterChartData[] = evalParamDetailsForLLM.map(paramDetail => {
        const labelCounts: Record<string, number> = {}; if (paramDetail.labels && Array.isArray(paramDetail.labels)) { paramDetail.labels.forEach(label => { if (label && typeof label.name === 'string') labelCounts[label.name] = 0; }); }
        labelCounts['ERROR_PROCESSING_ROW'] = 0; let correctCountForParam = 0; let totalComparedForParam = 0;
        runDetails.results!.forEach(resultItem => { if (resultItem.judgeLlmOutput && typeof resultItem.judgeLlmOutput === 'object') { const llmOutputForParam = resultItem.judgeLlmOutput[paramDetail.id]; if (llmOutputForParam?.chosenLabel && typeof llmOutputForParam.chosenLabel === 'string') { const chosenLabel = llmOutputForParam.chosenLabel; labelCounts[chosenLabel] = (labelCounts[chosenLabel] || 0) + 1; if (runDetails.runType === 'GroundTruth' && resultItem.groundTruth && !llmOutputForParam.error) { const gtLabel = resultItem.groundTruth[paramDetail.id]; if (gtLabel !== undefined && gtLabel !== null && String(gtLabel).trim() !== '') { totalComparedForParam++; if (String(chosenLabel).trim().toLowerCase() === String(gtLabel).trim().toLowerCase()) { correctCountForParam++; } } } } else if (llmOutputForParam?.error) { labelCounts['ERROR_PROCESSING_ROW'] = (labelCounts['ERROR_PROCESSING_ROW'] || 0) + 1; } } });
        const chartDataEntries = Object.entries(labelCounts).map(([labelName, count]) => ({ labelName, count })).filter(item => item.count > 0 || (paramDetail.labels && paramDetail.labels.some(l => l.name === item.labelName)) || item.labelName === 'ERROR_PROCESSING_ROW');
        const paramAccuracy = runDetails.runType === 'GroundTruth' && totalComparedForParam > 0 ? (correctCountForParam / totalComparedForParam) * 100 : undefined;
        return { parameterId: paramDetail.id, parameterName: paramDetail.name, data: chartDataEntries.sort((a, b) => b.count - a.count), accuracy: paramAccuracy, totalCompared: runDetails.runType === 'GroundTruth' ? totalComparedForParam : undefined, };
      });
      if (JSON.stringify(newComputedMetrics) !== JSON.stringify(metricsBreakdownData)) { setMetricsBreakdownData(newComputedMetrics); }
    } else { if (metricsBreakdownData.length > 0) { setMetricsBreakdownData([]); } }
  }, [runDetails, evalParamDetailsForLLM, metricsBreakdownData]);

  const handleFetchAndPreviewData = async (): Promise<void> => {
    if (!runDetails || !currentUserId || !runDetails.datasetId || !runDetails.datasetVersionId) { toast({ title: "Configuration Missing", description: "Dataset or version ID missing.", variant: "destructive" }); return; }
    setIsPreviewDataLoading(true); setPreviewDataError(null); setSimulationLog([]); addLog("Data Preview: Start.");
    try {
        addLog("Data Preview: Fetching dataset version config..."); const versionConfig = await fetchDatasetVersionConfig(currentUserId, runDetails.datasetId, runDetails.datasetVersionId);
        if (!versionConfig || !versionConfig.storagePath || !versionConfig.columnMapping || Object.keys(versionConfig.columnMapping).length === 0) { throw new Error("Dataset version config (storage path or product column mapping) incomplete."); }
        addLog(`Data Preview: Storage path: ${versionConfig.storagePath}`); addLog(`Data Preview: Product Column mapping: ${JSON.stringify(versionConfig.columnMapping)}`); if (versionConfig.groundTruthMapping && Object.keys(versionConfig.groundTruthMapping).length > 0) { addLog(`Data Preview: Ground Truth Mapping: ${JSON.stringify(versionConfig.groundTruthMapping)}`); } else if (runDetails.runType === 'GroundTruth') { addLog(`Data Preview: Warning: GT Run, but no GT mapping.`); } if (versionConfig.selectedSheetName) addLog(`Data Preview: Selected sheet: ${versionConfig.selectedSheetName}`);
        addLog("Data Preview: Downloading dataset file..."); const fileRef = storageRef(storage, versionConfig.storagePath); const blob = await getBlob(fileRef); addLog(`Data Preview: File downloaded (${(blob.size / (1024*1024)).toFixed(2)} MB). Parsing...`);
        let parsedRows: Array<Record<string, any>> = []; const fileName = versionConfig.storagePath.split('/').pop()?.toLowerCase() || '';
        if (fileName.endsWith('.xlsx')) { const arrayBuffer = await blob.arrayBuffer(); const workbook = XLSX.read(arrayBuffer, { type: 'array' }); const sheetName = versionConfig.selectedSheetName || workbook.SheetNames[0]; if (!sheetName || !workbook.Sheets[sheetName]) { throw new Error(`Sheet "${sheetName || 'default'}" not found.`); } parsedRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" }); addLog(`Data Preview: Parsed ${parsedRows.length} rows from Excel sheet "${sheetName}".`);
        } else if (fileName.endsWith('.csv')) { const text = await blob.text(); const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== ''); if (lines.length < 1) throw new Error("CSV file empty or no header."); const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim()); for (let i = 1; i < lines.length; i++) { const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim()); const rowObject: Record<string, any> = {}; headers.forEach((header, index) => { rowObject[header] = values[index] || ""; }); parsedRows.push(rowObject); } addLog(`Data Preview: Parsed ${parsedRows.length} rows from CSV.`);
        } else { throw new Error("Unsupported file type for preview."); }
        if (parsedRows.length === 0) { addLog("Data Preview: No data rows found."); updateRunMutation.mutate({ id: runId, previewedDatasetSample: [], status: 'DataPreviewed', results: [] }); toast({ title: "No Data", description: "Parsed file contained no data rows." }); setIsPreviewDataLoading(false); return; }
        let rowsToAttemptFromConfig: number; if (runDetails.runOnNRows > 0) { rowsToAttemptFromConfig = Math.min(runDetails.runOnNRows, parsedRows.length); } else { rowsToAttemptFromConfig = parsedRows.length; }
        const actualRowsToProcessAndStore = Math.min(rowsToAttemptFromConfig, MAX_ROWS_FOR_PROCESSING); const dataSliceForStorage = parsedRows.slice(0, actualRowsToProcessAndStore);
        if (rowsToAttemptFromConfig > MAX_ROWS_FOR_PROCESSING && runDetails.runOnNRows !== 0) { addLog(`Data Preview: Requested ${rowsToAttemptFromConfig}, capped at ${MAX_ROWS_FOR_PROCESSING}.`); } else if (rowsToAttemptFromConfig > MAX_ROWS_FOR_PROCESSING && runDetails.runOnNRows === 0) { addLog(`Data Preview: "All rows" (${rowsToAttemptFromConfig}), capped at ${MAX_ROWS_FOR_PROCESSING}.`); }
        addLog(`Data Preview: Preparing ${dataSliceForStorage.length} rows for processing.`); const sampleForStorage: Array<Record<string, any>> = []; const productParamToOriginalColMap = versionConfig.columnMapping; const evalParamIdToGtColMap = versionConfig.groundTruthMapping || {};
        dataSliceForStorage.forEach((originalRow, index) => { const mappedRowForStorage: Record<string, any> = {}; let rowHasAnyMappedData = false; const normalizedOriginalRowKeys: Record<string, string> = {}; Object.keys(originalRow).forEach(key => { normalizedOriginalRowKeys[String(key).trim().toLowerCase()] = key; });
            for (const productParamName in productParamToOriginalColMap) { const mappedOriginalColName = productParamToOriginalColMap[productParamName]; const normalizedMappedOriginalColName = String(mappedOriginalColName).trim().toLowerCase(); const actualKeyInOriginalRow = normalizedOriginalRowKeys[normalizedMappedOriginalColName]; if (actualKeyInOriginalRow !== undefined) { mappedRowForStorage[productParamName] = originalRow[actualKeyInOriginalRow]; rowHasAnyMappedData = true; } else { mappedRowForStorage[productParamName] = undefined; addLog(`Data Preview: Warn: Row ${index + 1} missing PRODUCT col "${mappedOriginalColName}" for "${productParamName}".`); } }
            if (runDetails.runType === 'GroundTruth') { for (const evalParamId in evalParamIdToGtColMap) { const mappedGtColName = evalParamIdToGtColMap[evalParamId]; const normalizedMappedGtColName = String(mappedGtColName).trim().toLowerCase(); const actualKeyInOriginalRowForGt = normalizedOriginalRowKeys[normalizedMappedGtColName]; if (actualKeyInOriginalRowForGt !== undefined) { mappedRowForStorage[`_gt_${evalParamId}`] = originalRow[actualKeyInOriginalRowForGt]; rowHasAnyMappedData = true; } else { mappedRowForStorage[`_gt_${evalParamId}`] = undefined; addLog(`Data Preview: Warn: Row ${index + 1} missing GT col "${mappedGtColName}" for EVAL ID "${evalParamId}".`); } } }
            if(rowHasAnyMappedData) { sampleForStorage.push(mappedRowForStorage); } else { addLog(`Data Preview: Skipping row ${index + 1} as no mapped data.`); } });
        addLog(`Data Preview: Processed ${sampleForStorage.length} rows for storage.`); const sanitizedSample = sanitizeDataForFirestore(sampleForStorage);
        updateRunMutation.mutate({ id: runId, previewedDatasetSample: sanitizedSample, status: 'DataPreviewed', results: [] });
        toast({ title: "Data Preview Ready", description: `${sanitizedSample.length} rows fetched.`});
    } catch (error: any) { addLog(`Data Preview: Error: ${error.message}`, "error"); setPreviewDataError(error.message); toast({ title: "Preview Error", description: error.message, variant: "destructive" }); updateRunMutation.mutate({ id: runId, status: 'Failed', errorMessage: `Data preview failed: ${error.message}` });
    } finally { setIsPreviewDataLoading(false); }
  };

  const simulateRunExecution = async (): Promise<void> => {
    const hasEvalParams = evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0; const hasSummarizationDefs = summarizationDefDetailsForLLM && summarizationDefDetailsForLLM.length > 0;
    if (!runDetails || !currentUserId || !runDetails.promptId || !runDetails.promptVersionId || (!hasEvalParams && !hasSummarizationDefs) ) { const errorMsg = "Missing config or no eval/summarization params."; toast({ title: "Cannot start", description: errorMsg, variant: "destructive" }); addLog(errorMsg, "error"); return; }
    if (!runDetails.previewedDatasetSample || runDetails.previewedDatasetSample.length === 0) { toast({ title: "Cannot start", description: "No dataset sample.", variant: "destructive"}); addLog("Error: No previewed data.", "error"); return; }
    updateRunMutation.mutate({ id: runId, status: 'Processing', progress: 0, results: [] }); setSimulationLog([]); addLog("LLM task init."); let collectedResults: EvalRunResultItem[] = [];
    try {
      const promptTemplateText = await fetchPromptVersionText(currentUserId, runDetails.promptId, runDetails.promptVersionId); if (!promptTemplateText) throw new Error("Failed to fetch prompt template.");
      addLog(`Fetched prompt (v${runDetails.promptVersionNumber}).`); if(hasEvalParams) addLog(`Using ${evalParamDetailsForLLM.length} eval params.`); if(hasSummarizationDefs) addLog(`Using ${summarizationDefDetailsForLLM.length} summarization defs.`);
      if (runDetails.modelConnectorProvider === 'Anthropic' || runDetails.modelConnectorProvider === 'OpenAI') { addLog(`Using direct ${runDetails.modelConnectorProvider} client via config: ${runDetails.modelConnectorConfigString || 'N/A'}`); } else if(runDetails.modelIdentifierForGenkit) { addLog(`Using Genkit model: ${runDetails.modelIdentifierForGenkit}`); } else { addLog(`Warn: No Genkit model ID. Using Genkit default.`); }
      const datasetToProcess = runDetails.previewedDatasetSample; const rowsToProcess = datasetToProcess.length; const effectiveConcurrencyLimit = Math.max(1, runDetails.concurrencyLimit || 3); addLog(`Starting LLM tasks for ${rowsToProcess} rows with concurrency: ${effectiveConcurrencyLimit}.`);
      const parameterIdsRequiringRationale = hasEvalParams ? evalParamDetailsForLLM.filter(ep => ep.requiresRationale).map(ep => ep.id) : [];
      for (let batchStartIndex = 0; batchStartIndex < rowsToProcess; batchStartIndex += effectiveConcurrencyLimit) {
        const batchEndIndex = Math.min(batchStartIndex + effectiveConcurrencyLimit, rowsToProcess); const currentBatchRows = datasetToProcess.slice(batchStartIndex, batchEndIndex); addLog(`Batch: Rows ${batchStartIndex + 1}-${batchEndIndex}. Size: ${currentBatchRows.length}.`);
        const batchPromises = currentBatchRows.map(async (rawRowFromPreview, indexInBatch) => {
          const overallRowIndex = batchStartIndex + indexInBatch; const inputDataForRow: Record<string, any> = {}; const groundTruthDataForRow: Record<string, string> = {};
          for (const key in rawRowFromPreview) { if (key.startsWith('_gt_')) { groundTruthDataForRow[key.substring('_gt_'.length)] = String(rawRowFromPreview[key]); } else { inputDataForRow[key] = rawRowFromPreview[key]; } }
          let fullPromptForLLM = promptTemplateText; for (const productParamName in inputDataForRow) { fullPromptForLLM = fullPromptForLLM.replace(new RegExp(`{{${productParamName}}}`, 'g'), String(inputDataForRow[productParamName] === null || inputDataForRow[productParamName] === undefined ? "" : inputDataForRow[productParamName])); }
          let structuredCriteriaText = ""; if (hasEvalParams) { structuredCriteriaText += "\n\n--- EVALUATION CRITERIA (LABELING) ---\n"; evalParamDetailsForLLM.forEach(ep => { structuredCriteriaText += `Parameter ID: ${ep.id}\nParameter Name: ${ep.name}\nDefinition: ${ep.definition}\n`; if (ep.requiresRationale) structuredCriteriaText += `IMPORTANT: For this parameter (${ep.name}), you MUST include a 'rationale'.\n`; if (ep.labels && ep.labels.length > 0) { structuredCriteriaText += "Labels:\n"; ep.labels.forEach(label => { structuredCriteriaText += `  - "${label.name}": ${label.definition || 'No def.'} ${label.example ? `(e.g., "${label.example}")` : ''}\n`; }); } else { structuredCriteriaText += " (No specific labels)\n"; } structuredCriteriaText += "\n"; }); structuredCriteriaText += "--- END EVALUATION CRITERIA ---\n"; }
          if (hasSummarizationDefs) { structuredCriteriaText += "\n\n--- SUMMARIZATION TASKS ---\n"; summarizationDefDetailsForLLM.forEach(sd => { structuredCriteriaText += `Summarization Task ID: ${sd.id}\nTask Name: ${sd.name}\nDefinition: ${sd.definition}\n`; if (sd.example) structuredCriteriaText += `Example Hint: "${sd.example}"\n`; structuredCriteriaText += "Provide summary.\n\n"; }); structuredCriteriaText += "--- END SUMMARIZATION TASKS ---\n"; }
          fullPromptForLLM += structuredCriteriaText;
          const genkitInput: JudgeLlmEvaluationInput = { fullPromptText: fullPromptForLLM, evaluationParameterIds: hasEvalParams ? evalParamDetailsForLLM.map(ep => ep.id) : [], summarizationParameterIds: hasSummarizationDefs ? summarizationDefDetailsForLLM.map(sd => sd.id) : [], parameterIdsRequiringRationale: parameterIdsRequiringRationale, modelName: runDetails.modelIdentifierForGenkit || undefined, modelConnectorProvider: runDetails.modelConnectorProvider, modelConnectorConfigString: runDetails.modelConnectorConfigString, };
          const itemResultShell: any = { inputData: inputDataForRow, judgeLlmOutput: {}, originalIndex: overallRowIndex }; if (runDetails.runType === 'GroundTruth' && Object.keys(groundTruthDataForRow).length > 0) { itemResultShell.groundTruth = groundTruthDataForRow; }
          try { addLog(`Sending row ${overallRowIndex + 1} to Judge LLM (Provider: ${runDetails.modelConnectorProvider || 'Genkit Default'})...`); const judgeOutput = await judgeLlmEvaluation(genkitInput); addLog(`Row ${overallRowIndex + 1} responded.`); itemResultShell.judgeLlmOutput = judgeOutput;
          } catch(flowError: any) { addLog(`Error in Judge LLM flow for row ${overallRowIndex + 1}: ${flowError.message}`, "error"); const errorOutputForAllParams: Record<string, { chosenLabel?: string; generatedSummary?: string; error?: string }> = {}; runDetails.selectedEvalParamIds?.forEach(paramId => { errorOutputForAllParams[paramId] = { chosenLabel: 'ERROR_PROCESSING_ROW', error: flowError.message || 'Unknown LLM error.' }; }); runDetails.selectedSummarizationDefIds?.forEach(paramId => { errorOutputForAllParams[paramId] = { generatedSummary: 'ERROR: LLM processing error.', error: flowError.message || 'Unknown LLM error.' }; }); itemResultShell.judgeLlmOutput = errorOutputForAllParams; }
          return itemResultShell;
        });
        const settledBatchResults = await Promise.all(batchPromises); settledBatchResults.forEach(itemWithIndex => { const { originalIndex, ...resultItem } = itemWithIndex; collectedResults.push(resultItem as EvalRunResultItem); });
        addLog(`Batch ${batchStartIndex + 1}-${batchEndIndex} processed. ${settledBatchResults.length} results.`); const currentProgress = Math.round(((batchEndIndex) / rowsToProcess) * 100);
        updateRunMutation.mutate({ id: runId, progress: currentProgress, results: sanitizeDataForFirestore(collectedResults), status: (batchEndIndex) === rowsToProcess ? 'Completed' : 'Processing' });
      }
      addLog("LLM tasks complete."); updateRunMutation.mutate({ id: runId, status: 'Completed', results: sanitizeDataForFirestore(collectedResults), progress: 100, completedAt: serverTimestamp() }); toast({ title: "LLM Tasks Complete", description: `Run "${runDetails.name}" processed ${rowsToProcess} rows.` });
    } catch (error: any) { addLog(`Error during LLM tasks: ${error.message}`, "error"); console.error("LLM Task Error: ", error); toast({ title: "LLM Error", description: error.message, variant: "destructive" }); updateRunMutation.mutate({ id: runId, status: 'Failed', errorMessage: `LLM task failed: ${error.message}`, results: sanitizeDataForFirestore(collectedResults) }); }
  };

  const handleDownloadResults = (): void => {
    if (!runDetails || !runDetails.results || runDetails.results.length === 0 ) { toast({ title: "No Results", description: "No results to download.", variant: "destructive" }); return; }
    const dataForExcel: any[] = []; const inputDataKeys = new Set<string>(); runDetails.results.forEach(item => { Object.keys(item.inputData).forEach(key => inputDataKeys.add(key)); }); const sortedInputDataKeys = Array.from(inputDataKeys).sort();
    runDetails.results.forEach(item => { const row: Record<string, any> = {}; sortedInputDataKeys.forEach(key => { row[key] = item.inputData[key] !== undefined && item.inputData[key] !== null ? String(item.inputData[key]) : ''; });
      evalParamDetailsForLLM?.forEach(paramDetail => { const output = item.judgeLlmOutput[paramDetail.id]; row[`${paramDetail.name} - LLM Label`] = output?.chosenLabel || (output?.error ? 'ERROR' : 'N/A'); if (runDetails.runType === 'GroundTruth') { const gtValue = item.groundTruth ? item.groundTruth[paramDetail.id] : 'N/A'; row[`${paramDetail.name} - Ground Truth`] = gtValue !== undefined && gtValue !== null ? String(gtValue) : 'N/A'; const llmLabel = output?.chosenLabel; row[`${paramDetail.name} - Match`] = (llmLabel && gtValue !== 'N/A' && !output?.error && String(llmLabel).trim().toLowerCase() === String(gtValue).trim().toLowerCase()) ? 'Yes' : 'No'; } row[`${paramDetail.name} - LLM Rationale`] = output?.rationale || ''; if(output?.error) row[`${paramDetail.name} - LLM Error`] = output.error; });
      summarizationDefDetailsForLLM?.forEach(summDefDetail => { const output = item.judgeLlmOutput[summDefDetail.id]; row[`${summDefDetail.name} - LLM Summary`] = output?.generatedSummary || (output?.error ? 'ERROR' : 'N/A'); if(output?.error) row[`${summDefDetail.name} - LLM Error`] = output.error; });
      dataForExcel.push(row); });
    const worksheet = XLSX.utils.json_to_sheet(dataForExcel); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Eval Results"); const fileName = `eval_run_${runDetails.name.replace(/\s+/g, '_')}_${runDetails.id.substring(0,8)}.xlsx`; XLSX.writeFile(workbook, fileName); toast({ title: "Download Started", description: `Results downloading as ${fileName}.` });
  };

  const { data: productParametersForSchema = [] } = useQuery<ProductParameterForSchema[], Error>({ queryKey: ['productParametersForSchema', currentUserId], queryFn: () => fetchProductParametersForSchema(currentUserId), enabled: !!currentUserId && (isSuggestionDialogOpen || isQuestionDialogVisible) });

  const handleSuggestImprovementsClick = async (): Promise<void> => {
    if (!runDetails || !currentUserId || !runDetails.promptId || !runDetails.promptVersionId || !evalParamDetailsForLLM || evalParamDetailsForLLM.length === 0 || !runDetails.results) { toast({ title: "Cannot Suggest", description: "Missing data for Ground Truth comparison.", variant: "destructive" }); return; }
    setIsLoadingSuggestion(true); setSuggestionError(null); setSuggestionResult(null); setIsSuggestionDialogOpen(true);
    try {
      const originalPromptTemplate = await fetchPromptVersionText(currentUserId, runDetails.promptId, runDetails.promptVersionId); if (!originalPromptTemplate) throw new Error("Failed to fetch original prompt.");
      const mismatchDetails: MismatchDetail[] = []; runDetails.results.forEach(item => { evalParamDetailsForLLM.forEach(paramDetail => { const llmOutput = item.judgeLlmOutput[paramDetail.id]; const gtLabel = item.groundTruth ? item.groundTruth[paramDetail.id] : undefined; if (gtLabel !== undefined && llmOutput && llmOutput.chosenLabel && !llmOutput.error && String(llmOutput.chosenLabel).trim().toLowerCase() !== String(gtLabel).trim().toLowerCase()) { mismatchDetails.push({ inputData: item.inputData, evaluationParameterName: paramDetail.name, evaluationParameterDefinition: paramDetail.definition, llmChosenLabel: llmOutput.chosenLabel, groundTruthLabel: gtLabel, llmRationale: llmOutput.rationale, }); } }); });
      if (mismatchDetails.length === 0) { setSuggestionError("No mismatches found."); setIsLoadingSuggestion(false); return; }
      const productParamsSchemaString = productParametersForSchema.length > 0 ? "Product Parameters:\n" + productParametersForSchema.map(p => `- ${p.name} (${p.type}): ${p.definition}${p.options ? ` Options: [${p.options.join(', ')}]` : ''}`).join("\n") : "No product params.";
      const evalParamsSchemaString = "Evaluation Parameters Used:\n" + evalParamDetailsForLLM.map(ep => { let schema = `- ID: ${ep.id}, Name: ${ep.name}\n  Definition: ${ep.definition}\n`; if (ep.requiresRationale) schema += `  (Requires Rationale)\n`; if (ep.labels && ep.labels.length > 0) { schema += `  Labels:\n` + ep.labels.map(l => `    - "${l.name}": ${l.definition} ${l.example ? `(e.g., "${l.example}")` : ''}`).join("\n"); } return schema; }).join("\n\n");
      const flowInput: SuggestRecursivePromptImprovementsInput = { originalPromptTemplate, mismatchDetails, productParametersSchema: productParamsSchemaString, evaluationParametersSchema: evalParamsSchemaString, };
      const result = await suggestRecursivePromptImprovements(flowInput); setSuggestionResult(result);
    } catch (error: any) { console.error("Error suggesting improvements:", error); setSuggestionError(error.message || "Failed to get suggestions."); } finally { setIsLoadingSuggestion(false); }
  };

  const handleOpenQuestionDialog = (item: EvalRunResultItem, paramId: string, rowIndex: number): void => {
    const paramDetail = evalParamDetailsForLLM.find(p => p.id === paramId); const outputData = item.judgeLlmOutput[paramId];
    if (!paramDetail || !outputData || typeof outputData.chosenLabel !== 'string') { console.error("Invalid data for question dialog.", paramDetail, outputData); toast({ title: "Internal Error", description: "Cannot open question dialog.", variant: "destructive" }); return; }
    setQuestioningItemData({ rowIndex, inputData: item.inputData, paramId: paramId, paramName: paramDetail.name, paramDefinition: paramDetail.definition, paramLabels: paramDetail.labels, judgeLlmOutput: { chosenLabel: outputData.chosenLabel, rationale: outputData.rationale, error: outputData.error, }, groundTruthLabel: item.groundTruth ? item.groundTruth[paramId] : undefined, });
    setUserQuestionText(''); setJudgmentAnalysisResult(null); setJudgmentAnalysisError(null); setIsQuestionDialogVisible(true);
  };

  const handleSubmitQuestionAnalysis = async (): Promise<void> => {
    if (!questioningItemData || !currentUserId || !runDetails?.promptId || !runDetails?.promptVersionId) { setJudgmentAnalysisError("Missing data for analysis."); return; }
    setIsAnalyzingJudgment(true); setJudgmentAnalysisError(null); setJudgmentAnalysisResult(null);
    try {
      const originalPromptTemplate = await fetchPromptVersionText(currentUserId, runDetails.promptId, runDetails.promptVersionId); if (!originalPromptTemplate) throw new Error("Failed to fetch original prompt.");
      const inputForFlow: AnalyzeJudgmentDiscrepancyInput = { inputData: questioningItemData.inputData, evaluationParameterName: questioningItemData.paramName, evaluationParameterDefinition: questioningItemData.paramDefinition, evaluationParameterLabels: questioningItemData.paramLabels, judgeLlmChosenLabel: questioningItemData.judgeLlmOutput.chosenLabel, judgeLlmRationale: questioningItemData.judgeLlmOutput.rationale, groundTruthLabel: questioningItemData.groundTruthLabel, userQuestion: userQuestionText, originalPromptTemplate: originalPromptTemplate, };
      const analysisOutput = await analyzeJudgmentDiscrepancy(inputForFlow); setJudgmentAnalysisResult(analysisOutput);
    } catch (error: any) { console.error("Error analyzing judgment:", error); setJudgmentAnalysisError(error.message || "Failed to get analysis."); } finally { setIsAnalyzingJudgment(false); }
  };

  const hasMismatches = useMemo((): boolean => { if (runDetails?.runType !== 'GroundTruth' || !runDetails.results || !evalParamDetailsForLLM) return false; return runDetails.results.some(item => evalParamDetailsForLLM.some(paramDetail => { const llmOutput = item.judgeLlmOutput[paramDetail.id]; const gtLabel = item.groundTruth ? item.groundTruth[paramDetail.id] : undefined; return gtLabel !== undefined && llmOutput && llmOutput.chosenLabel && !llmOutput?.error && String(llmOutput.chosenLabel).trim().toLowerCase() !== String(gtLabel).trim().toLowerCase(); }) ); }, [runDetails, evalParamDetailsForLLM]);

  const handleFilterChange = (paramId: string, filterType: 'matchMismatch' | 'label', value: FilterValueMatchMismatch | FilterValueSelectedLabel): void => {
    setFilterStates(prev => {
      const currentParamState = prev[paramId] || { matchMismatch: 'all', selectedLabel: 'all' };
      return {
        ...prev,
        [paramId]: {
          ...currentParamState,
          [filterType]: value,
        }
      };
    });
  };

  const filteredResultsToDisplay = useMemo((): EvalRunResultItem[] => {
    if (!runDetails?.results) return [];
    if (Object.keys(filterStates).length === 0 || !evalParamDetailsForLLM || evalParamDetailsForLLM.length === 0) {
      return runDetails.results;
    }
    return runDetails.results.filter(item => {
      for (const paramId in filterStates) {
        if (!evalParamDetailsForLLM.find(ep => ep.id === paramId)) continue;

        const currentParamFilters = filterStates[paramId];
        const llmOutput = item.judgeLlmOutput?.[paramId];

        // Match/Mismatch Filter
        if (runDetails.runType === 'GroundTruth' && currentParamFilters.matchMismatch !== 'all') {
          const gtDbValue = item.groundTruth?.[paramId];
          if (!llmOutput || typeof llmOutput.chosenLabel !== 'string' || gtDbValue === undefined || llmOutput.error) {
            return false; // If data is insufficient for match/mismatch, and filter is active, item fails the filter
          }
          const isMatch = String(llmOutput.chosenLabel).trim().toLowerCase() === String(gtDbValue).trim().toLowerCase();
          if (currentParamFilters.matchMismatch === 'match' && !isMatch) return false;
          if (currentParamFilters.matchMismatch === 'mismatch' && isMatch) return false;
        }

        // Label Filter
        if (currentParamFilters.selectedLabel !== 'all') {
          if (!llmOutput || typeof llmOutput.chosenLabel !== 'string' || llmOutput.error) {
            return false; // If no LLM label, it can't match a specific label filter
          }
          if (String(llmOutput.chosenLabel).trim().toLowerCase() !== String(currentParamFilters.selectedLabel).toLowerCase()) {
            return false;
          }
        }
      }
      return true;
    });
  }, [runDetails?.results, runDetails?.runType, filterStates, evalParamDetailsForLLM]);


  const displayedPreviewData: Array<Record<string, any>> = runDetails?.previewedDatasetSample || [];
  const previewTableHeaders: string[] = displayedPreviewData.length > 0 ? Object.keys(displayedPreviewData[0]).filter(k => !k.startsWith('_gt_')) : [];
  const isRunTerminal: boolean = runDetails?.status === 'Completed' || false;
  const canFetchData: boolean = runDetails?.status === 'Pending' || runDetails?.status === 'Failed' || runDetails?.status === 'DataPreviewed';
  const isRunReadyForProcessing_flag: boolean = runDetails?.status === 'DataPreviewed' || (runDetails?.status === 'Failed' && !!runDetails.previewedDatasetSample && runDetails.previewedDatasetSample.length > 0);
  const dependenciesLoadedForRunStart_flag: boolean = !isLoadingRunDetails && !isLoadingEvalParamsForLLMHook && !isLoadingSummarizationDefsForLLMHook;
  const hasParamsOrDefsForRunStart_flag: boolean = (evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0) || (summarizationDefDetailsForLLM && summarizationDefDetailsForLLM.length > 0);
  const canStartLLMTask: boolean = isRunReadyForProcessing_flag && dependenciesLoadedForRunStart_flag && hasParamsOrDefsForRunStart_flag;
  const hasResultsForDownload_flag: boolean = runDetails?.status === 'Completed' && runDetails.results && runDetails.results.length > 0;
  const canDownloadResults: boolean = hasResultsForDownload_flag;
  const canSuggestImprovements: boolean = runDetails?.status === 'Completed' && runDetails.runType === 'GroundTruth' && !!runDetails?.results && runDetails.results.length > 0 && hasMismatches && evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0;

  if (isLoadingUserId) { return ( <div className="space-y-6 p-4 md:p-6"> <Skeleton className="h-12 w-full md:w-1/3 mb-4" /> <Skeleton className="h-24 w-full mb-6" /> <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6"> <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /> <Skeleton className="h-32 w-full" /> </div> <Skeleton className="h-96 w-full" /> </div> ); }
  if (!currentUserId) { return <Card className="m-4 md:m-6"><CardContent className="p-6 text-center text-muted-foreground">Please log in.</CardContent></Card>; }
  if (isLoadingRunDetails && !!currentUserId) { return ( <div className="space-y-6 p-4 md:p-6"> <Skeleton className="h-12 w-full md:w-1/3 mb-4" /> <Skeleton className="h-24 w-full mb-6" /> <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6"> <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /> <Skeleton className="h-32 w-full" /> </div> <Skeleton className="h-96 w-full" /> </div> ); }
  if (fetchRunError) { return ( <Card className="shadow-lg m-4 md:m-6"> <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Run Details</CardTitle></CardHeader> <CardContent><p>{fetchRunError.message}</p><Link href="/runs"><Button variant="outline" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Runs</Button></Link></CardContent> </Card> ); }
  if (!runDetails) { return ( <Card className="shadow-lg m-4 md:m-6"> <CardHeader><CardTitle className="flex items-center"><AlertTriangle className="mr-2 h-6 w-6 text-destructive"/>Run Not Found</CardTitle></CardHeader> <CardContent><p>Run with ID "{runId}" not found.</p><Link href="/runs"><Button variant="outline" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Runs</Button></Link></CardContent> </Card> ); }

  const pageJSX = (
    <div className="space-y-6 p-4 md:p-6">
      <RunHeaderCard
        runDetails={runDetails}
        isPreviewDataLoading={isPreviewDataLoading}
        canFetchData={canFetchData}
        isRunTerminal={isRunTerminal}
        canStartLLMTask={canStartLLMTask}
        isLoadingEvalParamsForLLMHook={isLoadingEvalParamsForLLMHook}
        isLoadingSummarizationDefsForLLMHook={isLoadingSummarizationDefsForLLMHook}
        canSuggestImprovements={canSuggestImprovements}
        canDownloadResults={canDownloadResults}
        onFetchAndPreviewData={handleFetchAndPreviewData}
        onSimulateRunExecution={simulateRunExecution}
        onSuggestImprovementsClick={handleSuggestImprovementsClick}
        onDownloadResults={handleDownloadResults}
        isLoadingSuggestion={isLoadingSuggestion}
        formatTimestamp={formatTimestamp}
      />

      <RunProgressAndLogs
        runDetails={runDetails}
        isPreviewDataLoading={isPreviewDataLoading}
        isLoadingEvalParamsForLLMHook={isLoadingEvalParamsForLLMHook}
        isLoadingSummarizationDefsForLLMHook={isLoadingSummarizationDefsForLLMHook}
        simulationLog={simulationLog}
        previewDataError={previewDataError}
      />

      <RunSummaryCards runDetails={runDetails} getStatusBadge={getStatusBadge} />
      <DatasetSampleTable displayedPreviewData={displayedPreviewData} previewTableHeaders={previewTableHeaders} runDetails={runDetails} />

      <Tabs defaultValue="results_table">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 mb-4">
          <TabsTrigger value="config">Run Configuration</TabsTrigger>
          <TabsTrigger value="results_table">LLM Results Table</TabsTrigger>
          <TabsTrigger value="breakdown">Metrics Breakdown</TabsTrigger>
        </TabsList>
        <TabsContent value="config">
          <RunConfigTab
            runDetails={runDetails}
            evalParamDetailsForLLM={evalParamDetailsForLLM}
            summarizationDefDetailsForLLM={summarizationDefDetailsForLLM}
            selectedContextDocDetails={selectedContextDocDetails}
            isLoadingSelectedContextDocs={isLoadingSelectedContextDocs}
          />
        </TabsContent>
        <TabsContent value="results_table">
          <ResultsTableTab
            runDetails={runDetails}
            filteredResultsToDisplay={filteredResultsToDisplay}
            evalParamDetailsForLLM={evalParamDetailsForLLM}
            summarizationDefDetailsForLLM={summarizationDefDetailsForLLM}
            filterStates={filterStates}
            onFilterChange={handleFilterChange}
            onOpenQuestionDialog={handleOpenQuestionDialog}
          />
        </TabsContent>
        <TabsContent value="breakdown">
          <MetricsBreakdownTab runDetails={runDetails} metricsBreakdownData={metricsBreakdownData} />
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
        runDetails={runDetails}
      />
    </div>
  );
  return pageJSX;
}

