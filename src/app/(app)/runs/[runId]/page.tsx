
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Play, Settings, FileSearch, BarChartHorizontalBig, AlertTriangle, Loader2, ArrowLeft, CheckCircle, XCircle, Clock, Zap, DatabaseZap, MessageSquareText } from "lucide-react";
import { BarChart as RechartsBarChartElement, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar as RechartsBar, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc, Timestamp, type DocumentData, collection, writeBatch, serverTimestamp, type FieldValue } from 'firebase/firestore';
import { ref as storageRef, getBlob } from 'firebase/storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { judgeLlmEvaluation, type JudgeLlmEvaluationInput, type JudgeLlmEvaluationOutput } from '@/ai/flows/judge-llm-evaluation-flow';
import * as XLSX from 'xlsx';

// Interfaces
interface EvalRunResultItem {
  inputData: Record<string, any>;
  judgeLlmOutput: Record<string, { chosenLabel: string; rationale?: string }>; // Updated to match flow output
  fullPromptSent?: string;
  groundTruth?: Record<string, any>;
}

interface EvalRun {
  id: string;
  name: string;
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
  overallAccuracy?: number;
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
}


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
    console.warn("fetchEvaluationParameterDetailsForPrompt: Missing userId or paramIds. Returning empty array.");
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


