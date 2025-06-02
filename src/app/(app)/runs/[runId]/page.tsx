
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Play, Settings, FileSearch, BarChartHorizontalBig, AlertTriangle, Loader2, ArrowLeft, CheckCircle, XCircle, Clock, Zap } from "lucide-react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar as RechartsBar } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, Timestamp, type DocumentData, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { judgeEvaluationFlow, type JudgeEvaluationInput, type JudgeEvaluationOutput, type EvaluationParameterDetail } from '@/ai/flows/judge-evaluation-flow';

// Interfaces (ensure consistency with runs/page.tsx and Firestore structure)
interface EvalRunResultItem {
  inputData: Record<string, any>;
  judgeLlmOutput: JudgeEvaluationOutput; // Structured output: { evalParamId: chosenLabelName }
  fullPromptSent?: string; // Optional: for debugging
}

interface EvalRun {
  id: string;
  name: string;
  status: 'Completed' | 'Running' | 'Pending' | 'Failed' | 'Processing'; // Added 'Processing'
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
  progress?: number; // 0-100
  results?: EvalRunResultItem[];
  summaryMetrics?: Record<string, any>;
  errorMessage?: string;
  userId?: string;
}

// For fetching related data for simulation
interface PromptTemplateVersion {
  template: string;
  versionNumber: number;
}
interface EvalParamDetailForSim extends EvaluationParameterDetail {}


const fetchEvalRunDetails = async (userId: string, runId: string): Promise<EvalRun | null> => {
  const runDocRef = doc(db, 'users', userId, 'evaluationRuns', runId);
  const runDocSnap = await getDoc(runDocRef);
  if (runDocSnap.exists()) {
    return { id: runDocSnap.id, ...runDocSnap.data() } as EvalRun;
  }
  return null;
};

const fetchPromptVersionText = async (userId: string, promptId: string, versionId: string): Promise<string | null> => {
  const versionDocRef = doc(db, 'users', userId, 'promptTemplates', promptId, 'versions', versionId);
  const versionDocSnap = await getDoc(versionDocRef);
  return versionDocSnap.exists() ? (versionDocSnap.data()?.template as string) : null;
};

const fetchEvaluationParameterDetails = async (userId: string, paramIds: string[]): Promise<EvalParamDetailForSim[]> => {
  if (!paramIds || paramIds.length === 0) return [];
  const details: EvalParamDetailForSim[] = [];
  const evalParamsCollectionRef = collection(db, 'users', userId, 'evaluationParameters');
  
  // In a real app, you might fetch these in parallel or with an 'in' query if many.
  for (const paramId of paramIds) {
    const paramDocRef = doc(evalParamsCollectionRef, paramId);
    const paramDocSnap = await getDoc(paramDocRef);
    if (paramDocSnap.exists()) {
      const data = paramDocSnap.data();
      details.push({
        id: paramDocSnap.id,
        name: data.name,
        labels: (data.categorizationLabels || []).map((l: any) => ({ name: l.name, definition: l.definition, example: l.example})),
      });
    }
  }
  return details;
};


