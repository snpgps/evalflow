'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle, PlayCircle, Eye, Copy, Trash2, Filter, Settings, BarChart3, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";


interface EvalRun {
  id: string;
  name: string;
  status: 'Completed' | 'Running' | 'Pending' | 'Failed';
  datasetName: string;
  datasetVersion: string;
  modelConnector: string;
  promptTemplate: string;
  promptVersion: string;
  createdAt: string;
  accuracy?: number; // Overall accuracy
  progress?: number; // For running evals
}

const initialRuns: EvalRun[] = [
  { id: 'run1', name: 'Chatbot Support Eval - Run 1', status: 'Completed', datasetName: 'Chatbot Product Support Q&A', datasetVersion: 'v2', modelConnector: 'OpenAI GPT-4 Prod', promptTemplate: 'Product Support Judge Prompt', promptVersion: 'v2', createdAt: '2024-07-22', accuracy: 85.5, progress: 100 },
  { id: 'run2', name: 'E-commerce Desc Gen - Initial', status: 'Running', datasetName: 'E-commerce Product Description Generation', datasetVersion: 'v1', modelConnector: 'Vertex Gemini Staging', promptTemplate: 'Description Quality Prompt', promptVersion: 'v1', createdAt: '2024-07-23', progress: 60 },
  { id: 'run3', name: 'Chatbot Support Eval - Run 2 (new prompt)', status: 'Pending', datasetName: 'Chatbot Product Support Q&A', datasetVersion: 'v2', modelConnector: 'OpenAI GPT-4 Prod', promptTemplate: 'Product Support Judge Prompt', promptVersion: 'v3 (draft)', createdAt: '2024-07-24', progress: 0 },
  { id: 'run4', name: 'Content Moderation Test', status: 'Failed', datasetName: 'User Generated Content', datasetVersion: 'v1', modelConnector: 'Local LLM', promptTemplate: 'Toxicity Check', promptVersion: 'v1', createdAt: '2024-07-21', progress: 10 },
];

// Mock data for form selects - these would come from other pages' state/data
const mockDatasets = [{ id: 'ds1', name: 'Chatbot Product Support Q&A (v2)' }, { id: 'ds2', name: 'E-commerce Product Descriptions (v1)' }];
const mockSchemas = [{ id: 'sch1', name: 'Chatbot Schema' }, { id: 'sch2', name: 'E-commerce Schema' }];
const mockEvalParams = [{ id: 'ep1', name: 'Support Eval Set' }, { id: 'ep2', name: 'Generation Quality Metrics' }];
const mockConnectors = [{ id: 'mc1', name: 'OpenAI GPT-4 Prod' }, { id: 'mc2', name: 'Vertex Gemini Staging' }];
const mockPrompts = [{ id: 'p1', name: 'Product Support Judge Prompt (v2)' }, { id: 'p2', name: 'Product Support Judge Prompt (v3 draft)' }];


