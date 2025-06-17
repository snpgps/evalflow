
'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, Settings2, AlertTriangle } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, type Timestamp, deleteField, type FieldValue } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

interface InputParameter {
  id: string; // Firestore document ID
  name: string;
  type: 'text' | 'dropdown' | 'textarea';
  definition: string;
  options?: string[];
  createdAt?: Timestamp;
  order?: number;
}

// Type for update payload, allowing options to be FieldValue for deletion
type InputParameterUpdatePayload = { id: string } & Partial<Omit<InputParameter, 'id' | 'createdAt' | 'order' | 'options'>> & { options?: string[] | FieldValue };


const fetchInputParameters = async (userId: string | null): Promise<InputParameter[]> => {
  if (!userId) {
    console.log("fetchInputParameters: No userId provided, returning empty array.");
    return [];
  }
  console.log(`fetchInputParameters: Fetching for userId: ${userId}`);
  try {
    const parametersCollection = collection(db, 'users', userId, 'inputParameters');
    const q = query(parametersCollection, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    console.log(`fetchInputParameters: Snapshot received. Empty: ${snapshot.empty}. Size: ${snapshot.size}`);
    if (snapshot.empty) {
        console.log("fetchInputParameters: No documents found.");
    }
    const params = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      console.log(`fetchInputParameters: Document ID: ${docSnap.id}, Data:`, data);
      return { id: docSnap.id, ...data } as InputParameter;
    });
    console.log("fetchInputParameters: Successfully fetched and mapped parameters:", params);
    return params;
  } catch (error) {
    console.error("fetchInputParameters: Error fetching input parameters from Firestore:", error);
    // Re-throw the error so react-query can handle it and set the error state
    throw error;
  }
};

