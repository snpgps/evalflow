
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Play, Settings, FileSearch, BarChartHorizontalBig, AlertTriangle, Loader2, ArrowLeft, CheckCircle, XCircle, Clock, Zap, DatabaseZap, MessageSquareText, Download, TestTube2, CheckCheck, Info, Wand2, Copy } from "lucide-react";
import { BarChart as RechartsBarChartElement, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar as RechartsBar, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc, Timestamp, type DocumentData, collection, writeBatch, serverTimestamp, type FieldValue, query, orderBy } from 'firebase/firestore';
import { ref as storageRef, getBlob } from 'firebase/storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { judgeLlmEvaluation, type JudgeLlmEvaluationInput, type JudgeLlmEvaluationOutput } from '@/ai/flows/judge-llm-evaluation-flow';
import { suggestRecursivePromptImprovements, type SuggestRecursivePromptImprovementsInput, type SuggestRecursivePromptImprovementsOutput, type MismatchDetail } from '@/ai/flows/suggest-recursive-prompt-improvements';
import * as XLSX from 'xlsx';

// Interfaces
interface EvalRunResultItem {
  inputData: Record<string, any>;
  judgeLlmOutput: Record<string, { chosenLabel: string; rationale?: string }>;
  groundTruth?: Record<string, string>;
}

interface EvalRun {
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
  promptId: string;
  promptName?: string;
  promptVersionId?: string;
  promptVersionNumber?: number;
  selectedEvalParamIds: string[];
  selectedEvalParamNames?: string[];
  runOnNRows: number;
  progress?: number;
  results?: EvalRunResultItem[];
  previewedDatasetSample?: Array<Record<string, any>>;
  summaryMetrics?: Record<string, any>;
  errorMessage?: string;
  userId?: string;
}

interface DatasetVersionConfig {
    storagePath?: string;
    columnMapping?: Record<string, string>;
    groundTruthMapping?: Record<string, string>;
    selectedSheetName?: string | null;
}

interface EvalParamDetailForPrompt {
  id: string;
  name: string;
  definition: string;
  labels: Array<{ name: string; definition?: string; example?: string }>;
  requiresRationale?: boolean;
}

interface ParameterChartData {
  parameterId: string;
  parameterName: string;
  data: Array<{ labelName: string; count: number }>;
  accuracy?: number;
  totalCompared?: number;
}

interface ProductParameterForSchema {
  id: string;
  name: string;
  type: string;
  definition: string;
  options?: string[];
}

const MAX_ROWS_FOR_PROCESSING = 200;


const fetchEvalRunDetails = async (userId: string, runId: string): Promise<EvalRun | null> => {
  const runDocRef = doc(db, 'users', userId, 'evaluationRuns', runId);
  const runDocSnap = await getDoc(runDocRef);
  if (runDocSnap.exists()) {
    return { id: runDocSnap.id, ...runDocSnap.data() } as EvalRun;
  }
  return null;
};