export default function EvalRunsPage() {
  const [runs, setRuns] = useState<EvalRun[]>(initialRuns);
  const [isNewRunDialogOpen, setIsNewRunDialogOpen] = useState(false);

  // Form state for new run
  const [newRunName, setNewRunName] = useState('');
  const [selectedDataset, setSelectedDataset] = useState('');
  const [selectedSchema, setSelectedSchema] = useState('');
  const [selectedEvalParams, setSelectedEvalParams] = useState('');
  const [selectedConnector, setSelectedConnector] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState('');

  const handleNewRunSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Create new run object and add to state
    const newRun: EvalRun = {
      id: `run${Date.now()}`,
      name: newRunName || `Eval Run ${new Date().toLocaleDateString()}`,
      status: 'Pending',
      datasetName: mockDatasets.find(d => d.id === selectedDataset)?.name || 'N/A',
      datasetVersion: 'N/A', // This would need more complex data from dataset selection
      modelConnector: mockConnectors.find(c => c.id === selectedConnector)?.name || 'N/A',
      promptTemplate: mockPrompts.find(p => p.id === selectedPrompt)?.name || 'N/A',
      promptVersion: 'N/A', // This would need more complex data from prompt selection
      createdAt: new Date().toISOString().split('T')[0],
      progress: 0,
    };
    setRuns([newRun, ...runs]);
    resetNewRunForm();
    setIsNewRunDialogOpen(false);
  };

  const resetNewRunForm = () => {
    setNewRunName('');
    setSelectedDataset('');
    setSelectedSchema('');
    setSelectedEvalParams('');
    setSelectedConnector('');
    setSelectedPrompt('');
  };

  const getStatusBadge = (status: EvalRun['status']) => {
    switch (status) {
      case 'Completed': return <Badge variant="default" className="bg-green-500 hover:bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />Completed</Badge>;
      case 'Running': return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600"><Clock className="mr-1 h-3 w-3 animate-spin" />Running</Badge>;
      case 'Pending': return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case 'Failed': return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Failed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <PlayCircle className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">Evaluation Runs</CardTitle>
              <CardDescription>Manage and track your AI model evaluation runs. Initiate new runs and view results.</CardDescription>
            </div>
          </div>
           <Dialog open={isNewRunDialogOpen} onOpenChange={(isOpen) => { setIsNewRunDialogOpen(isOpen); if(!isOpen) resetNewRunForm();}}>
            <DialogTrigger asChild>
              <Button onClick={() => {resetNewRunForm(); setIsNewRunDialogOpen(true);}}>
                <PlusCircle className="mr-2 h-5 w-5" /> New Evaluation Run
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Configure New Evaluation Run</DialogTitle>
                <DialogDescription>
                  Select components and parameters for your new eval run.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleNewRunSubmit} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="run-name">Run Name (Optional)</Label>
                  <Input id="run-name" value={newRunName} onChange={(e) => setNewRunName(e.target.value)} placeholder="e.g., My Chatbot Eval - July"/>
                </div>
                <div>
                  <Label htmlFor="run-dataset">Dataset &amp; Version</Label>
                  <Select value={selectedDataset} onValueChange={setSelectedDataset} required>
                    <SelectTrigger id="run-dataset"><SelectValue placeholder="Select dataset" /></SelectTrigger>
                    <SelectContent>{mockDatasets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="run-schema">Product Parameter Schema</Label>
                  <Select value={selectedSchema} onValueChange={setSelectedSchema} required>
                    <SelectTrigger id="run-schema"><SelectValue placeholder="Select schema" /></SelectTrigger>
                    <SelectContent>{mockSchemas.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="run-eval-params">Evaluation Parameters Set</Label>
                  <Select value={selectedEvalParams} onValueChange={setSelectedEvalParams} required>
                    <SelectTrigger id="run-eval-params"><SelectValue placeholder="Select evaluation set" /></SelectTrigger>
                    <SelectContent>{mockEvalParams.map(ep => <SelectItem key={ep.id} value={ep.id}>{ep.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="run-connector">Model Connector (Judge LLM)</Label>
                  <Select value={selectedConnector} onValueChange={setSelectedConnector} required>
                    <SelectTrigger id="run-connector"><SelectValue placeholder="Select model connector" /></SelectTrigger>
                    <SelectContent>{mockConnectors.map(mc => <SelectItem key={mc.id} value={mc.id}>{mc.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="run-prompt">Prompt Template &amp; Version</Label>
                  <Select value={selectedPrompt} onValueChange={setSelectedPrompt} required>
                    <SelectTrigger id="run-prompt"><SelectValue placeholder="Select prompt" /></SelectTrigger>
                    <SelectContent>{mockPrompts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Card className="mt-4 bg-muted/50 p-4">
                  <CardHeader className="p-0 pb-2">
                     <CardTitle className="text-base flex items-center"><Settings className="mr-2 h-4 w-4 text-muted-foreground" /> Advanced Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 space-y-2 text-sm">
                    <p className="text-muted-foreground">Configure batching, concurrency, and cost limits (UI placeholders).</p>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="run-concurrency">Max Concurrency</Label>
                      <Input id="run-concurrency" type="number" defaultValue="5" className="w-20 h-8" />
                    </div>
                     <div className="flex items-center justify-between">
                      <Label htmlFor="run-cost-limit">Cost Limit ($)</Label>
                      <Input id="run-cost-limit" type="number" placeholder="Optional" className="w-20 h-8" />
                    </div>
                     <p className="text-xs text-muted-foreground pt-2">Estimated cost: <span className="font-semibold">$XX.XX</span> (Calculation TBD)</p>
                  </CardContent>
                </Card>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {setIsNewRunDialogOpen(false); resetNewRunForm();}}>Cancel</Button>
                  <Button type="submit">
                    <PlayCircle className="mr-2 h-4 w-4" /> Start Evaluation
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Evaluation Run History</CardTitle>
              <CardDescription>Review past and ongoing evaluation runs.</CardDescription>
            </div>
            <Button variant="outline" size="sm"><Filter className="mr-2 h-4 w-4" /> Filter Runs</Button>
          </div>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
             <div className="text-center text-muted-foreground py-8">
              <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p>No evaluation runs found.</p>
              <p className="text-sm">Click "New Evaluation Run" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Accuracy</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium max-w-xs truncate">
                      <Link href={`/runs/${run.id}`} className="hover:underline">{run.name}</Link>
                    </TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.datasetName} ({run.datasetVersion})</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.modelConnector}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.promptTemplate} ({run.promptVersion})</TableCell>
                    <TableCell>
                      {run.status === 'Completed' && run.accuracy !== undefined ? `${run.accuracy.toFixed(1)}%` : 
                       run.status === 'Running' && run.progress !== undefined ? <Progress value={run.progress} className="h-2 w-20" /> : 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.createdAt}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Link href={`/runs/${run.id}`}>
                        <Button variant="ghost" size="icon" title="View Details">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                       <Button variant="ghost" size="icon" title="Re-run with new config (Clone)">
                        <Copy className="h-4 w-4" />
                      </Button>
                       <Button variant="ghost" size="icon" title="Delete Run" className="text-destructive hover:text-destructive/90">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
