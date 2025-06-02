
'use client';

import { useState, type FormEvent, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, FileText, GitBranchPlus, Save, Copy, Tag, Loader2, Target, AlertTriangle } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { db } from '@/lib/firebase';
import { 
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, 
  query, orderBy, writeBatch, Timestamp, type FieldValue 
} from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

// Firestore-aligned interfaces for Product Parameters
interface ProductParameterForPrompts {
  id: string;
  name: string;
  description: string;
}

// Firestore-aligned interfaces for Evaluation Parameters
interface CategorizationLabelForPrompts {
    name: string;
    definition: string;
    example?: string;
}
interface EvalParameterForPrompts {
  id: string;
  name: string;
  definition: string;
  categorizationLabels?: CategorizationLabelForPrompts[];
}


interface PromptVersionFirestore { // Raw from Firestore
  versionNumber: number;
  template: string;
  notes: string;
  createdAt: Timestamp;
}

interface PromptTemplateFirestore { // Raw from Firestore
  name: string;
  description: string;
  currentVersionId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Interfaces for client-side state and display
interface PromptVersion {
  id: string;
  versionNumber: number;
  template: string;
  notes: string;
  createdAt: string; // ISO String
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  versions: PromptVersion[];
  currentVersionId: string | null;
  createdAt?: string; // ISO String for display
  updatedAt?: string; // ISO String for display
}


// Fetch Product Parameters
const fetchProductParametersForPrompts = async (userId: string | null): Promise<ProductParameterForPrompts[]> => {
  if (!userId) return [];
  const paramsCollectionRef = collection(db, 'users', userId, 'productParameters');
  const paramsQuery = query(paramsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(paramsQuery);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    name: docSnap.data().name as string || 'Unnamed Parameter',
    description: docSnap.data().description as string || '',
  }));
};

// Fetch Evaluation Parameters
const fetchEvaluationParametersForPrompts = async (userId: string | null): Promise<EvalParameterForPrompts[]> => {
  if (!userId) return [];
  try {
    const evalParamsCollectionRef = collection(db, 'users', userId, 'evaluationParameters');
    const q = query(evalParamsCollectionRef, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name || 'Unnamed Eval Param',
        definition: data.definition || '',
        categorizationLabels: (data.categorizationLabels || []).map((label: any) => ({
          name: label.name || '',
          definition: label.definition || '',
          example: label.example || undefined,
        })),
      };
    });
  } catch (error) {
    console.error("Error fetching evaluation parameters for prompts:", error);
    toast({ title: "Error", description: "Could not fetch evaluation parameters.", variant: "destructive" });
    return [];
  }
};


// Fetch Prompt Templates with Versions
export const fetchPromptTemplates = async (userId: string | null): Promise<PromptTemplate[]> => {
  if (!userId) return [];
  try {
    const promptTemplatesCollectionRef = collection(db, 'users', userId, 'promptTemplates');
    const q = query(promptTemplatesCollectionRef, orderBy('createdAt', 'desc'));
    const promptTemplatesSnapshot = await getDocs(q);

    if (promptTemplatesSnapshot.empty) {
        return [];
    }

    const promptTemplatesData: PromptTemplate[] = [];

    for (const promptDoc of promptTemplatesSnapshot.docs) {
      const promptData = promptDoc.data() as PromptTemplateFirestore;
      const versionsCollectionRef = collection(db, 'users', userId, 'promptTemplates', promptDoc.id, 'versions');
      const versionsQuery = query(versionsCollectionRef, orderBy('versionNumber', 'desc'));
      const versionsSnapshot = await getDocs(versionsQuery);
      
      const versions: PromptVersion[] = [];
      versionsSnapshot.forEach(versionDocSnap => {
        const versionData = versionDocSnap.data() as PromptVersionFirestore;
        const versionCreatedAtTimestamp = versionData.createdAt as Timestamp | undefined;
        versions.push({
          id: versionDocSnap.id,
          versionNumber: versionData.versionNumber || 0,
          template: versionData.template || '',
          notes: versionData.notes || '',
          createdAt: versionCreatedAtTimestamp?.toDate().toISOString() || new Date(0).toISOString(), 
        });
      });

      const createdAtTimestamp = promptData.createdAt as Timestamp | undefined;
      const updatedAtTimestamp = promptData.updatedAt as Timestamp | undefined;

      promptTemplatesData.push({
        id: promptDoc.id,
        name: promptData.name || 'Untitled Prompt',
        description: promptData.description || '',
        versions: versions,
        currentVersionId: promptData.currentVersionId || null,
        createdAt: createdAtTimestamp?.toDate().toISOString(),
        updatedAt: updatedAtTimestamp?.toDate().toISOString(),
      });
    }
    return promptTemplatesData;
  } catch (error) {
    console.error("Error fetching prompt templates:", error);
    toast({ title: "Error", description: "Could not fetch prompt templates.", variant: "destructive" });
    return []; 
  }
};


