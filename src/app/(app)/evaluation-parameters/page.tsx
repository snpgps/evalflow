
'use client';

import { useState, type FormEvent, useEffect, type ChangeEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, Target, GripVertical, CheckCircle, XCircle, AlertTriangle, MinusCircle, Tags, MessageSquarePlus, File as FileIcon, UploadCloud, AlignLeft } from "lucide-react";
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, type Timestamp, type FieldValue } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, deleteObject as deleteFileFromStorage, getBlob } from 'firebase/storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Interfaces for Evaluation Parameters
interface CategorizationLabelToStore {
  name: string;
  definition: string;
  example?: string;
}

interface UICategorizationLabel extends CategorizationLabelToStore {
  tempId: string;
}

interface EvalParameter {
  id: string;
  name: string;
  definition: string;
  categorizationLabels?: CategorizationLabelToStore[];
  requiresRationale?: boolean;
  createdAt?: Timestamp;
}

type EvalParameterUpdatePayload = { id: string } & Partial<Omit<EvalParameter, 'id' | 'createdAt'>>;
type UpdateLabelsPayload = { parameterId: string; labels: CategorizationLabelToStore[] };

// Interfaces for Context Documents
interface ContextDocument {
  id: string; // Firestore document ID
  name: string;
  description: string;
  fileName: string;
  storagePath: string;
  createdAt: Timestamp;
  userId: string;
}
type NewContextDocumentPayload = Omit<ContextDocument, 'id' | 'createdAt'> & { createdAt: FieldValue };

// Interfaces for Summarization Definitions
export interface SummarizationDefinition {
  id: string;
  name: string;
  definition: string;
  example?: string;
  createdAt?: Timestamp;
}
type SummarizationDefinitionUpdatePayload = { id: string } & Partial<Omit<SummarizationDefinition, 'id' | 'createdAt'>>;


const fetchEvaluationParameters = async (userId: string | null): Promise<EvalParameter[]> => {
  if (!userId) return [];
  const parametersCollection = collection(db, 'users', userId, 'evaluationParameters');
  const q = query(parametersCollection, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as EvalParameter));
};

const fetchContextDocuments = async (userId: string | null): Promise<ContextDocument[]> => {
  if (!userId) return [];
  const docsCollection = collection(db, 'users', userId, 'contextDocuments');
  const q = query(docsCollection, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ContextDocument));
}

const fetchSummarizationDefinitions = async (userId: string | null): Promise<SummarizationDefinition[]> => {
  if (!userId) return [];
  const definitionsCollection = collection(db, 'users', userId, 'summarizationDefinitions');
  const q = query(definitionsCollection, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as SummarizationDefinition));
};


