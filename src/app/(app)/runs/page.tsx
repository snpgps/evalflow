
'use client';

import { useState, type FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlusCircle, PlayCircle, Eye, Trash2, Filter, Settings, BarChart3, Clock, CheckCircle, XCircle, Loader2, TestTube2, CheckCheck, Zap, FileText as FileTextIcon, AlignLeft, Info, Briefcase, Cog, Layers, FileSearch } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, getDocs, doc, deleteDoc, serverTimestamp,
  query, orderBy, Timestamp, type FieldValue, getDoc, writeBatch
} from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';


// Interfaces for dropdown data
interface SelectableDatasetVersion { id: string; versionNumber: number; fileName?: string; columnMapping?: Record<string,string>; groundTruthMapping?: Record<string, string>; }
interface SelectableDataset { id: string; name: string; versions: SelectableDatasetVersion[]; }
interface SelectableModelConnector { id: string; name: string; provider?: string; config?: string; }
interface SelectablePromptVersion { id: string; versionNumber: number;}
interface SelectablePromptTemplate { id: string; name: string; versions: SelectablePromptVersion[]; }
interface SelectableEvalParameter { id: string; name: string; }
interface SelectableContextDocument { id: string; name: string; fileName: string; }
interface SelectableSummarizationDef { id: string; name: string; }


// Interface for EvalRun Firestore document
interface EvalRun {
  id: string; // Firestore document ID
  name: string;
  runType: 'Product' | 'GroundTruth';
  status: 'Completed' | 'Running' | 'Pending' | 'Failed' | 'Processing' | 'DataPreviewed';
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
  modelConnectorProvider?: string; // Added
  modelConnectorConfigString?: string; // Added to store the config JSON string
  modelIdentifierForGenkit?: string;

  promptId: string;
  promptName?: string;
  promptVersionId?: string;
  promptVersionNumber?: number;

  selectedEvalParamIds: string[];
  selectedEvalParamNames?: string[];
  selectedContextDocumentIds?: string[];
  selectedSummarizationDefIds?: string[]; 
  selectedSummarizationDefNames?: string[]; 


  runOnNRows: number;
  concurrencyLimit: number;

  // Results
  progress?: number;
  results?: any[];
  previewedDatasetSample?: Array<Record<string, any>>;
  summaryMetrics?: Record<string, any>;
  errorMessage?: string;
  userId?: string;
}

type NewEvalRunPayload = Omit<EvalRun, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'results' | 'summaryMetrics' | 'progress' | 'errorMessage' | 'status' | 'userId' | 'previewedDatasetSample'> & {
  createdAt: FieldValue;
  updatedAt: FieldValue;
  status: 'Pending';
  userId: string;
};

const GEMINI_CONTEXT_CACHING_MODELS = ["gemini-1.5-pro-latest", "gemini-1.5-flash-latest"];

// Fetch functions for dropdowns
const fetchSelectableDatasets = async (userId: string | null): Promise<SelectableDataset[]> => {
  if (!userId) return [];
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
    versionsSnapshot.forEach(vDoc => {
        const versionData = vDoc.data();
        versions.push({
             id: vDoc.id,
             versionNumber: versionData.versionNumber as number,
             fileName: versionData.fileName as string,
             columnMapping: versionData.columnMapping as Record<string, string> | undefined,
             groundTruthMapping: versionData.groundTruthMapping as Record<string, string> | undefined
        });
    });

    datasetsData.push({ id: docSnap.id, name: (data.name as string || `Dataset ${docSnap.id.substring(0,5)}`), versions });
  }
  return datasetsData;
};

const fetchSelectableModelConnectors = async (userId: string | null): Promise<SelectableModelConnector[]> => {
  if (!userId) return [];
  const connectorsCollectionRef = collection(db, 'users', userId, 'modelConnectors');
  const q = query(connectorsCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return { id: docSnap.id, name: data.name as string, provider: data.provider as string, config: data.config as string };
  });
};

