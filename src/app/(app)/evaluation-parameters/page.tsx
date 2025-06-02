
'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, Target, GripVertical, CheckCircle, XCircle, AlertTriangle, MinusCircle, Tags } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, type Timestamp, type FieldValue } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CategorizationLabelToStore {
  name: string;
  definition: string;
  example?: string;
}

interface UICategorizationLabel extends CategorizationLabelToStore {
  tempId: string; // For React key during editing
}

interface EvalParameter {
  id: string; // Firestore document ID
  name: string;
  definition: string;
  categorizationLabels?: CategorizationLabelToStore[];
  createdAt?: Timestamp;
}

type EvalParameterUpdatePayload = { id: string } & Partial<Omit<EvalParameter, 'id' | 'createdAt'>>;
type UpdateLabelsPayload = { parameterId: string; labels: CategorizationLabelToStore[] };


const fetchEvaluationParameters = async (userId: string | null): Promise<EvalParameter[]> => {
  if (!userId) return [];
  const parametersCollection = collection(db, 'users', userId, 'evaluationParameters');
  const q = query(parametersCollection, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EvalParameter));
};

export default function EvaluationParametersPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    if (storedUserId && storedUserId.trim() !== "") {
      setCurrentUserId(storedUserId.trim());
    } else {
      setCurrentUserId(null);
    }
    setIsLoadingUserId(false);
  }, []);

  const { data: evalParameters = [], isLoading: isLoadingParameters, error: fetchError } = useQuery<EvalParameter[], Error>({
    queryKey: ['evaluationParameters', currentUserId],
    queryFn: () => fetchEvaluationParameters(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const [isParamDialogOpen, setIsParamDialogOpen] = useState(false);
  const [isLabelsDialogOpen, setIsLabelsDialogOpen] = useState(false);
  
  const [editingEvalParam, setEditingEvalParam] = useState<EvalParameter | null>(null); // For editing parameter name/definition
  const [editingLabelsForParam, setEditingLabelsForParam] = useState<EvalParameter | null>(null); // For managing labels of a specific param

  const [paramName, setParamName] = useState('');
  const [paramDefinition, setParamDefinition] = useState('');
  const [currentCategorizationLabelsInLabelsDialog, setCurrentCategorizationLabelsInLabelsDialog] = useState<UICategorizationLabel[]>([]);


  const addMutation = useMutation<void, Error, Omit<EvalParameter, 'id' | 'createdAt'>>({
    mutationFn: async (newParameterData) => {
      if (!currentUserId) throw new Error("User not identified for add operation.");
      const dataWithTimestamp = {
        ...newParameterData,
        categorizationLabels: newParameterData.categorizationLabels || [], // Ensure it's an array
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'users', currentUserId, 'evaluationParameters'), dataWithTimestamp);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] });
      resetParamForm();
      setIsParamDialogOpen(false);
    },
    onError: (error) => console.error("Error adding evaluation parameter:", error)
  });

  const updateParamMutation = useMutation<void, Error, EvalParameterUpdatePayload>({
    mutationFn: async (parameterToUpdate) => {
      if (!currentUserId) throw new Error("User not identified for update operation.");
      const { id, ...dataToUpdate } = parameterToUpdate;
      const docRef = doc(db, 'users', currentUserId, 'evaluationParameters', id);
      await updateDoc(docRef, dataToUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] });
      resetParamForm();
      setIsParamDialogOpen(false);
    },
    onError: (error) => console.error("Error updating evaluation parameter:", error)
  });
  
  const updateLabelsMutation = useMutation<void, Error, UpdateLabelsPayload>({
    mutationFn: async ({ parameterId, labels }) => {
      if (!currentUserId) throw new Error("User not identified for updating labels.");
      const docRef = doc(db, 'users', currentUserId, 'evaluationParameters', parameterId);
      await updateDoc(docRef, { categorizationLabels: labels });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] });
      setIsLabelsDialogOpen(false);
      resetLabelsDialogForm();
    },
    onError: (error) => console.error("Error updating categorization labels:", error)
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (parameterId) => {
      if (!currentUserId) throw new Error("User not identified for delete operation.");
      await deleteDoc(doc(db, 'users', currentUserId, 'evaluationParameters', parameterId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] }),
    onError: (error) => console.error("Error deleting evaluation parameter:", error)
  });

  // --- Functions for Main Parameter Dialog (Name/Definition) ---
  const resetParamForm = () => {
    setParamName('');
    setParamDefinition('');
    setEditingEvalParam(null);
  };

  const openEditParamDialog = (param: EvalParameter) => {
    setEditingEvalParam(param);
    setParamName(param.name);
    setParamDefinition(param.definition);
    setIsParamDialogOpen(true);
  };
  
  const handleAddNewParameterClick = () => {
    if (!currentUserId) {
      alert("Please log in first to add parameters.");
      return;
    }
    setEditingEvalParam(null); 
    resetParamForm(); 
    setIsParamDialogOpen(true);
  };

  const handleSubmitParamForm = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      alert("No User ID found. Please log in again.");
      return;
    }
    if (!paramName.trim() || !paramDefinition.trim()) {
      alert("Parameter Name and Definition are required.");
      return;
    }

    if (editingEvalParam) {
      const payloadForUpdate: EvalParameterUpdatePayload = {
        id: editingEvalParam.id,
        name: paramName.trim(),
        definition: paramDefinition.trim(),
        // categorizationLabels will be managed separately
      };
      updateParamMutation.mutate(payloadForUpdate);
    } else {
      const newParamData: Omit<EvalParameter, 'id' | 'createdAt'> = {
        name: paramName.trim(),
        definition: paramDefinition.trim(),
        categorizationLabels: [], // Initialize with empty labels
      };
      addMutation.mutate(newParamData);
    }
  };

  // --- Functions for "Manage Labels" Dialog ---
  const resetLabelsDialogForm = () => {
    setCurrentCategorizationLabelsInLabelsDialog([]);
    setEditingLabelsForParam(null);
  };

  const openManageLabelsDialog = (param: EvalParameter) => {
    setEditingLabelsForParam(param);
    setCurrentCategorizationLabelsInLabelsDialog(
      param.categorizationLabels?.map((cl, index) => ({ 
        ...cl, 
        tempId: `cl-${param.id}-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` 
      })) || []
    );
    setIsLabelsDialogOpen(true);
  };

  const handleAddNewCategorizationLabelInLabelsDialog = () => {
    setCurrentCategorizationLabelsInLabelsDialog(prev => [
      ...prev,
      { tempId: `new-cl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, name: '', definition: '', example: '' }
    ]);
  };

  const handleCategorizationLabelChangeInLabelsDialog = (tempId: string, field: 'name' | 'definition' | 'example', value: string) => {
    setCurrentCategorizationLabelsInLabelsDialog(prev =>
      prev.map(label =>
        label.tempId === tempId ? { ...label, [field]: value } : label
      )
    );
  };

  const handleRemoveCategorizationLabelInLabelsDialog = (tempId: string) => {
    setCurrentCategorizationLabelsInLabelsDialog(prev => prev.filter(label => label.tempId !== tempId));
  };

  const handleSubmitLabelsDialog = (e: FormEvent) => {
    e.preventDefault();
    if (!editingLabelsForParam || !currentUserId) {
      alert("No parameter selected for label editing or user not identified.");
      return;
    }
    
    const labelsToSave: CategorizationLabelToStore[] = currentCategorizationLabelsInLabelsDialog
      .map(({ tempId, ...restOfLabel }) => restOfLabel) 
      .filter(cl => cl.name.trim() && cl.definition.trim()); // Example is optional

    updateLabelsMutation.mutate({ parameterId: editingLabelsForParam.id, labels: labelsToSave });
  };

  const handleDeleteParameter = (id: string) => {
    if (!currentUserId) {
      alert("No User ID found. Please log in again.");
      return;
    }
    if (confirm('Are you sure you want to delete this evaluation parameter? This will also delete its categorization labels.')) {
      deleteMutation.mutate(id);
    }
  };


  if (isLoadingUserId || (isLoadingParameters && currentUserId)) {
    return (
      <div className="space-y-6">
        <Card className="shadow-lg"><CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-64" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>
      </div>
    );
  }
  
  if (fetchError) {
    return (
      <Card className="shadow-lg">
        <CardHeader><CardTitle className="text-2xl font-headline text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Data</CardTitle></CardHeader>
        <CardContent><p>Could not fetch evaluation parameters: {fetchError.message}</p><p className="mt-2 text-sm text-muted-foreground">Please ensure you have entered a User ID on the login page and have a stable internet connection.</p></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3"><Target className="h-7 w-7 text-primary" />
            <div><CardTitle className="text-2xl font-headline">Evaluation Parameters</CardTitle><CardDescription>Define the metrics for evaluating your AI model's performance. Each parameter can have detailed categorization labels.</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent>
           <Button onClick={handleAddNewParameterClick} disabled={!currentUserId || addMutation.isPending || updateParamMutation.isPending}>
            <PlusCircle className="mr-2 h-5 w-5" /> Add New Evaluation Parameter
          </Button>
        </CardContent>
      </Card>
      
      {/* Dialog for Adding/Editing Evaluation Parameter (Name/Definition) */}
      <Dialog open={isParamDialogOpen} onOpenChange={(isOpen) => { setIsParamDialogOpen(isOpen); if(!isOpen) resetParamForm();}}>
        <DialogContent className="sm:max-w-lg"> 
          <DialogHeader>
            <DialogTitle>{editingEvalParam ? 'Edit' : 'Add New'} Evaluation Parameter</DialogTitle>
            <DialogDescription>Define the core name and definition for an evaluation criterion.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitParamForm}>
            <div className="space-y-4 py-4 pr-1">
              <div><Label htmlFor="eval-name">Parameter Name</Label><Input id="eval-name" value={paramName} onChange={(e) => setParamName(e.target.value)} placeholder="e.g., Hallucination, Relevance" required /></div>
              <div><Label htmlFor="eval-definition">Detailed Definition</Label><Textarea id="eval-definition" value={paramDefinition} onChange={(e) => setParamDefinition(e.target.value)} placeholder="Explain what this parameter measures." required /></div>
            </div>
            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => {setIsParamDialogOpen(false); resetParamForm();}}>Cancel</Button>
              <Button type="submit" disabled={addMutation.isPending || updateParamMutation.isPending || !currentUserId}>
                  {addMutation.isPending || updateParamMutation.isPending ? 'Saving...' : (editingEvalParam ? 'Save Changes' : 'Add Parameter')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for Managing Categorization Labels */}
      <Dialog open={isLabelsDialogOpen} onOpenChange={(isOpen) => { setIsLabelsDialogOpen(isOpen); if(!isOpen) resetLabelsDialogForm();}}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Categorization Labels for: {editingLabelsForParam?.name}</DialogTitle>
            <DialogDescription>Add, edit, or remove specific labels with definitions and examples for this evaluation parameter.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitLabelsDialog}>
            <ScrollArea className="max-h-[60vh] p-1 pr-6">
              <div className="space-y-4 py-4 pr-1">
                {currentCategorizationLabelsInLabelsDialog.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No categorization labels defined yet for this parameter.</p>
                )}
                {currentCategorizationLabelsInLabelsDialog.map((label, index) => (
                  <Card key={label.tempId} className="p-4 space-y-3 bg-muted/50">
                    <div className="flex justify-between items-center">
                      <Label className="font-semibold">Label #{index + 1}</Label>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveCategorizationLabelInLabelsDialog(label.tempId)}>
                        <MinusCircle className="h-4 w-4" />
                      </Button>
                    </div>
                    <div>
                      <Label htmlFor={`cl-name-${label.tempId}`}>Label Name</Label>
                      <Input id={`cl-name-${label.tempId}`} value={label.name} onChange={(e) => handleCategorizationLabelChangeInLabelsDialog(label.tempId, 'name', e.target.value)} placeholder="e.g., directly_relevant" required/>
                    </div>
                    <div>
                      <Label htmlFor={`cl-def-${label.tempId}`}>Label Definition</Label>
                      <Textarea id={`cl-def-${label.tempId}`} value={label.definition} onChange={(e) => handleCategorizationLabelChangeInLabelsDialog(label.tempId, 'definition', e.target.value)} placeholder="Define this specific label..." rows={2} required/>
                    </div>
                     <div>
                      <Label htmlFor={`cl-ex-${label.tempId}`}>Example (Optional)</Label>
                      <Textarea id={`cl-ex-${label.tempId}`} value={label.example || ''} onChange={(e) => handleCategorizationLabelChangeInLabelsDialog(label.tempId, 'example', e.target.value)} placeholder="Provide an illustrative example for this label..." rows={2}/>
                    </div>
                  </Card>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={handleAddNewCategorizationLabelInLabelsDialog}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add New Label
                </Button>
              </div>
            </ScrollArea>
            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => {setIsLabelsDialogOpen(false); resetLabelsDialogForm();}}>Cancel</Button>
              <Button type="submit" disabled={updateLabelsMutation.isPending || !editingLabelsForParam}>
                {updateLabelsMutation.isPending ? 'Saving Labels...' : 'Save Labels'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      <Card>
        <CardHeader>
          <CardTitle>Defined Evaluation Parameters</CardTitle>
          <CardDescription>Manage your existing evaluation parameters. {currentUserId ? `(User ID: ${currentUserId})` : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {!currentUserId && !isLoadingUserId ? (
             <div className="text-center text-muted-foreground py-8"><p>Please log in to see your evaluation parameters.</p></div>
          ) : evalParameters.length === 0 && !isLoadingParameters ? (
            <div className="text-center text-muted-foreground py-8"><p>No evaluation parameters defined yet. Click "Add New Evaluation Parameter" to get started.</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Order</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Definition</TableHead>
                  <TableHead className="text-right w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evalParameters.map((param) => (
                  <TableRow key={param.id} className="hover:bg-muted/50">
                    <TableCell className="cursor-grab"><GripVertical className="h-5 w-5 text-muted-foreground" /></TableCell>
                    <TableCell className="font-medium">{param.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-md truncate">{param.definition}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="outline" size="sm" onClick={() => openManageLabelsDialog(param)} disabled={!currentUserId || updateLabelsMutation.isPending && editingLabelsForParam?.id === param.id}>
                        <Tags className="h-4 w-4 mr-2"/> Manage Labels ({param.categorizationLabels?.length || 0})
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditParamDialog(param)} className="mr-1" disabled={updateParamMutation.isPending || deleteMutation.isPending || !currentUserId}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteParameter(param.id)} className="text-destructive hover:text-destructive/90" disabled={deleteMutation.isPending || (updateParamMutation.isPending && editingEvalParam?.id === param.id) || !currentUserId}>
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
    

    