
'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, Target, GripVertical, CheckCircle, XCircle, AlertTriangle, MinusCircle } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, type Timestamp, type FieldValue, deleteField } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CategorizationLabelToStore {
  name: string;
  definition: string;
}

interface UICategorizationLabel extends CategorizationLabelToStore {
  tempId: string; // For React key during editing
}

interface EvalParameter {
  id: string; // Firestore document ID
  name: string;
  definition: string;
  goodExample: string;
  badExample: string;
  categorizationLabels?: CategorizationLabelToStore[];
  createdAt?: Timestamp;
}

type EvalParameterUpdatePayload = { id: string } & Partial<Omit<EvalParameter, 'id' | 'createdAt' | 'categorizationLabels'> & { categorizationLabels?: CategorizationLabelToStore[] | FieldValue }>;


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

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvalParam, setEditingEvalParam] = useState<EvalParameter | null>(null);

  const [paramName, setParamName] = useState('');
  const [paramDefinition, setParamDefinition] = useState('');
  const [goodExample, setGoodExample] = useState('');
  const [badExample, setBadExample] = useState('');
  const [currentCategorizationLabels, setCurrentCategorizationLabels] = useState<UICategorizationLabel[]>([]);


  const addMutation = useMutation<void, Error, Omit<EvalParameter, 'id' | 'createdAt'>>({
    mutationFn: async (newParameterData) => {
      if (!currentUserId) throw new Error("User not identified for add operation.");
      await addDoc(collection(db, 'users', currentUserId, 'evaluationParameters'), {
        ...newParameterData,
        createdAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      console.error("Error adding evaluation parameter:", error);
      alert(`Error adding parameter: ${error.message}`);
    }
  });

  const updateMutation = useMutation<void, Error, EvalParameterUpdatePayload>({
    mutationFn: async (parameterToUpdate) => {
      if (!currentUserId) throw new Error("User not identified for update operation.");
      const { id, ...dataToUpdate } = parameterToUpdate;
      const docRef = doc(db, 'users', currentUserId, 'evaluationParameters', id);
      await updateDoc(docRef, dataToUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      console.error("Error updating evaluation parameter:", error);
      alert(`Error updating parameter: ${error.message}`);
    }
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (parameterId) => {
      if (!currentUserId) throw new Error("User not identified for delete operation.");
      await deleteDoc(doc(db, 'users', currentUserId, 'evaluationParameters', parameterId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationParameters', currentUserId] });
    },
    onError: (error) => {
      console.error("Error deleting evaluation parameter:", error);
      alert(`Error deleting parameter: ${error.message}`);
    }
  });

  const handleAddNewCategorizationLabel = () => {
    setCurrentCategorizationLabels(prev => [
      ...prev,
      { tempId: `new-cl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, name: '', definition: '' }
    ]);
  };

  const handleCategorizationLabelChange = (tempId: string, field: 'name' | 'definition', value: string) => {
    setCurrentCategorizationLabels(prev =>
      prev.map(label =>
        label.tempId === tempId ? { ...label, [field]: value } : label
      )
    );
  };

  const handleRemoveCategorizationLabel = (tempId: string) => {
    setCurrentCategorizationLabels(prev => prev.filter(label => label.tempId !== tempId));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      alert("No User ID found. Please log in again.");
      return;
    }
    if (!paramName.trim() || !paramDefinition.trim() || !goodExample.trim() || !badExample.trim()) {
      alert("Parameter Name, Definition, Good and Bad Examples are required.");
      return;
    }

    const labelsToSave: CategorizationLabelToStore[] = currentCategorizationLabels
      .map(({ tempId, ...restOfLabel }) => restOfLabel) // Strip tempId
      .filter(cl => cl.name.trim() && cl.definition.trim()); // Save only valid labels

    if (editingEvalParam) {
      const payloadForUpdate: EvalParameterUpdatePayload = {
        id: editingEvalParam.id,
        name: paramName.trim(),
        definition: paramDefinition.trim(),
        goodExample: goodExample.trim(),
        badExample: badExample.trim(),
        categorizationLabels: labelsToSave,
      };
      updateMutation.mutate(payloadForUpdate);
    } else {
      const newParamData: Omit<EvalParameter, 'id' | 'createdAt'> = {
        name: paramName.trim(),
        definition: paramDefinition.trim(),
        goodExample: goodExample.trim(),
        badExample: badExample.trim(),
        categorizationLabels: labelsToSave,
      };
      addMutation.mutate(newParamData);
    }
  };

  const resetForm = () => {
    setParamName('');
    setParamDefinition('');
    setGoodExample('');
    setBadExample('');
    setCurrentCategorizationLabels([]);
    setEditingEvalParam(null);
  };

  const openEditDialog = (param: EvalParameter) => {
    setEditingEvalParam(param);
    setParamName(param.name);
    setParamDefinition(param.definition);
    setGoodExample(param.goodExample);
    setBadExample(param.badExample);
    setCurrentCategorizationLabels(
      param.categorizationLabels?.map((cl, index) => ({ 
        ...cl, 
        tempId: `cl-${param.id}-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` 
      })) || []
    );
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!currentUserId) {
      alert("No User ID found. Please log in again.");
      return;
    }
    if (confirm('Are you sure you want to delete this evaluation parameter?')) {
      deleteMutation.mutate(id);
    }
  };
  
  const handleAddNewParameterClick = () => {
    if (!currentUserId) {
      alert("Please log in first to add parameters.");
      return;
    }
    setEditingEvalParam(null); // Ensure we are in "add new" mode
    resetForm(); // Resets all fields including categorization labels
    setIsDialogOpen(true);
  };


  if (isLoadingUserId || (isLoadingParameters && currentUserId)) {
    return (
      <div className="space-y-6">
        <Card className="shadow-lg">
          <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
          <CardContent><Skeleton className="h-10 w-64" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (fetchError) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle className="text-2xl font-headline text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Could not fetch evaluation parameters: {fetchError.message}</p>
           <p className="mt-2 text-sm text-muted-foreground">Please ensure you have entered a User ID on the login page and have a stable internet connection.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Target className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">Evaluation Parameters</CardTitle>
              <CardDescription>Define the metrics and criteria for evaluating your AI model's performance. Each parameter should include a clear definition, examples, and optional categorization labels.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
           <Button onClick={handleAddNewParameterClick} disabled={!currentUserId || addMutation.isPending || updateMutation.isPending}>
            <PlusCircle className="mr-2 h-5 w-5" /> Add New Evaluation Parameter
          </Button>
        </CardContent>
      </Card>
      
      <Dialog open={isDialogOpen} onOpenChange={(isOpen) => { setIsDialogOpen(isOpen); if(!isOpen) resetForm();}}>
        <DialogContent className="sm:max-w-2xl"> {/* Increased width for more content */}
          <DialogHeader>
            <DialogTitle>{editingEvalParam ? 'Edit' : 'Add New'} Evaluation Parameter</DialogTitle>
            <DialogDescription>
              Define a criterion for evaluating model outputs. Include examples and optional categorization labels.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <ScrollArea className="max-h-[70vh] p-1 pr-6"> {/* Added ScrollArea */}
              <div className="space-y-4 py-4 pr-1">
                <div>
                  <Label htmlFor="eval-name">Parameter Name</Label>
                  <Input id="eval-name" value={paramName} onChange={(e) => setParamName(e.target.value)} placeholder="e.g., Completeness" required />
                </div>
                <div>
                  <Label htmlFor="eval-definition">Detailed Definition</Label>
                  <Textarea id="eval-definition" value={paramDefinition} onChange={(e) => setParamDefinition(e.target.value)} placeholder="Explain what this parameter measures." required />
                </div>
                <div>
                  <Label htmlFor="eval-good-example">Good Example</Label>
                  <Textarea id="eval-good-example" value={goodExample} onChange={(e) => setGoodExample(e.target.value)} placeholder="Provide an example of a good response for this parameter." required />
                </div>
                <div>
                  <Label htmlFor="eval-bad-example">Bad Example</Label>
                  <Textarea id="eval-bad-example" value={badExample} onChange={(e) => setBadExample(e.target.value)} placeholder="Provide an example of a bad response for this parameter." required />
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <h4 className="text-md font-medium">Categorization Labels (Optional)</h4>
                  {currentCategorizationLabels.map((label, index) => (
                    <Card key={label.tempId} className="p-3 space-y-2 bg-muted/50">
                      <div className="flex justify-between items-center">
                        <Label htmlFor={`cl-name-${label.tempId}`}>Label Name #{index + 1}</Label>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveCategorizationLabel(label.tempId)}>
                          <MinusCircle className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        id={`cl-name-${label.tempId}`}
                        value={label.name}
                        onChange={(e) => handleCategorizationLabelChange(label.tempId, 'name', e.target.value)}
                        placeholder="e.g., directly_relevant"
                      />
                      <Label htmlFor={`cl-def-${label.tempId}`}>Label Definition</Label>
                      <Textarea
                        id={`cl-def-${label.tempId}`}
                        value={label.definition}
                        onChange={(e) => handleCategorizationLabelChange(label.tempId, 'definition', e.target.value)}
                        placeholder="Define this specific label..."
                        rows={2}
                      />
                    </Card>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={handleAddNewCategorizationLabel}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Categorization Label
                  </Button>
                </div>
              </div>
            </ScrollArea>
            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => {setIsDialogOpen(false); resetForm();}}>Cancel</Button>
              <Button type="submit" disabled={addMutation.isPending || updateMutation.isPending || !currentUserId}>
                  {addMutation.isPending || updateMutation.isPending ? 'Saving...' : (editingEvalParam ? 'Save Changes' : 'Add Parameter')}
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
             <div className="text-center text-muted-foreground py-8">
                <p>Please log in to see your evaluation parameters.</p>
              </div>
          ) : evalParameters.length === 0 && !isLoadingParameters ? (
            <div className="text-center text-muted-foreground py-8">
              <p>No evaluation parameters defined yet {currentUserId ? `for User ID: ${currentUserId}` : ''}.</p>
              <p className="text-sm">Click "Add New Evaluation Parameter" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Order</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Definition</TableHead>
                  <TableHead>Good Example</TableHead>
                  <TableHead>Bad Example</TableHead>
                  {/* Column for categorization labels could be added here if direct display is needed */}
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evalParameters.map((param) => (
                  <TableRow 
                    key={param.id}
                    className="hover:bg-muted/50"
                  >
                    <TableCell className="cursor-grab"><GripVertical className="h-5 w-5 text-muted-foreground" /></TableCell>
                    <TableCell className="font-medium">{param.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{param.definition}</TableCell>
                    <TableCell className="text-sm text-green-600 max-w-xs truncate"><CheckCircle className="inline h-4 w-4 mr-1" />{param.goodExample}</TableCell>
                    <TableCell className="text-sm text-red-600 max-w-xs truncate"><XCircle className="inline h-4 w-4 mr-1" />{param.badExample}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(param)} className="mr-2" disabled={updateMutation.isPending || deleteMutation.isPending || !currentUserId}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(param.id)} className="text-destructive hover:text-destructive/90" disabled={deleteMutation.isPending || (updateMutation.isPending && editingEvalParam?.id === param.id) || !currentUserId}>
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
    

    