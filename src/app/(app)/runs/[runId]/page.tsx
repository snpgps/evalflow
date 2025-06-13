
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Play, Settings, FileSearch, BarChartHorizontalBig, AlertTriangle, Loader2, ArrowLeft, CheckCircle, XCircle, Clock, Zap, DatabaseZap, MessageSquareText, Download, TestTube2, CheckCheck, Info, Wand2, Copy, FileText as FileTextIcon, MessageSquareQuote, Filter as FilterIcon, AlignLeft } from "lucide-react";
import { BarChart as RechartsBarChartElement, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar as RechartsBar, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

import { db, storage } from '@/lib/firebase';
import { doc, getDoc, getDocs, updateDoc, Timestamp, type DocumentData, collection, writeBatch, serverTimestamp, type FieldValue, query, orderBy } from 'firebase/firestore';
import { ref as storageRef, getBlob } from 'firebase/storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { judgeLlmEvaluation, type JudgeLlmEvaluationInput, type JudgeLlmEvaluationOutput } from '@/ai/flows/judge-llm-evaluation-flow';
import { suggestRecursivePromptImprovements, type SuggestRecursivePromptImprovementsInput, type SuggestRecursivePromptImprovementsOutput, type MismatchDetail } from '@/ai/flows/suggest-recursive-prompt-improvements';
import { analyzeJudgmentDiscrepancy, type AnalyzeJudgmentDiscrepancyInput, type AnalyzeJudgmentDiscrepancyOutput } from '@/ai/flows/analyze-judgment-discrepancy';
import * as XLSX from 'xlsx';
import type { SummarizationDefinition } from '@/app/(app)/evaluation-parameters/page';


// Interfaces
interface EvalRunResultItem {
  inputData: Record<string, any>;
  judgeLlmOutput: Record<string, { chosenLabel?: string; generatedSummary?: string; rationale?: string; error?: string }>;
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

interface DatasetVersionConfig {
    storagePath?: string;
    columnMapping?: Record<string, string>;
    groundTruthMapping?: Record<string, string>;
    selectedSheetName?: string | null;
}

interface EvalParamLabelForAnalysis {
    name: string;
    definition: string;
    example?: string;
}
interface EvalParamDetailForPrompt {
  id: string;
  name: string;
  definition: string;
  labels: EvalParamLabelForAnalysis[];
  requiresRationale?: boolean;
}
interface SummarizationDefDetailForPrompt {
    id: string;
    name: string;
    definition: string;
    example?: string;
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

interface ContextDocumentDisplayDetail {
    id: string;
    name: string;
    fileName: string;
}

interface QuestioningItemContext {
    rowIndex: number;
    inputData: Record<string, any>;
    paramId: string;
    paramName: string;
    paramDefinition: string;
    paramLabels: EvalParamLabelForAnalysis[];
    judgeLlmOutput: { chosenLabel: string; rationale?: string; error?: string };
    groundTruthLabel?: string;
}

// Interface for Child Components' Props
interface RunHeaderCardProps {
  runDetails: EvalRun;
  isPreviewDataLoading: boolean;
  canFetchData: boolean;
  isRunTerminal: boolean;
  canStartLLMTask: boolean;
  isLoadingEvalParamsForLLMHook: boolean;
  isLoadingSummarizationDefsForLLMHook: boolean;
  canSuggestImprovements: boolean;
  canDownloadResults: boolean;
  onFetchAndPreviewData: () => void;
  onSimulateRunExecution: () => void;
  onSuggestImprovementsClick: () => void;
  onDownloadResults: () => void;
  isLoadingSuggestion: boolean;
}

interface RunProgressAndLogsProps {
  runDetails: EvalRun;
  isPreviewDataLoading: boolean;
  isLoadingEvalParamsForLLMHook: boolean;
  isLoadingSummarizationDefsForLLMHook: boolean;
  simulationLog: string[];
  previewDataError: string | null;
}

interface RunSummaryCardsProps {
  runDetails: EvalRun;
}

interface DatasetSampleTableProps {
  displayedPreviewData: Array<Record<string, any>>;
  previewTableHeaders: string[];
  runDetails: EvalRun;
}

interface RunConfigTabProps {
  runDetails: EvalRun;
  evalParamDetailsForLLM: EvalParamDetailForPrompt[];
  summarizationDefDetailsForLLM: SummarizationDefDetailForPrompt[];
  selectedContextDocDetails: ContextDocumentDisplayDetail[];
  isLoadingSelectedContextDocs: boolean;
}

interface ResultsTableTabProps {
  runDetails: EvalRun;
  filteredResultsToDisplay: EvalRunResultItem[];
  evalParamDetailsForLLM: EvalParamDetailForPrompt[];
  summarizationDefDetailsForLLM: SummarizationDefDetailForPrompt[];
  filterStates: Record<string, 'all' | 'match' | 'mismatch'>;
  onFilterChange: (paramId: string, value: 'all' | 'match' | 'mismatch') => void;
  onOpenQuestionDialog: (item: EvalRunResultItem, paramId: string, rowIndex: number) => void;
}

interface MetricsBreakdownTabProps {
  runDetails: EvalRun;
  metricsBreakdownData: ParameterChartData[];
}

interface ImprovementSuggestionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  error: string | null;
  result: SuggestRecursivePromptImprovementsOutput | null;
}

interface QuestionJudgmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  itemData: QuestioningItemContext | null;
  userQuestion: string;
  onUserQuestionChange: (value: string) => void;
  analysisResult: AnalyzeJudgmentDiscrepancyOutput | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  onSubmitAnalysis: () => void;
  runDetails: EvalRun | null;
}


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

// Child Components

const RunHeaderCard: React.FC<RunHeaderCardProps> = ({
  runDetails, isPreviewDataLoading, canFetchData, isRunTerminal, canStartLLMTask,
  isLoadingEvalParamsForLLMHook, isLoadingSummarizationDefsForLLMHook,
  canSuggestImprovements, canDownloadResults, onFetchAndPreviewData, onSimulateRunExecution,
  onSuggestImprovementsClick, onDownloadResults, isLoadingSuggestion
}) => {
  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex-grow">
          <div className="flex items-center gap-3">
            <FileSearch className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl md:text-3xl font-headline">{runDetails.name}</CardTitle>
          </div>
          <CardDescription className="mt-1 ml-0 md:ml-11 text-xs md:text-sm">
            Run ID: {runDetails.id} | Type: {runDetails.runType === 'GroundTruth' ? 'Ground Truth Comparison' : 'Product Evaluation'} | Created: {formatTimestamp(runDetails.createdAt, true)}{runDetails.status === 'Completed' && runDetails.completedAt && ` | Completed: ${formatTimestamp(runDetails.completedAt, true)}`}
          </CardDescription>
        </div>
        <div className="flex flex-col items-start md:items-end gap-2 w-full md:w-auto">
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto self-start md:self-center">
            <Button variant="outline" onClick={onFetchAndPreviewData} disabled={isPreviewDataLoading || (runDetails.status === 'Running' || runDetails.status === 'Processing') || !canFetchData || isRunTerminal} className="w-full sm:w-auto">
              {isPreviewDataLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
              {runDetails.previewedDatasetSample && runDetails.previewedDatasetSample.length > 0 ? 'Refetch Sample' : 'Fetch & Preview Sample'}
            </Button>
            <Button variant="default" onClick={onSimulateRunExecution} disabled={(runDetails.status === 'Running' || runDetails.status === 'Processing') || !canStartLLMTask || isRunTerminal } className="w-full sm:w-auto">
              {(runDetails.status === 'Running' || runDetails.status === 'Processing') || isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {(runDetails.status === 'Running' || runDetails.status === 'Processing') ? 'Processing...' : ((isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook) ? 'Loading Config...' : (runDetails.status === 'Failed' ? 'Retry LLM Tasks' : 'Start LLM Tasks'))}
            </Button>
            {canSuggestImprovements && (
              <Button variant="outline" onClick={onSuggestImprovementsClick} disabled={isLoadingSuggestion} className="w-full sm:w-auto">
                <Wand2 className="mr-2 h-4 w-4" /> Suggest Improvements
              </Button>
            )}
            <Button variant="outline" onClick={onDownloadResults} disabled={!canDownloadResults} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" /> Download Results
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

const RunProgressAndLogs: React.FC<RunProgressAndLogsProps> = ({
  runDetails, isPreviewDataLoading, isLoadingEvalParamsForLLMHook, isLoadingSummarizationDefsForLLMHook, simulationLog, previewDataError
}) => {
  const showProgress = isPreviewDataLoading || (runDetails.status === 'Running' || runDetails.status === 'Processing') || isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook;
  const progressLabel = (runDetails.status === 'Running' || runDetails.status === 'Processing') ? 'LLM Progress' : (isPreviewDataLoading ? 'Data Fetch Progress' : 'Loading Config...');
  const progressValue = (runDetails.status === 'Running' || runDetails.status === 'Processing') ? runDetails.progress || 0 : (isPreviewDataLoading || isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook ? 50 : 0);

  return (
    <CardContent>
      {showProgress && (
        <>
          <Label>{progressLabel}: {progressValue}%</Label>
          <Progress value={progressValue} className="w-full h-2 mt-1 mb-2" />
        </>
      )}
      {simulationLog.length > 0 && (
        <Card className="max-h-40 overflow-y-auto p-2 bg-muted/50 text-xs">
          <p className="font-semibold mb-1">Log:</p>
          {simulationLog.map((log, i) => <p key={i} className="whitespace-pre-wrap font-mono">{log}</p>)}
        </Card>
      )}
      {previewDataError && !isPreviewDataLoading && (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Data Preview Error</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{previewDataError}</AlertDescription></Alert>
      )}
      {runDetails.errorMessage && runDetails.status === 'Failed' && !isPreviewDataLoading && (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Run Failed</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{runDetails.errorMessage}</AlertDescription></Alert>
      )}
    </CardContent>
  );
};

const RunSummaryCards: React.FC<RunSummaryCardsProps> = ({ runDetails }) => {
  return (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
      <Card><CardHeader className="pb-2"><CardDescription>Status</CardDescription><CardTitle className="text-2xl md:text-3xl">{getStatusBadge(runDetails.status)}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">{runDetails.progress !== undefined && (runDetails.status === 'Running' || runDetails.status === 'Processing') ? `${runDetails.progress}% complete` : `Rows to process: ${runDetails.previewedDatasetSample?.length || 'N/A (Fetch sample first)'}`}</div></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Duration</CardDescription><CardTitle className="text-3xl md:text-3xl">{runDetails.summaryMetrics?.duration || (runDetails.status === 'Completed' && runDetails.createdAt && runDetails.completedAt ? `${((runDetails.completedAt.toMillis() - runDetails.createdAt.toMillis()) / 1000).toFixed(1)}s` : 'N/A')}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent></Card>
    </div>
  );
};

const DatasetSampleTable: React.FC<DatasetSampleTableProps> = ({ displayedPreviewData, previewTableHeaders, runDetails }) => {
  if (displayedPreviewData.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Dataset Sample Preview (Input Data Only)</CardTitle><CardDescription>Showing {displayedPreviewData.length} rows that will be processed. (Configured N: {runDetails.runOnNRows === 0 ? 'All' : runDetails.runOnNRows}, System processing limit: {MAX_ROWS_FOR_PROCESSING} rows). Ground truth data (if any) is used internally.</CardDescription></CardHeader>
      <CardContent><div className="max-h-96 overflow-auto"><Table><TableHeader><TableRow>{previewTableHeaders.map(header => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{displayedPreviewData.map((row, rowIndex) => (<TableRow key={`preview-row-${rowIndex}`}>{previewTableHeaders.map(header => <TableCell key={`preview-cell-${rowIndex}-${header}`} className="text-xs max-w-[150px] sm:max-w-[200px] truncate" title={String(row[header])}>{String(row[header])}</TableCell>)}</TableRow>))}</TableBody></Table></div></CardContent>
    </Card>
  );
};

const RunConfigTab: React.FC<RunConfigTabProps> = ({ runDetails, evalParamDetailsForLLM, summarizationDefDetailsForLLM, selectedContextDocDetails, isLoadingSelectedContextDocs }) => {
  return (
    <Card>
      <CardHeader><CardTitle>Run Configuration Details</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <p><strong>Run Type:</strong> {runDetails.runType === 'GroundTruth' ? 'Ground Truth Comparison' : 'Product Evaluation'}</p>
          <p><strong>Dataset:</strong> {runDetails.datasetName || runDetails.datasetId}{runDetails.datasetVersionNumber ? ` (v${runDetails.datasetVersionNumber})` : ''}</p>
          <p><strong>Model Connector:</strong> {runDetails.modelConnectorName || runDetails.modelConnectorId} {runDetails.modelConnectorProvider && <Badge variant="outline" className="ml-1 text-xs">Provider: {runDetails.modelConnectorProvider}</Badge>} { (runDetails.modelConnectorProvider !== 'Anthropic' && runDetails.modelIdentifierForGenkit) ? <Badge variant="outline" className="ml-1 text-xs">Using (Genkit): {runDetails.modelIdentifierForGenkit}</Badge> : (runDetails.modelConnectorProvider === 'Anthropic' && runDetails.modelConnectorConfigString) ? <Badge variant="outline" className="ml-1 text-xs">Using (Direct): {JSON.parse(runDetails.modelConnectorConfigString).model || 'N/A'}</Badge> : null } </p>
          <p><strong>Prompt Template:</strong> {runDetails.promptName || runDetails.promptId}{runDetails.promptVersionNumber ? ` (v${runDetails.promptVersionNumber})` : ''}</p>
          <p><strong>Test on Rows Config:</strong> {runDetails.runOnNRows === 0 ? 'All (capped)' : `First ${runDetails.runOnNRows} (capped)`}</p>
          <p><strong>LLM Concurrency Limit:</strong> {runDetails.concurrencyLimit || 'Default (3)'}</p>
          <div><strong>Evaluation Parameters:</strong> {evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0 ? ( <ul className="list-disc list-inside ml-4 mt-1"> {evalParamDetailsForLLM.map(ep => <li key={ep.id}>{ep.name} (ID: {ep.id}){ep.requiresRationale ? <Badge variant="outline" className="ml-2 text-xs border-blue-400 text-blue-600">Rationale Requested</Badge> : ''}</li>)} </ul> ) : (runDetails.selectedEvalParamNames && runDetails.selectedEvalParamNames.length > 0 ? ( <ul className="list-disc list-inside ml-4 mt-1"> {runDetails.selectedEvalParamNames.map(name => <li key={name}>{name}</li>)} </ul> ) : "None selected for labeling.")} </div>
          <div><strong>Summarization Definitions:</strong> {summarizationDefDetailsForLLM && summarizationDefDetailsForLLM.length > 0 ? ( <ul className="list-disc list-inside ml-4 mt-1"> {summarizationDefDetailsForLLM.map(sd => <li key={sd.id}>{sd.name} (ID: {sd.id})</li>)} </ul> ) : (runDetails.selectedSummarizationDefNames && runDetails.selectedSummarizationDefNames.length > 0 ? ( <ul className="list-disc list-inside ml-4 mt-1"> {runDetails.selectedSummarizationDefNames.map(name => <li key={name}>{name}</li>)} </ul> ) : "None selected for summarization.")} </div>
          {runDetails.selectedContextDocumentIds && runDetails.selectedContextDocumentIds.length > 0 && (
            <div><strong>Context Documents:</strong>
                {isLoadingSelectedContextDocs ? <Skeleton className="h-5 w-24 mt-1" /> :
                    selectedContextDocDetails.length > 0 ? (
                        <ul className="list-disc list-inside ml-4 mt-1">
                            {selectedContextDocDetails.map(doc => <li key={doc.id} title={doc.fileName}>{doc.name}</li>)}
                        </ul>
                    ) : <span className="text-muted-foreground"> Details not found.</span>
                }
                <p className="text-xs text-muted-foreground mt-1">Note: Full context caching integration via Genkit is model-dependent and might require specific flow adjustments not yet implemented.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const ResultsTableTab: React.FC<ResultsTableTabProps> = ({
  runDetails, filteredResultsToDisplay, evalParamDetailsForLLM, summarizationDefDetailsForLLM,
  filterStates, onFilterChange, onOpenQuestionDialog
}) => {
  return (
    <Card>
      <CardHeader> <CardTitle>Detailed LLM Task Results</CardTitle> <CardDescription>Row-by-row results from the Genkit LLM flow on the processed data.</CardDescription> </CardHeader>
      <CardContent>
        {filteredResultsToDisplay.length === 0 ? ( <p className="text-muted-foreground">No LLM categorization results for the current filter. {runDetails.status === 'DataPreviewed' ? 'Start LLM Categorization.' : (runDetails.status === 'Pending' ? 'Fetch data sample.' : (runDetails.status === 'Running' || runDetails.status === 'Processing' ? 'Categorization in progress...' : (Object.values(filterStates).some(f => f !== 'all') ? 'Try adjusting filters.' : 'Run may have failed or has no results.')))}</p> ) : (
          <div className="max-h-[600px] overflow-auto">
            <Table><TableHeader><TableRow><TableHead className="min-w-[150px] sm:min-w-[200px]">Input Data (Mapped)</TableHead>
            {evalParamDetailsForLLM?.map(paramDetail => (
              <TableHead key={paramDetail.id} className="min-w-[200px] sm:min-w-[250px] align-top">
                <div className="flex flex-col">
                  <span>{paramDetail.name}</span>
                  {runDetails.runType === 'GroundTruth' && (
                    <Select
                      value={filterStates[paramDetail.id] || 'all'}
                      onValueChange={(value) => onFilterChange(paramDetail.id, value as 'all' | 'match' | 'mismatch')}
                    >
                      <SelectTrigger className="h-7 text-xs mt-1 w-full max-w-[180px] bg-background focus:ring-primary focus:border-primary">
                        <FilterIcon className="h-3 w-3 mr-1 opacity-70" />
                        <SelectValue>
                          { filterStates[paramDetail.id] === 'match' ? 'GT Matches Only' : filterStates[paramDetail.id] === 'mismatch' ? 'GT Mismatches Only' : 'Filter: All' }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent> <SelectItem value="all">Show All</SelectItem> <SelectItem value="match">Ground Truth Matches</SelectItem> <SelectItem value="mismatch">Ground Truth Mismatches</SelectItem> </SelectContent>
                    </Select>
                  )}
                </div>
              </TableHead>
            ))}
            {summarizationDefDetailsForLLM?.map(summDef => ( <TableHead key={summDef.id} className="min-w-[200px] sm:min-w-[300px] align-top">{summDef.name} (Summary)</TableHead> ))}
            </TableRow></TableHeader>
              <TableBody>{filteredResultsToDisplay.map((item, index) => (<TableRow key={`result-${index}`}><TableCell className="text-xs align-top"><pre className="whitespace-pre-wrap bg-muted/30 p-1 rounded-sm">{JSON.stringify(item.inputData, null, 2)}</pre></TableCell>
                {evalParamDetailsForLLM?.map(paramDetail => {
                  const paramId = paramDetail.id; const outputForCell = item.judgeLlmOutput[paramId]; const groundTruthValue = item.groundTruth ? item.groundTruth[paramId] : undefined; const llmLabel = outputForCell?.chosenLabel; const gtLabel = groundTruthValue; const isMatch = runDetails.runType === 'GroundTruth' && gtLabel !== undefined && llmLabel && !outputForCell?.error && String(llmLabel).toLowerCase() === String(gtLabel).toLowerCase(); const showGroundTruth = runDetails.runType === 'GroundTruth' && gtLabel !== undefined && gtLabel !== null && String(gtLabel).trim() !== '';
                  return (
                    <TableCell key={paramId} className="text-xs align-top">
                      <div className="flex justify-between items-start">
                        <div>
                          <div><strong>LLM Label:</strong> {outputForCell?.chosenLabel || (outputForCell?.error ? 'ERROR' : 'N/A')}</div>
                          {outputForCell?.error && <div className="text-destructive text-[10px]">Error: {outputForCell.error}</div>}
                          {showGroundTruth && !outputForCell?.error && ( <div className={`mt-1 pt-1 border-t border-dashed ${isMatch ? 'border-green-300' : 'border-red-300'}`}> <div className="flex items-center"> <strong>GT:</strong>&nbsp;{gtLabel} {isMatch ? <CheckCircle className="h-3.5 w-3.5 ml-1 text-green-500"/> : <XCircle className="h-3.5 w-3.5 ml-1 text-red-500"/>} </div> </div> )}
                          {outputForCell?.rationale && ( <details className="mt-1"> <summary className="cursor-pointer text-blue-600 hover:underline text-[10px] flex items-center"> <MessageSquareText className="h-3 w-3 mr-1"/> LLM Rationale </summary> <p className="text-[10px] bg-blue-50 p-1 rounded border border-blue-200 mt-0.5 whitespace-pre-wrap max-w-xs">{outputForCell.rationale}</p> </details> )}
                        </div>
                        {outputForCell && !outputForCell.error && outputForCell.chosenLabel && ( <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 ml-1" title="Question this Judgement" onClick={() => onOpenQuestionDialog(item, paramId, index)}> <MessageSquareQuote className="h-4 w-4 text-muted-foreground hover:text-primary"/> </Button> )}
                      </div>
                    </TableCell>
                  );
                })}
                {summarizationDefDetailsForLLM?.map(summDef => { const paramId = summDef.id; const outputForCell = item.judgeLlmOutput[paramId]; return ( <TableCell key={paramId} className="text-xs align-top"> <div>{outputForCell?.generatedSummary || (outputForCell?.error ? <span className="text-destructive">ERROR: {outputForCell.error}</span> : 'N/A')}</div> </TableCell> ); })}
                </TableRow>))}</TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const MetricsBreakdownTab: React.FC<MetricsBreakdownTabProps> = ({ runDetails, metricsBreakdownData }) => {
  return (
    <>
      {metricsBreakdownData.length === 0 && (!runDetails?.results || runDetails.results.length === 0) && (
        <Card> <CardHeader> <CardTitle className="flex items-center"> <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Metrics Breakdown (Labels) </CardTitle> </CardHeader> <CardContent> <p className="text-muted-foreground">No results available to generate label breakdown.</p> </CardContent> </Card>
      )}
      {metricsBreakdownData.map(paramChart => (
        <Card key={paramChart.parameterId} className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center"> <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/> {paramChart.parameterName} </CardTitle>
            {runDetails.runType === 'GroundTruth' && paramChart.accuracy !== undefined && ( <CardDescription className="flex items-center mt-1"> <CheckCheck className="h-4 w-4 mr-1.5 text-green-600" /> Accuracy: {paramChart.accuracy.toFixed(1)}% {paramChart.totalCompared !== undefined && ` (${(paramChart.accuracy/100 * paramChart.totalCompared).toFixed(0)}/${paramChart.totalCompared} correct)`} </CardDescription> )}
            {runDetails.runType === 'Product' && ( <CardDescription className="flex items-center mt-1"> <Info className="h-4 w-4 mr-1.5 text-blue-600" /> Label distribution. </CardDescription> )}
          </CardHeader>
          <CardContent>
            {paramChart.data.length === 0 ? ( <p className="text-muted-foreground">No data recorded for this parameter.</p> ) : (
              <ChartContainer config={{ count: { label: "Count" } }} className="w-full" style={{ height: `${Math.max(150, paramChart.data.length * 40 + 60)}px` }}>
                <RechartsBarChartElement data={paramChart.data} layout="vertical" margin={{ right: 30, left: 70, top: 5, bottom: 20 }}> <CartesianGrid strokeDasharray="3 3" /> <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} /> <YAxis dataKey="labelName" type="category" width={120} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={0} /> <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'hsl(var(--muted))' }} /> <RechartsBar dataKey="count" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} barSize={20} /> </RechartsBarChartElement>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      ))}
      {runDetails?.results && runDetails.results.length > 0 && metricsBreakdownData.length === 0 && ( <Card> <CardHeader> <CardTitle className="flex items-center"> <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Metrics Breakdown (Labels) </CardTitle> </CardHeader> <CardContent> <p className="text-muted-foreground">Results are present, but no label counts could be generated for evaluation parameters.</p> </CardContent> </Card> )}
    </>
  );
};

const ImprovementSuggestionDialog: React.FC<ImprovementSuggestionDialogProps> = ({ isOpen, onOpenChange, isLoading, error, result }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader> <DialogTitle className="flex items-center"><Wand2 className="mr-2 h-5 w-5 text-primary"/>Prompt Improvement Suggestions</DialogTitle> <DialogDescription> Based on mismatches in this Ground Truth run, here are suggestions to improve your prompt. </DialogDescription> </DialogHeader>
        <ScrollArea className="flex-grow pr-2 -mr-2">
          {isLoading && ( <div className="flex flex-col items-center justify-center py-10"> <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" /> <p className="text-muted-foreground">Generating suggestions...</p> </div> )}
          {error && !isLoading && ( <Alert variant="destructive" className="my-4"> <AlertTriangle className="h-4 w-4" /> <AlertTitle>Error Generating Suggestions</AlertTitle> <AlertDescription>{error}</AlertDescription> </Alert> )}
          {result && !isLoading && ( <div className="space-y-6 py-4"> <div> <Label htmlFor="suggested-prompt" className="text-base font-semibold">Suggested Prompt Template</Label> <div className="relative mt-1"> <Textarea id="suggested-prompt" value={result.suggestedPromptTemplate} readOnly rows={10} className="bg-muted/30 font-mono text-xs"/> <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => { navigator.clipboard.writeText(result.suggestedPromptTemplate); toast({ title: "Copied!"}); }}> <Copy className="h-4 w-4" /> </Button> </div> </div> <div> <Label htmlFor="suggestion-reasoning" className="text-base font-semibold">Reasoning</Label> <div className="relative mt-1"> <Textarea id="suggestion-reasoning" value={result.reasoning} readOnly rows={8} className="bg-muted/30 text-sm"/> <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => { navigator.clipboard.writeText(result.reasoning); toast({ title: "Copied!"}); }}> <Copy className="h-4 w-4" /> </Button> </div> </div> <Alert> <Info className="h-4 w-4"/> <AlertTitle>Next Steps</AlertTitle> <AlertDescription> Review the suggested prompt. If you like it, copy it and create a new version of your prompt template on the "Prompts" page. Then, create a new evaluation run using this updated prompt version. </AlertDescription> </Alert> </div> )}
        </ScrollArea>
        <DialogFooter className="pt-4 border-t"> <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button> </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const QuestionJudgmentDialog: React.FC<QuestionJudgmentDialogProps> = ({
  isOpen, onOpenChange, itemData, userQuestion, onUserQuestionChange,
  analysisResult, isAnalyzing, analysisError, onSubmitAnalysis, runDetails
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center"><MessageSquareQuote className="mr-2 h-5 w-5 text-primary"/>Question Bot&apos;s Judgement</DialogTitle>
          <DialogDescription>Analyze a specific judgment made by the LLM. Provide your reasoning for a deeper AI analysis.</DialogDescription>
        </DialogHeader>
        <div className="flex-grow min-h-0 overflow-y-auto">
          <ScrollArea className="h-full w-full">
            {itemData && (
              <div className="space-y-4 p-6 text-sm">
                <Card className="p-3 bg-muted/40">
                  <CardHeader className="p-0 pb-2"><CardTitle className="text-sm">Item Details (Row {itemData.rowIndex + 1})</CardTitle></CardHeader>
                  <CardContent className="p-0 space-y-1 text-xs">
                    <div><strong>Input Data:</strong> <pre className="whitespace-pre-wrap bg-background p-1 rounded-sm text-[10px]">{JSON.stringify(itemData.inputData, null, 2)}</pre></div>
                    <div><strong>Evaluation Parameter:</strong> {itemData.paramName}</div>
                    <div><strong>Judge LLM Label:</strong> {itemData.judgeLlmOutput.chosenLabel}</div>
                    {itemData.judgeLlmOutput.rationale && <div><strong>Judge LLM Rationale:</strong> <span className="italic">{itemData.judgeLlmOutput.rationale}</span></div>}
                    {runDetails?.runType === 'GroundTruth' && <div><strong>Ground Truth Label:</strong> {itemData.groundTruthLabel || 'N/A'}</div>}
                  </CardContent>
                </Card>
                <div>
                  <Label htmlFor="userQuestionText">Your Question/Reasoning for Discrepancy:</Label>
                  <Textarea id="userQuestionText" value={userQuestion} onChange={(e) => onUserQuestionChange(e.target.value)} placeholder="e.g., 'I believe the LLM missed the nuance...'" rows={4} className="mt-1" />
                </div>
                {isAnalyzing && ( <div className="flex items-center space-x-2 pt-2"> <Loader2 className="h-5 w-5 animate-spin text-primary" /> <p className="text-muted-foreground">AI is analyzing...</p> </div> )}
                {analysisError && !isAnalyzing && ( <Alert variant="destructive"> <AlertTriangle className="h-4 w-4" /> <AlertTitle>Analysis Error</AlertTitle> <AlertDescription>{analysisError}</AlertDescription> </Alert> )}
                {analysisResult && !isAnalyzing && (
                  <Card className="mt-4 p-4 border-primary/30">
                    <CardHeader className="p-0 pb-2"><CardTitle className="text-base text-primary">AI Analysis of Judgement</CardTitle></CardHeader>
                    <CardContent className="p-0 space-y-2 text-xs">
                      <p><strong>Analysis:</strong> {analysisResult.analysis}</p>
                      <div className="flex items-center gap-2"> <strong>Agrees with User Concern:</strong> <Badge variant={analysisResult.agreesWithUserConcern ? "default" : "secondary"} className={analysisResult.agreesWithUserConcern ? "bg-green-100 text-green-700 border-green-300" : ""}> {analysisResult.agreesWithUserConcern ? 'Yes' : 'No'} </Badge> </div>
                      {analysisResult.potentialFailureReasons && <p><strong>Potential Failure Reasons:</strong> {analysisResult.potentialFailureReasons}</p>}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
        <DialogFooter className="p-6 pt-4 border-t mt-auto flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmitAnalysis} disabled={isAnalyzing || !userQuestion.trim() || !itemData}>
            {isAnalyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</> : "Submit for Analysis"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

  const [filterStates, setFilterStates] = useState<Record<string, 'all' | 'match' | 'mismatch'>>({});

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
    if (hasEvalParams && runDetails?.runType === 'GroundTruth') {
      const newInitialFilters: Record<string, 'all' | 'match' | 'mismatch'> = {};
      evalParamDetailsForLLM.forEach(param => { newInitialFilters[param.id] = 'all'; });
      if (JSON.stringify(filterStates) !== JSON.stringify(newInitialFilters)) { setFilterStates(newInitialFilters); }
    } else {
      if (Object.keys(filterStates).length > 0) { setFilterStates({}); }
    }
  }, [evalParamDetailsForLLM, runDetails?.runType, filterStates]);

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
        runDetails.results!.forEach(resultItem => { if (resultItem.judgeLlmOutput && typeof resultItem.judgeLlmOutput === 'object') { const llmOutputForParam = resultItem.judgeLlmOutput[paramDetail.id]; if (llmOutputForParam?.chosenLabel && typeof llmOutputForParam.chosenLabel === 'string') { const chosenLabel = llmOutputForParam.chosenLabel; labelCounts[chosenLabel] = (labelCounts[chosenLabel] || 0) + 1; if (runDetails.runType === 'GroundTruth' && resultItem.groundTruth && !llmOutputForParam.error) { const gtLabel = resultItem.groundTruth[paramDetail.id]; if (gtLabel !== undefined && gtLabel !== null && String(gtLabel).trim() !== '') { totalComparedForParam++; if (String(chosenLabel).toLowerCase() === String(gtLabel).toLowerCase()) { correctCountForParam++; } } } } else if (llmOutputForParam?.error) { labelCounts['ERROR_PROCESSING_ROW'] = (labelCounts['ERROR_PROCESSING_ROW'] || 0) + 1; } } });
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
      if (runDetails.modelConnectorProvider === 'Anthropic') { addLog(`Using direct Anthropic client via config: ${runDetails.modelConnectorConfigString || 'N/A'}`); } else if(runDetails.modelIdentifierForGenkit) { addLog(`Using Genkit model: ${runDetails.modelIdentifierForGenkit}`); } else { addLog(`Warn: No Genkit model ID. Using Genkit default.`); }
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
      evalParamDetailsForLLM?.forEach(paramDetail => { const output = item.judgeLlmOutput[paramDetail.id]; row[`${paramDetail.name} - LLM Label`] = output?.chosenLabel || (output?.error ? 'ERROR' : 'N/A'); if (runDetails.runType === 'GroundTruth') { const gtValue = item.groundTruth ? item.groundTruth[paramDetail.id] : 'N/A'; row[`${paramDetail.name} - Ground Truth`] = gtValue !== undefined && gtValue !== null ? String(gtValue) : 'N/A'; const llmLabel = output?.chosenLabel; row[`${paramDetail.name} - Match`] = (llmLabel && gtValue !== 'N/A' && !output?.error && String(llmLabel).toLowerCase() === String(gtValue).toLowerCase()) ? 'Yes' : 'No'; } row[`${paramDetail.name} - LLM Rationale`] = output?.rationale || ''; if(output?.error) row[`${paramDetail.name} - LLM Error`] = output.error; });
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
      const mismatchDetails: MismatchDetail[] = []; runDetails.results.forEach(item => { evalParamDetailsForLLM.forEach(paramDetail => { const llmOutput = item.judgeLlmOutput[paramDetail.id]; const gtLabel = item.groundTruth ? item.groundTruth[paramDetail.id] : undefined; if (gtLabel !== undefined && llmOutput && llmOutput.chosenLabel && !llmOutput.error && String(llmOutput.chosenLabel).toLowerCase() !== String(gtLabel).toLowerCase()) { mismatchDetails.push({ inputData: item.inputData, evaluationParameterName: paramDetail.name, evaluationParameterDefinition: paramDetail.definition, llmChosenLabel: llmOutput.chosenLabel, groundTruthLabel: gtLabel, llmRationale: llmOutput.rationale, }); } }); });
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

  const hasMismatches = useMemo((): boolean => { if (runDetails?.runType !== 'GroundTruth' || !runDetails.results || !evalParamDetailsForLLM) return false; return runDetails.results.some(item => evalParamDetailsForLLM.some(paramDetail => { const llmOutput = item.judgeLlmOutput[paramDetail.id]; const gtLabel = item.groundTruth ? item.groundTruth[paramDetail.id] : undefined; return gtLabel !== undefined && llmOutput && llmOutput.chosenLabel && !llmOutput?.error && String(llmOutput.chosenLabel).toLowerCase() !== String(gtLabel).toLowerCase(); }) ); }, [runDetails, evalParamDetailsForLLM]);
  const handleFilterChange = (paramId: string, value: 'all' | 'match' | 'mismatch'): void => { setFilterStates(prev => ({ ...prev, [paramId]: value })); };
  const filteredResultsToDisplay = useMemo((): EvalRunResultItem[] => { if (!runDetails?.results) return []; if (runDetails.runType !== 'GroundTruth' || Object.keys(filterStates).length === 0 || !evalParamDetailsForLLM || evalParamDetailsForLLM.length === 0) { return runDetails.results; } return runDetails.results.filter(item => { for (const paramId in filterStates) { if (!evalParamDetailsForLLM.find(ep => ep.id === paramId)) continue; const filterValue = filterStates[paramId]; if (filterValue === 'all') continue; const llmOutput = item.judgeLlmOutput?.[paramId]; const gtLabel = item.groundTruth?.[paramId]; if (!llmOutput || gtLabel === undefined || llmOutput.error) { if (filterValue === 'match' || filterValue === 'mismatch') return false; continue; } const isMatch = String(llmOutput.chosenLabel).toLowerCase() === String(gtLabel).toLowerCase(); if (filterValue === 'match' && !isMatch) return false; if (filterValue === 'mismatch' && isMatch) return false; } return true; }); }, [runDetails?.results, runDetails?.runType, filterStates, evalParamDetailsForLLM]);
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

  const pageContent = (
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
      />

      <RunProgressAndLogs
        runDetails={runDetails}
        isPreviewDataLoading={isPreviewDataLoading}
        isLoadingEvalParamsForLLMHook={isLoadingEvalParamsForLLMHook}
        isLoadingSummarizationDefsForLLMHook={isLoadingSummarizationDefsForLLMHook}
        simulationLog={simulationLog}
        previewDataError={previewDataError}
      />

      <RunSummaryCards runDetails={runDetails} />
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
  return pageContent;
}