export default function EvaluationParametersPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null); // Variable name kept as currentUserId
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const storedProjectId = localStorage.getItem('currentUserId'); // Key kept as currentUserId
    if (storedProjectId && storedProjectId.trim() !== "") {
      setCurrentUserId(storedProjectId.trim());
    } else {
      setCurrentUserId(null);
    }
    setIsLoadingUserId(false);
  }, []);

  // --- Eval Parameter State & Mutations ---
  const { data: evalParameters = [], isLoading: isLoadingParameters, error: fetchError } = useQuery<EvalParameter[], Error>({
    queryKey: ['evaluationParameters', currentUserId],
    queryFn: () => fetchEvaluationParameters(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const [isParamDialogOpen, setIsParamDialogOpen] = useState(false);
  const [isLabelsDialogOpen, setIsLabelsDialogOpen] = useState(false);
  const [editingEvalParam, setEditingEvalParam] = useState<EvalParameter | null>(null);
  const [editingLabelsForParam, setEditingLabelsForParam] = useState<EvalParameter | null>(null);
  const [paramName, setParamName] = useState('');
  const [paramDefinition, setParamDefinition] = useState('');
  const [paramRequiresRationale, setParamRequiresRationale] = useState(false);
  const [currentCategorizationLabelsInLabelsDialog, setCurrentCategorizationLabelsInLabelsDialog] = useState<UICategorizationLabel[]>([]);

  const addMutation = useMutation<void, Error, Omit<EvalParameter, 'id' | 'createdAt'>>({
    mutationFn: async (newParameterData) => {
      if (!currentUserId) throw new Error("Project not selected for add operation.");
      const dataWithTimestamp = {
        ...newParameterData,
        categorizationLabels: newParameterData.categorizationLabels || [],
        requiresRationale: newParameterData.requiresRationale || false,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'users', currentUserId, 'evaluationParameters'), dataWithTimestamp);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] });
      resetParamForm();
      setIsParamDialogOpen(false);
      toast({ title: "Success", description: "Evaluation parameter added." });
    },
    onError: (error) => { console.error("Error adding evaluation parameter:", error); toast({ title: "Error", description: error.message, variant: "destructive" });}
  });

  const updateParamMutation = useMutation<void, Error, EvalParameterUpdatePayload>({
    mutationFn: async (parameterToUpdate) => {
      if (!currentUserId) throw new Error("Project not selected for update operation.");
      const { id, ...dataToUpdate } = parameterToUpdate;
      const docRef = doc(db, 'users', currentUserId, 'evaluationParameters', id);
      await updateDoc(docRef, dataToUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] });
      resetParamForm();
      setIsParamDialogOpen(false);
      toast({ title: "Success", description: "Evaluation parameter updated." });
    },
    onError: (error) => { console.error("Error updating evaluation parameter:", error); toast({ title: "Error", description: error.message, variant: "destructive" });}
  });

  const updateLabelsMutation = useMutation<void, Error, UpdateLabelsPayload>({
    mutationFn: async ({ parameterId, labels }) => {
      if (!currentUserId) throw new Error("Project not selected for updating labels.");
      const docRef = doc(db, 'users', currentUserId, 'evaluationParameters', parameterId);
      await updateDoc(docRef, { categorizationLabels: labels });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] });
      setIsLabelsDialogOpen(false);
      resetLabelsDialogForm();
      toast({ title: "Success", description: "Categorization labels updated." });
    },
    onError: (error) => { console.error("Error updating categorization labels:", error); toast({ title: "Error", description: error.message, variant: "destructive" });}
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (parameterId) => {
      if (!currentUserId) throw new Error("Project not selected for delete operation.");
      await deleteDoc(doc(db, 'users', currentUserId, 'evaluationParameters', parameterId));
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] }); toast({ title: "Success", description: "Evaluation parameter deleted." });},
    onError: (error) => { console.error("Error deleting evaluation parameter:", error); toast({ title: "Error", description: error.message, variant: "destructive" });}
  });

  // --- Context Document State & Mutations ---
  const { data: contextDocuments = [], isLoading: isLoadingContextDocs, error: fetchContextDocsError } = useQuery<ContextDocument[], Error>({
    queryKey: ['contextDocuments', currentUserId],
    queryFn: () => fetchContextDocuments(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const [isContextDocDialogOpen, setIsContextDocDialogOpen] = useState(false);
  const [contextDocName, setContextDocName] = useState('');
  const [contextDocDescription, setContextDocDescription] = useState('');
  const [contextDocFile, setContextDocFile] = useState<File | null>(null);

  const addContextDocMutation = useMutation<void, Error, { payload: NewContextDocumentPayload; file: File }>({
    mutationFn: async ({ payload, file }) => {
      if (!currentUserId) throw new Error("Project not selected.");
      const docRef = await addDoc(collection(db, 'users', currentUserId, 'contextDocuments'), payload);
      const storagePath = `users/${currentUserId}/contextDocuments/${docRef.id}/${file.name}`;
      const fileStorageRef = storageRef(storage, storagePath);
      
      await uploadBytes(fileStorageRef, file);
      await updateDoc(docRef, { storagePath });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextDocuments', currentUserId] });
      resetContextDocForm();
      setIsContextDocDialogOpen(false);
      toast({ title: "Success", description: "Context document uploaded." });
    },
    onError: (error) => {
      console.error("Error uploading context document:", error);
      toast({ title: "Upload Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteContextDocMutation = useMutation<void, Error, ContextDocument>({
    mutationFn: async (docToDelete) => {
      if (!currentUserId) throw new Error("Project not selected.");
      if (docToDelete.storagePath) {
        try {
          await deleteFileFromStorage(storageRef(storage, docToDelete.storagePath));
        } catch (storageError: any) {
           if (storageError.code !== 'storage/object-not-found') {
             console.warn(`Error deleting file ${docToDelete.storagePath} from storage, but proceeding with Firestore delete:`, storageError);
           }
        }
      }
      await deleteDoc(doc(db, 'users', currentUserId, 'contextDocuments', docToDelete.id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextDocuments', currentUserId] });
      toast({ title: "Success", description: "Context document deleted." });
    },
    onError: (error) => {
      console.error("Error deleting context document:", error);
      toast({ title: "Delete Error", description: error.message, variant: "destructive" });
    }
  });

  // --- Summarization Definition State & Mutations ---
  const { data: summarizationDefinitions = [], isLoading: isLoadingSummarizationDefs, error: fetchSummarizationDefsError } = useQuery<SummarizationDefinition[], Error>({
    queryKey: ['summarizationDefinitions', currentUserId],
    queryFn: () => fetchSummarizationDefinitions(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const [isSummarizationDefDialogOpen, setIsSummarizationDefDialogOpen] = useState(false);
  const [editingSummarizationDef, setEditingSummarizationDef] = useState<SummarizationDefinition | null>(null);
  const [summarizationDefName, setSummarizationDefName] = useState('');
  const [summarizationDefDefinition, setSummarizationDefDefinition] = useState('');
  const [summarizationDefExample, setSummarizationDefExample] = useState('');

  const addSummarizationDefMutation = useMutation<void, Error, Omit<SummarizationDefinition, 'id' | 'createdAt'>>({
    mutationFn: async (newDefData) => {
      if (!currentUserId) throw new Error("Project not selected.");
      await addDoc(collection(db, 'users', currentUserId, 'summarizationDefinitions'), { ...newDefData, createdAt: serverTimestamp() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summarizationDefinitions', currentUserId] });
      resetSummarizationDefForm();
      setIsSummarizationDefDialogOpen(false);
      toast({ title: "Success", description: "Summarization definition added." });
    },
    onError: (error) => { console.error("Error adding summarization definition:", error); toast({ title: "Error", description: error.message, variant: "destructive" }); }
  });

  const updateSummarizationDefMutation = useMutation<void, Error, SummarizationDefinitionUpdatePayload>({
    mutationFn: async (defToUpdate) => {
      if (!currentUserId) throw new Error("Project not selected.");
      const { id, ...dataToUpdate } = defToUpdate;
      await updateDoc(doc(db, 'users', currentUserId, 'summarizationDefinitions', id), dataToUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summarizationDefinitions', currentUserId] });
      resetSummarizationDefForm();
      setIsSummarizationDefDialogOpen(false);
      toast({ title: "Success", description: "Summarization definition updated." });
    },
    onError: (error) => { console.error("Error updating summarization definition:", error); toast({ title: "Error", description: error.message, variant: "destructive" }); }
  });

  const deleteSummarizationDefMutation = useMutation<void, Error, string>({
    mutationFn: async (defId) => {
      if (!currentUserId) throw new Error("Project not selected.");
      await deleteDoc(doc(db, 'users', currentUserId, 'summarizationDefinitions', defId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summarizationDefinitions', currentUserId] });
      toast({ title: "Success", description: "Summarization definition deleted." });
    },
    onError: (error) => { console.error("Error deleting summarization definition:", error); toast({ title: "Error", description: error.message, variant: "destructive" }); }
  });


  // --- Form Reset & Dialog Openers ---
  const resetParamForm = () => { setParamName(''); setParamDefinition(''); setParamRequiresRationale(false); setEditingEvalParam(null); };
  const openEditParamDialog = (param: EvalParameter) => { setEditingEvalParam(param); setParamName(param.name); setParamDefinition(param.definition); setParamRequiresRationale(param.requiresRationale || false); setIsParamDialogOpen(true); };
  const handleAddNewParameterClick = () => { if (!currentUserId) { toast({title: "Project Selection Required", description: "Please select a project.", variant: "destructive"}); return; } resetParamForm(); setIsParamDialogOpen(true); };
  const resetLabelsDialogForm = () => { setCurrentCategorizationLabelsInLabelsDialog([]); setEditingLabelsForParam(null); };
  const openManageLabelsDialog = (param: EvalParameter) => { setEditingLabelsForParam(param); setCurrentCategorizationLabelsInLabelsDialog(param.categorizationLabels?.map((cl, index) => ({ ...cl, tempId: `cl-${param.id}-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` })) || []); setIsLabelsDialogOpen(true); };
  const resetContextDocForm = () => { setContextDocName(''); setContextDocDescription(''); setContextDocFile(null); };
  const handleAddNewContextDocClick = () => { if (!currentUserId) { toast({title: "Project Selection Required", description: "Please select a project.", variant: "destructive"}); return; } resetContextDocForm(); setIsContextDocDialogOpen(true); };

  const resetSummarizationDefForm = () => { setSummarizationDefName(''); setSummarizationDefDefinition(''); setSummarizationDefExample(''); setEditingSummarizationDef(null); };
  const openEditSummarizationDefDialog = (def: SummarizationDefinition) => { setEditingSummarizationDef(def); setSummarizationDefName(def.name); setSummarizationDefDefinition(def.definition); setSummarizationDefExample(def.example || ''); setIsSummarizationDefDialogOpen(true); };
  const handleAddNewSummarizationDefClick = () => { if (!currentUserId) { toast({title: "Project Selection Required", description: "Please select a project.", variant: "destructive"}); return; } resetSummarizationDefForm(); setIsSummarizationDefDialogOpen(true); };

  // --- Handlers ---
  const handleSubmitParamForm = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !paramName.trim() || !paramDefinition.trim()) { toast({title: "Validation Error", description: "Name and Definition required.", variant: "destructive"}); return; }
    if (editingEvalParam) {
      updateParamMutation.mutate({ id: editingEvalParam.id, name: paramName.trim(), definition: paramDefinition.trim(), categorizationLabels: editingEvalParam.categorizationLabels || [], requiresRationale: paramRequiresRationale });
    } else {
      addMutation.mutate({ name: paramName.trim(), definition: paramDefinition.trim(), categorizationLabels: [], requiresRationale: paramRequiresRationale });
    }
  };
  const handleAddNewCategorizationLabelInLabelsDialog = () => setCurrentCategorizationLabelsInLabelsDialog(prev => [...prev, { tempId: `new-cl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, name: '', definition: '', example: '' }]);
  const handleCategorizationLabelChangeInLabelsDialog = (tempId: string, field: 'name' | 'definition' | 'example', value: string) => setCurrentCategorizationLabelsInLabelsDialog(prev => prev.map(label => label.tempId === tempId ? { ...label, [field]: value } : label));
  const handleRemoveCategorizationLabelInLabelsDialog = (tempId: string) => setCurrentCategorizationLabelsInLabelsDialog(prev => prev.filter(label => label.tempId !== tempId));
  const handleSubmitLabelsDialog = (e: FormEvent) => {
    e.preventDefault();
    if (!editingLabelsForParam || !currentUserId) { toast({title: "Error", description: "Parameter not selected or project not identified.", variant: "destructive"}); return; }
    const labelsToSave: CategorizationLabelToStore[] = currentCategorizationLabelsInLabelsDialog.map(({ tempId, ...rest }) => rest).filter(cl => cl.name.trim() && cl.definition.trim());
    updateLabelsMutation.mutate({ parameterId: editingLabelsForParam.id, labels: labelsToSave });
  };
  const handleDeleteParameter = (id: string) => { if (!currentUserId) return; if (confirm('Delete this evaluation parameter?')) deleteMutation.mutate(id); };

  const handleContextDocFileChange = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) setContextDocFile(event.target.files[0]); };
  const handleSubmitContextDocForm = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !contextDocName.trim() || !contextDocFile) { toast({title: "Validation Error", description: "Name and file are required for context document.", variant: "destructive"}); return; }
    const payload: NewContextDocumentPayload = {
      name: contextDocName.trim(),
      description: contextDocDescription.trim(),
      fileName: contextDocFile.name,
      storagePath: '', 
      userId: currentUserId, // Still userId internally for Firestore path
      createdAt: serverTimestamp() 
    };
    addContextDocMutation.mutate({ payload, file: contextDocFile });
  };
  const handleDeleteContextDoc = (doc: ContextDocument) => { if (!currentUserId) return; if (confirm(`Delete context document "${doc.name}"? This will also remove the file from storage.`)) deleteContextDocMutation.mutate(doc); };

  const handleSubmitSummarizationDefForm = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !summarizationDefName.trim() || !summarizationDefDefinition.trim()) { toast({title: "Validation Error", description: "Name and Definition are required.", variant: "destructive"}); return; }
    const defData = { name: summarizationDefName.trim(), definition: summarizationDefDefinition.trim(), example: summarizationDefExample.trim() || undefined };
    if (editingSummarizationDef) {
      updateSummarizationDefMutation.mutate({ id: editingSummarizationDef.id, ...defData });
    } else {
      addSummarizationDefMutation.mutate(defData);
    }
  };
  const handleDeleteSummarizationDef = (id: string) => { if (!currentUserId) return; if (confirm('Delete this summarization definition?')) deleteSummarizationDefMutation.mutate(id); };


  if (isLoadingUserId || (isLoadingParameters && currentUserId) || (isLoadingContextDocs && currentUserId) || (isLoadingSummarizationDefs && currentUserId)) {
    return ( <div className="space-y-6 p-4 md:p-0"> <Card className="shadow-lg"><CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-full sm:w-64" /></CardContent></Card> <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card> </div> );
  }
  if (fetchError || fetchContextDocsError || fetchSummarizationDefsError) {
    return ( <Card className="shadow-lg m-4 md:m-0"><CardHeader><CardTitle className="text-xl md:text-2xl font-headline text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Data</CardTitle></CardHeader><CardContent><p>{fetchError?.message || fetchContextDocsError?.message || fetchSummarizationDefsError?.message}</p></CardContent></Card> );
  }

  return (
    <div className="space-y-6 p-4 md:p-0">
      {/* Evaluation Parameters Section */}
      <Card className="shadow-lg">
        <CardHeader> <div className="flex items-center gap-3"><Target className="h-7 w-7 text-primary" /> <div><CardTitle className="text-xl md:text-2xl font-headline">Evaluation Parameters</CardTitle><CardDescription>Define metrics for evaluating AI model performance. Each parameter can have detailed categorization labels.</CardDescription></div> </div> </CardHeader>
        <CardContent> <Button onClick={handleAddNewParameterClick} disabled={!currentUserId || addMutation.isPending || updateParamMutation.isPending} className="w-full sm:w-auto"> <PlusCircle className="mr-2 h-5 w-5" /> Add New Evaluation Parameter </Button> </CardContent>
      </Card>

      <Dialog open={isParamDialogOpen} onOpenChange={(isOpen) => { setIsParamDialogOpen(isOpen); if(!isOpen) resetParamForm();}}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader> <DialogTitle>{editingEvalParam ? 'Edit' : 'Add New'} Evaluation Parameter</DialogTitle> <DialogDescription>Define the core name and definition for an evaluation criterion.</DialogDescription> </DialogHeader>
          <form onSubmit={handleSubmitParamForm}>
            <div className="space-y-4 py-4 pr-1">
              <div><Label htmlFor="eval-name">Parameter Name</Label><Input id="eval-name" value={paramName} onChange={(e) => setParamName(e.target.value)} placeholder="e.g., Hallucination, Relevance" required /></div>
              <div><Label htmlFor="eval-definition">Detailed Definition</Label><Textarea id="eval-definition" value={paramDefinition} onChange={(e) => setParamDefinition(e.target.value)} placeholder="Explain what this parameter measures." required /></div>
              <div className="flex items-center space-x-2 pt-2"> <Checkbox id="eval-requires-rationale" checked={paramRequiresRationale} onCheckedChange={(checked) => setParamRequiresRationale(checked as boolean)} /> <Label htmlFor="eval-requires-rationale" className="font-normal flex items-center gap-1"> <MessageSquarePlus className="h-4 w-4 text-blue-600" /> Request Rationale from LLM </Label> </div>
              <p className="text-xs text-muted-foreground pl-8">If checked, the LLM will be prompted to provide a textual explanation for its choice on this parameter during evaluation runs.</p>
            </div>
            <DialogFooter className="pt-4 border-t"> <Button type="button" variant="outline" onClick={() => {setIsParamDialogOpen(false); resetParamForm();}}>Cancel</Button> <Button type="submit" disabled={addMutation.isPending || updateParamMutation.isPending || !currentUserId}> {addMutation.isPending || updateParamMutation.isPending ? 'Saving...' : (editingEvalParam ? 'Save Changes' : 'Add Parameter')} </Button> </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isLabelsDialogOpen} onOpenChange={(isOpen) => { setIsLabelsDialogOpen(isOpen); if(!isOpen) resetLabelsDialogForm();}}>
        <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0"> <DialogTitle>Manage Categorization Labels for: {editingLabelsForParam?.name}</DialogTitle> <DialogDescription>Add, edit, or remove specific labels with definitions and examples for this evaluation parameter.</DialogDescription> </DialogHeader>
          <div className="flex-grow overflow-y-auto pr-2">
            <form onSubmit={handleSubmitLabelsDialog} id="manage-labels-form" className="h-full">
              <div className="space-y-4 py-4">
                {currentCategorizationLabelsInLabelsDialog.length === 0 && (<p className="text-sm text-muted-foreground text-center py-4">No categorization labels defined yet.</p>)}
                {currentCategorizationLabelsInLabelsDialog.map((label, index) => ( <Card key={label.tempId} className="p-4 space-y-3 bg-muted/50"> <div className="flex justify-between items-center"> <Label className="font-semibold">Label #{index + 1}</Label> <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveCategorizationLabelInLabelsDialog(label.tempId)}> <MinusCircle className="h-4 w-4" /> </Button> </div> <div> <Label htmlFor={`cl-name-${label.tempId}`}>Label Name</Label> <Input id={`cl-name-${label.tempId}`} value={label.name} onChange={(e) => handleCategorizationLabelChangeInLabelsDialog(label.tempId, 'name', e.target.value)} placeholder="e.g., directly_relevant" required/> </div> <div> <Label htmlFor={`cl-def-${label.tempId}`}>Label Definition</Label> <Textarea id={`cl-def-${label.tempId}`} value={label.definition} onChange={(e) => handleCategorizationLabelChangeInLabelsDialog(label.tempId, 'definition', e.target.value)} placeholder="Define this specific label..." rows={2} required/> </div> <div> <Label htmlFor={`cl-ex-${label.tempId}`}>Example (Optional)</Label> <Textarea id={`cl-ex-${label.tempId}`} value={label.example || ''} onChange={(e) => handleCategorizationLabelChangeInLabelsDialog(label.tempId, 'example', e.target.value)} placeholder="Provide an illustrative example for this label..." rows={2}/> </div> </Card> ))}
                <Button type="button" variant="outline" size="sm" onClick={handleAddNewCategorizationLabelInLabelsDialog}> <PlusCircle className="mr-2 h-4 w-4" /> Add New Label </Button>
              </div>
            </form>
          </div>
          <DialogFooter className="pt-4 border-t flex-shrink-0"> <Button type="button" variant="outline" onClick={() => {setIsLabelsDialogOpen(false); resetLabelsDialogForm();}}>Cancel</Button> <Button type="submit" form="manage-labels-form" disabled={updateLabelsMutation.isPending || !editingLabelsForParam}> {updateLabelsMutation.isPending ? 'Saving Labels...' : 'Save Labels'} </Button> </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader> <CardTitle>Defined Evaluation Parameters</CardTitle> <CardDescription>Manage your existing evaluation parameters. {currentUserId ? `(Project ID: ${currentUserId})` : ''}</CardDescription> </CardHeader>
        <CardContent>
          {!currentUserId && !isLoadingUserId ? ( <div className="text-center text-muted-foreground py-8"><p>Please select a project to see evaluation parameters.</p></div> ) : evalParameters.length === 0 && !isLoadingParameters ? ( <div className="text-center text-muted-foreground py-8"><p>No evaluation parameters defined yet. Click "Add New Evaluation Parameter" to get started.</p></div> ) : (
            <TooltipProvider>
              <Table>
                <TableHeader><TableRow><TableHead className="w-[50px] hidden md:table-cell">Order</TableHead><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Definition</TableHead><TableHead>Rationale Req.</TableHead><TableHead className="text-right w-auto md:w-[200px]">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {evalParameters.map((param) => (
                    <TableRow key={param.id} className="hover:bg-muted/50">
                      <TableCell className="cursor-grab hidden md:table-cell"><GripVertical className="h-5 w-5 text-muted-foreground" /></TableCell>
                      <TableCell className="font-medium">{param.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs sm:max-w-md truncate hidden sm:table-cell">{param.definition}</TableCell>
                      <TableCell>
                        {param.requiresRationale ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Rationale requested</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <XCircle className="h-5 w-5 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Rationale not requested</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-right"><div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1"><Button variant="outline" size="sm" onClick={() => openManageLabelsDialog(param)} disabled={!currentUserId || updateLabelsMutation.isPending && editingLabelsForParam?.id === param.id}><Tags className="h-4 w-4 mr-0 sm:mr-2"/><span className="hidden sm:inline">Labels ({param.categorizationLabels?.length || 0})</span></Button><Button variant="ghost" size="icon" onClick={() => openEditParamDialog(param)} className="mr-1" disabled={updateParamMutation.isPending || deleteMutation.isPending || !currentUserId}><Edit2 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => handleDeleteParameter(param.id)} className="text-destructive hover:text-destructive/90" disabled={deleteMutation.isPending || (updateParamMutation.isPending && editingEvalParam?.id === param.id) || !currentUserId}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      {/* Summarization Definitions Section */}
      <Card className="shadow-lg">
        <CardHeader> <div className="flex items-center gap-3"><AlignLeft className="h-7 w-7 text-primary" /> <div><CardTitle className="text-xl md:text-2xl font-headline">Summarization Definitions</CardTitle><CardDescription>Define tasks for the AI to generate textual summaries based on input data.</CardDescription></div> </div> </CardHeader>
        <CardContent> <Button onClick={handleAddNewSummarizationDefClick} disabled={!currentUserId || addSummarizationDefMutation.isPending || updateSummarizationDefMutation.isPending} className="w-full sm:w-auto"> <PlusCircle className="mr-2 h-5 w-5" /> Add New Summarization Definition </Button> </CardContent>
      </Card>

      <Dialog open={isSummarizationDefDialogOpen} onOpenChange={(isOpen) => { setIsSummarizationDefDialogOpen(isOpen); if(!isOpen) resetSummarizationDefForm();}}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader> <DialogTitle>{editingSummarizationDef ? 'Edit' : 'Add New'} Summarization Definition</DialogTitle> <DialogDescription>Define the name, detailed definition, and an optional example for a summarization task.</DialogDescription> </DialogHeader>
          <form onSubmit={handleSubmitSummarizationDefForm}>
            <div className="space-y-4 py-4 pr-1">
              <div><Label htmlFor="summ-def-name">Name</Label><Input id="summ-def-name" value={summarizationDefName} onChange={(e) => setSummarizationDefName(e.target.value)} placeholder="e.g., User Intent Summary" required /></div>
              <div><Label htmlFor="summ-def-definition">Definition</Label><Textarea id="summ-def-definition" value={summarizationDefDefinition} onChange={(e) => setSummarizationDefDefinition(e.target.value)} placeholder="Clearly describe what this summary should capture." required /></div>
              <div><Label htmlFor="summ-def-example">Example (Optional)</Label><Textarea id="summ-def-example" value={summarizationDefExample} onChange={(e) => setSummarizationDefExample(e.target.value)} placeholder="Provide an ideal example of this summary." /></div>
            </div>
            <DialogFooter className="pt-4 border-t"> <Button type="button" variant="outline" onClick={() => {setIsSummarizationDefDialogOpen(false); resetSummarizationDefForm();}}>Cancel</Button> <Button type="submit" disabled={addSummarizationDefMutation.isPending || updateSummarizationDefMutation.isPending || !currentUserId}> {addSummarizationDefMutation.isPending || updateSummarizationDefMutation.isPending ? 'Saving...' : (editingSummarizationDef ? 'Save Changes' : 'Add Definition')} </Button> </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader> <CardTitle>Defined Summarization Definitions</CardTitle> <CardDescription>Manage your existing summarization tasks.</CardDescription> </CardHeader>
        <CardContent>
          {!currentUserId && !isLoadingUserId ? ( <div className="text-center text-muted-foreground py-8"><p>Please select a project to see summarization definitions.</p></div> ) : summarizationDefinitions.length === 0 && !isLoadingSummarizationDefs ? ( <div className="text-center text-muted-foreground py-8"><p>No summarization definitions created yet.</p></div> ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Definition</TableHead><TableHead className="hidden md:table-cell">Example</TableHead><TableHead className="text-right w-auto md:w-[120px]">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {summarizationDefinitions.map((def) => (
                  <TableRow key={def.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{def.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs sm:max-w-md truncate hidden sm:table-cell">{def.definition}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate hidden md:table-cell">{def.example || "N/A"}</TableCell>
                    <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEditSummarizationDefDialog(def)} className="mr-1" disabled={updateSummarizationDefMutation.isPending || deleteSummarizationDefMutation.isPending || !currentUserId}><Edit2 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => handleDeleteSummarizationDef(def.id)} className="text-destructive hover:text-destructive/90" disabled={deleteSummarizationDefMutation.isPending || (updateSummarizationDefMutation.isPending && editingSummarizationDef?.id === def.id) || !currentUserId}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Context Documents Section */}
      <Card className="shadow-lg">
        <CardHeader> <div className="flex items-center gap-3"><FileIcon className="h-7 w-7 text-primary" /> <div><CardTitle className="text-xl md:text-2xl font-headline">Context Documents</CardTitle><CardDescription>Upload and manage large context documents (e.g., SOPs) for use in evaluations, especially with models supporting context caching.</CardDescription></div> </div> </CardHeader>
        <CardContent>
          <Dialog open={isContextDocDialogOpen} onOpenChange={(isOpen) => { setIsContextDocDialogOpen(isOpen); if(!isOpen) resetContextDocForm();}}>
            <DialogTrigger asChild>
              <Button onClick={handleAddNewContextDocClick} disabled={!currentUserId || addContextDocMutation.isPending} className="w-full sm:w-auto"> <UploadCloud className="mr-2 h-5 w-5" /> Add New Context Document </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader> <DialogTitle>Add New Context Document</DialogTitle> <DialogDescription>Upload a document (.txt, .md, .pdf - text content is prioritized).</DialogDescription> </DialogHeader>
              <form onSubmit={handleSubmitContextDocForm} className="space-y-4 py-4">
                <div><Label htmlFor="cd-name">Document Name</Label><Input id="cd-name" value={contextDocName} onChange={(e) => setContextDocName(e.target.value)} placeholder="e.g., Customer Service SOP" required /></div>
                <div><Label htmlFor="cd-desc">Description (Optional)</Label><Textarea id="cd-desc" value={contextDocDescription} onChange={(e) => setContextDocDescription(e.target.value)} placeholder="Briefly describe this document's content." /></div>
                <div><Label htmlFor="cd-file">File</Label><Input id="cd-file" type="file" onChange={handleContextDocFileChange} accept=".txt,.md,.pdf" required /></div>
                {contextDocFile && <p className="text-xs text-muted-foreground">Selected: {contextDocFile.name}</p>}
                <DialogFooter> <Button type="button" variant="outline" onClick={() => {setIsContextDocDialogOpen(false); resetContextDocForm();}}>Cancel</Button> <Button type="submit" disabled={addContextDocMutation.isPending || !contextDocFile}> {addContextDocMutation.isPending ? 'Uploading...' : 'Upload Document'} </Button> </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader> <CardTitle>Uploaded Context Documents</CardTitle> <CardDescription>Your stored context documents.</CardDescription> </CardHeader>
        <CardContent>
          {!currentUserId && !isLoadingUserId ? ( <div className="text-center text-muted-foreground py-8"><p>Please select a project to see context documents.</p></div> ) : contextDocuments.length === 0 && !isLoadingContextDocs ? ( <div className="text-center text-muted-foreground py-8"><p>No context documents uploaded yet.</p></div> ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Description</TableHead><TableHead>File Name</TableHead><TableHead className="text-right w-[80px]">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {contextDocuments.map((docItem) => (
                  <TableRow key={docItem.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium truncate" title={docItem.name}>{docItem.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden sm:table-cell truncate" title={docItem.description}>{docItem.description || "No description"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate" title={docItem.fileName}>{docItem.fileName}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteContextDoc(docItem)} className="text-destructive hover:text-destructive/90" disabled={deleteContextDocMutation.isPending && deleteContextDocMutation.variables?.id === docItem.id}> <Trash2 className="h-4 w-4" /> </Button>
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