export default function PromptsPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);
  const queryClient = useQueryClient();

  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);

  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [editingPromptData, setEditingPromptData] = useState<PromptTemplate | null>(null);
  const [promptName, setPromptName] = useState('');
  const [promptDescription, setPromptDescription] = useState('');

  const [promptTemplateContent, setPromptTemplateContent] = useState('');
  const [versionNotes, setVersionNotes] = useState('');
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    if (storedUserId && storedUserId.trim() !== "") {
      setCurrentUserId(storedUserId.trim());
    } else {
      setCurrentUserId(null);
    }
    setIsLoadingUserId(false);
  }, []);

  const { data: promptsData = [], isLoading: isLoadingPrompts, error: fetchPromptsError } = useQuery<PromptTemplate[], Error>({
    queryKey: ['promptTemplates', currentUserId],
    queryFn: () => fetchPromptTemplates(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const { data: productParameters = [], isLoading: isLoadingProdParams, error: fetchProdParamsError } = useQuery<ProductParameterForPrompts[], Error>({
    queryKey: ['productParametersForPrompts', currentUserId],
    queryFn: () => fetchProductParametersForPrompts(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const { data: evaluationParameters = [], isLoading: isLoadingEvalParams, error: fetchEvalParamsError } = useQuery<EvalParameterForPrompts[], Error>({
    queryKey: ['evaluationParametersForPrompts', currentUserId],
    queryFn: () => fetchEvaluationParametersForPrompts(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });


  useEffect(() => {
    if (!currentUserId || isLoadingPrompts || fetchPromptsError || !promptsData) return;

    if (promptsData && promptsData.length > 0) {
      if (!selectedPromptId || !promptsData.find(p => p.id === selectedPromptId)) {
        const firstPrompt = promptsData[0];
        setSelectedPromptId(firstPrompt.id);
        if (firstPrompt.currentVersionId && firstPrompt.versions.find(v => v.id === firstPrompt.currentVersionId)) {
          setSelectedVersionId(firstPrompt.currentVersionId);
        } else if (firstPrompt.versions.length > 0) {
          const latestVersion = [...firstPrompt.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
          setSelectedVersionId(latestVersion.id);
        } else {
          setSelectedVersionId(null);
        }
      }
      else if (selectedPromptId) {
        const currentPromptInList = promptsData.find(p => p.id === selectedPromptId);
        if (currentPromptInList && (!selectedVersionId || !currentPromptInList.versions.find(v => v.id === selectedVersionId))) {
            if (currentPromptInList.currentVersionId && currentPromptInList.versions.find(v => v.id === currentPromptInList.currentVersionId)) {
                setSelectedVersionId(currentPromptInList.currentVersionId);
            } else if (currentPromptInList.versions.length > 0) {
                const latestVersion = [...currentPromptInList.versions].sort((a,b) => b.versionNumber - a.versionNumber)[0];
                setSelectedVersionId(latestVersion.id);
            } else {
                setSelectedVersionId(null);
            }
        }
      }
    } else if (promptsData && promptsData.length === 0) {
      setSelectedPromptId(null);
      setSelectedVersionId(null);
    }
  }, [promptsData, selectedPromptId, currentUserId, isLoadingPrompts, fetchPromptsError]);


  useEffect(() => {
    if (!promptsData) {
        setSelectedPrompt(null);
        setSelectedVersion(null);
        setPromptTemplateContent('');
        setVersionNotes('');
        return;
    }
    const currentPromptObj = promptsData.find(p => p.id === selectedPromptId);
    setSelectedPrompt(currentPromptObj || null);

    if (currentPromptObj) {
      const currentVersionObj = currentPromptObj.versions.find(v => v.id === selectedVersionId);
      setSelectedVersion(currentVersionObj || null);
      if (currentVersionObj) {
        setPromptTemplateContent(currentVersionObj.template);
        setVersionNotes(currentVersionObj.notes);
      } else {
        setPromptTemplateContent('');
        setVersionNotes('');
      }
    } else {
      setSelectedVersion(null);
      setPromptTemplateContent('');
      setVersionNotes('');
    }
  }, [promptsData, selectedPromptId, selectedVersionId]);


  const addPromptTemplateMutation = useMutation<string, Error, { name: string; description: string }>({
    mutationFn: async ({ name, description }) => {
      if (!currentUserId) throw new Error("User not identified.");
      
      const newPromptRef = await addDoc(collection(db, 'users', currentUserId, 'promptTemplates'), {
        name,
        description,
        currentVersionId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const initialVersionRef = await addDoc(collection(db, 'users', currentUserId, 'promptTemplates', newPromptRef.id, 'versions'), {
        versionNumber: 1,
        template: "Your initial prompt template here. Use {{variable_name}} for product parameters. You can also insert structured evaluation parameter details.",
        notes: 'Initial version',
        createdAt: serverTimestamp(),
      });

      await updateDoc(newPromptRef, { currentVersionId: initialVersionRef.id, updatedAt: serverTimestamp() });
      return newPromptRef.id;
    },
    onSuccess: (newPromptId) => {
      queryClient.invalidateQueries({ queryKey: ['promptTemplates', currentUserId] });
      setSelectedPromptId(newPromptId);
      toast({ title: "Success", description: "Prompt template created." });
      setIsPromptDialogOpen(false);
      resetPromptDialogForm();
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to create prompt: ${error.message}`, variant: "destructive" });
    }
  });

  const updatePromptTemplateMutation = useMutation<void, Error, { id: string; name: string; description: string }>({
    mutationFn: async ({ id, name, description }) => {
      if (!currentUserId) throw new Error("User not identified.");
      const promptRef = doc(db, 'users', currentUserId, 'promptTemplates', id);
      await updateDoc(promptRef, { name, description, updatedAt: serverTimestamp() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promptTemplates', currentUserId] });
      toast({ title: "Success", description: "Prompt template updated." });
      setIsPromptDialogOpen(false);
      resetPromptDialogForm();
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to update prompt: ${error.message}`, variant: "destructive" });
    }
  });

  const deletePromptTemplateMutation = useMutation<void, Error, string>({
    mutationFn: async (promptId) => {
      if (!currentUserId) throw new Error("User not identified.");
      
      const versionsRef = collection(db, 'users', currentUserId, 'promptTemplates', promptId, 'versions');
      const versionsSnapshot = await getDocs(versionsRef);
      const batch = writeBatch(db);
      versionsSnapshot.forEach(vDoc => batch.delete(vDoc.ref));
      await batch.commit();

      await deleteDoc(doc(db, 'users', currentUserId, 'promptTemplates', promptId));
    },
    onSuccess: (_data, promptId) => {
      queryClient.invalidateQueries({ queryKey: ['promptTemplates', currentUserId] });
      toast({ title: "Success", description: "Prompt template deleted." });
      if (selectedPromptId === promptId) {
        setSelectedPromptId(null); 
        setSelectedVersionId(null);
      }
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to delete prompt: ${error.message}`, variant: "destructive" });
    }
  });

  const addPromptVersionMutation = useMutation<string, Error, { promptId: string; template: string; notes: string }>({
    mutationFn: async ({ promptId, template, notes }) => {
      if (!currentUserId || !selectedPrompt) throw new Error("User or prompt not identified.");
      
      const latestVersionNum = Math.max(0, ...selectedPrompt.versions.map(v => v.versionNumber));
      const newVersionRef = await addDoc(collection(db, 'users', currentUserId, 'promptTemplates', promptId, 'versions'), {
        versionNumber: latestVersionNum + 1,
        template,
        notes: notes || `New version based on v${latestVersionNum}`,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', currentUserId, 'promptTemplates', promptId), { 
        currentVersionId: newVersionRef.id,
        updatedAt: serverTimestamp() 
      });
      return newVersionRef.id;
    },
    onSuccess: (newVersionId) => {
      queryClient.invalidateQueries({ queryKey: ['promptTemplates', currentUserId] });
      setSelectedVersionId(newVersionId); 
      toast({ title: "Success", description: "New prompt version created." });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to create version: ${error.message}`, variant: "destructive" });
    }
  });

  const updatePromptVersionMutation = useMutation<void, Error, { promptId: string; versionId: string; template: string; notes: string }>({
    mutationFn: async ({ promptId, versionId, template, notes }) => {
      if (!currentUserId) throw new Error("User not identified.");
      const versionRef = doc(db, 'users', currentUserId, 'promptTemplates', promptId, 'versions', versionId);
      await updateDoc(versionRef, { template, notes });
      await updateDoc(doc(db, 'users', currentUserId, 'promptTemplates', promptId), { updatedAt: serverTimestamp() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promptTemplates', currentUserId] });
      toast({ title: "Success", description: "Prompt version saved." });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to save version: ${error.message}`, variant: "destructive" });
    }
  });


  const handleSelectPrompt = (promptId: string) => {
    setSelectedPromptId(promptId);
    const prompt = promptsData?.find(p => p.id === promptId);
    if (prompt) {
      if (prompt.currentVersionId && prompt.versions.find(v => v.id === prompt.currentVersionId)) {
        setSelectedVersionId(prompt.currentVersionId);
      } else if (prompt.versions.length > 0) {
        const latestVersion = [...prompt.versions].sort((a,b) => b.versionNumber - a.versionNumber)[0];
        setSelectedVersionId(latestVersion.id);
      } else {
        setSelectedVersionId(null); 
      }
    }
  };

  const handleSelectVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
  };

  const insertIntoTextarea = (textToInsert: string) => {
    const textarea = promptTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = textarea.value;
      const before = currentText.substring(0, start);
      const after = currentText.substring(end, currentText.length);
      
      setPromptTemplateContent(before + textToInsert + after);
      
      textarea.focus();
      setTimeout(() => { // Ensure DOM has updated before setting selection
        textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
      }, 0);
    }
  };

  const insertProductParameter = (variableName: string) => {
    insertIntoTextarea(`{{${variableName}}}`);
  };

  const insertEvaluationParameter = (evalParam: EvalParameterForPrompts) => {
    let textToInsert = `--- EVALUATION PARAMETER: ${evalParam.name} ---\n`;
    textToInsert += `Definition: ${evalParam.definition}\n\n`;

    if (evalParam.categorizationLabels && evalParam.categorizationLabels.length > 0) {
      textToInsert += "Relevant Categorization Labels:\n";
      evalParam.categorizationLabels.forEach(label => {
        textToInsert += `  - Label: "${label.name}"\n`;
        textToInsert += `    Definition: "${label.definition}"\n`;
        if (label.example && label.example.trim() !== '') {
          textToInsert += `    Example: "${label.example}"\n`;
        }
      });
    } else {
      textToInsert += "(No specific categorization labels defined for this parameter)\n";
    }
    textToInsert += `--- END EVALUATION PARAMETER: ${evalParam.name} ---\n\n`;
    insertIntoTextarea(textToInsert);
  };


  const handleSaveVersion = () => {
    if (!selectedPrompt || !selectedVersion || !currentUserId) {
      toast({ title: "Error", description: "No prompt or version selected to save.", variant: "destructive" });
      return;
    }
    updatePromptVersionMutation.mutate({ 
      promptId: selectedPrompt.id, 
      versionId: selectedVersion.id, 
      template: promptTemplateContent, 
      notes: versionNotes 
    });
  };

  const handleCreateNewVersion = () => {
    if (!selectedPrompt || !currentUserId) {
      toast({ title: "Error", description: "Select a prompt to create a new version for.", variant: "destructive" });
      return;
    }
    addPromptVersionMutation.mutate({
      promptId: selectedPrompt.id,
      template: promptTemplateContent, 
      notes: `New version based on v${selectedVersion?.versionNumber || 'current editor'}`,
    });
  };
  
  const handlePromptDialogSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!promptName.trim()) {
      toast({ title: "Validation Error", description: "Prompt name is required.", variant: "destructive" });
      return;
    }
    if (editingPromptData) {
      updatePromptTemplateMutation.mutate({ id: editingPromptData.id, name: promptName, description: promptDescription });
    } else {
      addPromptTemplateMutation.mutate({ name: promptName, description: promptDescription });
    }
  };

  const resetPromptDialogForm = () => {
    setPromptName('');
    setPromptDescription('');
    setEditingPromptData(null);
  };

  const openEditPromptDialog = (prompt: PromptTemplate) => {
    setEditingPromptData(prompt);
    setPromptName(prompt.name);
    setPromptDescription(prompt.description);
    setIsPromptDialogOpen(true);
  };
  
  const handleOpenNewPromptDialog = () => {
    if (!currentUserId) {
        toast({ title: "Login Required", description: "Please log in to create prompts.", variant: "destructive" });
        return;
    }
    resetPromptDialogForm();
    setIsPromptDialogOpen(true);
  };

  const handleDeletePrompt = (promptId: string) => {
    if (!currentUserId) return;
    if (confirm('Are you sure you want to delete this prompt template and all its versions? This action cannot be undone.')) {
      deletePromptTemplateMutation.mutate(promptId);
    }
  };
  
  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleDateString();
    } catch (e) {
      return 'Invalid Date';
    }
  };

  const renderPromptList = () => {
    if (isLoadingUserId || (isLoadingPrompts && !!currentUserId)) {
      return Array.from({ length: 3 }).map((_, i) => (
        <div key={`skel-prompt-${i}`} className="p-3 border-b">
          <Skeleton className="h-5 w-3/4 mb-1" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ));
    }
    if (fetchPromptsError) {
      return <div className="p-4 text-destructive">Error: {fetchPromptsError.message}</div>;
    }
    if (!currentUserId && !isLoadingUserId) {
        return <div className="p-6 text-center text-muted-foreground">Please log in to manage prompts.</div>;
    }
    if (promptsData.length === 0) {
      return (
        <div className="p-6 text-center text-muted-foreground">
          <FileText className="mx-auto h-10 w-10 mb-2" />
          <p>No prompts created yet.</p>
        </div>
      );
    }
    return promptsData.map(p => (
      <div
        key={p.id}
        className={`p-3 border-b cursor-pointer hover:bg-muted/50 ${selectedPromptId === p.id ? 'bg-muted' : ''}`}
        onClick={() => handleSelectPrompt(p.id)}
      >
        <div className="flex justify-between items-center">
          <span className={selectedPromptId === p.id ? 'font-semibold text-primary': ''}>{p.name}</span>
          <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditPromptDialog(p);}} disabled={updatePromptTemplateMutation.isPending || deletePromptTemplateMutation.isPending}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/90" onClick={(e) => {e.stopPropagation(); handleDeletePrompt(p.id)}} disabled={deletePromptTemplateMutation.isPending || (deletePromptTemplateMutation.isPending && deletePromptTemplateMutation.variables === p.id) }>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground truncate">{p.description}</p>
      </div>
    ));
  };

  const renderEditorArea = () => {
    if (!selectedPrompt && !isLoadingPrompts && promptsData.length > 0 && currentUserId) {
      return (
        <Card className="flex-1 flex items-center justify-center shadow-lg">
          <div className="text-center text-muted-foreground p-8">
            <FileText className="mx-auto h-16 w-16 mb-4" />
            <h2 className="text-xl font-semibold">Select a Prompt</h2>
            <p>Choose a prompt from the list to start editing or view its versions.</p>
          </div>
        </Card>
      );
    }
     if (!selectedPrompt && promptsData.length === 0 && !isLoadingPrompts && currentUserId) {
         return (
            <Card className="flex-1 flex items-center justify-center shadow-lg">
              <div className="text-center text-muted-foreground p-8">
                <FileText className="mx-auto h-16 w-16 mb-4" />
                <h2 className="text-xl font-semibold">No Prompts Available</h2>
                <p>Create a new prompt template to begin.</p>
              </div>
            </Card>
         );
     }
    if (!selectedPrompt && (isLoadingPrompts || isLoadingUserId)) {
         return (
            <Card className="flex-1 flex flex-col shadow-lg">
                <CardHeader className="border-b">
                    <Skeleton className="h-6 w-3/4 mb-1"/>
                    <Skeleton className="h-4 w-1/2"/>
                </CardHeader>
                <CardContent className="flex-1 p-4">
                    <Skeleton className="h-full w-full"/>
                </CardContent>
                <CardFooter className="border-t pt-4">
                    <Skeleton className="h-9 w-24"/> <Skeleton className="h-9 w-32 ml-2"/>
                </CardFooter>
            </Card>
         );
    }
    if (!selectedPrompt) { 
        return (
            <Card className="flex-1 flex items-center justify-center shadow-lg">
                 <div className="text-center text-muted-foreground p-8">
                    <FileText className="mx-auto h-16 w-16 mb-4" />
                    <p>Select or create a prompt.</p>
                 </div>
            </Card>
        );
    }

    return (
      <Card className="flex-1 flex flex-col shadow-lg">
        <CardHeader className="border-b">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xl font-headline">{selectedPrompt.name}</CardTitle>
              <CardDescription>{selectedPrompt.description || "No description."}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select
                  value={selectedVersionId || ''}
                  onValueChange={(versionId) => handleSelectVersion(versionId)}
                  disabled={selectedPrompt.versions.length === 0}
                >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {selectedPrompt.versions.sort((a,b) => b.versionNumber - a.versionNumber).map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      Version {v.versionNumber} ({formatDate(v.createdAt)})
                      {selectedPrompt.currentVersionId === v.id && <Badge variant="secondary" className="ml-2">Active</Badge>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={handleCreateNewVersion} disabled={!selectedPrompt || addPromptVersionMutation.isPending}>
                {addPromptVersionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <GitBranchPlus className="mr-2 h-4 w-4" />} New Version
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 flex min-h-0">
          <div className="flex-1 p-4 flex flex-col">
            <Label htmlFor="prompt-template-area" className="mb-2 font-medium">
              Prompt Template (Version {selectedVersion?.versionNumber || 'N/A'})
              {selectedPrompt.currentVersionId === selectedVersionId && <Badge variant="outline" className="ml-2 border-green-500 text-green-600">Active</Badge>}
            </Label>
            <Textarea
              ref={promptTextareaRef}
              id="prompt-template-area"
              value={promptTemplateContent}
              onChange={(e) => setPromptTemplateContent(e.target.value)}
              placeholder={!selectedVersion && selectedPrompt.versions.length === 0 ? "Create a version to start editing." : "Enter your prompt template here..."}
              className="flex-1 resize-none font-mono text-sm min-h-[200px]"
              disabled={!selectedVersion || updatePromptVersionMutation.isPending}
            />
            <Label htmlFor="version-notes" className="mt-4 mb-2 font-medium">Version Notes</Label>
            <Input 
              id="version-notes" 
              value={versionNotes} 
              onChange={(e) => setVersionNotes(e.target.value)} 
              placeholder="Notes for this version (e.g., 'Improved clarity on instructions')" 
              disabled={!selectedVersion || updatePromptVersionMutation.isPending}
            />
          </div>
          <div className="w-1/3 min-w-[300px] border-l p-4 bg-muted/20 flex flex-col">
            <ScrollArea className="flex-1">
              <div>
                <h3 className="text-md font-semibold mb-3">Product Parameters</h3>
                {isLoadingProdParams ? <Skeleton className="h-20 w-full" /> :
                fetchProdParamsError ? <p className="text-xs text-destructive">Error loading product parameters.</p> :
                productParameters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No product parameters defined. Go to Schema Definition.</p>
                ) : (
                  <div className="space-y-2">
                    {productParameters.map(param => (
                      <Card key={param.id} className="p-2 shadow-sm bg-background">
                        <div className="flex items-center gap-2 mb-1">
                          <Tag className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">{param.name}</span>
                        </div>
                        <Button onClick={() => insertProductParameter(param.name)} title={`Insert {{${param.name}}}`} disabled={!selectedVersion} variant="outline" size="sm" className="w-full mb-1">
                          Insert Variable
                        </Button>
                        <p className="text-xs text-muted-foreground truncate" title={param.description}>{param.description}</p>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t">
                <h3 className="text-md font-semibold mb-3">Evaluation Parameters</h3>
                {isLoadingEvalParams ? <Skeleton className="h-20 w-full" /> :
                fetchEvalParamsError ? <p className="text-xs text-destructive">Error loading evaluation parameters.</p> :
                evaluationParameters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No evaluation parameters defined. Go to Evaluation Parameters.</p>
                ) : (
                  <div className="space-y-2">
                    {evaluationParameters.map(param => (
                      <Card key={param.id} className="p-2 shadow-sm bg-background">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium">{param.name}</span>
                        </div>
                        <Button onClick={() => insertEvaluationParameter(param)} title={`Insert details for ${param.name}`} disabled={!selectedVersion} variant="outline" size="sm" className="w-full mb-1">
                          Insert Details
                        </Button>
                        <p className="text-xs text-muted-foreground truncate" title={param.definition}>{param.definition}</p>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(promptTemplateContent)} disabled={!selectedVersion || !promptTemplateContent}>
            <Copy className="mr-2 h-4 w-4" /> Copy Template
          </Button>
          <Button onClick={handleSaveVersion} disabled={!selectedVersion || updatePromptVersionMutation.isPending}>
            {updatePromptVersionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Current Version
          </Button>
        </CardFooter>
      </Card>
    );
  };


  return (
    <div className="flex h-[calc(100vh-theme(spacing.28))] gap-6">
      <Card className="w-1/4 min-w-[300px] flex flex-col shadow-lg">
        <CardHeader className="border-b">
          <CardTitle>Prompt Templates</CardTitle>
          <CardDescription>Manage your Judge LLM prompts.</CardDescription>
           <Dialog open={isPromptDialogOpen} onOpenChange={(isOpen) => { setIsPromptDialogOpen(isOpen); if(!isOpen) resetPromptDialogForm();}}>
            <DialogTrigger asChild>
              <Button size="sm" className="mt-2 w-full" onClick={handleOpenNewPromptDialog} disabled={addPromptTemplateMutation.isPending || updatePromptTemplateMutation.isPending || !currentUserId}>
                <PlusCircle className="mr-2 h-4 w-4" /> New Prompt Template
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingPromptData ? 'Edit' : 'Create New'} Prompt Template</DialogTitle>
              </DialogHeader>
              <form onSubmit={handlePromptDialogSubmit} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="prompt-name">Prompt Name</Label>
                  <Input id="prompt-name" value={promptName} onChange={(e) => setPromptName(e.target.value)} placeholder="e.g., Quality Check Prompt" required />
                </div>
                <div>
                  <Label htmlFor="prompt-desc">Description</Label>
                  <Textarea id="prompt-desc" value={promptDescription} onChange={(e) => setPromptDescription(e.target.value)} placeholder="Briefly describe this prompt's purpose." />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {setIsPromptDialogOpen(false); resetPromptDialogForm();}}>Cancel</Button>
                  <Button type="submit" disabled={addPromptTemplateMutation.isPending || updatePromptTemplateMutation.isPending}>
                    {(addPromptTemplateMutation.isPending || updatePromptTemplateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    {editingPromptData ? 'Save Changes' : 'Create Prompt'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <ScrollArea className="flex-1">
          <CardContent className="p-0">
            {renderPromptList()}
          </CardContent>
        </ScrollArea>
      </Card>

      {renderEditorArea()}
    </div>
  );
}

