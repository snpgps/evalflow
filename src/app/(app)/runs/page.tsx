
'use client';

import { useState, type FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle, PlayCircle, Eye, Trash2, Filter, Settings, BarChart3, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { 
  collection, addDoc, getDocs, doc, deleteDoc, serverTimestamp, 
  query, orderBy, Timestamp, type FieldValue, getDoc
} from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';

// Interfaces for dropdown data
interface SelectableDatasetVersion { id: string; versionNumber: number; fileName?: string; }
interface SelectableDataset { id: string; name: string; versions: SelectableDatasetVersion[]; }
interface SelectableModelConnector { id: string; name: string; }
interface SelectablePromptVersion { id: string; versionNumber: number;}
interface SelectablePromptTemplate { id: string; name: string; versions: SelectablePromptVersion[]; }
interface SelectableEvalParameter { id: string; name: string; }


// Interface for EvalRun Firestore document
interface EvalRun {
  id: string; // Firestore document ID
  name: string;
  status: 'Completed' | 'Running' | 'Pending' | 'Failed' | 'Processing';
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp;

  // Configuration
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

  // Results
  overallAccuracy?: number;
  progress?: number;
  results?: any[]; 
  summaryMetrics?: Record<string, any>;
  errorMessage?: string;
  userId?: string; // To ensure user-specific data
}

type NewEvalRunPayload = Omit<EvalRun, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'results' | 'summaryMetrics' | 'progress' | 'overallAccuracy' | 'errorMessage' | 'status' | 'userId'> & {
  createdAt: FieldValue;
  updatedAt: FieldValue;
  status: 'Pending';
  userId: string;
};


// Fetch functions for dropdowns
const fetchSelectableDatasets = async (userId: string): Promise<SelectableDataset[]> => {
  const datasetsCollectionRef = collection(db, 'users', userId, 'datasets');
  const q = query(datasetsCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  const datasetsData: SelectableDataset[] = [];
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const versionsCollectionRef = collection(db, 'users', userId, 'datasets', docSnap.id, 'versions');
    const versionsQuery = query(versionsCollectionRef, orderBy('versionNumber', 'desc'));
    const versionsSnapshot = await getDocs(versionsQuery);
    
    const versions: SelectableDatasetVersion[] = [];
    for (const vDoc of versionsSnapshot.docs) {
        const versionData = vDoc.data();
        // Only include versions that have a columnMapping
        if (versionData.columnMapping && Object.keys(versionData.columnMapping).length > 0) {
            versions.push({
                 id: vDoc.id, 
                 versionNumber: versionData.versionNumber as number,
                 fileName: versionData.fileName as string 
            });
        }
    }
    
    if (versions.length > 0) { // Only include datasets with at least one mapped version
        datasetsData.push({ id: docSnap.id, name: data.name as string, versions });
    }
  }
  return datasetsData;
};

const fetchSelectableModelConnectors = async (userId: string): Promise<SelectableModelConnector[]> => {
  const connectorsCollectionRef = collection(db, 'users', userId, 'modelConnectors');
  const q = query(connectorsCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name as string }));
};

const fetchSelectablePromptTemplates = async (userId: string): Promise<SelectablePromptTemplate[]> => {
  const promptsCollectionRef = collection(db, 'users', userId, 'promptTemplates');
  const q = query(promptsCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  const promptsData: SelectablePromptTemplate[] = [];
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const versionsSnapshot = await getDocs(query(collection(db, 'users', userId, 'promptTemplates', docSnap.id, 'versions'), orderBy('versionNumber', 'desc')));
    const versions = versionsSnapshot.docs
      .map(vDoc => ({ 
        id: vDoc.id, 
        versionNumber: vDoc.data().versionNumber as number 
      }))
      .filter(v => v.versionNumber); 
    if (versions.length > 0) { 
        promptsData.push({ id: docSnap.id, name: data.name as string, versions });
    }
  }
  return promptsData;
};