const fetchSelectablePromptTemplates = async (userId: string | null): Promise<SelectablePromptTemplate[]> => {
  if (!userId) return [];
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
    promptsData.push({ id: docSnap.id, name: (data.name as string || `Prompt ${docSnap.id.substring(0,5)}`), versions });
  }
  return promptsData;
};

const fetchSelectableEvalParameters = async (userId: string | null): Promise<SelectableEvalParameter[]> => {
  if (!userId) return [];
  const evalParamsCollectionRef = collection(db, 'users', userId, 'evaluationParameters');
  const q = query(evalParamsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name as string }));
};

const fetchSelectableContextDocuments = async (userId: string | null): Promise<SelectableContextDocument[]> => {
  if (!userId) return [];
  const contextDocsCollectionRef = collection(db, 'users', userId, 'contextDocuments');
  const q = query(contextDocsCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name as string, fileName: docSnap.data().fileName as string }));
};

const fetchSelectableSummarizationDefs = async (userId: string | null): Promise<SelectableSummarizationDef[]> => {
  if (!userId) return [];
  const defsCollectionRef = collection(db, 'users', userId, 'summarizationDefinitions');
  const q = query(defsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name as string }));
};


// Fetch Evaluation Runs
const fetchEvalRuns = async (userId: string | null): Promise<EvalRun[]> => {
  if (!userId) return [];
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
    queryFn: () => fetchEvalRuns(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const { data: datasets = [], isLoading: isLoadingDatasets } = useQuery<SelectableDataset[], Error>({
    queryKey: ['selectableDatasets', currentUserId],
    queryFn: () => fetchSelectableDatasets(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });
  const { data: modelConnectors = [], isLoading: isLoadingConnectors } = useQuery<SelectableModelConnector[], Error>({
    queryKey: ['selectableModelConnectors', currentUserId],
    queryFn: () => fetchSelectableModelConnectors(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });
  const { data: promptTemplates = [], isLoading: isLoadingPrompts } = useQuery<SelectablePromptTemplate[], Error>({
    queryKey: ['selectablePromptTemplates', currentUserId],
    queryFn: () => fetchSelectablePromptTemplates(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });
  const { data: evaluationParameters = [], isLoading: isLoadingEvalParams } = useQuery<SelectableEvalParameter[], Error>({
    queryKey: ['selectableEvalParameters', currentUserId],
    queryFn: () => fetchSelectableEvalParameters(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });
  const { data: contextDocuments = [], isLoading: isLoadingContextDocs } = useQuery<SelectableContextDocument[], Error>({
    queryKey: ['selectableContextDocuments', currentUserId],
    queryFn: () => fetchSelectableContextDocuments(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });
  const { data: summarizationDefinitions = [], isLoading: isLoadingSummarizationDefs } = useQuery<SelectableSummarizationDef[], Error>({
    queryKey: ['selectableSummarizationDefs', currentUserId],
    queryFn: () => fetchSelectableSummarizationDefs(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });


  const [isNewRunDialogOpen, setIsNewRunDialogOpen] = useState(false);
  const [newRunName, setNewRunName] = useState('');
  const [newRunType, setNewRunType] = useState<'Product' | 'GroundTruth'>('Product');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedDatasetVersionId, setSelectedDatasetVersionId] = useState('');
  const [selectedConnectorId, setSelectedConnectorId] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [selectedPromptVersionId, setSelectedPromptVersionId] = useState('');
  const [selectedEvalParamIds, setSelectedEvalParamIds] = useState<string[]>([]);
  const [selectedContextDocIds, setSelectedContextDocIds] = useState<string[]>([]);
  const [selectedSummarizationDefIds, setSelectedSummarizationDefIds] = useState<string[]>([]);
  const [runOnNRows, setRunOnNRows] = useState<number>(0); // 0 means all
  const [newRunConcurrencyLimit, setNewRunConcurrencyLimit] = useState<number>(3);

  const [showContextDocSelector, setShowContextDocSelector] = useState(false);

  useEffect(() => {
    let shouldShowSelector = false;
    if (selectedConnectorId && modelConnectors) {
      const connector = modelConnectors.find(c => c.id === selectedConnectorId);
      if (connector && connector.provider === 'Vertex AI' && connector.config) {
        try {
          const configJson = JSON.parse(connector.config);
          if (configJson.model && GEMINI_CONTEXT_CACHING_MODELS.includes(configJson.model)) {
            shouldShowSelector = true;
          }
        } catch (e) {
          console.warn("Could not parse model connector config to check for Gemini model:", e);
        }
      }
    }

    if (showContextDocSelector !== shouldShowSelector) {
      setShowContextDocSelector(shouldShowSelector);
    }

    if (!shouldShowSelector && selectedContextDocIds.length > 0) {
      setSelectedContextDocIds([]);
    }
  }, [selectedConnectorId, modelConnectors, showContextDocSelector, selectedContextDocIds]);


  const addEvalRunMutation = useMutation<string, Error, NewEvalRunPayload>({
    mutationFn: async (newRunRawData) => {
      if (!currentUserId) throw new Error("User not identified.");
      
      const newRunDataForFirestore: Record<string, any> = {};
      for (const key in newRunRawData) {
        if (Object.prototype.hasOwnProperty.call(newRunRawData, key)) {
          const value = (newRunRawData as any)[key];
          if (value !== undefined) { 
            newRunDataForFirestore[key] = value;
          }
        }
      }
      
      newRunDataForFirestore.createdAt = serverTimestamp();
      newRunDataForFirestore.updatedAt = serverTimestamp();
      newRunDataForFirestore.status = 'Pending';
      newRunDataForFirestore.userId = currentUserId;
      
      const docRef = await addDoc(collection(db, 'users', currentUserId, 'evaluationRuns'), newRunDataForFirestore);
      return docRef.id;
    },
    onSuccess: (newRunId) => {
      queryClient.invalidateQueries({ queryKey: ['evalRuns', currentUserId] });
      toast({
        title: "Success",
        description: "New evaluation run created and set to Pending.",
        action: ( <Button variant="outline" size="sm" onClick={() => router.push(`/runs/${newRunId}`)}> View Run </Button> ),
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
      if (!currentUserId) { throw new Error("User not identified for delete operation."); }
      try { 
        const analysesCollectionRef = collection(db, 'users', currentUserId, 'evaluationRuns', runId, 'storedAnalyses');
        const analysesSnapshot = await getDocs(analysesCollectionRef);
        const batch = writeBatch(db);
        analysesSnapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        await deleteDoc(doc(db, 'users', currentUserId, 'evaluationRuns', runId)); 
      } catch (e: unknown) {
        if (e instanceof Error) { throw new Error(`Failed to delete run from Firestore: ${e.message}`); }
        throw new Error(`An unknown error occurred while deleting run ${runId} from Firestore.`);
      }
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

    const dataset = datasets?.find(d => d.id === selectedDatasetId);
    const datasetVersion = dataset?.versions.find(v => v.id === selectedDatasetVersionId);
    const connector = modelConnectors?.find(c => c.id === selectedConnectorId);
    const prompt = promptTemplates?.find(p => p.id === selectedPromptId);
    const promptVersion = prompt?.versions.find(v => v.id === selectedPromptVersionId);
    const selEvalParams = evaluationParameters?.filter(ep => selectedEvalParamIds.includes(ep.id)) || [];
    const selSummarizationDefs = summarizationDefinitions?.filter(sd => selectedSummarizationDefIds.includes(sd.id)) || [];


    if (!newRunName.trim()){ toast({ title: "Validation Error", description: "Run Name is required.", variant: "destructive"}); return; }
    if (!dataset || !datasetVersion || !connector || !prompt || !promptVersion ) { toast({ title: "Configuration Incomplete", description: "Please ensure Dataset, Connector, and Prompt (with versions) are selected.", variant: "destructive"}); return; }
    if (selEvalParams.length === 0 && selSummarizationDefs.length === 0) { toast({ title: "Configuration Incomplete", description: "Please select at least one Evaluation Parameter or one Summarization Definition.", variant: "destructive"}); return; }
    if (runOnNRows < 0) { toast({ title: "Validation Error", description: "Number of rows to test cannot be negative.", variant: "destructive" }); return; }
    if (newRunConcurrencyLimit < 1) { toast({ title: "Validation Error", description: "Concurrency limit must be at least 1.", variant: "destructive" }); return; }
    if (!datasetVersion.columnMapping || Object.keys(datasetVersion.columnMapping).length === 0) { toast({ title: "Dataset Version Not Ready", description: "The selected dataset version must have product parameters mapped. Please configure it on the Datasets page.", variant: "destructive" }); return; }
    if (newRunType === 'GroundTruth' && (!datasetVersion.groundTruthMapping || Object.keys(datasetVersion.groundTruthMapping).length === 0) && selEvalParams.length > 0) { toast({ title: "Configuration Warning", description: "For Ground Truth runs with Evaluation Parameters, the selected dataset version should ideally have Ground Truth columns mapped for accurate label comparison. The run will proceed but accuracy may be 0% for labels.", variant: "default" }); }

    let modelIdentifierForGenkit: string | undefined = undefined;
    if (connector && connector.config && connector.provider && connector.provider !== 'Anthropic' && connector.provider !== 'OpenAI') {
        try {
            const parsedConfig = JSON.parse(connector.config);
            if (parsedConfig.model) {
                const providerPrefix = connector.provider.toLowerCase().replace(/\s+/g, '');
                if (providerPrefix === 'vertexai' || providerPrefix === 'googleai') {
                    modelIdentifierForGenkit = `googleai/${parsedConfig.model}`;
                } else if (providerPrefix === 'azureopenai') { // Keep the openai prefix for azure for genkit, if applicable
                    modelIdentifierForGenkit = `openai/${parsedConfig.model}`; 
                }
            }
        } catch (e) {
            console.error("Failed to parse model connector config for Genkit identifier:", e);
        }
    }


    const newRunData: NewEvalRunPayload = {
      name: newRunName.trim(), runType: newRunType, status: 'Pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), userId: currentUserId,
      datasetId: selectedDatasetId, datasetName: dataset?.name, datasetVersionId: selectedDatasetVersionId, datasetVersionNumber: datasetVersion?.versionNumber,
      modelConnectorId: selectedConnectorId, modelConnectorName: connector?.name, modelConnectorProvider: connector?.provider, modelConnectorConfigString: connector?.config, modelIdentifierForGenkit,
      promptId: selectedPromptId, promptName: prompt?.name, promptVersionId: selectedPromptVersionId, promptVersionNumber: promptVersion?.versionNumber,
      selectedEvalParamIds: selectedEvalParamIds, selectedEvalParamNames: selEvalParams.map(ep => ep.name),
      selectedSummarizationDefIds: selectedSummarizationDefIds, 
      selectedSummarizationDefNames: selSummarizationDefs.map(sd => sd.name), 
      selectedContextDocumentIds: showContextDocSelector ? selectedContextDocIds : [],
      runOnNRows: Number(runOnNRows) || 0, concurrencyLimit: Number(newRunConcurrencyLimit) || 3,
    };
    addEvalRunMutation.mutate(newRunData);
  };

  const resetNewRunForm = () => {
    setNewRunName(''); setNewRunType('Product'); setSelectedDatasetId(''); setSelectedDatasetVersionId(''); setSelectedConnectorId('');
    setSelectedPromptId(''); setSelectedPromptVersionId(''); setSelectedEvalParamIds([]); setSelectedContextDocIds([]);
    setSelectedSummarizationDefIds([]);
    setRunOnNRows(0); setNewRunConcurrencyLimit(3); setShowContextDocSelector(false);
  };

  const handleDeleteRun = (runId: string) => { if (!currentUserId) return; if (confirm('Are you sure you want to delete this evaluation run and all its associated analyses? This action cannot be undone.')) deleteEvalRunMutation.mutate(runId); };
  const getStatusBadge = (status: EvalRun['status']) => {
    switch (status) {
      case 'Completed': return <Badge variant="default" className="bg-green-500 hover:bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />Completed</Badge>;
      case 'Running': return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600"><Clock className="mr-1 h-3 w-3 animate-spin" />Running</Badge>;
      case 'Processing': return <Badge variant="default" className="bg-purple-500 hover:bg-purple-600"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Processing</Badge>;
      case 'Pending': return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case 'DataPreviewed': return <Badge variant="outline" className="border-blue-500 text-blue-600"><Loader2 className="mr-1 h-3 w-3" />Data Previewed</Badge>;
      case 'Failed': return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Failed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };
  const formatTimestamp = (timestamp?: Timestamp) => timestamp ? timestamp.toDate().toLocaleDateString() : 'N/A';

  const isLoadingDialogData = isLoadingDatasets || isLoadingConnectors || isLoadingPrompts || isLoadingEvalParams || isLoadingContextDocs || isLoadingSummarizationDefs;
  const selectedDatasetForVersions = datasets?.find(d => d.id === selectedDatasetId);
  const selectedDatasetVersionForWarnings = selectedDatasetForVersions?.versions.find(v => v.id === selectedDatasetVersionId);
  const foundPromptTemplate = selectedPromptId ? promptTemplates?.find(p => p.id === selectedPromptId) : undefined;


  if (isLoadingUserId) return <div className="p-4 md:p-6"><Skeleton className="h-32 w-full"/></div>;
  if (!currentUserId) return <Card className="m-4 md:m-0"><CardContent className="p-6 text-center text-muted-foreground">Please log in to manage evaluation runs.</CardContent></Card>;


  const isNewRunButtonDisabled = addEvalRunMutation.isPending || 
    !selectedDatasetId || 
    !selectedConnectorId || 
    !selectedPromptId || 
    (selectedEvalParamIds.length === 0 && selectedSummarizationDefIds.length === 0) || 
    !selectedDatasetVersionId || 
    !selectedPromptVersionId || 
    !newRunName.trim();


  return (
    <div className="space-y-6 p-4 md:p-0">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3"> <PlayCircle className="h-7 w-7 text-primary" /> <div> <CardTitle className="text-xl md:text-2xl font-headline">Evaluation Runs</CardTitle> <CardDescription>Manage and track your AI model evaluation runs. Choose between Product or Ground Truth comparison.</CardDescription> </div> </div>
        </CardHeader>
        <CardContent>
          {/* Button removed from here */}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle>Evaluation Run History</CardTitle>
                <CardDescription>Review past and ongoing evaluation runs.</CardDescription>
            </div>
            <Dialog open={isNewRunDialogOpen} onOpenChange={(isOpen) => { setIsNewRunDialogOpen(isOpen); if(!isOpen) resetNewRunForm();}}>
            <DialogTrigger asChild>
              <Button 
                onClick={() => {resetNewRunForm(); setIsNewRunDialogOpen(true);}} 
                disabled={addEvalRunMutation.isPending || !currentUserId} 
                className="w-full sm:w-auto"
              >
                <PlusCircle className="mr-2 h-5 w-5" />New Evaluation Run
              </Button>
            </DialogTrigger>
            <DialogContent 
              className="sm:max-w-2xl flex flex-col max-h-[90vh] p-0" // Increased width, max height, no padding
            >
              <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
                <DialogTitle>Configure New Evaluation Run</DialogTitle>
                <DialogDescription>Select components and parameters for your new eval run.</DialogDescription>
              </DialogHeader>
              {isLoadingDialogData ? (
                <div className="py-8 flex justify-center items-center flex-grow">
                  <Loader2 className="h-8 w-8 animate-spin" /> <span className="ml-2">Loading options...</span>
                </div>
              ) : (
                <>
                  <div className="flex-grow min-h-0 overflow-y-auto">
                    <form id="new-eval-run-form" onSubmit={handleNewRunSubmit} className="p-0"> {/* No padding on form itself */}
                      <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-4 rounded-none border-b sticky top-0 bg-background z-10 px-6 pt-4">
                          <TabsTrigger value="general"><Info className="mr-1 h-4 w-4 hidden sm:inline"/>General</TabsTrigger>
                          <TabsTrigger value="data_model"><Layers className="mr-1 h-4 w-4 hidden sm:inline"/>Data & Model</TabsTrigger>
                          <TabsTrigger value="prompt_tasks"><Briefcase className="mr-1 h-4 w-4 hidden sm:inline"/>Prompt & Tasks</TabsTrigger>
                          <TabsTrigger value="execution"><Cog className="mr-1 h-4 w-4 hidden sm:inline"/>Execution</TabsTrigger>
                        </TabsList>
                        
                        <div className="p-6 space-y-4"> {/* Padding applied here for content of tabs */}
                          <TabsContent value="general" className="mt-0">
                            <div className="space-y-4">
                              <div><Label htmlFor="run-name">Run Name</Label><Input id="run-name" value={newRunName} onChange={(e) => setNewRunName(e.target.value)} placeholder="e.g., My Chatbot Eval - July" required/></div>
                              <div> <Label htmlFor="run-type">Run Type</Label> <RadioGroup value={newRunType} onValueChange={(value: 'Product' | 'GroundTruth') => setNewRunType(value)} className="flex space-x-4 mt-1"> <div className="flex items-center space-x-2"> <RadioGroupItem value="Product" id="type-product" /> <Label htmlFor="type-product" className="font-normal">Product Run</Label> </div> <div className="flex items-center space-x-2"> <RadioGroupItem value="GroundTruth" id="type-gt" /> <Label htmlFor="type-gt" className="font-normal">Ground Truth Run</Label> </div> </RadioGroup> <p className="text-xs text-muted-foreground mt-1"> Product runs evaluate outputs (can include summarizations). Ground Truth runs compare outputs to known correct labels and can also generate summaries.</p> </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="data_model" className="mt-0">
                            <div className="space-y-4">
                              <div> <Label htmlFor="run-dataset">Dataset</Label> <Select value={selectedDatasetId} onValueChange={(value) => {setSelectedDatasetId(value); setSelectedDatasetVersionId('');}} required> <SelectTrigger id="run-dataset"><SelectValue placeholder="Select dataset" /></SelectTrigger> <SelectContent>{datasets?.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent> </Select> </div>
                              {selectedDatasetId && selectedDatasetForVersions && selectedDatasetForVersions.versions.length > 0 && ( <div> <Label htmlFor="run-dataset-version">Dataset Version</Label> <Select value={selectedDatasetVersionId} onValueChange={setSelectedDatasetVersionId} required> <SelectTrigger id="run-dataset-version"><SelectValue placeholder="Select version" /></SelectTrigger> <SelectContent>{selectedDatasetForVersions.versions.sort((a,b) => b.versionNumber - a.versionNumber).map(v => <SelectItem key={v.id} value={v.id}>v{v.versionNumber} - {v.fileName || 'Unnamed version'}</SelectItem>)}</SelectContent> </Select> {selectedDatasetVersionForWarnings && (!selectedDatasetVersionForWarnings.columnMapping || Object.keys(selectedDatasetVersionForWarnings.columnMapping).length === 0) && ( <p className="text-xs text-destructive mt-1">Warning: No Product Parameters mapped.</p> )} {newRunType === 'GroundTruth' && selectedDatasetVersionForWarnings && !(selectedDatasetVersionForWarnings.groundTruthMapping && Object.keys(selectedDatasetVersionForWarnings.groundTruthMapping).length > 0) && selectedEvalParamIds.length > 0 && ( <p className="text-xs text-amber-600 mt-1">Warning: GT run with Eval Params, but no GT columns mapped.</p> )} </div> )}
                              {selectedDatasetId && selectedDatasetForVersions && selectedDatasetForVersions.versions.length === 0 && ( <p className="text-xs text-muted-foreground mt-1">This dataset has no versions.</p> )}
                              <div><Label htmlFor="run-connector">Model Connector (Judge LLM)</Label> <Select value={selectedConnectorId} onValueChange={setSelectedConnectorId} required> <SelectTrigger id="run-connector"><SelectValue placeholder="Select model connector" /></SelectTrigger> <SelectContent>{modelConnectors?.map(mc => <SelectItem key={mc.id} value={mc.id}>{mc.name} ({mc.provider})</SelectItem>)}</SelectContent> </Select> </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="prompt_tasks" className="mt-0">
                             <div className="space-y-4">
                                <div> <Label htmlFor="run-prompt">Prompt Template</Label> <Select value={selectedPromptId} onValueChange={(value) => {setSelectedPromptId(value); setSelectedPromptVersionId('');}} required> <SelectTrigger id="run-prompt"><SelectValue placeholder="Select prompt" /></SelectTrigger> <SelectContent>{promptTemplates?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent> </Select> </div>
                                {foundPromptTemplate && foundPromptTemplate.versions && foundPromptTemplate.versions.length > 0 && (
                                  <div>
                                    <Label htmlFor="run-prompt-version">Prompt Version</Label>
                                    <Select value={selectedPromptVersionId} onValueChange={setSelectedPromptVersionId} required>
                                      <SelectTrigger id="run-prompt-version"><SelectValue placeholder="Select version" /></SelectTrigger>
                                      <SelectContent>{
                                        foundPromptTemplate.versions
                                          .sort((a,b) => b.versionNumber - a.versionNumber)
                                          .map(v => <SelectItem key={v.id} value={v.id}>Version {v.versionNumber}</SelectItem>)
                                      }</SelectContent>
                                    </Select>
                                  </div>
                                )}
                                <div><Label>Evaluation Parameters (for labeling)</Label> <ScrollArea className="h-32 rounded-md border bg-muted/30 p-2"> <div className="space-y-2"> {evaluationParameters && evaluationParameters.length === 0 && <p className="text-xs text-muted-foreground">No evaluation parameters defined.</p>} {evaluationParameters?.map(ep => ( <div key={ep.id} className="flex items-center space-x-2"> <Checkbox id={`ep-${ep.id}`} checked={selectedEvalParamIds.includes(ep.id)} onCheckedChange={(checked) => { setSelectedEvalParamIds(prev => checked ? [...prev, ep.id] : prev.filter(id => id !== ep.id) ); }} /> <Label htmlFor={`ep-${ep.id}`} className="font-normal">{ep.name}</Label> </div> ))} </div></ScrollArea> </div>
                                <div><Label>Summarization Definitions (for summary generation)</Label> <ScrollArea className="h-32 rounded-md border bg-muted/30 p-2"> <div className="space-y-2"> {summarizationDefinitions && summarizationDefinitions.length === 0 && <p className="text-xs text-muted-foreground">No summarization definitions available.</p>} {summarizationDefinitions?.map(sd => ( <div key={sd.id} className="flex items-center space-x-2"> <Checkbox id={`sd-${sd.id}`} checked={selectedSummarizationDefIds.includes(sd.id)} onCheckedChange={(checked) => { setSelectedSummarizationDefIds(prev => checked ? [...prev, sd.id] : prev.filter(id => id !== sd.id) ); }} /> <Label htmlFor={`sd-${sd.id}`} className="font-normal">{sd.name}</Label> </div> ))} </div></ScrollArea> </div>
                                {showContextDocSelector && (
                                  <div><Label>Context Documents (Optional, for compatible Gemini models)</Label>
                                    <ScrollArea className="h-32 rounded-md border bg-muted/30 p-2">
                                      <div className="space-y-2">
                                        {contextDocuments && contextDocuments.length === 0 && <p className="text-xs text-muted-foreground">No context documents available.</p>}
                                        {contextDocuments?.map(cd => (
                                          <div key={cd.id} className="flex items-center space-x-2">
                                            <Checkbox id={`cd-${cd.id}`} checked={selectedContextDocIds.includes(cd.id)} onCheckedChange={(checked) => { setSelectedContextDocIds(prev => checked ? [...prev, cd.id] : prev.filter(id => id !== cd.id) ); }} />
                                            <Label htmlFor={`cd-${cd.id}`} className="font-normal truncate" title={`${cd.name} (${cd.fileName})`}>{cd.name} <span className="text-xs text-muted-foreground">({cd.fileName})</span></Label>
                                          </div>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                    <p className="text-xs text-muted-foreground mt-1">These documents can provide additional context to the LLM.</p>
                                  </div>
                                )}
                             </div>
                          </TabsContent>
                          
                          <TabsContent value="execution" className="mt-0">
                            <div className="space-y-4">
                              <div> <Label htmlFor="run-nrows">Test on first N rows (0 for all)</Label> <Input id="run-nrows" type="number" value={runOnNRows} onChange={(e) => { const val = parseInt(e.target.value, 10); setRunOnNRows(isNaN(val) ? 0 : val); }} min="0" /> <p className="text-xs text-muted-foreground mt-1">0 uses all (capped for preview). Max recommended for processing: 200.</p> </div>
                              <div> <Label htmlFor="run-concurrency">LLM Concurrency Limit</Label> <Input id="run-concurrency" type="number" value={newRunConcurrencyLimit} onChange={(e) => setNewRunConcurrencyLimit(Math.max(1, parseInt(e.target.value, 10) || 1))} min="1" max="20" /> <p className="text-xs text-muted-foreground mt-1">Number of LLM calls in parallel (e.g., 3-5). Max: 20.</p> </div>
                            </div>
                          </TabsContent>
                        </div>
                      </Tabs>
                    </form>
                  </div>
                  <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => {setIsNewRunDialogOpen(false); resetNewRunForm();}}>Cancel</Button>
                    <Button type="submit" form="new-eval-run-form" disabled={isNewRunButtonDisabled} >
                      {addEvalRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlayCircle className="mr-2 h-4 w-4" />} Create Run
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoadingEvalRuns && <div className="p-6"><Skeleton className="h-40 w-full"/></div>}
          {fetchEvalRunsError && <p className="text-destructive p-4">Error fetching runs: {fetchEvalRunsError.message}</p>}
          {!isLoadingEvalRuns && !fetchEvalRunsError && evalRuns.length === 0 && ( <div className="text-center text-muted-foreground py-8"> <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" /> <p>No evaluation runs found.</p> <p className="text-sm">Click "New Evaluation Run" to get started.</p> </div> )}
          {!isLoadingEvalRuns && !fetchEvalRunsError && evalRuns.length > 0 && (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">View</TableHead>
                  <TableHead className="w-[120px] sm:w-auto">Name</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="hidden md:table-cell w-[100px]">Type</TableHead>
                  <TableHead className="hidden md:table-cell w-auto">Dataset</TableHead>
                  <TableHead className="hidden lg:table-cell w-auto">Model</TableHead>
                  <TableHead className="hidden lg:table-cell w-auto">Prompt</TableHead>
                  <TableHead className="hidden sm:table-cell w-[100px]">Created At</TableHead>
                  <TableHead className="text-right w-[50px]">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evalRuns.map((run) => (
                  <TableRow key={run.id} className="hover:bg-muted/50">
                    <TableCell>
                        <Link href={`/runs/${run.id}`} passHref>
                            <Button variant="ghost" size="icon" title="View Details">
                                <FileSearch className="h-5 w-5 text-primary" />
                            </Button>
                        </Link>
                    </TableCell>
                    <TableCell className="font-medium max-w-[100px] sm:max-w-xs truncate">
                        <Link href={`/runs/${run.id}`} className="hover:underline" title={run.name}>{run.name}</Link>
                    </TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{run.runType === 'GroundTruth' ? (<Badge variant="outline" className="border-green-500 text-green-700"><CheckCheck className="mr-1 h-3 w-3" />Ground Truth</Badge>) : (<Badge variant="outline"><TestTube2 className="mr-1 h-3 w-3" />Product</Badge>)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell max-w-[100px] truncate" title={run.datasetName || run.datasetId}>{run.datasetName || run.datasetId}{run.datasetVersionNumber ? ` (v${run.datasetVersionNumber})` : ''}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell max-w-[100px] truncate" title={run.modelConnectorName || run.modelConnectorId}>{run.modelConnectorName || run.modelConnectorId}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell max-w-[100px] truncate" title={run.promptName || run.promptId}>{run.promptName || run.promptId}{run.promptVersionNumber ? ` (v${run.promptVersionNumber})` : ''}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{formatTimestamp(run.createdAt)}</TableCell>
                    <TableCell className="text-right">
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