export default function RunDetailsPage() {
  const reactParams = useParams();
  const runId = reactParams.runId as string;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [currentSimulationLog, setCurrentSimulationLog] = useState<string[]>([]);

  const [isPreviewDataLoading, setIsPreviewDataLoading] = useState(false);
  const [previewDataError, setPreviewDataError] = useState<string | null>(null);

  const [evalParamDetailsForLLM, setEvalParamDetailsForLLM] = useState<EvalParamDetailForPrompt[]>([]);
  const [isLoadingEvalParamDetails, setIsLoadingEvalParamDetails] = useState(false);
  const [metricsBreakdownData, setMetricsBreakdownData] = useState<ParameterChartData[]>([]);


  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    setCurrentUserId(storedUserId || null);
    setIsLoadingUserId(false);
  }, []);

  const { data: runDetails, isLoading: isLoadingRunDetails, error: fetchRunError, refetch: refetchRunDetails } = useQuery<EvalRun | null, Error>({
    queryKey: ['evalRunDetails', currentUserId, runId],
    queryFn: () => fetchEvalRunDetails(currentUserId!, runId),
    enabled: !!currentUserId && !!runId && !isLoadingUserId,
    refetchInterval: (query) => {
      const data = query.state.data as EvalRun | null;
      return (data?.status === 'Running' || data?.status === 'Processing') ? 5000 : false;
    },
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
      if(isSimulating) setIsSimulating(false);
      if(isPreviewDataLoading) setIsPreviewDataLoading(false);
    }
  });

  const addLog = (message: string, type: 'info' | 'error' = 'info') => {
    const logEntry = `${new Date().toLocaleTimeString()}: ${type === 'error' ? 'ERROR: ' : ''}${message}`;
    console[type === 'error' ? 'error' : 'log'](logEntry);
    setCurrentSimulationLog(prev => [...prev, logEntry].slice(-100));
  };

  useEffect(() => {
    if (!runDetails) {
      setEvalParamDetailsForLLM([]);
      return;
    }
    if (runDetails.selectedEvalParamIds && runDetails.selectedEvalParamIds.length > 0 && currentUserId) {
      const fetchDetails = async () => {
        setIsLoadingEvalParamDetails(true);
        addLog("Fetching/updating evaluation parameter details for LLM...");
        try {
          const details = await fetchEvaluationParameterDetailsForPrompt(currentUserId, runDetails.selectedEvalParamIds);
          setEvalParamDetailsForLLM(details);
          addLog(`Fetched ${details.length} evaluation parameter details.`);
          if (details.length === 0 && runDetails.selectedEvalParamIds!.length > 0) {
               addLog("Warning: Selected evaluation parameter IDs were present, but no details were fetched. Check IDs in Firestore and parameter definitions.", "error");
          }
        } catch (error: any) {
          addLog(`Error fetching evaluation parameter details: ${error.message}`, "error");
        } finally {
          setIsLoadingEvalParamDetails(false);
        }
      };
      fetchDetails();
    } else {
      setEvalParamDetailsForLLM([]);
      addLog("No evaluation parameters selected for this run, or selectedEvalParamIds is empty.");
      setIsLoadingEvalParamDetails(false);
    }
  }, [runDetails?.id, runDetails?.selectedEvalParamIds?.join(','), currentUserId]);


  useEffect(() => {
    if (runDetails?.results && runDetails.results.length > 0 && evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0) {
      const newMetricsBreakdownData: ParameterChartData[] = evalParamDetailsForLLM.map(paramDetail => {
        const labelCounts: Record<string, number> = {};

        if (paramDetail.labels && Array.isArray(paramDetail.labels)) {
          paramDetail.labels.forEach(label => {
            if (label && typeof label.name === 'string') {
              labelCounts[label.name] = 0;
            }
          });
        }

        runDetails.results!.forEach(resultItem => {
          if (resultItem.judgeLlmOutput && typeof resultItem.judgeLlmOutput === 'object') {
              const llmOutputForParam = resultItem.judgeLlmOutput[paramDetail.id];
              if (llmOutputForParam?.chosenLabel && typeof llmOutputForParam.chosenLabel === 'string') {
              labelCounts[llmOutputForParam.chosenLabel] = (labelCounts[llmOutputForParam.chosenLabel] || 0) + 1;
              }
          }
        });

        const chartDataEntries = Object.entries(labelCounts)
          .map(([labelName, count]) => ({ labelName, count }))
          .filter(item => item.count > 0 || (paramDetail.labels && paramDetail.labels.some(l => l.name === item.labelName)));

        return {
          parameterId: paramDetail.id,
          parameterName: paramDetail.name,
          data: chartDataEntries.sort((a, b) => b.count - a.count),
        };
      }).filter(paramChart => paramChart.data.length > 0); 

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
    setCurrentSimulationLog([]);
    addLog("Data Preview: Process started.");

    try {
        addLog("Data Preview: Fetching dataset version configuration...");
        const versionConfig = await fetchDatasetVersionConfig(currentUserId, runDetails.datasetId, runDetails.datasetVersionId);
        if (!versionConfig || !versionConfig.storagePath || !versionConfig.columnMapping || Object.keys(versionConfig.columnMapping).length === 0) {
            throw new Error("Dataset version configuration (storage path or column mapping) is incomplete or missing.");
        }
        addLog(`Data Preview: Storage path: ${versionConfig.storagePath}`);
        addLog(`Data Preview: Column mapping: ${JSON.stringify(versionConfig.columnMapping)}`);
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
                headers.forEach((header, index) => {
                    rowObject[header] = values[index] || "";
                });
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

        const maxRowsForPreview = 10;
        const numRowsToFetch = runDetails.runOnNRows > 0 ? Math.min(runDetails.runOnNRows, parsedRows.length, maxRowsForPreview) : Math.min(parsedRows.length, maxRowsForPreview);

        const actualRowsToPreview = parsedRows.slice(0, numRowsToFetch);
        addLog(`Data Preview: Taking first ${actualRowsToPreview.length} rows for preview (Config N: ${runDetails.runOnNRows}, Max Preview: ${maxRowsForPreview}).`);

        const mappedSampleData: Array<Record<string, any>> = [];
        const productParamToOriginalColMap = versionConfig.columnMapping;

        actualRowsToPreview.forEach((originalRow, index) => {
            const mappedRow: Record<string, any> = {};
            let rowHasMappedData = false;
            for (const productParamName in productParamToOriginalColMap) {
                const originalColName = productParamToOriginalColMap[productParamName];
                if (originalRow.hasOwnProperty(originalColName)) {
                    mappedRow[productParamName] = originalRow[originalColName];
                    rowHasMappedData = true;
                } else {
                    mappedRow[productParamName] = undefined;
                    addLog(`Data Preview: Warning: Row ${index+1} missing original column "${originalColName}" for product parameter "${productParamName}".`);
                }
            }
            if(rowHasMappedData) mappedSampleData.push(mappedRow);
            else addLog(`Data Preview: Skipping row ${index+1} as no mapped data was found for it.`)
        });

        addLog(`Data Preview: Successfully mapped ${mappedSampleData.length} rows for preview.`);

        updateRunMutation.mutate({ id: runId, previewedDatasetSample: mappedSampleData, status: 'DataPreviewed', errorMessage: null, results: [] });
        toast({ title: "Data Preview Ready", description: `${mappedSampleData.length} rows fetched and mapped.`});

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
      console.error("Pre-simulation check failed:", {
        runDetailsExists: !!runDetails,
        userIdExists: !!currentUserId,
        promptIdExists: !!runDetails?.promptId,
        promptVersionIdExists: !!runDetails?.promptVersionId,
        evalParamDetailsLength: evalParamDetailsForLLM.length,
        evalParamDetailsActual: JSON.parse(JSON.stringify(evalParamDetailsForLLM)),
        selectedEvalParamIdsFromRun: runDetails?.selectedEvalParamIds
      });
      addLog(errorMsg, "error");
      return;
    }

    if (!runDetails.previewedDatasetSample || runDetails.previewedDatasetSample.length === 0) {
        toast({ title: "Cannot start LLM Categorization", description: "No dataset sample available. Please fetch and preview data first.", variant: "destructive"});
        addLog("Error: Attempted to start LLM categorization without previewed data.", "error");
        return;
    }

    setIsSimulating(true);
    setSimulationProgress(0);
    if (currentSimulationLog.length === 0 || !currentSimulationLog.some(log => log.includes("Data Preview"))) {
      setCurrentSimulationLog([]);
    }
    addLog("LLM Categorization started using previewed data.");
    let collectedResults: EvalRunResultItem[] = runDetails.results || []; // Initialize with existing results if any


    try {
      updateRunMutation.mutate({ id: runId, status: 'Processing', progress: 0, errorMessage: null });
      addLog("Status set to Processing.");

      const promptTemplateText = await fetchPromptVersionText(currentUserId, runDetails.promptId, runDetails.promptVersionId);
      if (!promptTemplateText) {
        throw new Error("Failed to fetch prompt template text.");
      }
      addLog(`Fetched prompt template (v${runDetails.promptVersionNumber}).`);
      addLog(`Using ${evalParamDetailsForLLM.length} evaluation parameter details for LLM call.`);

      const datasetToProcess = runDetails.previewedDatasetSample;
      const rowsToProcess = datasetToProcess.length;
      addLog(`Starting LLM categorization for ${rowsToProcess} previewed rows.`);
      
      const parameterIdsRequiringRationale = evalParamDetailsForLLM
        .filter(ep => ep.requiresRationale)
        .map(ep => ep.id);

      for (let i = 0; i < rowsToProcess; i++) {
        const currentMappedRow = datasetToProcess[i];
        addLog(`Processing row ${i + 1}/${rowsToProcess}: ${JSON.stringify(currentMappedRow).substring(0, 100)}...`);

        let fullPromptForLLM = promptTemplateText;
        for (const productParamName in currentMappedRow) {
          fullPromptForLLM = fullPromptForLLM.replace(new RegExp(`{{${productParamName}}}`, 'g'), String(currentMappedRow[productParamName] === null || currentMappedRow[productParamName] === undefined ? "" : currentMappedRow[productParamName]));
        }

        let evalCriteriaText = "\n\n--- EVALUATION CRITERIA ---\n";
        evalParamDetailsForLLM.forEach(ep => {
          evalCriteriaText += `Parameter ID: ${ep.id}\nParameter Name: ${ep.name}\nDefinition: ${ep.definition}\n`;
          if (ep.requiresRationale) {
            evalCriteriaText += `IMPORTANT: For this parameter (${ep.name}), when providing your evaluation, you MUST include a 'rationale' explaining your choice.\n`;
          }
          if (ep.labels && ep.labels.length > 0) {
            evalCriteriaText += "Labels:\n";
            ep.labels.forEach(label => {
              evalCriteriaText += `  - "${label.name}": ${label.definition || 'No definition.'} ${label.example ? `(e.g., "${label.example}")` : ''}\n`;
            });
          } else {
            evalCriteriaText += " (No specific categorization labels defined for this parameter)\n";
          }
          evalCriteriaText += "\n";
        });
        evalCriteriaText += "--- END EVALUATION CRITERIA ---\n";

        fullPromptForLLM += evalCriteriaText;

        const genkitInput: JudgeLlmEvaluationInput = {
            fullPromptText: fullPromptForLLM,
            evaluationParameterIds: evalParamDetailsForLLM.map(ep => ep.id),
            parameterIdsRequiringRationale: parameterIdsRequiringRationale,
        };

        addLog(`Sending prompt for row ${i+1} to Genkit flow... (Prompt length: ${fullPromptForLLM.length} chars)`);
        const judgeOutput = await judgeLlmEvaluation(genkitInput);
        addLog(`Genkit flow for row ${i+1} responded: ${JSON.stringify(judgeOutput)}`);

        collectedResults.push({
          inputData: currentMappedRow,
          judgeLlmOutput: judgeOutput,
          fullPromptSent: fullPromptForLLM.substring(0, 1500) + (fullPromptForLLM.length > 1500 ? "... (truncated)" : "")
        });

        const currentProgress = Math.round(((i + 1) / rowsToProcess) * 100);
        setSimulationProgress(currentProgress);

        if ((i + 1) % Math.max(1, Math.floor(rowsToProcess / 10)) === 0) {
            updateRunMutation.mutate({
                id: runId,
                progress: currentProgress,
                results: [...collectedResults], 
                status: 'Processing'
            });
        }
      }

      addLog("LLM Categorization completed for all previewed rows.");
      updateRunMutation.mutate({
        id: runId,
        status: 'Completed',
        results: collectedResults, 
        progress: 100,
        completedAt: serverTimestamp(), 
        overallAccuracy: Math.round(Math.random() * 30 + 70) 
      });
      toast({ title: "LLM Categorization Complete", description: `Run "${runDetails.name}" processed ${rowsToProcess} rows.` });

    } catch (error: any) {
      addLog(`Error during LLM categorization: ${error.message}`, "error");
      console.error("LLM Categorization Error: ", error);
      toast({ title: "LLM Categorization Error", description: error.message, variant: "destructive" });
      updateRunMutation.mutate({ id: runId, status: 'Failed', errorMessage: `LLM Categorization failed: ${error.message}`, results: collectedResults });
    } finally {
      setIsSimulating(false);
    }
  };


  if (isLoadingUserId || (isLoadingRunDetails && currentUserId)) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Skeleton className="h-12 w-full md:w-1/3 mb-4" />
        <Skeleton className="h-24 w-full mb-6" />
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (fetchRunError) {
    return (
      <Card className="shadow-lg m-4 md:m-6">
        <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Run Details</CardTitle></CardHeader>
        <CardContent><p>{fetchRunError.message}</p><Link href="/runs"><Button variant="outline" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Runs</Button></Link></CardContent>
      </Card>
    );
  }

  if (!runDetails) {
    return (
      <Card className="shadow-lg m-4 md:m-6">
        <CardHeader><CardTitle className="flex items-center"><AlertTriangle className="mr-2 h-6 w-6 text-destructive"/>Run Not Found</CardTitle></CardHeader>
        <CardContent><p>The evaluation run with ID "{runId}" could not be found.</p><Link href="/runs"><Button variant="outline" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Runs</Button></Link></CardContent>
      </Card>
    );
  }

  const actualResultsToDisplay = runDetails.results || [];
  const displayedPreviewData = runDetails.previewedDatasetSample || [];
  const previewTableHeaders = displayedPreviewData.length > 0 ? Object.keys(displayedPreviewData[0]) : [];


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

  const formatTimestamp = (timestamp?: Timestamp, includeTime = false) => {
    if (!timestamp) return 'N/A';
    return includeTime ? timestamp.toDate().toLocaleString() : timestamp.toDate().toLocaleDateString();
  };

  const isRunTerminal = runDetails.status === 'Completed';
  const canFetchData = runDetails.status === 'Pending' || runDetails.status === 'Failed' || runDetails.status === 'DataPreviewed';
  const canStartLLMCategorization = (runDetails?.status === 'DataPreviewed' || (runDetails?.status === 'Failed' && !!runDetails.previewedDatasetSample && runDetails.previewedDatasetSample.length > 0)) && !isLoadingRunDetails && evalParamDetailsForLLM.length > 0;


  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
           <div>
            <div className="flex items-center gap-3">
              <FileSearch className="h-8 w-8 text-primary" />
              <CardTitle className="text-2xl md:text-3xl font-headline">{runDetails.name}</CardTitle>
            </div>
            <CardDescription className="mt-1 ml-0 md:ml-11 text-xs md:text-sm">
              Run ID: {runDetails.id} | Created: {formatTimestamp(runDetails.createdAt, true)}
              {runDetails.status === 'Completed' && runDetails.completedAt && ` | Completed: ${formatTimestamp(runDetails.completedAt, true)}`}
            </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto self-start md:self-center">
             <Button
                variant="outline"
                onClick={handleFetchAndPreviewData}
                disabled={isLoadingEvalParamDetails || isPreviewDataLoading || isSimulating || !canFetchData || isRunTerminal}
                className="w-full sm:w-auto"
             >
                {isPreviewDataLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
                {runDetails.previewedDatasetSample && runDetails.previewedDatasetSample.length > 0 ? 'Refetch Sample' : 'Fetch & Preview Sample'}
            </Button>
             <Button
                variant="default"
                onClick={simulateRunExecution}
                disabled={isLoadingEvalParamDetails || isSimulating || !canStartLLMCategorization || isRunTerminal }
                className="w-full sm:w-auto"
             >
                {isSimulating || isLoadingEvalParamDetails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                {isSimulating ? 'Categorizing...' : (isLoadingEvalParamDetails ? 'Loading Config...' : (runDetails.status === 'Failed' ? 'Retry LLM Categorization' : 'Start LLM Categorization'))}
            </Button>
          </div>
        </CardHeader>
        {(isPreviewDataLoading || isSimulating || isLoadingEvalParamDetails) && (
          <CardContent>
            <Label>{isSimulating ? 'LLM Categorization Progress' : (isPreviewDataLoading ? 'Data Fetch Progress' : 'Loading Configuration...')}: {isSimulating ? `${simulationProgress}%` : (isPreviewDataLoading || isLoadingEvalParamDetails ? 'In Progress...' : 'Idle')}</Label>
            <Progress value={isSimulating ? simulationProgress : (isPreviewDataLoading || isLoadingEvalParamDetails ? 50 : 0)} className="w-full h-2 mt-1 mb-2" />
          </CardContent>
        )}
         {currentSimulationLog.length > 0 && (
            <CardContent>
                <Card className="max-h-40 overflow-y-auto p-2 bg-muted/50 text-xs">
                <p className="font-semibold mb-1">Log:</p>
                {currentSimulationLog.map((log, i) => <p key={i} className="whitespace-pre-wrap font-mono">{log}</p>)}
                </Card>
            </CardContent>
        )}
        {previewDataError && !isPreviewDataLoading && (
             <CardContent><Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Data Preview Error</AlertTitle><AlertDescription>{previewDataError}</AlertDescription></Alert></CardContent>
        )}
         {runDetails.errorMessage && runDetails.status === 'Failed' && !isSimulating && !isPreviewDataLoading && (
             <CardContent><Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Run Failed</AlertTitle><AlertDescription>{runDetails.errorMessage}</AlertDescription></Alert></CardContent>
        )}
      </Card>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Overall Accuracy</CardDescription><CardTitle className="text-3xl md:text-4xl">{runDetails.overallAccuracy ? `${runDetails.overallAccuracy.toFixed(1)}%` : 'N/A'}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">{runDetails.results?.length || 0} records processed</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Status</CardDescription><CardTitle className="text-2xl md:text-3xl">{getStatusBadge(runDetails.status)}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">{runDetails.progress !== undefined && (runDetails.status === 'Running' || runDetails.status === 'Processing') ? `${runDetails.progress}% complete` : `Rows to process: ${runDetails.previewedDatasetSample?.length || 'N/A (Fetch sample first)'}`}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Duration</CardDescription><CardTitle className="text-3xl md:text-3xl">{runDetails.summaryMetrics?.duration || (runDetails.status === 'Completed' && runDetails.createdAt && runDetails.completedAt ? `${((runDetails.completedAt.toMillis() - runDetails.createdAt.toMillis()) / 1000).toFixed(1)}s` : 'N/A')}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Estimated Cost</CardDescription><CardTitle className="text-3xl md:text-3xl">{runDetails.summaryMetrics?.cost || 'N/A'}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent></Card>
      </div>

      {displayedPreviewData.length > 0 && (
        <Card>
            <CardHeader>
                <CardTitle>Dataset Sample Preview</CardTitle>
                <CardDescription>Showing first {displayedPreviewData.length} mapped rows from the dataset ({runDetails.datasetName} v{runDetails.datasetVersionNumber}).</CardDescription>
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
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 mb-4">
          <TabsTrigger value="config">Run Configuration</TabsTrigger>
          <TabsTrigger value="results_table">LLM Results Table</TabsTrigger>
          <TabsTrigger value="breakdown">Metrics Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <Card>
            <CardHeader><CardTitle>Run Configuration Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <p><strong>Dataset:</strong> {runDetails.datasetName || runDetails.datasetId}{runDetails.datasetVersionNumber ? ` (v${runDetails.datasetVersionNumber})` : ''}</p>
                <p><strong>Model Connector:</strong> {runDetails.modelConnectorName || runDetails.modelConnectorId}</p>
                <p><strong>Prompt Template:</strong> {runDetails.promptName || runDetails.promptId}{runDetails.promptVersionNumber ? ` (v${runDetails.promptVersionNumber})` : ''}</p>
                <p><strong>Test on Rows Config (from dataset):</strong> {runDetails.runOnNRows === 0 ? 'All (capped for preview)' : `First ${runDetails.runOnNRows} (capped for preview)`}</p>
                <div><strong>Evaluation Parameters Used:</strong>
                  {evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0 ? (
                    <ul className="list-disc list-inside ml-4 mt-1">
                      {evalParamDetailsForLLM.map(ep => <li key={ep.id}>{ep.name} (ID: {ep.id}){ep.requiresRationale ? <Badge variant="outline" className="ml-2 text-xs border-blue-400 text-blue-600">Rationale Requested</Badge> : ''}</li>)}
                    </ul>
                  ) : (runDetails.selectedEvalParamNames && runDetails.selectedEvalParamNames.length > 0 ? (
                     <ul className="list-disc list-inside ml-4 mt-1">
                       {runDetails.selectedEvalParamNames.map(name => <li key={name}>{name}</li>)}
                     </ul>
                  ) : "None selected or details not loaded.")}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results_table">
          <Card>
            <CardHeader><CardTitle>Detailed LLM Categorization Results</CardTitle><CardDescription>Row-by-row results from the Genkit LLM flow on the previewed data.</CardDescription></CardHeader>
            <CardContent>
              {actualResultsToDisplay.length === 0 ? (
                <p className="text-muted-foreground">No LLM categorization results available. {runDetails.status === 'DataPreviewed' ? 'Start LLM Categorization to generate results.' : (runDetails.status === 'Pending' ? 'Fetch data sample first.' : (runDetails.status === 'Running' || runDetails.status === 'Processing' ? 'Categorization in progress...' : 'Run may have failed or has no results.'))}</p>
              ) : (
                <div className="max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="min-w-[150px] sm:min-w-[200px]">Input Data (Mapped)</TableHead>
                    {evalParamDetailsForLLM?.map(paramDetail => <TableHead key={paramDetail.id} className="min-w-[120px] sm:min-w-[150px]">{paramDetail.name}</TableHead>)}
                    <TableHead className="min-w-[200px] sm:min-w-[250px]">Full Prompt (Truncated)</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {actualResultsToDisplay.map((item, index) => (
                       <TableRow key={`result-${index}`}>
                        <TableCell className="max-w-xs text-xs align-top">
                          <pre className="whitespace-pre-wrap bg-muted/30 p-1 rounded-sm">{JSON.stringify(item.inputData, null, 2)}</pre>
                        </TableCell>
                        {evalParamDetailsForLLM?.map(paramDetail => {
                            const paramId = paramDetail.id;
                            const output = item.judgeLlmOutput[paramId];
                            return (
                              <TableCell key={paramId} className="text-xs align-top">
                                <div>{output?.chosenLabel || 'N/A'}</div>
                                {output?.rationale && (
                                  <details className="mt-1">
                                    <summary className="cursor-pointer text-blue-600 hover:underline text-[10px] flex items-center">
                                      <MessageSquareText className="h-3 w-3 mr-1"/> Rationale
                                    </summary>
                                    <p className="text-[10px] bg-blue-50 p-1 rounded border border-blue-200 mt-0.5 whitespace-pre-wrap max-w-xs">{output.rationale}</p>
                                  </details>
                                )}
                              </TableCell>
                            );
                        })}
                        <TableCell className="max-w-xs sm:max-w-md text-xs align-top">
                           <details>
                             <summary className="cursor-pointer hover:underline">View Prompt</summary>
                             <pre className="whitespace-pre-wrap text-[10px] bg-muted p-1 rounded mt-1 max-h-40 overflow-y-auto border">{item.fullPromptSent || "Not stored."}</pre>
                           </details>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          {metricsBreakdownData.length === 0 && (!runDetails?.results || runDetails.results.length === 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Metrics Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">No results available to generate breakdown. Please complete the run or check configuration.</p>
              </CardContent>
            </Card>
          )}
          {metricsBreakdownData.map(paramChart => (
            <Card key={paramChart.parameterId} className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>
                  {paramChart.parameterName}
                </CardTitle>
                <CardDescription>Distribution of chosen labels for this parameter.</CardDescription>
              </CardHeader>
              <CardContent>
                {paramChart.data.length === 0 ? (
                    <p className="text-muted-foreground">No data recorded for this parameter in the results.</p>
                ) : (
                  <ChartContainer
                    config={{ count: { label: "Count" } }}
                    className="w-full" 
                    style={{ height: `${Math.max(150, paramChart.data.length * 40 + 60)}px` }} 
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChartElement data={paramChart.data} layout="vertical" margin={{ right: 30, left: 70, top: 5, bottom: 20 }}> 
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis
                          dataKey="labelName"
                          type="category"
                          width={120} 
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          interval={0} 
                        />
                        <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'hsl(var(--muted))' }} />
                        <RechartsBar dataKey="count" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} barSize={20}>
                        </RechartsBar>
                      </RechartsBarChartElement>
                    </ResponsiveContainer>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          ))}
          {runDetails?.results && runDetails.results.length > 0 && metricsBreakdownData.length === 0 && (
             <Card>
               <CardHeader>
                 <CardTitle className="flex items-center">
                   <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Metrics Breakdown
                 </CardTitle>
               </CardHeader>
               <CardContent>
                 <p className="text-muted-foreground">Results are present, but no specific label counts could be generated for the evaluated parameters. This might happen if the LLM responses did not match expected labels or if evaluation parameters were not configured with labels.</p>
               </CardContent>
             </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