export default function SchemaDefinitionPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    if (storedUserId && storedUserId.trim() !== "") {
      console.log("SchemaDefinitionPage: User ID found in localStorage:", storedUserId);
      setCurrentUserId(storedUserId.trim());
    } else {
      console.log("SchemaDefinitionPage: No User ID in localStorage.");
      setCurrentUserId(null);
    }
    setIsLoadingUserId(false);
  }, []);

  const { data: parameters = [], isLoading: isLoadingParameters, error: fetchError } = useQuery<InputParameter[], Error>({
    queryKey: ['inputParameters', currentUserId],
    queryFn: () => fetchInputParameters(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  useEffect(() => {
    if(fetchError) {
      console.error("SchemaDefinitionPage: React Query fetchError:", fetchError);
    }
    if(!isLoadingParameters && parameters.length === 0 && !!currentUserId && !fetchError) {
      console.log("SchemaDefinitionPage: Parameters loaded, but the array is empty.");
    }
  }, [fetchError, isLoadingParameters, parameters, currentUserId]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingParameter, setEditingParameter] = useState<InputParameter | null>(null);

  const [parameterName, setParameterName] = useState('');
  const [parameterType, setParameterType] = useState<'text' | 'dropdown' | 'textarea'>('text');
  const [parameterDefinition, setParameterDefinition] = useState('');
  const [dropdownOptions, setDropdownOptions] = useState('');

  const addMutation = useMutation<void, Error, Omit<InputParameter, 'id' | 'createdAt' | 'order'>>({
    mutationFn: async (newParameterDataFromMutate) => {
      if (!currentUserId) throw new Error("User not identified for add operation.");

      const dataForDoc: any = {
        name: newParameterDataFromMutate.name,
        type: newParameterDataFromMutate.type,
        definition: newParameterDataFromMutate.definition,
        createdAt: serverTimestamp(),
      };

      if (newParameterDataFromMutate.type === 'dropdown') {
        dataForDoc.options = newParameterDataFromMutate.options || []; // Ensure options is an array, even if empty
      }
      // If type is not 'dropdown', 'options' field is not added to dataForDoc.

      await addDoc(collection(db, 'users', currentUserId, 'inputParameters'), dataForDoc);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inputParameters', currentUserId] });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      console.error("Error adding parameter:", error);
      alert(`Error adding parameter: ${error.message}`);
    }
  });

  const updateMutation = useMutation<void, Error, InputParameterUpdatePayload>({
    mutationFn: async (parameterUpdatePayload) => {
      if (!currentUserId) throw new Error("User not identified for update operation.");
      const { id, ...dataToUpdate } = parameterUpdatePayload;
      const docRef = doc(db, 'users', currentUserId, 'inputParameters', id);
      await updateDoc(docRef, dataToUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inputParameters', currentUserId] });
      resetForm();
      setIsDialogOpen(false);
    },
     onError: (error) => {
      console.error("Error updating parameter:", error);
      alert(`Error updating parameter: ${error.message}`);
    }
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (parameterId) => {
      if (!currentUserId) throw new Error("User not identified for delete operation.");
      await deleteDoc(doc(db, 'users', currentUserId, 'inputParameters', parameterId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inputParameters', currentUserId] });
    },
    onError: (error) => {
      console.error("Error deleting parameter:", error);
      alert(`Error deleting parameter: ${error.message}`);
    }
  });

 const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
        alert("No User ID found. Please log in again.");
        return;
    }
    if (!parameterName.trim() || !parameterDefinition.trim()) {
        alert("Parameter Name and Definition are required.");
        return;
    }

    if (editingParameter) {
      const payloadForUpdate: InputParameterUpdatePayload = {
            id: editingParameter.id,
            name: parameterName.trim(),
            type: parameterType,
            definition: parameterDefinition.trim(),
        };
        if (parameterType === 'dropdown') {
            payloadForUpdate.options = dropdownOptions.split(',').map(opt => opt.trim()).filter(Boolean);
            if (!payloadForUpdate.options) payloadForUpdate.options = [];
        } else {
            payloadForUpdate.options = deleteField();
        }
        updateMutation.mutate(payloadForUpdate);
    } else {
      const newParamData: Omit<InputParameter, 'id' | 'createdAt' | 'order'> = {
        name: parameterName.trim(),
        type: parameterType,
        definition: parameterDefinition.trim(),
      };
      if (parameterType === 'dropdown') {
        (newParamData as any).options = dropdownOptions.split(',').map(opt => opt.trim()).filter(Boolean);
         if (!(newParamData as any).options) (newParamData as any).options = [];
      }
      addMutation.mutate(newParamData);
    }
  };

  const resetForm = () => {
    setParameterName('');
    setParameterType('text');
    setParameterDefinition('');
    setDropdownOptions('');
    setEditingParameter(null);
  };

  const openEditDialog = (param: InputParameter) => {
    setEditingParameter(param);
    setParameterName(param.name);
    setParameterType(param.type);
    setParameterDefinition(param.definition);
    setDropdownOptions(param.options?.join(', ') || '');
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!currentUserId) {
        alert("No User ID found. Please log in again.");
        return;
    }
    if (confirm('Are you sure you want to delete this parameter?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleAddNewParameterClick = () => {
    if (!currentUserId) {
      alert("Please log in first to add parameters.");
      return;
    }
    setEditingParameter(null);
    resetForm();
    setIsDialogOpen(true);
  };

  if (isLoadingUserId || (isLoadingParameters && currentUserId)) {
    return (
      <div className="space-y-6 p-4 md:p-0">
        <Card className="shadow-lg">
          <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
          <CardContent><Skeleton className="h-10 w-full sm:w-48" /></CardContent>
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

  // This check is more specific: if there IS a fetchError from react-query
  if (fetchError) {
    return (
      <Card className="shadow-lg m-4 md:m-0">
        <CardHeader>
            <CardTitle className="text-xl md:text-2xl font-headline text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Could not fetch input parameters: {fetchError.message}</p>
           <p className="mt-2 text-sm text-muted-foreground">Please ensure you have entered a User ID on the login page and have a stable internet connection. Check your browser's developer console (Network and Console tabs) for more specific Firebase errors. Also, verify your Firebase project's Firestore security rules and API key restrictions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-0">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
             <Settings2 className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-xl md:text-2xl font-headline">Input Parameter Schema</CardTitle>
              <CardDescription>Define the structured fields for your AI inputs. These parameters will be used for dataset mapping and prompt templating.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAddNewParameterClick} disabled={!currentUserId || addMutation.isPending || updateMutation.isPending} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-5 w-5" /> Add New Parameter
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(isOpen) => { setIsDialogOpen(isOpen); if(!isOpen) resetForm();}}>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>{editingParameter ? 'Edit' : 'Add New'} Input Parameter</DialogTitle>
                <DialogDescription>
                  Define a field for your input data. This will be used to structure datasets and create prompt variables.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="param-name">Parameter Name</Label>
                  <Input id="param-name" value={parameterName} onChange={(e) => setParameterName(e.target.value)} placeholder="e.g., User Query" required />
                </div>
                <div>
                  <Label htmlFor="param-type">Parameter Type</Label>
                  <Select value={parameterType} onValueChange={(value: 'text' | 'dropdown' | 'textarea') => setParameterType(value)}>
                    <SelectTrigger id="param-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text (Single Line)</SelectItem>
                      <SelectItem value="textarea">Text Area (Multi Line)</SelectItem>
                      <SelectItem value="dropdown">Dropdown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {parameterType === 'dropdown' && (
                  <div>
                    <Label htmlFor="param-options">Dropdown Options (comma-separated)</Label>
                    <Input id="param-options" value={dropdownOptions} onChange={(e) => setDropdownOptions(e.target.value)} placeholder="e.g., Option A, Option B" />
                  </div>
                )}
                <div>
                  <Label htmlFor="param-definition">Definition/Description</Label>
                  <Textarea id="param-definition" value={parameterDefinition} onChange={(e) => setParameterDefinition(e.target.value)} placeholder="Describe what this parameter represents." required />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {setIsDialogOpen(false); resetForm();}}>Cancel</Button>
                  <Button type="submit" disabled={addMutation.isPending || updateMutation.isPending || !currentUserId}>
                    {addMutation.isPending || updateMutation.isPending ? 'Saving...' : (editingParameter ? 'Save Changes' : 'Add Parameter')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Defined Input Parameters</CardTitle>
          <CardDescription>Manage your existing input parameters. {currentUserId ? `(User ID: ${currentUserId})` : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {!currentUserId && !isLoadingUserId ? (
             <div className="text-center text-muted-foreground py-8">
                <p>Please log in to see your parameters.</p>
              </div>
          ) : isLoadingParameters ? ( // This case is now less likely to show due to the top-level loader, but good fallback
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : parameters.length === 0 && !fetchError ? ( // Check if parameters array is empty AND there was no fetchError
            <div className="text-center text-muted-foreground py-8">
              <p>No input parameters defined yet {currentUserId ? `for User ID: ${currentUserId}` : ''}.</p>
              <p className="text-sm">Click "Add New Parameter" to get started.</p>
            </div>
          ) : ( // This implies parameters.length > 0 AND no fetchError
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-2/5 sm:w-1/3">Name</TableHead>
                  <TableHead className="hidden sm:table-cell w-1/5 sm:w-1/4">Type</TableHead>
                  <TableHead className="w-2/5 sm:w-1/3">Definition</TableHead>
                  <TableHead className="text-right w-[70px] sm:w-auto">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parameters.map((param) => (
                  <TableRow key={param.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium truncate" title={param.name}>{param.name}</TableCell>
                    <TableCell className="capitalize hidden sm:table-cell truncate">{param.type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate" title={param.definition}>{param.definition}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-0 sm:gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(param)} className="mr-0 sm:mr-2" disabled={updateMutation.isPending || deleteMutation.isPending || !currentUserId}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(param.id)} className="text-destructive hover:text-destructive/90" disabled={deleteMutation.isPending || (updateMutation.isPending && editingParameter?.id === param.id) || !currentUserId}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