// MOCK data for charts
const mockPerParameterBreakdown = [
    { parameter: 'Hallucination', accuracy: 95.2, correct: 9996, incorrect: 524, total: 10520 },
    { parameter: 'Context Relevance', accuracy: 88.0, correct: 9258, incorrect: 1262, total: 10520 },
];


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

  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    setCurrentUserId(storedUserId || null);
    setIsLoadingUserId(false);
  }, []);

  const { data: runDetails, isLoading: isLoadingRunDetails, error: fetchRunError, refetch: refetchRunDetails } = useQuery<EvalRun | null, Error>({
    queryKey: ['evalRunDetails', currentUserId, runId],
    queryFn: () => fetchEvalRunDetails(currentUserId!, runId),
    enabled: !!currentUserId && !!runId && !isLoadingUserId,
  });
  
  const updateRunMutation = useMutation<void, Error, Partial<EvalRun> & { id: string }>({
    mutationFn: async (updateData) => {
      if (!currentUserId) throw new Error("User not identified.");
      const { id, ...dataToUpdate } = updateData;
      const runDocRef = doc(db, 'users', currentUserId, 'evaluationRuns', id);
      await updateDoc(runDocRef, { ...dataToUpdate, updatedAt: serverTimestamp() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evalRunDetails', currentUserId, runId] });
      queryClient.invalidateQueries({ queryKey: ['evalRuns', currentUserId] }); // Invalidate list too
    },
    onError: (error) => {
      toast({ title: "Error updating run", description: error.message, variant: "destructive" });
      setIsSimulating(false); // Stop simulation on error
    }
  });


  const addLog = (message: string) => {
    setCurrentSimulationLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const simulateRunExecution = async () => {
    if (!runDetails || !currentUserId || !runDetails.promptVersionId || runDetails.selectedEvalParamIds.length === 0) {
      toast({ title: "Cannot start simulation", description: "Missing critical run configuration.", variant: "destructive" });
      return;
    }

    setIsSimulating(true);
    setSimulationProgress(0);
    setCurrentSimulationLog([]);
    addLog("Simulation started.");

    try {
      updateRunMutation.mutate({ id: runId, status: 'Processing', progress: 0 });
      addLog("Status set to Processing.");

      const promptTemplateText = await fetchPromptVersionText(currentUserId, runDetails.promptId, runDetails.promptVersionId);
      if (!promptTemplateText) {
        throw new Error("Failed to fetch prompt template text.");
      }
      addLog(`Fetched prompt template (v${runDetails.promptVersionNumber}).`);

      const evalParamDetails = await fetchEvaluationParameterDetails(currentUserId, runDetails.selectedEvalParamIds);
      if (evalParamDetails.length !== runDetails.selectedEvalParamIds.length) {
        addLog(`Warning: Could only fetch ${evalParamDetails.length} of ${runDetails.selectedEvalParamIds.length} evaluation parameter details.`);
      }
      addLog("Fetched evaluation parameter details.");

      // MOCK DATASET ROWS (replace with actual dataset fetching & parsing in a real backend)
      const mockDataset = [
        { product_name: "Wireless Headphones X1", product_description: "Noise-cancelling over-ear headphones with 20-hour battery life." },
        { product_name: "Smart Coffee Mug", product_description: "Temperature-controlled mug that keeps your drink perfectly hot." },
        { product_name: "Ultra-Thin Laptop Z", product_description: "Lightweight laptop with a 13-inch display and long battery." },
        { product_name: "Eco-Friendly Water Bottle", product_description: "Reusable water bottle made from recycled materials." },
        { product_name: "Portable Bluetooth Speaker", product_description: "Compact speaker with rich sound and 10-hour playtime." },
      ];

      const rowsToProcess = runDetails.runOnNRows > 0 ? Math.min(runDetails.runOnNRows, mockDataset.length) : mockDataset.length;
      addLog(`Simulating ${rowsToProcess} rows. Configured N: ${runDetails.runOnNRows === 0 ? 'All (mock)' : runDetails.runOnNRows}.`);
      
      const collectedResults: EvalRunResultItem[] = [];

      for (let i = 0; i < rowsToProcess; i++) {
        const currentRow = mockDataset[i];
        addLog(`Processing row ${i + 1}/${rowsToProcess}: ${JSON.stringify(currentRow)}`);

        // 1. Construct final prompt
        let finalPrompt = promptTemplateText;
        // Inject dataset row values
        for (const key in currentRow) {
          finalPrompt = finalPrompt.replace(new RegExp(`{{${key}}}`, 'g'), (currentRow as any)[key]);
        }

        // Append evaluation parameter details
        finalPrompt += "\n\n--- EVALUATION CRITERIA ---\n";
        evalParamDetails.forEach(ep => {
          finalPrompt += `Parameter: ${ep.name}\nDefinition: ${ep.labels.find(l => l.name === runDetails.selectedEvalParamNames?.find(name => name === ep.name))?.definition || 'N/A'}\n`; // This part might be tricky if names don't match ids
          finalPrompt += "Labels:\n";
          ep.labels.forEach(label => {
            finalPrompt += `  - "${label.name}": ${label.definition} ${label.example ? `(e.g., "${label.example}")` : ''}\n`;
          });
          finalPrompt += "\n";
        });
        finalPrompt += "--- END EVALUATION CRITERIA ---\n";
        finalPrompt += "Please provide your evaluation as a structured JSON object where keys are parameter names (or IDs) and values are the chosen label names.\n";
        
        // 2. Call mock Judge LLM flow
        const judgeInput: JudgeEvaluationInput = { fullPrompt: finalPrompt, evaluationParameterDetails: evalParamDetails };
        const judgeOutput = await judgeEvaluationFlow(judgeInput);
        addLog(`Mock Judge LLM for row ${i+1} responded: ${JSON.stringify(judgeOutput)}`);
        
        collectedResults.push({
          inputData: currentRow,
          judgeLlmOutput: judgeOutput,
          fullPromptSent: finalPrompt.substring(0, 500) + (finalPrompt.length > 500 ? "..." : "") // Store truncated prompt for review
        });

        const currentProgress = Math.round(((i + 1) / rowsToProcess) * 100);
        setSimulationProgress(currentProgress);
        // Update Firestore periodically, not on every row for performance.
        if ((i + 1) % 2 === 0 || (i + 1) === rowsToProcess) {
            updateRunMutation.mutate({ id: runId, progress: currentProgress, results: collectedResults, status: (i + 1) === rowsToProcess ? 'Completed' : 'Processing' });
        }
      }
      
      addLog("Simulation completed.");
      updateRunMutation.mutate({ 
        id: runId, 
        status: 'Completed', 
        results: collectedResults, 
        progress: 100, 
        completedAt: serverTimestamp(),
        overallAccuracy: Math.round(Math.random() * 30 + 70) // Mock accuracy
      });
      toast({ title: "Simulation Complete", description: `Run "${runDetails.name}" processed.` });

    } catch (error: any) {
      addLog(`Error during simulation: ${error.message}`);
      toast({ title: "Simulation Error", description: error.message, variant: "destructive" });
      updateRunMutation.mutate({ id: runId, status: 'Failed', errorMessage: error.message });
    } finally {
      setIsSimulating(false);
    }
  };

  // Auto-start simulation if status is 'Pending'
  useEffect(() => {
    if (runDetails && runDetails.status === 'Pending' && !isSimulating) {
      simulateRunExecution();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runDetails, isSimulating]); // Dependencies chosen carefully to avoid re-triggering without need


  if (isLoadingUserId || (isLoadingRunDetails && currentUserId)) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-12 w-1/3 mb-4" />
        <Skeleton className="h-24 w-full mb-6" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (fetchRunError) {
    return (
      <Card className="shadow-lg m-6">
        <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Run Details</CardTitle></CardHeader>
        <CardContent><p>{fetchRunError.message}</p><Link href="/runs"><Button variant="outline" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Runs</Button></Link></CardContent>
      </Card>
    );
  }

  if (!runDetails) {
    return (
      <Card className="shadow-lg m-6">
        <CardHeader><CardTitle className="flex items-center"><AlertTriangle className="mr-2 h-6 w-6 text-destructive"/>Run Not Found</CardTitle></CardHeader>
        <CardContent><p>The evaluation run with ID "{runId}" could not be found.</p><Link href="/runs"><Button variant="outline" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Runs</Button></Link></CardContent>
      </Card>
    );
  }
  
  const perParameterChartData = mockPerParameterBreakdown.map(p => ({ name: p.parameter, Accuracy: p.accuracy }));
  const actualResultsToDisplay = runDetails.results || []; 


  const getStatusBadge = (status: EvalRun['status']) => {
    switch (status) {
      case 'Completed': return <Badge variant="default" className="text-base bg-green-500 hover:bg-green-600"><CheckCircle className="mr-1.5 h-4 w-4" />Completed</Badge>;
      case 'Running': return <Badge variant="default" className="text-base bg-blue-500 hover:bg-blue-600"><Clock className="mr-1.5 h-4 w-4 animate-spin" />Running</Badge>;
      case 'Processing': return <Badge variant="default" className="text-base bg-purple-500 hover:bg-purple-600"><Zap className="mr-1.5 h-4 w-4 animate-pulse" />Processing</Badge>;
      case 'Pending': return <Badge variant="secondary" className="text-base"><Clock className="mr-1.5 h-4 w-4" />Pending</Badge>;
      case 'Failed': return <Badge variant="destructive" className="text-base"><XCircle className="mr-1.5 h-4 w-4" />Failed</Badge>;
      default: return <Badge variant="outline" className="text-base">{status}</Badge>;
    }
  };
  
  const formatTimestamp = (timestamp?: Timestamp, includeTime = false) => {
    if (!timestamp) return 'N/A';
    return includeTime ? timestamp.toDate().toLocaleString() : timestamp.toDate().toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
           <div>
            <div className="flex items-center gap-3">
              <FileSearch className="h-8 w-8 text-primary" />
              <CardTitle className="text-3xl font-headline">{runDetails.name}</CardTitle>
            </div>
            <CardDescription className="mt-1 ml-11">
              Run ID: {runDetails.id} | Created: {formatTimestamp(runDetails.createdAt, true)}
              {runDetails.status === 'Completed' && runDetails.completedAt && ` | Completed: ${formatTimestamp(runDetails.completedAt, true)}`}
            </CardDescription>
          </div>
          <div className="flex gap-2 self-start md:self-center">
             <Button 
                variant="outline" 
                onClick={simulateRunExecution} 
                disabled={isSimulating || runDetails.status === 'Completed' || runDetails.status === 'Processing' || runDetails.status === 'Running'}
             >
                {isSimulating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                {isSimulating ? 'Simulating...' : (runDetails.status === 'Failed' ? 'Retry Simulation' : 'Start Simulation')}
            </Button>
            <Button disabled><Download className="mr-2 h-4 w-4" /> Download Report</Button>
          </div>
        </CardHeader>
        {isSimulating && (
          <CardContent>
            <Label>Simulation Progress: {simulationProgress}%</Label>
            <Progress value={simulationProgress} className="w-full h-2 mt-1 mb-2" />
            <Card className="max-h-40 overflow-y-auto p-2 bg-muted/50 text-xs">
              <p className="font-semibold mb-1">Simulation Log:</p>
              {currentSimulationLog.map((log, i) => <p key={i} className="whitespace-pre-wrap font-mono">{log}</p>)}
            </Card>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Overall Accuracy</CardDescription><CardTitle className="text-4xl">{runDetails.overallAccuracy ? `${runDetails.overallAccuracy.toFixed(1)}%` : 'N/A'}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">{runDetails.results?.length || 0} records processed</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Status</CardDescription><CardTitle className="text-3xl">{getStatusBadge(runDetails.status)}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">{runDetails.progress !== undefined && (runDetails.status === 'Running' || runDetails.status === 'Processing') ? `${runDetails.progress}% complete` : `Test on: ${runDetails.runOnNRows === 0 ? 'All (mocked max)' : `First ${runDetails.runOnNRows} rows`}`}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Duration</CardDescription><CardTitle className="text-3xl">{runDetails.summaryMetrics?.duration || (runDetails.status === 'Completed' && runDetails.createdAt && runDetails.completedAt ? `${((runDetails.completedAt.toMillis() - runDetails.createdAt.toMillis()) / 1000).toFixed(1)}s (sim)` : 'N/A')}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Estimated Cost</CardDescription><CardTitle className="text-3xl">{runDetails.summaryMetrics?.cost || 'N/A'}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent></Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-3 mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="results_table">Results Table</TabsTrigger>
          <TabsTrigger value="breakdown">Metrics Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle>Run Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <p><strong>Dataset:</strong> {runDetails.datasetName || runDetails.datasetId}{runDetails.datasetVersionNumber ? ` (v${runDetails.datasetVersionNumber})` : ''}</p>
                <p><strong>Model Connector:</strong> {runDetails.modelConnectorName || runDetails.modelConnectorId}</p>
                <p><strong>Prompt Template:</strong> {runDetails.promptName || runDetails.promptId}{runDetails.promptVersionNumber ? ` (v${runDetails.promptVersionNumber})` : ''}</p>
                <p><strong>Test on Rows:</strong> {runDetails.runOnNRows === 0 ? 'All available in mock (max 5)' : `First ${runDetails.runOnNRows} rows (mocked)`}</p>
                <div><strong>Evaluation Parameters Used:</strong> 
                  {runDetails.selectedEvalParamNames && runDetails.selectedEvalParamNames.length > 0 ? (
                    <ul className="list-disc list-inside ml-4 mt-1">
                      {runDetails.selectedEvalParamNames.map(name => <li key={name}>{name}</li>)}
                    </ul>
                  ) : "None selected"}
                </div>
              </div>
              {runDetails.errorMessage && (
                <div className="mt-4">
                    <h4 className="font-semibold text-destructive">Error Message:</h4>
                    <p className="text-destructive bg-destructive/10 p-2 rounded-md">{runDetails.errorMessage}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results_table">
          <Card>
            <CardHeader><CardTitle>Detailed Evaluation Results</CardTitle><CardDescription>Row-by-row results from the Judge LLM simulation.</CardDescription></CardHeader>
            <CardContent>
              {actualResultsToDisplay.length === 0 ? (
                <p className="text-muted-foreground">No results available. {runDetails.status === 'Pending' ? 'Start simulation to see results.' : (runDetails.status === 'Running' || runDetails.status === 'Processing' ? 'Simulation in progress...' : 'Run may have failed or has no results.')}</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Input Data</TableHead>
                    {runDetails.selectedEvalParamNames?.map(paramName => <TableHead key={paramName}>{paramName}</TableHead>)}
                    <TableHead>Full Prompt (Truncated)</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {actualResultsToDisplay.map((item, index) => (
                       <TableRow key={`result-${index}`}>
                        <TableCell className="max-w-xs truncate text-xs align-top">
                          <pre className="whitespace-pre-wrap">{JSON.stringify(item.inputData, null, 2)}</pre>
                        </TableCell>
                        {runDetails.selectedEvalParamIds?.map(paramId => {
                            const paramName = runDetails.selectedEvalParamNames?.[runDetails.selectedEvalParamIds.indexOf(paramId)] || paramId;
                            return <TableCell key={paramId} className="text-xs align-top">{item.judgeLlmOutput[paramId] || 'N/A'}</TableCell>;
                        })}
                        <TableCell className="max-w-md truncate text-xs align-top">
                           <details>
                             <summary className="cursor-pointer">View Prompt</summary>
                             <pre className="whitespace-pre-wrap text-[10px] bg-muted p-1 rounded mt-1 max-h-40 overflow-y-auto">{item.fullPromptSent || "Not stored."}</pre>
                           </details>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          <Card>
            <CardHeader><CardTitle className="flex items-center"><BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Per-Parameter Accuracy</CardTitle><CardDescription>Accuracy breakdown. (Mock data shown - actual processing TBD)</CardDescription></CardHeader>
            <CardContent>
              <ChartContainer config={{ Accuracy: { label: "Accuracy", color: "hsl(var(--primary))" } }} className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={perParameterChartData} layout="vertical" margin={{ right: 30, left: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} unit="%" />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'hsl(var(--muted))' }} />
                    <Legend />
                    <RechartsBar dataKey="Accuracy" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={30} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
