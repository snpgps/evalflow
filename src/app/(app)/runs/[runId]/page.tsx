'use client';

import { useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Play, Settings, FileSearch, BarChartHorizontalBig, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, PieChart, Pie, Cell as RechartsCells } from 'recharts'; // Recharts for charts
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'; // Shadcn chart components

// Mock data for a specific run - in a real app, this would be fetched based on runId
const mockRunDetails = {
  id: 'run1',
  name: 'Chatbot Support Eval - Run 1',
  status: 'Completed',
  createdAt: '2024-07-22',
  config: {
    dataset: 'Chatbot Product Support Q&A (v2)',
    schema: 'Chatbot Schema',
    evalParameters: 'Support Eval Set',
    modelConnector: 'OpenAI GPT-4 Prod',
    prompt: 'Product Support Judge Prompt (v2)',
  },
  summaryMetrics: {
    overallAccuracy: 85.5,
    totalRecords: 10520,
    evaluatedRecords: 10520,
    duration: '2h 30min',
    cost: '$12.50', // Placeholder
  },
  perParameterBreakdown: [
    { parameter: 'Hallucination', accuracy: 95.2, correct: 9996, incorrect: 524, total: 10520 },
    { parameter: 'Context Relevance', accuracy: 88.0, correct: 9258, incorrect: 1262, total: 10520 },
    { parameter: 'Groundedness', accuracy: 90.1, correct: 9479, incorrect: 1041, total: 10520 },
    { parameter: 'Completeness', accuracy: 75.3, correct: 7922, incorrect: 2598, total: 10520 },
    { parameter: 'Toxicity', accuracy: 99.8, correct: 10500, incorrect: 20, total: 10520 },
  ],
  // Simplified confusion matrix data (Actual vs Predicted for a binary classification on "Overall Quality")
  // For a real confusion matrix, you'd have more complex data structure.
  // This is just for placeholder visualization.
  confusionMatrix: [ // Example: [[True Positive, False Negative], [False Positive, True Negative]]
    { name: 'Actual Good, Predicted Good (TP)', value: 8000 },
    { name: 'Actual Good, Predicted Bad (FN)', value: 968 },
    { name: 'Actual Bad, Predicted Good (FP)', value: 552 },
    { name: 'Actual Bad, Predicted Bad (TN)', value: 1000 },
  ],
  sampleEvaluations: [ // Top few examples
    { id: 'sample1', input: 'User: My device won\'t turn on.', modelOutput: 'Try holding the power button for 10 seconds.', groundTruth: 'Good', eval: { Hallucination: 'Pass', 'Context Relevance': 'Pass'} },
    { id: 'sample2', input: 'User: How do I reset my password?', modelOutput: 'You can reset it by chanting to the moon.', groundTruth: 'Bad', eval: { Hallucination: 'Fail - invented fact', 'Context Relevance': 'Fail'} },
  ],
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042']; // For Pie chart

export default function RunDetailsPage() {
  const params = useParams();
  const runId = params.runId as string;

  // In a real app, fetch runDetails based on runId
  const runDetails = mockRunDetails; 

  if (!runDetails) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-headline flex items-center"><AlertTriangle className="mr-2 h-6 w-6 text-destructive"/>Run Not Found</CardTitle>
        </CardHeader>
        <CardContent>
          <p>The evaluation run with ID "{runId}" could not be found.</p>
        </CardContent>
      </Card>
    );
  }
  
  const perParameterChartData = runDetails.perParameterBreakdown.map(p => ({ name: p.parameter, Accuracy: p.accuracy }));

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
           <div>
            <div className="flex items-center gap-2">
              <FileSearch className="h-7 w-7 text-primary" />
              <CardTitle className="text-2xl font-headline">{runDetails.name}</CardTitle>
            </div>
            <CardDescription>Detailed results for evaluation run ID: {runDetails.id}. Created on: {runDetails.createdAt}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline"><Play className="mr-2 h-4 w-4" /> Rerun Eval</Button>
            <Button><Download className="mr-2 h-4 w-4" /> Download Report (XLSX)</Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Overall Accuracy</CardDescription>
            <CardTitle className="text-4xl">{runDetails.summaryMetrics.overallAccuracy}%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Based on {runDetails.summaryMetrics.evaluatedRecords.toLocaleString()} / {runDetails.summaryMetrics.totalRecords.toLocaleString()} records.
            </div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="pb-2">
            <CardDescription>Duration</CardDescription>
            <CardTitle className="text-3xl">{runDetails.summaryMetrics.duration}</CardTitle>
          </CardHeader>
          <CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Estimated Cost</CardDescription>
            <CardTitle className="text-3xl">{runDetails.summaryMetrics.cost}</CardTitle>
          </CardHeader>
          <CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent>
        </Card>
         <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-3xl text-green-600">{runDetails.status}</CardTitle>
          </CardHeader>
           <CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="breakdown">Per-Parameter Breakdown</TabsTrigger>
          <TabsTrigger value="matrix">Confusion Matrix</TabsTrigger>
          <TabsTrigger value="samples">Sample Evaluations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Run Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <p><strong>Dataset:</strong> {runDetails.config.dataset}</p>
                <p><strong>Schema:</strong> {runDetails.config.schema}</p>
                <p><strong>Evaluation Parameters:</strong> {runDetails.config.evalParameters}</p>
                <p><strong>Model Connector:</strong> {runDetails.config.modelConnector}</p>
                <p><strong>Prompt:</strong> {runDetails.config.prompt}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center"><BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Per-Parameter Accuracy</CardTitle>
              <CardDescription>Accuracy breakdown for each evaluation parameter.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ Accuracy: { label: "Accuracy", color: "hsl(var(--primary))" } }} className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perParameterChartData} layout="vertical" margin={{ right: 30, left: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} unit="%" />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'hsl(var(--muted))' }} />
                    <Legend />
                    <Bar dataKey="Accuracy" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
               <Table className="mt-6">
                <TableHeader>
                  <TableRow>
                    <TableHead>Parameter</TableHead>
                    <TableHead className="text-right">Accuracy</TableHead>
                    <TableHead className="text-right">Correct</TableHead>
                    <TableHead className="text-right">Incorrect</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runDetails.perParameterBreakdown.map((param) => (
                    <TableRow key={param.parameter}>
                      <TableCell className="font-medium">{param.parameter}</TableCell>
                      <TableCell className="text-right font-semibold">{param.accuracy.toFixed(1)}%</TableCell>
                      <TableCell className="text-right text-green-600">{param.correct.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-red-600">{param.incorrect.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{param.total.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="matrix">
          <Card>
            <CardHeader>
              <CardTitle>Confusion Matrix (Example)</CardTitle>
              <CardDescription>Visualization of model predictions vs. ground truth for overall quality. (Illustrative)</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] flex items-center justify-center">
               <ChartContainer config={{}} className="mx-auto aspect-square max-h-[350px]">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie data={runDetails.confusionMatrix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label>
                        {runDetails.confusionMatrix.map((entry, index) => (
                          <RechartsCells key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
                {/* A proper confusion matrix table would go here too */}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="samples">
          <Card>
            <CardHeader>
              <CardTitle>Sample Evaluations</CardTitle>
              <CardDescription>Review individual evaluation examples.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Input</TableHead>
                    <TableHead>Model Output</TableHead>
                    <TableHead>Ground Truth</TableHead>
                    <TableHead>Evaluation Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runDetails.sampleEvaluations.map((sample) => (
                    <TableRow key={sample.id}>
                      <TableCell className="max-w-xs truncate">{sample.input}</TableCell>
                      <TableCell className="max-w-xs truncate">{sample.modelOutput}</TableCell>
                      <TableCell><Badge variant={sample.groundTruth === 'Good' ? 'default' : 'destructive'} className={sample.groundTruth === 'Good' ? 'bg-green-500' : ''}>{sample.groundTruth}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {Object.entries(sample.eval).map(([key, value]) => (
                          <div key={key}><strong>{key}:</strong> {String(value)}</div>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
