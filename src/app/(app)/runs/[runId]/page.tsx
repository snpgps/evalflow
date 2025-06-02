
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Play, Settings, FileSearch, BarChartHorizontalBig, AlertTriangle, Loader2, ArrowLeft, CheckCircle, XCircle, Clock } from "lucide-react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar as RechartsBar, PieChart, Pie, Cell as RechartsCells } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { doc, getDoc, Timestamp, type DocumentData } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';

// Interface for EvalRun Firestore document (consistent with runs/page.tsx)
interface EvalRun {
  id: string; 
  name: string;
  status: 'Completed' | 'Running' | 'Pending' | 'Failed';
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
  results?: Array<{
    inputData: Record<string, any>; // The input row from the dataset
    modelOutput: string | Record<string, any>; // Output from the target model being evaluated
    groundTruth?: string | Record<string, any>; // Ground truth, if available
    evaluations: Record<string, string>; // Key: evalParamId/Name, Value: chosen label name
    // ... any other per-row metrics
  }>; 
  summaryMetrics?: Record<string, any>;
  errorMessage?: string;
  userId?: string; 
}


const fetchEvalRunDetails = async (userId: string, runId: string): Promise<EvalRun | null> => {
  const runDocRef = doc(db, 'users', userId, 'evaluationRuns', runId);
  const runDocSnap = await getDoc(runDocRef);
  if (runDocSnap.exists()) {
    return { id: runDocSnap.id, ...runDocSnap.data() } as EvalRun;
  }
  return null;
};


// MOCK data for charts until actual results processing is implemented
const mockPerParameterBreakdown = [
    { parameter: 'Hallucination', accuracy: 95.2, correct: 9996, incorrect: 524, total: 10520 },
    { parameter: 'Context Relevance', accuracy: 88.0, correct: 9258, incorrect: 1262, total: 10520 },
];
const mockConfusionMatrix = [
    { name: 'Actual Good, Predicted Good (TP)', value: 8000 },
    { name: 'Actual Good, Predicted Bad (FN)', value: 968 },
];
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];


export default function RunDetailsPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);

  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    setCurrentUserId(storedUserId || null);
    setIsLoadingUserId(false);
  }, []);

  const { data: runDetails, isLoading: isLoadingRunDetails, error: fetchRunError } = useQuery<EvalRun | null, Error>({
    queryKey: ['evalRunDetails', currentUserId, runId],
    queryFn: () => fetchEvalRunDetails(currentUserId!, runId),
    enabled: !!currentUserId && !!runId && !isLoadingUserId,
  });

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
  // This needs to be dynamic based on runDetails.results and selectedEvalParamNames/Ids
  const actualResultsToDisplay = runDetails.results || []; 


  const getStatusBadge = (status: EvalRun['status']) => {
    switch (status) {
      case 'Completed': return <Badge variant="default" className="text-base bg-green-500 hover:bg-green-600"><CheckCircle className="mr-1.5 h-4 w-4" />Completed</Badge>;
      case 'Running': return <Badge variant="default" className="text-base bg-blue-500 hover:bg-blue-600"><Clock className="mr-1.5 h-4 w-4 animate-spin" />Running</Badge>;
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
            <Button variant="outline" disabled><Play className="mr-2 h-4 w-4" /> Rerun Eval</Button>
            <Button disabled><Download className="mr-2 h-4 w-4" /> Download Report</Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Overall Accuracy</CardDescription><CardTitle className="text-4xl">{runDetails.overallAccuracy ? `${runDetails.overallAccuracy.toFixed(1)}%` : 'N/A'}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">{runDetails.results?.length || 0} records processed</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Status</CardDescription><CardTitle className="text-3xl">{getStatusBadge(runDetails.status)}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">{runDetails.progress !== undefined && runDetails.status === 'Running' ? `${runDetails.progress}% complete` : `Test on: ${runDetails.runOnNRows === 0 ? 'All rows' : `First ${runDetails.runOnNRows} rows`}`}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Duration</CardDescription><CardTitle className="text-3xl">{runDetails.summaryMetrics?.duration || 'N/A'}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Estimated Cost</CardDescription><CardTitle className="text-3xl">{runDetails.summaryMetrics?.cost || 'N/A'}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent></Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5 mb-4"> {/* Adjusted for fewer tabs initially */}
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="results_table">Results Table</TabsTrigger>
          <TabsTrigger value="breakdown">Metrics Breakdown</TabsTrigger>
          {/* <TabsTrigger value="matrix">Confusion Matrix</TabsTrigger>
          <TabsTrigger value="samples">Sample Evaluations</TabsTrigger> */}
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle>Run Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <p><strong>Dataset:</strong> {runDetails.datasetName || runDetails.datasetId}{runDetails.datasetVersionNumber ? ` (v${runDetails.datasetVersionNumber})` : ''}</p>
                <p><strong>Model Connector:</strong> {runDetails.modelConnectorName || runDetails.modelConnectorId}</p>
                <p><strong>Prompt Template:</strong> {runDetails.promptName || runDetails.promptId}{runDetails.promptVersionNumber ? ` (v${runDetails.promptVersionNumber})` : ''}</p>
                <p><strong>Test on Rows:</strong> {runDetails.runOnNRows === 0 ? 'All available rows' : `First ${runDetails.runOnNRows} rows`}</p>
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
            <CardHeader><CardTitle>Detailed Evaluation Results</CardTitle><CardDescription>Row-by-row results from the Judge LLM. (Actual data parsing and display TBD)</CardDescription></CardHeader>
            <CardContent>
              {actualResultsToDisplay.length === 0 ? (
                <p className="text-muted-foreground">No results available for this run yet, or the run is still pending/running.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Input</TableHead> {/* This needs to be dynamic based on dataset schema */}
                    <TableHead>Model Output</TableHead>
                    <TableHead>Ground Truth</TableHead>
                    {runDetails.selectedEvalParamNames?.map(paramName => <TableHead key={paramName}>{paramName}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {actualResultsToDisplay.map((item, index) => (
                       <TableRow key={`result-${index}`}>
                        <TableCell className="max-w-xs truncate text-xs">{JSON.stringify(item.inputData)}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs">{typeof item.modelOutput === 'string' ? item.modelOutput : JSON.stringify(item.modelOutput)}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs">{item.groundTruth ? (typeof item.groundTruth === 'string' ? item.groundTruth : JSON.stringify(item.groundTruth)) : 'N/A'}</TableCell>
                        {runDetails.selectedEvalParamNames?.map(paramName => {
                            // Find evalParamId corresponding to paramName for safe key access
                            const paramId = runDetails.selectedEvalParamIds[runDetails.selectedEvalParamNames!.indexOf(paramName)];
                            return <TableCell key={paramId} className="text-xs">{item.evaluations[paramId] || item.evaluations[paramName] || 'N/A'}</TableCell>;
                        })}
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
        
        {/* Confusion Matrix and Samples tabs can be re-enabled when data processing logic is ready */}
      </Tabs>
    </div>
  );
}