const fetchSelectableEvalParameters = async (userId: string): Promise<SelectableEvalParameter[]> => {
  const evalParamsCollectionRef = collection(db, 'users', userId, 'evaluationParameters');
  const q = query(evalParamsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name as string }));
};

// Fetch Evaluation Runs
const fetchEvalRuns = async (userId: string): Promise<EvalRun[]> => {
  const evalRunsCollectionRef = collection(db, 'users', userId, 'evaluationRuns');
  const q = query(evalRunsCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as EvalRun));
};


export default function EvalRunsPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    setCurrentUserId(storedUserId || null);
    setIsLoadingUserId(false);
  }, []);

  const { data: evalRuns = [], isLoading: isLoadingEvalRuns, error: fetchEvalRunsError } = useQuery<EvalRun[], Error>({
    queryKey: ['evalRuns', currentUserId],
    queryFn: () => fetchEvalRuns(currentUserId!),
    enabled: !!currentUserId && !isLoadingUserId,
  });
  
  const { data: datasets = [], isLoading: isLoadingDatasets } = useQuery<SelectableDataset[], Error>({
    queryKey: ['selectableDatasets', currentUserId],
    queryFn: () => fetchSelectableDatasets(currentUserId!),
    enabled: !!currentUserId,
  });
  const { data: modelConnectors = [], isLoading: isLoadingConnectors } = useQuery<SelectableModelConnector[], Error>({
    queryKey: ['selectableModelConnectors', currentUserId],
    queryFn: () => fetchSelectableModelConnectors(currentUserId!),
    enabled: !!currentUserId,
  });
  const { data: promptTemplates = [], isLoading: isLoadingPrompts } = useQuery<SelectablePromptTemplate[], Error>({
    queryKey: ['selectablePromptTemplates', currentUserId],
    queryFn: () => fetchSelectablePromptTemplates(currentUserId!),
    enabled: !!currentUserId,
  });
  const { data: evaluationParameters = [], isLoading: isLoadingEvalParams } = useQuery<SelectableEvalParameter[], Error>({
    queryKey: ['selectableEvalParameters', currentUserId],
    queryFn: () => fetchSelectableEvalParameters(currentUserId!),
    enabled: !!currentUserId,
  });


  const [isNewRunDialogOpen, setIsNewRunDialogOpen] = useState(false);
  const [newRunName, setNewRunName] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedDatasetVersionId, setSelectedDatasetVersionId] = useState('');
  const [selectedConnectorId, setSelectedConnectorId] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [selectedPromptVersionId, setSelectedPromptVersionId] = useState('');
  const [selectedEvalParamIds, setSelectedEvalParamIds] = useState<string[]>([]);
  const [runOnNRows, setRunOnNRows] = useState<number>(0);


  const addEvalRunMutation = useMutation<string, Error, NewEvalRunPayload>({
    mutationFn: async (newRunData) => {
      if (!currentUserId) throw new Error("User not identified.");
      const docRef = await addDoc(collection(db, 'users', currentUserId, 'evaluationRuns'), newRunData);
      return docRef.id;
    },
    onSuccess: (newRunId) => {
      queryClient.invalidateQueries({ queryKey: ['evalRuns', currentUserId] });
      toast({ 
        title: "Success", 
        description: "New evaluation run created and set to Pending.",
        action: (
          <Button variant="outline" size="sm" onClick={() => router.push(`/runs/${newRunId}`)}>
            View Run
          </Button>
        ),
      });
      resetNewRunForm();
      setIsNewRunDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to create run: ${error.message}`, variant: "destructive" });
    }
  });
  
  const deleteEvalRunMutation = useMutation<void, Error, string>({
    mutationFn: async (runId: string) => {
        if (!currentUserId) throw new Error("User not identified.");
        await deleteDoc(doc(db, 'users', currentUserId, 'evaluationRuns', runId));
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['evalRuns', currentUserId] });
        toast({title: "Success", description: "Evaluation run deleted."});
    },
    onError: (error) => {
        toast({title: "Error", description: `Failed to delete run: ${error.message}`, variant: "destructive"});
    }
  });

  const handleNewRunSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return;

    const dataset = datasets.find(d => d.id === selectedDatasetId);
    const datasetVersion = dataset?.versions.find(v => v.id === selectedDatasetVersionId);
    const connector = modelConnectors.find(c => c.id === selectedConnectorId);
    const prompt = promptTemplates.find(p => p.id === selectedPromptId);
    const promptVersion = prompt?.versions.find(v => v.id === selectedPromptVersionId);
    const selEvalParams = evaluationParameters.filter(ep => selectedEvalParamIds.includes(ep.id));

    if (!newRunName.trim()){
        toast({ title: "Validation Error", description: "Run Name is required.", variant: "destructive"});
        return;
    }
    if (!dataset || !datasetVersion || !connector || !prompt || !promptVersion || selEvalParams.length === 0) {
        toast({ title: "Configuration Incomplete", description: "Please ensure all fields are selected, including at least one evaluation parameter.", variant: "destructive"});
        return;
    }
     if (runOnNRows < 0) {
      toast({ title: "Validation Error", description: "Number of rows to test cannot be negative.", variant: "destructive" });
      return;
    }


    const newRunData: NewEvalRunPayload = {
      name: newRunName.trim(),
      status: 'Pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      userId: currentUserId,
      datasetId: selectedDatasetId,
      datasetName: dataset?.name,
      datasetVersionId: selectedDatasetVersionId,
      datasetVersionNumber: datasetVersion?.versionNumber,
      modelConnectorId: selectedConnectorId,
      modelConnectorName: connector?.name,
      promptId: selectedPromptId,
      promptName: prompt?.name,
      promptVersionId: selectedPromptVersionId,
      promptVersionNumber: promptVersion?.versionNumber,
      selectedEvalParamIds: selectedEvalParamIds,
      selectedEvalParamNames: selEvalParams.map(ep => ep.name),
      runOnNRows: Number(runOnNRows) || 0, 
    };
    addEvalRunMutation.mutate(newRunData);
  };

  const resetNewRunForm = () => {
    setNewRunName('');
    setSelectedDatasetId('');
    setSelectedDatasetVersionId('');
    setSelectedConnectorId('');
    setSelectedPromptId('');
    setSelectedPromptVersionId('');
    setSelectedEvalParamIds([]);
    setRunOnNRows(0);
  };
  
  const handleDeleteRun = (runId: string) => {
    if (confirm('Are you sure you want to delete this evaluation run? This action cannot be undone.')) {
        deleteEvalRunMutation.mutate(runId);
    }
  };

  const getStatusBadge = (status: EvalRun['status']) => {
    switch (status) {
      case 'Completed': return <Badge variant="default" className="bg-green-500 hover:bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />Completed</Badge>;
      case 'Running': return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600"><Clock className="mr-1 h-3 w-3 animate-spin" />Running</Badge>;
      case 'Processing': return <Badge variant="default" className="bg-purple-500 hover:bg-purple-600"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Processing</Badge>;
      case 'Pending': return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case 'Failed': return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Failed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const formatTimestamp = (timestamp?: Timestamp) => {
    return timestamp ? timestamp.toDate().toLocaleDateString() : 'N/A';
  };

  const isLoadingDialogData = isLoadingDatasets || isLoadingConnectors || isLoadingPrompts || isLoadingEvalParams;

  if (isLoadingUserId) return <div className="p-6"><Skeleton className="h-32 w-full"/></div>;
  if (!currentUserId) return <Card><CardContent className="p-6 text-center text-muted-foreground">Please log in to manage evaluation runs.</CardContent></Card>;


  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <PlayCircle className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">Evaluation Runs</CardTitle>
              <CardDescription>Manage and track your AI model evaluation runs.</CardDescription>
            </div>
          </div>
           <Dialog open={isNewRunDialogOpen} onOpenChange={(isOpen) => { setIsNewRunDialogOpen(isOpen); if(!isOpen) resetNewRunForm();}}>
            <DialogTrigger asChild>
              <Button onClick={() => {resetNewRunForm(); setIsNewRunDialogOpen(true);}} disabled={addEvalRunMutation.isPending}>
                <PlusCircle className="mr-2 h-5 w-5" /> New Evaluation Run
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg flex flex-col max-h-[85vh]">
              <DialogHeader className="flex-shrink-0 p-6 pb-4 border-b">
                <DialogTitle>Configure New Evaluation Run</DialogTitle>
                <DialogDescription>Select components and parameters for your new eval run.</DialogDescription>
              </DialogHeader>
              {isLoadingDialogData ? (
                <div className="py-8 flex justify-center items-center flex-grow"><Loader2 className="h-8 w-8 animate-spin" /> <span className="ml-2">Loading configuration options...</span></div>
              ) : (
                <>
                 <div className="flex-grow overflow-y-auto">
                    <form id="new-eval-run-form" onSubmit={handleNewRunSubmit} className="p-6 space-y-4">
                      <div><Label htmlFor="run-name">Run Name</Label><Input id="run-name" value={newRunName} onChange={(e) => setNewRunName(e.target.value)} placeholder="e.g., My Chatbot Eval - July" required/></div>
                      
                      <div>
                        <Label htmlFor="run-dataset">Dataset (Mapped Versions Only)</Label>
                        <Select value={selectedDatasetId} onValueChange={(value) => {setSelectedDatasetId(value); setSelectedDatasetVersionId('');}} required>
                          <SelectTrigger id="run-dataset"><SelectValue placeholder="Select dataset" /></SelectTrigger>
                          <SelectContent>{datasets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {selectedDatasetId && datasets.find(d => d.id === selectedDatasetId)?.versions.length > 0 && (
                        <div>
                          <Label htmlFor="run-dataset-version">Dataset Version (Mapped)</Label>
                          <Select value={selectedDatasetVersionId} onValueChange={setSelectedDatasetVersionId} required>
                            <SelectTrigger id="run-dataset-version"><SelectValue placeholder="Select version" /></SelectTrigger>
                            <SelectContent>{datasets.find(d => d.id === selectedDatasetId)?.versions.sort((a,b) => b.versionNumber - a.versionNumber).map(v => <SelectItem key={v.id} value={v.id}>v{v.versionNumber} - {v.fileName || 'Unnamed version'}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      )}

                      <div><Label htmlFor="run-connector">Model Connector (Judge LLM)</Label>
                        <Select value={selectedConnectorId} onValueChange={setSelectedConnectorId} required>
                          <SelectTrigger id="run-connector"><SelectValue placeholder="Select model connector" /></SelectTrigger>
                          <SelectContent>{modelConnectors.map(mc => <SelectItem key={mc.id} value={mc.id}>{mc.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="run-prompt">Prompt Template</Label>
                        <Select value={selectedPromptId} onValueChange={(value) => {setSelectedPromptId(value); setSelectedPromptVersionId('');}} required>
                          <SelectTrigger id="run-prompt"><SelectValue placeholder="Select prompt" /></SelectTrigger>
                          <SelectContent>{promptTemplates.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                       {selectedPromptId && promptTemplates.find(p => p.id === selectedPromptId)?.versions.length > 0 && (
                        <div>
                          <Label htmlFor="run-prompt-version">Prompt Version</Label>
                          <Select value={selectedPromptVersionId} onValueChange={setSelectedPromptVersionId} required>
                            <SelectTrigger id="run-prompt-version"><SelectValue placeholder="Select version" /></SelectTrigger>
                            <SelectContent>{promptTemplates.find(p => p.id === selectedPromptId)?.versions.sort((a,b) => b.versionNumber - a.versionNumber).map(v => <SelectItem key={v.id} value={v.id}>Version {v.versionNumber}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      )}

                      <div><Label>Evaluation Parameters (Select one or more)</Label>
                        <Card className="p-3 max-h-40 overflow-y-auto bg-muted/50 border">
                          <div className="space-y-2">
                            {evaluationParameters.length === 0 && <p className="text-xs text-muted-foreground">No evaluation parameters defined.</p>}
                            {evaluationParameters.map(ep => (
                              <div key={ep.id} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`ep-${ep.id}`} 
                                  checked={selectedEvalParamIds.includes(ep.id)}
                                  onCheckedChange={(checked) => {
                                    setSelectedEvalParamIds(prev => 
                                      checked ? [...prev, ep.id] : prev.filter(id => id !== ep.id)
                                    );
                                  }}
                                />
                                <Label htmlFor={`ep-${ep.id}`} className="font-normal">{ep.name}</Label>
                              </div>
                            ))}
                          </div>
                        </Card>
                      </div>
                      
                      <div>
                        <Label htmlFor="run-nrows">Test on first N rows (0 for all)</Label>
                        <Input id="run-nrows" type="number" value={runOnNRows} onChange={(e) => setRunOnNRows(parseInt(e.target.value, 10))} min="0" />
                        <p className="text-xs text-muted-foreground mt-1">Enter 1 to test on the first row only. 0 uses all (mock) data or up to default limit.</p>
                      </div>
                    </form>
                  </div>
                  <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => {setIsNewRunDialogOpen(false); resetNewRunForm();}}>Cancel</Button>
                    <Button 
                        type="submit" 
                        form="new-eval-run-form" 
                        disabled={addEvalRunMutation.isPending || !selectedDatasetId || !selectedConnectorId || !selectedPromptId || selectedEvalParamIds.length === 0 || !selectedDatasetVersionId || !selectedPromptVersionId || !newRunName.trim()}
                    >
                      {addEvalRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlayCircle className="mr-2 h-4 w-4" />}
                      Create Evaluation Run
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div><CardTitle>Evaluation Run History</CardTitle><CardDescription>Review past and ongoing evaluation runs.</CardDescription></div>
            <Button variant="outline" size="sm" disabled><Filter className="mr-2 h-4 w-4" /> Filter Runs</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingEvalRuns && <div className="p-6"><Skeleton className="h-40 w-full"/></div>}
          {fetchEvalRunsError && <p className="text-destructive p-4">Error fetching runs: {fetchEvalRunsError.message}</p>}
          {!isLoadingEvalRuns && !fetchEvalRunsError && evalRuns.length === 0 && (
             <div className="text-center text-muted-foreground py-8">
              <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p>No evaluation runs found.</p>
              <p className="text-sm">Click "New Evaluation Run" to get started.</p>
            </div>
          )}
          {!isLoadingEvalRuns && !fetchEvalRunsError && evalRuns.length > 0 && (
            <Table>
              <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Dataset</TableHead>
                  <TableHead>Model</TableHead><TableHead>Prompt</TableHead><TableHead>Accuracy</TableHead>
                  <TableHead>Created At</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {evalRuns.map((run) => (
                  <TableRow key={run.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium max-w-xs truncate">
                      <Link href={`/runs/${run.id}`} className="hover:underline">{run.name}</Link>
                    </TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.datasetName || run.datasetId}{run.datasetVersionNumber ? ` (v${run.datasetVersionNumber})` : ''}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.modelConnectorName || run.modelConnectorId}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.promptName || run.promptId}{run.promptVersionNumber ? ` (v${run.promptVersionNumber})` : ''}</TableCell>
                    <TableCell>
                      {run.status === 'Completed' && run.overallAccuracy !== undefined ? `${run.overallAccuracy.toFixed(1)}%` : 
                       (run.status === 'Running' || run.status === 'Processing') && run.progress !== undefined ? <Progress value={run.progress} className="h-2 w-20" /> : 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatTimestamp(run.createdAt)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Link href={`/runs/${run.id}`} passHref>
                        <Button variant="ghost" size="icon" title="View Details"><Eye className="h-4 w-4" /></Button>
                      </Link>
                      <Button variant="ghost" size="icon" title="Delete Run" className="text-destructive hover:text-destructive/90" onClick={() => handleDeleteRun(run.id)} disabled={deleteEvalRunMutation.isPending && deleteEvalRunMutation.variables === run.id}>
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
    

    