const fetchDatasetVersionConfig = async (userId: string, datasetId: string, versionId: string): Promise<DatasetVersionConfig | null> => {
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

const fetchPromptVersionText = async (userId: string, promptId: string, versionId: string): Promise<string | null> => {
  const versionDocRef = doc(db, 'users', userId, 'promptTemplates', promptId, 'versions', versionId);
  const versionDocSnap = await getDoc(versionDocRef);
  return versionDocSnap.exists() ? (versionDocSnap.data()?.template as string) : null;
};

const fetchEvaluationParameterDetailsForPrompt = async (userId: string, paramIds: string[]): Promise<EvalParamDetailForPrompt[]> => {
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

const fetchProductParametersForSchema = async (userId: string): Promise<ProductParameterForSchema[]> => {
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


export default function RunDetailsPage() {
  const reactParams = useParams();
  const runId = reactParams.runId as string;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  const [simulationLog, setSimulationLog] = useState<string[]>([]);
  const [isPreviewDataLoading, setIsPreviewDataLoading] = useState(false);
  const [previewDataError, setPreviewDataError] = useState<string | null>(null);
  const [isLoadingEvalParamDetails, setIsLoadingEvalParamDetails] = useState(false);
  const [metricsBreakdownData, setMetricsBreakdownData] = useState<ParameterChartData[]>([]);

  const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionResult, setSuggestionResult] = useState<SuggestRecursivePromptImprovementsOutput | null>(null);


  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    setCurrentUserId(storedUserId || null);
    setIsLoadingUserId(false);
  }, []);

  const addLog = (message: string, type: 'info' | 'error' = 'info') => {
    const logEntry = `${new Date().toLocaleTimeString()}: ${type === 'error' ? 'ERROR: ' : ''}${message}`;
    console[type === 'error' ? 'error' : 'log'](logEntry);
    setSimulationLog(prev => [...prev, logEntry].slice(-100));
  };

  const { data: runDetails, isLoading: isLoadingRunDetails, error: fetchRunError, refetch: refetchRunDetails } = useQuery<EvalRun | null, Error>({
    queryKey: ['evalRunDetails', currentUserId, runId],
    queryFn: () => fetchEvalRunDetails(currentUserId!, runId),
    enabled: !!currentUserId && !!runId && !isLoadingUserId,
    refetchInterval: (query) => {
      const data = query.state.data as EvalRun | null;
      return (data?.status === 'Running' || data?.status === 'Processing') ? 5000 : false;
    },
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

  const updateRunMutation = useMutation<void, Error, Partial<EvalRun> & { id: string; updatedAt?: FieldValue } >({
    mutationFn: async (updateData) => {
      if (!currentUserId) throw new Error("User not identified.");
      const { id, ...dataToUpdate } = updateData;
      const runDocRef = doc(db, 'users', currentUserId, 'evaluationRuns', id);
      await updateDoc(runDocRef, { ...dataToUpdate, updatedAt: serverTimestamp() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evalRunDetails', currentUserId, runId] });
      queryClient.invalidateQueries({ queryKey: ['evalRuns', currentUserId] });
    },
    onError: (error) => {
      toast({ title: "Error updating run", description: error.message, variant: "destructive" });
      if(runDetails?.status === 'Processing' || runDetails?.status === 'Running') {
         updateRunMutation.mutate({ id: runId, status: 'Failed', errorMessage: `Update during run failed: ${error.message}` });
      }
      if(isPreviewDataLoading) setIsPreviewDataLoading(false);
    }
  });

  useEffect(() => {
    if (runDetails?.results && runDetails.results.length > 0 && evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0) {
      const newMetricsBreakdownData: ParameterChartData[] = evalParamDetailsForLLM.map(paramDetail => {
        const labelCounts: Record<string, number> = {};
        if (paramDetail.labels && Array.isArray(paramDetail.labels)) {
          paramDetail.labels.forEach(label => {
            if (label && typeof label.name === 'string') labelCounts[label.name] = 0;
          });
        }

        let correctCountForParam = 0;
        let totalComparedForParam = 0;

        runDetails.results!.forEach(resultItem => {
          if (resultItem.judgeLlmOutput && typeof resultItem.judgeLlmOutput === 'object') {
              const llmOutputForParam = resultItem.judgeLlmOutput[paramDetail.id];
              if (llmOutputForParam?.chosenLabel && typeof llmOutputForParam.chosenLabel === 'string') {
                const chosenLabel = llmOutputForParam.chosenLabel;
                labelCounts[chosenLabel] = (labelCounts[chosenLabel] || 0) + 1;

                if (runDetails.runType === 'GroundTruth' && resultItem.groundTruth) {
                    const gtLabel = resultItem.groundTruth[paramDetail.id];
                    if (gtLabel !== undefined && gtLabel !== null && String(gtLabel).trim() !== '') {
                        totalComparedForParam++;
                        if (String(chosenLabel).toLowerCase() === String(gtLabel).toLowerCase()) {
                            correctCountForParam++;
                        }
                    }
                }
              }
          }
        });

        const chartDataEntries = Object.entries(labelCounts)
          .map(([labelName, count]) => ({ labelName, count }))
          .filter(item => item.count > 0 || (paramDetail.labels && paramDetail.labels.some(l => l.name === item.labelName)));

        const paramAccuracy = runDetails.runType === 'GroundTruth' && totalComparedForParam > 0
          ? (correctCountForParam / totalComparedForParam) * 100
          : undefined;

        return {
          parameterId: paramDetail.id,
          parameterName: paramDetail.name,
          data: chartDataEntries.sort((a, b) => b.count - a.count),
          accuracy: paramAccuracy,
          totalCompared: runDetails.runType === 'GroundTruth' ? totalComparedForParam : undefined,
        };
      });
      setMetricsBreakdownData(newMetricsBreakdownData);
    } else {
      setMetricsBreakdownData([]);
    }
  }, [runDetails, evalParamDetailsForLLM]);


  const handleFetchAndPreviewData = async () => {
    if (!runDetails || !currentUserId || !runDetails.datasetId || !runDetails.datasetVersionId) {
      toast({ title: "Configuration Missing", description: "Dataset or version ID missing for this run.", variant: "destructive" });
      return;
    }
    setIsPreviewDataLoading(true);
    setPreviewDataError(null);
    setSimulationLog([]);
    addLog("Data Preview: Process started.");

    try {
        addLog("Data Preview: Fetching dataset version configuration...");
        const versionConfig = await fetchDatasetVersionConfig(currentUserId, runDetails.datasetId, runDetails.datasetVersionId);
        if (!versionConfig || !versionConfig.storagePath || !versionConfig.columnMapping || Object.keys(versionConfig.columnMapping).length === 0) {
            throw new Error("Dataset version configuration (storage path or product column mapping) is incomplete or missing.");
        }
        addLog(`Data Preview: Storage path: ${versionConfig.storagePath}`);
        addLog(`Data Preview: Product Column mapping: ${JSON.stringify(versionConfig.columnMapping)}`);
        if (versionConfig.groundTruthMapping && Object.keys(versionConfig.groundTruthMapping).length > 0) {
          addLog(`Data Preview: Ground Truth Mapping: ${JSON.stringify(versionConfig.groundTruthMapping)}`);
        } else if (runDetails.runType === 'GroundTruth') {
          addLog(`Data Preview: Warning: Run type is Ground Truth, but no ground truth mapping found for this dataset version.`);
        }
        if (versionConfig.selectedSheetName) addLog(`Data Preview: Selected sheet: ${versionConfig.selectedSheetName}`);

        addLog("Data Preview: Downloading dataset file from storage...");
        const fileRef = storageRef(storage, versionConfig.storagePath);
        const blob = await getBlob(fileRef);
        addLog(`Data Preview: File downloaded (${(blob.size / (1024*1024)).toFixed(2)} MB). Parsing...`);

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
            addLog(`Data Preview: Parsed ${parsedRows.length} rows from Excel sheet "${sheetName}".`);
        } else if (fileName.endsWith('.csv')) {
            const text = await blob.text();
            const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
            if (lines.length < 1) throw new Error("CSV file is empty or has no header row.");

            const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
                const rowObject: Record<string, any> = {};
                headers.forEach((header, index) => { rowObject[header] = values[index] || ""; });
                parsedRows.push(rowObject);
            }
            addLog(`Data Preview: Parsed ${parsedRows.length} rows from CSV file.`);
        } else {
            throw new Error("Unsupported file type. Only .xlsx and .csv are supported for preview.");
        }

        if (parsedRows.length === 0) {
            addLog("Data Preview: No data rows found after parsing.");
            updateRunMutation.mutate({ id: runId, previewedDatasetSample: [], status: 'DataPreviewed', errorMessage: null, results: [] });
            toast({ title: "No Data", description: "The dataset file was parsed but contained no data rows." });
            setIsPreviewDataLoading(false);
            return;
        }

        let rowsToAttemptFromConfig: number;
        if (runDetails.runOnNRows > 0) {
            rowsToAttemptFromConfig = Math.min(runDetails.runOnNRows, parsedRows.length);
        } else { 
            rowsToAttemptFromConfig = parsedRows.length;
        }

        const actualRowsToProcessAndStore = Math.min(rowsToAttemptFromConfig, MAX_ROWS_FOR_PROCESSING);
        const dataSliceForStorage = parsedRows.slice(0, actualRowsToProcessAndStore);

        if (rowsToAttemptFromConfig > MAX_ROWS_FOR_PROCESSING && runDetails.runOnNRows !== 0) {
            addLog(`Data Preview: User requested ${rowsToAttemptFromConfig} rows, but processing is capped at ${MAX_ROWS_FOR_PROCESSING} rows by the system.`);
        } else if (rowsToAttemptFromConfig > MAX_ROWS_FOR_PROCESSING && runDetails.runOnNRows === 0) {
            addLog(`Data Preview: "All rows" selected (${rowsToAttemptFromConfig}), processing capped at ${MAX_ROWS_FOR_PROCESSING} rows by the system.`);
        }
        addLog(`Data Preview: Preparing ${dataSliceForStorage.length} rows for processing and storage (User N: ${runDetails.runOnNRows === 0 ? 'All' : runDetails.runOnNRows}, System Cap: ${MAX_ROWS_FOR_PROCESSING}).`);


        const sampleForStorage: Array<Record<string, any>> = [];
        const productParamToOriginalColMap = versionConfig.columnMapping;
        const evalParamIdToGtColMap = versionConfig.groundTruthMapping || {};

        dataSliceForStorage.forEach((originalRow, index) => {
            const mappedRowForStorage: Record<string, any> = {};
            let rowHasAnyMappedData = false;
            for (const productParamName in productParamToOriginalColMap) {
                const originalColName = productParamToOriginalColMap[productParamName];
                if (originalRow.hasOwnProperty(originalColName)) {
                    mappedRowForStorage[productParamName] = originalRow[originalColName];
                    rowHasAnyMappedData = true;
                } else {
                    mappedRowForStorage[productParamName] = undefined;
                    addLog(`Data Preview: Warning: Row ${index+1} missing original column "${originalColName}" for product parameter "${productParamName}".`);
                }
            }
            if (runDetails.runType === 'GroundTruth') {
              for (const evalParamId in evalParamIdToGtColMap) {
                  const gtColName = evalParamIdToGtColMap[evalParamId];
                  if (originalRow.hasOwnProperty(gtColName)) {
                      mappedRowForStorage[`_gt_${evalParamId}`] = originalRow[gtColName];
                      rowHasAnyMappedData = true;
                  } else {
                      mappedRowForStorage[`_gt_${evalParamId}`] = undefined;
                       addLog(`Data Preview: Warning: Row ${index+1} missing ground truth column "${gtColName}" for eval parameter ID "${evalParamId}".`);
                  }
              }
            }
            if(rowHasAnyMappedData) sampleForStorage.push(mappedRowForStorage);
            else addLog(`Data Preview: Skipping row ${index+1} as no mapped data (product or GT) was found for it.`)
        });

        addLog(`Data Preview: Successfully processed ${sampleForStorage.length} rows for preview storage.`);
        updateRunMutation.mutate({ id: runId, previewedDatasetSample: sampleForStorage, status: 'DataPreviewed', errorMessage: null, results: [] });
        toast({ title: "Data Preview Ready", description: `${sampleForStorage.length} rows fetched and mapped for processing.`});
    } catch (error: any) {
        addLog(`Data Preview: Error fetching/previewing data: ${error.message}`, "error");
        setPreviewDataError(error.message);
        toast({ title: "Preview Error", description: error.message, variant: "destructive" });
        updateRunMutation.mutate({ id: runId, status: 'Failed', errorMessage: `Data preview failed: ${error.message}` });
    } finally {
        setIsPreviewDataLoading(false);
    }
  };

  const simulateRunExecution = async () => {
    if (!runDetails || !currentUserId || !runDetails.promptId || !runDetails.promptVersionId || evalParamDetailsForLLM.length === 0) {
      const errorMsg = "Missing critical run configuration or evaluation parameter details.";
      toast({ title: "Cannot start LLM Categorization", description: errorMsg, variant: "destructive" });
      addLog(errorMsg, "error");
      return;
    }
    if (!runDetails.previewedDatasetSample || runDetails.previewedDatasetSample.length === 0) {
        toast({ title: "Cannot start LLM Categorization", description: "No dataset sample available. Please fetch and preview data first.", variant: "destructive"});
        addLog("Error: Attempted to start LLM categorization without previewed data.", "error");
        return;
    }

    updateRunMutation.mutate({ id: runId, status: 'Processing', progress: 0, errorMessage: null });
    addLog("LLM Categorization started using previewed data.");
    let collectedResults: EvalRunResultItem[] = runDetails.results || [];
    try {
      const promptTemplateText = await fetchPromptVersionText(currentUserId, runDetails.promptId, runDetails.promptVersionId);
      if (!promptTemplateText) throw new Error("Failed to fetch prompt template text.");
      addLog(`Fetched prompt template (v${runDetails.promptVersionNumber}).`);
      addLog(`Using ${evalParamDetailsForLLM.length} evaluation parameter details for LLM call.`);

      const datasetToProcess = runDetails.previewedDatasetSample;
      const rowsToProcess = datasetToProcess.length;
      addLog(`Starting LLM categorization for ${rowsToProcess} previewed rows.`);
      const parameterIdsRequiringRationale = evalParamDetailsForLLM.filter(ep => ep.requiresRationale).map(ep => ep.id);

      for (let i = 0; i < rowsToProcess; i++) {
        const rawRowFromPreview = datasetToProcess[i];
        const inputDataForRow: Record<string, any> = {};
        const groundTruthDataForRow: Record<string, string> = {};
        for (const key in rawRowFromPreview) {
          if (key.startsWith('_gt_')) {
            groundTruthDataForRow[key.substring('_gt_'.length)] = String(rawRowFromPreview[key]);
          } else {
            inputDataForRow[key] = rawRowFromPreview[key];
          }
        }
        addLog(`Processing row ${i + 1}/${rowsToProcess}: Inputs: ${JSON.stringify(inputDataForRow).substring(0,70)}... GT: ${JSON.stringify(groundTruthDataForRow).substring(0,50)}...`);

        let fullPromptForLLM = promptTemplateText;
        for (const productParamName in inputDataForRow) {
          fullPromptForLLM = fullPromptForLLM.replace(new RegExp(`{{${productParamName}}}`, 'g'), String(inputDataForRow[productParamName] === null || inputDataForRow[productParamName] === undefined ? "" : inputDataForRow[productParamName]));
        }
        let evalCriteriaText = "\n\n--- EVALUATION CRITERIA ---\n";
        evalParamDetailsForLLM.forEach(ep => {
          evalCriteriaText += `Parameter ID: ${ep.id}\nParameter Name: ${ep.name}\nDefinition: ${ep.definition}\n`;
          if (ep.requiresRationale) evalCriteriaText += `IMPORTANT: For this parameter (${ep.name}), when providing your evaluation, you MUST include a 'rationale' explaining your choice.\n`;
          if (ep.labels && ep.labels.length > 0) {
            evalCriteriaText += "Labels:\n";
            ep.labels.forEach(label => { evalCriteriaText += `  - "${label.name}": ${label.definition || 'No definition.'} ${label.example ? `(e.g., "${label.example}")` : ''}\n`; });
          } else { evalCriteriaText += " (No specific categorization labels defined for this parameter)\n"; }
          evalCriteriaText += "\n";
        });
        evalCriteriaText += "--- END EVALUATION CRITERIA ---\n";
        fullPromptForLLM += evalCriteriaText;

        const genkitInput: JudgeLlmEvaluationInput = { fullPromptText: fullPromptForLLM, evaluationParameterIds: evalParamDetailsForLLM.map(ep => ep.id), parameterIdsRequiringRationale: parameterIdsRequiringRationale };
        addLog(`Sending prompt for row ${i+1} to Genkit flow...`);
        const judgeOutput = await judgeLlmEvaluation(genkitInput);
        addLog(`Genkit flow for row ${i+1} responded: ${JSON.stringify(judgeOutput)}`);
        const resultItem: EvalRunResultItem = { inputData: inputDataForRow, judgeLlmOutput: judgeOutput };
        if (runDetails.runType === 'GroundTruth' && Object.keys(groundTruthDataForRow).length > 0) resultItem.groundTruth = groundTruthDataForRow;
        collectedResults.push(resultItem);
        const currentProgress = Math.round(((i + 1) / rowsToProcess) * 100);
        if ((i + 1) % Math.max(1, Math.floor(rowsToProcess / 10)) === 0 || (i+1) === rowsToProcess) {
            updateRunMutation.mutate({ id: runId, progress: currentProgress, results: [...collectedResults], status: (i+1) === rowsToProcess ? 'Completed' : 'Processing' });
        }
      }
      addLog("LLM Categorization completed for all previewed rows.");
      updateRunMutation.mutate({ id: runId, status: 'Completed', results: collectedResults, progress: 100, completedAt: serverTimestamp() });
      toast({ title: "LLM Categorization Complete", description: `Run "${runDetails.name}" processed ${rowsToProcess} rows.` });
    } catch (error: any) {
      addLog(`Error during LLM categorization: ${error.message}`, "error");
      console.error("LLM Categorization Error: ", error);
      toast({ title: "LLM Categorization Error", description: error.message, variant: "destructive" });
      updateRunMutation.mutate({ id: runId, status: 'Failed', errorMessage: `LLM Categorization failed: ${error.message}`, results: collectedResults });
    }
  };

  const handleDownloadResults = () => {
    if (!runDetails || !runDetails.results || runDetails.results.length === 0 || !evalParamDetailsForLLM || evalParamDetailsForLLM.length === 0) {
      toast({ title: "No Results", description: "No results available to download.", variant: "destructive" });
      return;
    }
    const dataForExcel: any[] = [];
    const inputDataKeys = new Set<string>();
    runDetails.results.forEach(item => { Object.keys(item.inputData).forEach(key => inputDataKeys.add(key)); });
    const sortedInputDataKeys = Array.from(inputDataKeys).sort();
    runDetails.results.forEach(item => {
      const row: Record<string, any> = {};
      sortedInputDataKeys.forEach(key => { row[key] = item.inputData[key] !== undefined && item.inputData[key] !== null ? String(item.inputData[key]) : ''; });
      evalParamDetailsForLLM.forEach(paramDetail => {
        const output = item.judgeLlmOutput[paramDetail.id];
        row[`${paramDetail.name} - LLM Label`] = output?.chosenLabel || 'N/A';
        if (runDetails.runType === 'GroundTruth') {
          const gtValue = item.groundTruth ? item.groundTruth[paramDetail.id] : 'N/A';
          row[`${paramDetail.name} - Ground Truth`] = gtValue !== undefined && gtValue !== null ? String(gtValue) : 'N/A';
          const llmLabel = output?.chosenLabel;
          row[`${paramDetail.name} - Match`] = (llmLabel && gtValue !== 'N/A' && String(llmLabel).toLowerCase() === String(gtValue).toLowerCase()) ? 'Yes' : 'No';
        }
        row[`${paramDetail.name} - LLM Rationale`] = output?.rationale || '';
      });
      dataForExcel.push(row);
    });
    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Eval Results");
    const fileName = `eval_run_${runDetails.name.replace(/\s+/g, '_')}_${runDetails.id.substring(0,8)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast({ title: "Download Started", description: `Results are being downloaded as ${fileName}.` });
  };

  const { data: productParametersForSchema = [] } = useQuery<ProductParameterForSchema[], Error>({
    queryKey: ['productParametersForSchema', currentUserId],
    queryFn: () => fetchProductParametersForSchema(currentUserId!),
    enabled: !!currentUserId && isSuggestionDialogOpen,
  });

  const handleSuggestImprovementsClick = async () => {
    if (!runDetails || !currentUserId || !runDetails.promptId || !runDetails.promptVersionId || evalParamDetailsForLLM.length === 0 || !runDetails.results) {
      toast({ title: "Cannot Suggest Improvements", description: "Missing critical run data or configuration.", variant: "destructive" });
      return;
    }
    setIsLoadingSuggestion(true);
    setSuggestionError(null);
    setSuggestionResult(null);
    setIsSuggestionDialogOpen(true);

    try {
      const originalPromptTemplate = await fetchPromptVersionText(currentUserId, runDetails.promptId, runDetails.promptVersionId);
      if (!originalPromptTemplate) throw new Error("Failed to fetch original prompt template text.");

      const mismatchDetails: MismatchDetail[] = [];
      runDetails.results.forEach(item => {
        evalParamDetailsForLLM.forEach(paramDetail => {
          const llmOutput = item.judgeLlmOutput[paramDetail.id];
          const gtLabel = item.groundTruth ? item.groundTruth[paramDetail.id] : undefined;
          if (gtLabel !== undefined && llmOutput && String(llmOutput.chosenLabel).toLowerCase() !== String(gtLabel).toLowerCase()) {
            mismatchDetails.push({
              inputData: item.inputData,
              evaluationParameterName: paramDetail.name,
              evaluationParameterDefinition: paramDetail.definition,
              llmChosenLabel: llmOutput.chosenLabel,
              groundTruthLabel: gtLabel,
              llmRationale: llmOutput.rationale,
            });
          }
        });
      });

      if (mismatchDetails.length === 0) {
        setSuggestionError("No mismatches found in this ground truth run. Nothing to improve based on!");
        setIsLoadingSuggestion(false);
        return;
      }

      const productParamsSchemaString = productParametersForSchema.length > 0
        ? "Product Parameters:\n" + productParametersForSchema.map(p => `- ${p.name} (${p.type}): ${p.definition}${p.options ? ` Options: [${p.options.join(', ')}]` : ''}`).join("\n")
        : "No product parameters defined.";

      const evalParamsSchemaString = "Evaluation Parameters Used:\n" + evalParamDetailsForLLM.map(ep => {
        let schema = `- ID: ${ep.id}, Name: ${ep.name}\n  Definition: ${ep.definition}\n`;
        if (ep.requiresRationale) schema += `  (Requires Rationale)\n`;
        if (ep.labels && ep.labels.length > 0) {
            schema += `  Labels:\n` + ep.labels.map(l => `    - "${l.name}": ${l.definition} ${l.example ? `(e.g., "${l.example}")` : ''}`).join("\n");
        }
        return schema;
      }).join("\n\n");


      const flowInput: SuggestRecursivePromptImprovementsInput = {
        originalPromptTemplate,
        mismatchDetails,
        productParametersSchema: productParamsSchemaString,
        evaluationParametersSchema: evalParamsSchemaString,
      };

      const result = await suggestRecursivePromptImprovements(flowInput);
      setSuggestionResult(result);

    } catch (error: any) {
      console.error("Error suggesting prompt improvements:", error);
      setSuggestionError(error.message || "Failed to get suggestions.");
    } finally {
      setIsLoadingSuggestion(false);
    }
  };

  const hasMismatches = useMemo(() => {
    if (runDetails?.runType !== 'GroundTruth' || !runDetails.results || !evalParamDetailsForLLM) return false;
    return runDetails.results.some(item =>
      evalParamDetailsForLLM.some(paramDetail => {
        const llmOutput = item.judgeLlmOutput[paramDetail.id];
        const gtLabel = item.groundTruth ? item.groundTruth[paramDetail.id] : undefined;
        return gtLabel !== undefined && llmOutput && String(llmOutput.chosenLabel).toLowerCase() !== String(gtLabel).toLowerCase();
      })
    );
  }, [runDetails, evalParamDetailsForLLM]);


  if (isLoadingUserId || (isLoadingRunDetails && currentUserId)) {
    return ( <div className="space-y-6 p-4 md:p-6"> <Skeleton className="h-12 w-full md:w-1/3 mb-4" /> <Skeleton className="h-24 w-full mb-6" /> <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6"> <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /> <Skeleton className="h-32 w-full" /> </div> <Skeleton className="h-96 w-full" /> </div> );
  }
  if (fetchRunError) {
    return ( <Card className="shadow-lg m-4 md:m-6"> <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Run Details</CardTitle></CardHeader> <CardContent><p>{fetchRunError.message}</p><Link href="/runs"><Button variant="outline" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Runs</Button></Link></CardContent> </Card> );
  }
  if (!runDetails) {
    return ( <Card className="shadow-lg m-4 md:m-6"> <CardHeader><CardTitle className="flex items-center"><AlertTriangle className="mr-2 h-6 w-6 text-destructive"/>Run Not Found</CardTitle></CardHeader> <CardContent><p>The evaluation run with ID "{runId}" could not be found.</p><Link href="/runs"><Button variant="outline" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Runs</Button></Link></CardContent> </Card> );
  }

  const actualResultsToDisplay = runDetails.results || [];
  const displayedPreviewData = runDetails.previewedDatasetSample || [];
  const previewTableHeaders = displayedPreviewData.length > 0 ? Object.keys(displayedPreviewData[0]).filter(k => !k.startsWith('_gt_')) : [];
  const formatTimestamp = (timestamp?: Timestamp, includeTime = false) => { if (!timestamp) return 'N/A'; return includeTime ? timestamp.toDate().toLocaleString() : timestamp.toDate().toLocaleDateString(); };
  const isRunTerminal = runDetails.status === 'Completed';
  const canFetchData = runDetails.status === 'Pending' || runDetails.status === 'Failed' || runDetails.status === 'DataPreviewed';
  const canStartLLMCategorization = (runDetails?.status === 'DataPreviewed' || (runDetails?.status === 'Failed' && !!runDetails.previewedDatasetSample && runDetails.previewedDatasetSample.length > 0)) && !isLoadingRunDetails && !isLoadingEvalParamsForLLMHook && evalParamDetailsForLLM.length > 0;
  const canDownloadResults = runDetails.status === 'Completed' && runDetails.results && runDetails.results.length > 0;
  const canSuggestImprovements = runDetails.status === 'Completed' && runDetails.runType === 'GroundTruth' && !!runDetails.results && runDetails.results.length > 0 && hasMismatches;


  const getStatusBadge = (status: EvalRun['status']) => {
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

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
           <div>
            <div className="flex items-center gap-3"> <FileSearch className="h-8 w-8 text-primary" /> <CardTitle className="text-2xl md:text-3xl font-headline">{runDetails.name}</CardTitle> </div>
            <CardDescription className="mt-1 ml-0 md:ml-11 text-xs md:text-sm"> Run ID: {runDetails.id} | Type: {runDetails.runType === 'GroundTruth' ? 'Ground Truth Comparison' : 'Product Evaluation'} | Created: {formatTimestamp(runDetails.createdAt, true)} {runDetails.status === 'Completed' && runDetails.completedAt && ` | Completed: ${formatTimestamp(runDetails.completedAt, true)}`} </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto self-start md:self-center">
             <Button variant="outline" onClick={handleFetchAndPreviewData} disabled={isLoadingEvalParamsForLLMHook || isPreviewDataLoading || (runDetails.status === 'Running' || runDetails.status === 'Processing') || !canFetchData || isRunTerminal} className="w-full sm:w-auto"> {isPreviewDataLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />} {runDetails.previewedDatasetSample && runDetails.previewedDatasetSample.length > 0 ? 'Refetch Sample' : 'Fetch & Preview Sample'} </Button>
             <Button variant="default" onClick={simulateRunExecution} disabled={isLoadingEvalParamsForLLMHook || (runDetails.status === 'Running' || runDetails.status === 'Processing') || !canStartLLMCategorization || isRunTerminal } className="w-full sm:w-auto"> {(runDetails.status === 'Running' || runDetails.status === 'Processing') || isLoadingEvalParamsForLLMHook ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} {(runDetails.status === 'Running' || runDetails.status === 'Processing') ? 'Categorizing...' : (isLoadingEvalParamsForLLMHook ? 'Loading Config...' : (runDetails.status === 'Failed' ? 'Retry LLM Categorization' : 'Start LLM Categorization'))} </Button>
             {canSuggestImprovements && (
                <Button variant="outline" onClick={handleSuggestImprovementsClick} disabled={isLoadingSuggestion} className="w-full sm:w-auto">
                    <Wand2 className="mr-2 h-4 w-4" /> Suggest Prompt Improvements
                </Button>
             )}
             <Button variant="outline" onClick={handleDownloadResults} disabled={!canDownloadResults} className="w-full sm:w-auto"> <Download className="mr-2 h-4 w-4" /> Download Results </Button>
          </div>
        </CardHeader>
        {(isPreviewDataLoading || (runDetails.status === 'Running' || runDetails.status === 'Processing') || isLoadingEvalParamsForLLMHook) && (
          <CardContent> <Label>{(runDetails.status === 'Running' || runDetails.status === 'Processing') ? 'LLM Categorization Progress' : (isPreviewDataLoading ? 'Data Fetch Progress' : 'Loading Configuration...')}: {(runDetails.status === 'Running' || runDetails.status === 'Processing') ? `${runDetails.progress || 0}%` : (isPreviewDataLoading || isLoadingEvalParamsForLLMHook ? 'In Progress...' : 'Idle')}</Label> <Progress value={(runDetails.status === 'Running' || runDetails.status === 'Processing') ? runDetails.progress || 0 : (isPreviewDataLoading || isLoadingEvalParamsForLLMHook ? 50 : 0)} className="w-full h-2 mt-1 mb-2" /> </CardContent>
        )}
         {simulationLog.length > 0 && ( <CardContent> <Card className="max-h-40 overflow-y-auto p-2 bg-muted/50 text-xs"> <p className="font-semibold mb-1">Log:</p> {simulationLog.map((log, i) => <p key={i} className="whitespace-pre-wrap font-mono">{log}</p>)} </Card> </CardContent> )}
         {previewDataError && !isPreviewDataLoading && ( <CardContent><Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Data Preview Error</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{previewDataError}</AlertDescription></Alert></CardContent> )}
         {runDetails.errorMessage && runDetails.status === 'Failed' && !(runDetails.status === 'Running' || runDetails.status === 'Processing') && !isPreviewDataLoading && ( <CardContent><Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Run Failed</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{runDetails.errorMessage}</AlertDescription></Alert></CardContent> )}
      </Card>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
        <Card><CardHeader className="pb-2"><CardDescription>Status</CardDescription><CardTitle className="text-2xl md:text-3xl">{getStatusBadge(runDetails.status)}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">{runDetails.progress !== undefined && (runDetails.status === 'Running' || runDetails.status === 'Processing') ? `${runDetails.progress}% complete` : `Rows to process: ${runDetails.previewedDatasetSample?.length || 'N/A (Fetch sample first)'}`}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Duration</CardDescription><CardTitle className="text-3xl md:text-3xl">{runDetails.summaryMetrics?.duration || (runDetails.status === 'Completed' && runDetails.createdAt && runDetails.completedAt ? `${((runDetails.completedAt.toMillis() - runDetails.createdAt.toMillis()) / 1000).toFixed(1)}s` : 'N/A')}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent></Card>
      </div>

      {displayedPreviewData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dataset Sample Preview (Input Data Only)</CardTitle>
            <CardDescription>Showing {displayedPreviewData.length} rows that will be processed. (Configured N: {runDetails.runOnNRows === 0 ? 'All' : runDetails.runOnNRows}, System processing limit: {MAX_ROWS_FOR_PROCESSING} rows). Ground truth data (if any) is used internally.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader><TableRow>{previewTableHeaders.map(header => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {displayedPreviewData.map((row, rowIndex) => (
                    <TableRow key={`preview-row-${rowIndex}`}>
                      {previewTableHeaders.map(header => <TableCell key={`preview-cell-${rowIndex}-${header}`} className="text-xs max-w-[150px] sm:max-w-[200px] truncate" title={String(row[header])}>{String(row[header])}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="results_table">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 mb-4"> <TabsTrigger value="config">Run Configuration</TabsTrigger> <TabsTrigger value="results_table">LLM Results Table</TabsTrigger> <TabsTrigger value="breakdown">Metrics Breakdown</TabsTrigger> </TabsList>
        <TabsContent value="config"> <Card> <CardHeader><CardTitle>Run Configuration Details</CardTitle></CardHeader> <CardContent className="space-y-3 text-sm"> <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4"> <p><strong>Run Type:</strong> {runDetails.runType === 'GroundTruth' ? 'Ground Truth Comparison' : 'Product Evaluation'}</p> <p><strong>Dataset:</strong> {runDetails.datasetName || runDetails.datasetId}{runDetails.datasetVersionNumber ? ` (v${runDetails.datasetVersionNumber})` : ''}</p> <p><strong>Model Connector:</strong> {runDetails.modelConnectorName || runDetails.modelConnectorId}</p> <p><strong>Prompt Template:</strong> {runDetails.promptName || runDetails.promptId}{runDetails.promptVersionNumber ? ` (v${runDetails.promptVersionNumber})` : ''}</p> <p><strong>Test on Rows Config (from dataset):</strong> {runDetails.runOnNRows === 0 ? 'All (capped for processing)' : `First ${runDetails.runOnNRows} (capped for processing)`}</p> <div><strong>Evaluation Parameters Used:</strong> {evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0 ? ( <ul className="list-disc list-inside ml-4 mt-1"> {evalParamDetailsForLLM.map(ep => <li key={ep.id}>{ep.name} (ID: {ep.id}){ep.requiresRationale ? <Badge variant="outline" className="ml-2 text-xs border-blue-400 text-blue-600">Rationale Requested</Badge> : ''}</li>)} </ul> ) : (runDetails.selectedEvalParamNames && runDetails.selectedEvalParamNames.length > 0 ? ( <ul className="list-disc list-inside ml-4 mt-1"> {runDetails.selectedEvalParamNames.map(name => <li key={name}>{name}</li>)} </ul> ) : "None selected or details not loaded.")} </div> </div> </CardContent> </Card> </TabsContent>
        <TabsContent value="results_table">
          <Card>
            <CardHeader>
              <CardTitle>Detailed LLM Categorization Results</CardTitle>
              <CardDescription>Row-by-row results from the Genkit LLM flow on the processed data.</CardDescription>
            </CardHeader>
            <CardContent>
              {actualResultsToDisplay.length === 0 ? (
                <p className="text-muted-foreground">No LLM categorization results available. {runDetails.status === 'DataPreviewed' ? 'Start LLM Categorization to generate results.' : (runDetails.status === 'Pending' ? 'Fetch data sample first.' : (runDetails.status === 'Running' || runDetails.status === 'Processing' ? 'Categorization in progress...' : 'Run may have failed or has no results.'))}</p>
              ) : (
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px] sm:min-w-[200px]">Input Data (Mapped)</TableHead>
                        {evalParamDetailsForLLM?.map(paramDetail => (
                          <TableHead key={paramDetail.id} className="min-w-[150px] sm:min-w-[200px]">
                            {paramDetail.name}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actualResultsToDisplay.map((item, index) => (
                        <TableRow key={`result-${index}`}>
                          <TableCell className="max-w-xs text-xs align-top">
                            <pre className="whitespace-pre-wrap bg-muted/30 p-1 rounded-sm">{JSON.stringify(item.inputData, null, 2)}</pre>
                          </TableCell>
                          {evalParamDetailsForLLM?.map(paramDetail => {
                            const paramId = paramDetail.id;
                            const output = item.judgeLlmOutput[paramId];
                            const groundTruthValue = item.groundTruth ? item.groundTruth[paramId] : undefined;
                            const llmLabel = output?.chosenLabel;
                            const gtLabel = groundTruthValue;
                            const isMatch = runDetails.runType === 'GroundTruth' && 
                                            gtLabel !== undefined && 
                                            llmLabel && 
                                            String(llmLabel).toLowerCase() === String(gtLabel).toLowerCase();
                            const showGroundTruth = runDetails.runType === 'GroundTruth' && gtLabel !== undefined && gtLabel !== null && String(gtLabel).trim() !== '';
                            return (
                              <TableCell key={paramId} className="text-xs align-top">
                                <div><strong>LLM:</strong> {output?.chosenLabel || 'N/A'}</div>
                                {showGroundTruth && (
                                  <div className={`mt-1 pt-1 border-t border-dashed ${isMatch ? 'border-green-300' : 'border-red-300'}`}>
                                    <div className="flex items-center">
                                      <strong>GT:</strong>&nbsp;{gtLabel}
                                      {isMatch ? <CheckCircle className="h-3.5 w-3.5 ml-1 text-green-500"/> : <XCircle className="h-3.5 w-3.5 ml-1 text-red-500"/>}
                                    </div>
                                  </div>
                                )}
                                {output?.rationale && (
                                  <details className="mt-1">
                                    <summary className="cursor-pointer text-blue-600 hover:underline text-[10px] flex items-center">
                                      <MessageSquareText className="h-3 w-3 mr-1"/> LLM Rationale
                                    </summary>
                                    <p className="text-[10px] bg-blue-50 p-1 rounded border border-blue-200 mt-0.5 whitespace-pre-wrap max-w-xs">{output.rationale}</p>
                                  </details>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="breakdown"> {metricsBreakdownData.length === 0 && (!runDetails?.results || runDetails.results.length === 0) && ( <Card> <CardHeader> <CardTitle className="flex items-center"> <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Metrics Breakdown </CardTitle> </CardHeader> <CardContent> <p className="text-muted-foreground">No results available to generate breakdown. Please complete the run or check configuration.</p> </CardContent> </Card> )} {metricsBreakdownData.map(paramChart => ( <Card key={paramChart.parameterId} className="mb-6"> <CardHeader> <CardTitle className="flex items-center"> <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/> {paramChart.parameterName} </CardTitle> {runDetails.runType === 'GroundTruth' && paramChart.accuracy !== undefined && ( <CardDescription className="flex items-center mt-1"> <CheckCheck className="h-4 w-4 mr-1.5 text-green-600" /> Accuracy: {paramChart.accuracy.toFixed(1)}% {paramChart.totalCompared !== undefined && ` (${(paramChart.accuracy/100 * paramChart.totalCompared).toFixed(0)}/${paramChart.totalCompared} correct)`} </CardDescription> )} {runDetails.runType === 'Product' && ( <CardDescription className="flex items-center mt-1"> <Info className="h-4 w-4 mr-1.5 text-blue-600" /> Label distribution for this Product run. </CardDescription> )} </CardHeader> <CardContent> {paramChart.data.length === 0 ? ( <p className="text-muted-foreground">No data recorded for this parameter in the results.</p> ) : ( <ChartContainer config={{ count: { label: "Count" } }} className="w-full" style={{ height: `${Math.max(150, paramChart.data.length * 40 + 60)}px` }} > <ResponsiveContainer width="100%" height="100%"> <RechartsBarChartElement data={paramChart.data} layout="vertical" margin={{ right: 30, left: 70, top: 5, bottom: 20 }}> <CartesianGrid strokeDasharray="3 3" /> <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} /> <YAxis dataKey="labelName" type="category" width={120} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={0} /> <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'hsl(var(--muted))' }} /> <RechartsBar dataKey="count" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} barSize={20} /> </RechartsBarChartElement> </ResponsiveContainer> </ChartContainer> )} </CardContent> </Card> ))} {runDetails?.results && runDetails.results.length > 0 && metricsBreakdownData.length === 0 && ( <Card> <CardHeader> <CardTitle className="flex items-center"> <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Metrics Breakdown </CardTitle> </CardHeader> <CardContent> <p className="text-muted-foreground">Results are present, but no specific label counts could be generated for the evaluated parameters. This might happen if the LLM responses did not match expected labels or if evaluation parameters were not configured with labels.</p> </CardContent> </Card> )} </TabsContent>
      </Tabs>

      <Dialog open={isSuggestionDialogOpen} onOpenChange={setIsSuggestionDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center"><Wand2 className="mr-2 h-5 w-5 text-primary"/>Prompt Improvement Suggestions</DialogTitle>
            <DialogDescription>
              Based on mismatches in this Ground Truth run, here are suggestions to improve your prompt template.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-grow pr-2 -mr-2">
            {isLoadingSuggestion && (
              <div className="flex flex-col items-center justify-center py-10">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Generating suggestions, please wait...</p>
              </div>
            )}
            {suggestionError && !isLoadingSuggestion && (
              <Alert variant="destructive" className="my-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error Generating Suggestions</AlertTitle>
                <AlertDescription>{suggestionError}</AlertDescription>
              </Alert>
            )}
            {suggestionResult && !isLoadingSuggestion && (
              <div className="space-y-6 py-4">
                <div>
                  <Label htmlFor="suggested-prompt" className="text-base font-semibold">Suggested Prompt Template</Label>
                  <div className="relative mt-1">
                    <Textarea id="suggested-prompt" value={suggestionResult.suggestedPromptTemplate} readOnly rows={10} className="bg-muted/30 font-mono text-xs"/>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7"
                      onClick={() => { navigator.clipboard.writeText(suggestionResult.suggestedPromptTemplate); toast({ title: "Copied!"}); }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="suggestion-reasoning" className="text-base font-semibold">Reasoning</Label>
                   <div className="relative mt-1">
                    <Textarea id="suggestion-reasoning" value={suggestionResult.reasoning} readOnly rows={8} className="bg-muted/30 text-sm"/>
                     <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7"
                      onClick={() => { navigator.clipboard.writeText(suggestionResult.reasoning); toast({ title: "Copied!"}); }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Alert>
                    <Info className="h-4 w-4"/>
                    <AlertTitle>Next Steps</AlertTitle>
                    <AlertDescription>
                        Review the suggested prompt. If you like it, copy it and create a new version of your prompt template on the "Prompts" page. Then, you can create a new evaluation run using this updated prompt version.
                    </AlertDescription>
                </Alert>
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setIsSuggestionDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
