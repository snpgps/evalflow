
'use client';

import { useState, type FormEvent, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PlusCircle, Edit2, Trash2, FileText, GitBranchPlus, Save, Copy, Tag, Loader2, Target, AlertTriangle, AlignLeft, PanelLeftClose, PanelRightOpen, HelpCircle, MessageSquareText } from "lucide-react";
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
import { fetchPromptTemplates } from '@/lib/promptActions';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


export interface InputParameterForPrompts { // Renamed from ProductParameter
  id: string;
  name: string;
  description: string;
}

export interface CategorizationLabelForPrompts {
    name: string;
    definition: string;
    example?: string;
}
export interface EvalParameterForPrompts {
  id: string;
  name: string;
  definition: string;
  categorizationLabels?: CategorizationLabelForPrompts[];
  requiresRationale?: boolean;
}

export interface SummarizationDefinition {
  id: string;
  name: string;
  definition: string;
  example?: string;
  createdAt?: Timestamp;
}


export interface PromptVersion {
  id: string;
  versionNumber: number;
  template: string; 
  notes: string;
  createdAt: string; 
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  versions: PromptVersion[];
  currentVersionId: string | null;
  createdAt?: string; 
  updatedAt?: string; 
}

const FIXED_SYSTEM_PROMPT = `You are an impartial and rigorous evaluator of AI-generated outputs. Your task is to judge the quality of responses to a given input based on objective criteria. You must not add new content, speculate, or favor any model. Score only based on how well the response meets the criteria.

Your task is to analyze the provided input data and then perform two types of tasks:
1.  **Evaluation Labeling**: For each specified Evaluation Parameter, choose the most appropriate label based on its definition and the input data.
2.  **Summarization**: For each specified Summarization Task, generate a concise summary based on its definition and the input data.`;

const FIXED_INPUT_DATA_HEADER = `--- INPUT DATA ---`; // Renamed from FIXED_PRODUCT_INPUT_HEADER
const FIXED_INPUT_DATA_FOOTER = `--- END INPUT DATA ---`; // Renamed from FIXED_PRODUCT_INPUT_FOOTER
const FIXED_CRITERIA_HEADER = `--- DETAILED INSTRUCTIONS & CRITERIA ---`;

const defaultInitialUserEditablePromptTemplate = `Your input data and definition goes here. Use the "Input Parameters" sidebar to insert placeholders like {{ParameterName}} for data that will be dynamically filled from your dataset.
Example:
"Below is the full conversation transcript between the shopper and the voicebot : "{{conv_full_conversation}}"
User Selected Language: {{User Language}}
"`;


const fetchInputParametersForPrompts = async (userId: string | null): Promise<InputParameterForPrompts[]> => { // Renamed
  if (!userId) return [];
  const paramsCollectionRef = collection(db, 'users', userId, 'inputParameters'); // Renamed
  const paramsQuery = query(paramsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(paramsQuery);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    name: docSnap.data().name as string || 'Unnamed Parameter',
    description: docSnap.data().description as string || '',
  }));
};


export default function PromptsPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null); // Variable name kept as currentUserId
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

  const [isPromptListCollapsed, setIsPromptListCollapsed] = useState(false);
  const [isInstructionsDialogOpen, setIsInstructionsDialogOpen] = useState(false);
  
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [promptIdPendingDelete, setPromptIdPendingDelete] = useState<string | null>(null);


  useEffect(() => {
    const storedProjectId = localStorage.getItem('currentUserId'); // Key kept as currentUserId
    if (storedProjectId && storedProjectId.trim() !== "") {
      setCurrentUserId(storedProjectId.trim());
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

  const { data: inputParameters = [], isLoading: isLoadingInputParams, error: fetchInputParamsError } = useQuery<InputParameterForPrompts[], Error>({ // Renamed
    queryKey: ['inputParametersForPrompts', currentUserId], // Renamed
    queryFn: () => fetchInputParametersForPrompts(currentUserId), // Renamed
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
  }, [promptsData, selectedPromptId, currentUserId, isLoadingPrompts, fetchPromptsError, selectedVersionId]);


  useEffect(() => {
    if (!promptsData) {
        setSelectedPrompt(null);
        setSelectedVersion(null);
        setPromptTemplateContent(defaultInitialUserEditablePromptTemplate); 
        setVersionNotes('');
        return;
    }
    const currentPromptObj = promptsData.find(p => p.id === selectedPromptId);
    setSelectedPrompt(currentPromptObj || null);

    if (currentPromptObj) {
      const currentVersionObj = currentPromptObj.versions.find(v => v.id === selectedVersionId);
      setSelectedVersion(currentVersionObj || null);
      if (currentVersionObj) {
        const fullTemplate = currentVersionObj.template;
        let editablePart = defaultInitialUserEditablePromptTemplate; 

        const inputDataStartMarkerWithNewline = FIXED_INPUT_DATA_HEADER + '\n';
        const newlineAndInputDataFooterMarker = '\n' + FIXED_INPUT_DATA_FOOTER;

        const startIndex = fullTemplate.indexOf(inputDataStartMarkerWithNewline);
        const endIndex = fullTemplate.indexOf(newlineAndInputDataFooterMarker);
        
        if (startIndex !== -1 && endIndex !== -1 && (startIndex + inputDataStartMarkerWithNewline.length) <= endIndex) {
             editablePart = fullTemplate.substring(startIndex + inputDataStartMarkerWithNewline.length, endIndex).trim();
        } else if (fullTemplate.startsWith(FIXED_SYSTEM_PROMPT) && fullTemplate.includes(FIXED_CRITERIA_HEADER)) {
             const afterSystemPromptAndHeader = fullTemplate.substring(FIXED_SYSTEM_PROMPT.length + FIXED_INPUT_DATA_HEADER.length).trim();
             const criteriaStartIndex = afterSystemPromptAndHeader.indexOf(FIXED_INPUT_DATA_FOOTER + '\n\n' + FIXED_CRITERIA_HEADER);
             if (criteriaStartIndex !== -1) {
                 editablePart = afterSystemPromptAndHeader.substring(0, criteriaStartIndex).trim();
             } else {
                const systemPromptEndIndex = fullTemplate.indexOf(FIXED_SYSTEM_PROMPT) + FIXED_SYSTEM_PROMPT.length;
                const criteriaHeaderIndex = fullTemplate.lastIndexOf(FIXED_CRITERIA_HEADER);
                if (systemPromptEndIndex !== -1 && criteriaHeaderIndex !== -1 && systemPromptEndIndex < criteriaHeaderIndex) {
                    let potentialEditable = fullTemplate.substring(systemPromptEndIndex, criteriaHeaderIndex).trim();
                    if (potentialEditable.startsWith(FIXED_INPUT_DATA_HEADER)) {
                        potentialEditable = potentialEditable.substring(FIXED_INPUT_DATA_HEADER.length).trim();
                    }
                    if (potentialEditable.endsWith(FIXED_INPUT_DATA_FOOTER)) {
                        potentialEditable = potentialEditable.substring(0, potentialEditable.length - FIXED_INPUT_DATA_FOOTER.length).trim();
                    }
                    editablePart = potentialEditable;
                } else {
                    editablePart = defaultInitialUserEditablePromptTemplate; 
                }
             }
        } else if (!fullTemplate.startsWith(FIXED_SYSTEM_PROMPT) || !fullTemplate.includes(FIXED_CRITERIA_HEADER)) {
            editablePart = fullTemplate;
        }

        setPromptTemplateContent(editablePart);
        setVersionNotes(currentVersionObj.notes);
      } else {
        setPromptTemplateContent(defaultInitialUserEditablePromptTemplate);
        setVersionNotes('Initial version notes');
      }
    } else {
      setSelectedVersion(null);
      setPromptTemplateContent(defaultInitialUserEditablePromptTemplate);
      setVersionNotes('');
    }
  }, [promptsData, selectedPromptId, selectedVersionId]);


  const addPromptTemplateMutation = useMutation<string, Error, { name: string; description: string }>({
    mutationFn: async ({ name, description }) => {
      if (!currentUserId) throw new Error("Project not selected.");

      const fullInitialTemplate = `${FIXED_SYSTEM_PROMPT}\n\n${FIXED_INPUT_DATA_HEADER}\n${defaultInitialUserEditablePromptTemplate.trim()}\n${FIXED_INPUT_DATA_FOOTER}\n\n${FIXED_CRITERIA_HEADER}`;

      const newPromptRef = await addDoc(collection(db, 'users', currentUserId, 'promptTemplates'), {
        name,
        description,
        currentVersionId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const initialVersionRef = await addDoc(collection(db, 'users', currentUserId, 'promptTemplates', newPromptRef.id, 'versions'), {
        versionNumber: 1,
        template: fullInitialTemplate, 
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
      if (!currentUserId) throw new Error("Project not selected.");
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
      if (!currentUserId) throw new Error("Project not selected.");

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

  const addPromptVersionMutation = useMutation<string, Error, { promptId: string; userEditableTemplate: string; notes: string }>({
    mutationFn: async ({ promptId, userEditableTemplate, notes }) => {
      if (!currentUserId || !selectedPrompt) throw new Error("Project or prompt not identified.");

      const fullTemplateToSave = `${FIXED_SYSTEM_PROMPT}\n\n${FIXED_INPUT_DATA_HEADER}\n${userEditableTemplate.trim()}\n${FIXED_INPUT_DATA_FOOTER}\n\n${FIXED_CRITERIA_HEADER}`;
      const latestVersionNum = Math.max(0, ...selectedPrompt.versions.map(v => v.versionNumber));

      const newVersionRef = await addDoc(collection(db, 'users', currentUserId, 'promptTemplates', promptId, 'versions'), {
        versionNumber: latestVersionNum + 1,
        template: fullTemplateToSave,
        notes: notes || `New version based on v${selectedVersion?.versionNumber || latestVersionNum}`,
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

  const updatePromptVersionMutation = useMutation<void, Error, { promptId: string; versionId: string; userEditableTemplate: string; notes: string }>({
    mutationFn: async ({ promptId, versionId, userEditableTemplate, notes }) => {
      if (!currentUserId) throw new Error("Project not selected.");
      const fullTemplateToSave = `${FIXED_SYSTEM_PROMPT}\n\n${FIXED_INPUT_DATA_HEADER}\n${userEditableTemplate.trim()}\n${FIXED_INPUT_DATA_FOOTER}\n\n${FIXED_CRITERIA_HEADER}`;
      const versionRef = doc(db, 'users', currentUserId, 'promptTemplates', promptId, 'versions', versionId);
      await updateDoc(versionRef, { template: fullTemplateToSave, notes });
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
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
      }, 0);
    }
  };

  const insertInputParameter = (variableName: string) => { // Renamed
    insertIntoTextarea(`{{${variableName}}}`);
  };

  const handleSaveVersion = () => {
    if (!selectedPrompt || !selectedVersion || !currentUserId) {
      toast({ title: "Error", description: "No prompt or version selected to save.", variant: "destructive" });
      return;
    }
    updatePromptVersionMutation.mutate({
      promptId: selectedPrompt.id,
      versionId: selectedVersion.id,
      userEditableTemplate: promptTemplateContent,
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
      userEditableTemplate: promptTemplateContent,
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
        toast({ title: "Project Selection Required", description: "Please select a project to create prompts.", variant: "destructive" });
        return;
    }
    resetPromptDialogForm();
    setIsPromptDialogOpen(true);
  };

  const handleDeletePromptInitiate = (promptId: string) => {
    if (!currentUserId) return;
    setPromptIdPendingDelete(promptId);
    setIsConfirmDeleteDialogOpen(true);
  };

  const confirmDeletePrompt = () => {
    if (promptIdPendingDelete) {
      deletePromptTemplateMutation.mutate(promptIdPendingDelete);
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
        return <div className="p-6 text-center text-muted-foreground">Please select a project to manage prompts.</div>;
    }
    if (promptsData.length === 0) {
      return (
        <div className="p-6 text-center text-muted-foreground">
          <FileText className="mx-auto h-10 w-10 mb-2" />
          <p className={cn(isPromptListCollapsed && "hidden")}>No prompts created yet.</p>
        </div>
      );
    }
    return promptsData.map(p => (
      <TooltipProvider key={p.id} delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`p-3 border-b cursor-pointer hover:bg-muted/50 ${selectedPromptId === p.id ? 'bg-muted' : ''}`}
              onClick={() => handleSelectPrompt(p.id)}
            >
              <div className="flex justify-between items-center">
                <span className={cn("font-medium truncate min-w-0", selectedPromptId === p.id ? 'text-primary': '', isPromptListCollapsed ? "hidden" : "")}>{p.name}</span>
                {isPromptListCollapsed && <FileText className="h-5 w-5 mx-auto text-muted-foreground" />}
                <div className={cn("flex gap-1 shrink-0", isPromptListCollapsed ? "hidden" : "")}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditPromptDialog(p);}} disabled={updatePromptTemplateMutation.isPending || deletePromptTemplateMutation.isPending}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/90" onClick={(e) => {e.stopPropagation(); handleDeletePromptInitiate(p.id)}} disabled={deletePromptTemplateMutation.isPending && deletePromptTemplateMutation.variables === p.id }>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className={cn("text-xs text-muted-foreground truncate", isPromptListCollapsed ? "hidden" : "")}>{p.description}</p>
            </div>
          </TooltipTrigger>
          {isPromptListCollapsed && <TooltipContent side="right"><p>{p.name}</p></TooltipContent>}
        </Tooltip>
      </TooltipProvider>
    ));
  };

  const renderEditorArea = () => {
    if (!selectedPrompt && !isLoadingPrompts && promptsData.length > 0 && currentUserId) {
      return (
        <Card className="w-full md:flex-1 flex items-center justify-center shadow-lg min-w-0">
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
            <Card className="w-full md:flex-1 flex items-center justify-center shadow-lg min-w-0">
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
            <Card className="w-full md:flex-1 flex flex-col shadow-lg min-w-0">
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
            <Card className="w-full md:flex-1 flex items-center justify-center shadow-lg min-w-0">
                 <div className="text-center text-muted-foreground p-8">
                    <FileText className="mx-auto h-16 w-16 mb-4" />
                    <p>Select or create a prompt.</p>
                 </div>
            </Card>
        );
    }

    return (
      <Card className="w-full md:flex-1 flex flex-col shadow-lg min-h-0 min-w-0">
        <CardHeader className="border-b">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex-grow min-w-0">
              <CardTitle className="text-xl font-headline truncate">{selectedPrompt.name}</CardTitle>
              <CardDescription className="truncate">{selectedPrompt.description || "No description."}</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                 <Dialog open={isInstructionsDialogOpen} onOpenChange={setIsInstructionsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="w-full sm:w-auto" title="Prompting Instructions">
                        <HelpCircle className="mr-2 h-4 w-4" /> Instructions
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><HelpCircle className="text-primary"/>Prompt Engineering Instructions for EvalFlow</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="flex-1 pr-2 -mr-2">
                        <div className="space-y-3 text-sm py-2">
                            <p>Your prompt template is structured into several parts:</p>
                            <ol className="list-decimal pl-5 space-y-1 text-xs">
                                <li><strong className="font-medium">System Prompt:</strong> Tells the AI its role. This part is fixed by the system.</li>
                                <li><strong className="font-medium">Your Input Data Section:</strong> This is where you define the structure of the specific data the AI will analyze.
                                    <ul className="list-disc pl-5 space-y-0.5 mt-1">
                                        <li>The markers <code>{FIXED_INPUT_DATA_HEADER}</code> and <code>{FIXED_INPUT_DATA_FOOTER}</code> will be automatically wrapped around this section by the system during evaluation runs.</li>
                                        <li>Use the "Input Parameters" sidebar to insert placeholders like <code>{`{{ParameterName}}`}</code> into the editable textarea.</li>
                                        <li>Example: <pre className="bg-muted p-1 rounded-sm text-[10px] my-0.5 whitespace-pre-wrap break-words">User Query: {`{{UserQuery}}`}{`\n`}Previous Turn: {`{{BotResponse}}`}</pre></li>
                                    </ul>
                                </li>
                                <li><strong className="font-medium">Detailed Instructions & Criteria:</strong> This section's header (<code>{FIXED_CRITERIA_HEADER}</code>) is fixed. During an eval run, the system appends the detailed definitions of your selected Evaluation Parameters and Summarization Tasks here.</li>
                            </ol>
                            
                            <h3 className="font-semibold mt-2">Key Points:</h3>
                            <ul className="list-disc pl-5 space-y-1 text-xs break-words">
                                <li className="break-words">You <strong className="text-primary">only edit the content for your Input Data</strong> in the main textarea.</li>
                                <li className="break-words">The system handles the overall structure (System Prompt, data markers, criteria header) and dynamically adds the specific criteria definitions during evaluation runs.</li>
                                <li className="break-words">The Judge LLM is already instructed by the system (via the fixed System Prompt and backend flow logic) to output a JSON array containing its judgments and summaries.</li>
                            </ul>
                        </div>
                        </ScrollArea>
                        <DialogFooter className="mt-auto pt-4 border-t">
                            <Button onClick={() => setIsInstructionsDialogOpen(false)}>Close</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
              <Select
                  value={selectedVersionId || ''}
                  onValueChange={(versionId) => handleSelectVersion(versionId)}
                  disabled={selectedPrompt.versions.length === 0}
                >
                <SelectTrigger className="w-full sm:w-[220px]">
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
              <Button size="sm" variant="outline" onClick={handleCreateNewVersion} disabled={!selectedPrompt || addPromptVersionMutation.isPending} className="w-full sm:w-auto">
                {addPromptVersionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <GitBranchPlus className="mr-2 h-4 w-4" />} New Version
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 flex flex-col lg:flex-row min-h-0">
          <ScrollArea className="flex-1">
            <div className="p-4 flex flex-col space-y-4">
              <div>
                <Label className="font-medium text-base">System Prompt</Label>
                <div className="mt-1 p-3 rounded-md bg-muted/50 border text-sm whitespace-pre-wrap text-muted-foreground">
                  {FIXED_SYSTEM_PROMPT}
                </div>
              </div>
              
              <div>
                 <Label className="font-medium text-base">Your Input Data Section</Label>
                 <div className="mt-1 p-3 rounded-md bg-muted/50 border text-sm whitespace-pre-wrap text-muted-foreground">
                  {FIXED_INPUT_DATA_HEADER}
                </div>
                <Textarea
                  ref={promptTextareaRef}
                  id="prompt-template-area"
                  value={promptTemplateContent}
                  onChange={(e) => setPromptTemplateContent(e.target.value)}
                  placeholder={!selectedVersion && selectedPrompt.versions.length === 0 ? "Create a version to start editing." : "Enter your input data structure here..."}
                  className="flex-1 resize-none font-mono text-sm min-h-[150px] md:min-h-[200px] mt-1"
                  disabled={!selectedVersion || updatePromptVersionMutation.isPending}
                />
                 <div className="mt-1 p-3 rounded-md bg-muted/50 border text-sm whitespace-pre-wrap text-muted-foreground">
                  {FIXED_INPUT_DATA_FOOTER}
                </div>
              </div>

              <div>
                <Label className="font-medium text-base">Detailed Instructions & Criteria</Label>
                <div className="mt-1 p-3 rounded-md bg-muted/50 border text-sm whitespace-pre-wrap text-muted-foreground">
                  {FIXED_CRITERIA_HEADER}
                  <p className="text-xs italic mt-1">(The system will append selected evaluation parameter and summarization definitions here during a run.)</p>
                </div>
              </div>
            </div>
          </ScrollArea>
          <div className="w-full lg:w-[280px] lg:shrink-0 border-t lg:border-t-0 lg:border-l p-4 bg-muted/20 flex flex-col min-w-0">
            <ScrollArea className="flex-1">
              <div className="mb-4">
                 <Label htmlFor="version-notes" className="text-md font-semibold mb-2 flex items-center">
                    <MessageSquareText className="h-4 w-4 mr-2 text-primary"/>
                    Version Notes
                    <span className="text-xs text-muted-foreground ml-1">(v{selectedVersion?.versionNumber || 'N/A'})</span>
                 </Label>
                <Input
                  id="version-notes"
                  value={versionNotes}
                  onChange={(e) => setVersionNotes(e.target.value)}
                  placeholder="Notes for this version..."
                  disabled={!selectedVersion || updatePromptVersionMutation.isPending}
                  className="text-sm h-9 mt-1"
                />
              </div>

              <div className="mb-4 pt-3 border-t">
                <h3 className="text-md font-semibold mb-2">Input Parameters</h3>
                {isLoadingInputParams ? <Skeleton className="h-20 w-full" /> :
                fetchInputParamsError ? <p className="text-xs text-destructive">Error loading input parameters.</p> :
                inputParameters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No input parameters defined. Go to Schema Definition.</p>
                ) : (
                  <div className="space-y-2">
                    {inputParameters.map(param => ( // Renamed productParameters to inputParameters
                      <Card key={param.id} className="p-2 shadow-sm bg-background overflow-hidden">
                        <div className="flex items-center gap-2 mb-1">
                          <Tag className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm font-medium truncate min-w-0" title={param.name}>{param.name}</span>
                        </div>
                        <Button onClick={() => insertInputParameter(param.name)} title={`Insert {{${param.name}}}`} disabled={!selectedVersion} variant="outline" size="sm" className="w-full mb-1 text-xs h-8 whitespace-normal text-left justify-start px-2">
                          Insert Placeholder
                        </Button>
                        <p className="text-xs text-muted-foreground truncate min-w-0" title={param.description}>{param.description}</p>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-4 flex flex-col sm:flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => { if(promptTemplateContent) navigator.clipboard.writeText(promptTemplateContent); toast({title:"Input Data section copied!"})}} disabled={!selectedVersion || !promptTemplateContent} className="w-full sm:w-auto">
            <Copy className="mr-2 h-4 w-4" /> Copy Input Data Section
          </Button>
          <Button onClick={handleSaveVersion} disabled={!selectedVersion || updatePromptVersionMutation.isPending} className="w-full sm:w-auto">
            {updatePromptVersionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Current Version
          </Button>
        </CardFooter>
      </Card>
    );
  };


  return (
    <div className="flex flex-col md:flex-row h-auto md:h-[calc(100vh-theme(spacing.28))] gap-6 p-4 md:p-0">
      <Card className={cn(
        "flex flex-col shadow-lg transition-all duration-300 ease-in-out md:max-h-none overflow-hidden",
        isPromptListCollapsed ? "w-full md:w-16" : "w-full md:w-[300px]"
        )}
      >
        <CardHeader className="border-b p-3">
          <div className="flex justify-between items-center">
            <div className={cn(isPromptListCollapsed && "md:hidden")}>
              <CardTitle>Prompt Templates</CardTitle>
              <CardDescription>Manage your Judge LLM prompts.</CardDescription>
            </div>
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsPromptListCollapsed(!isPromptListCollapsed)}
                    className="hidden md:flex"
                    aria-label={isPromptListCollapsed ? "Expand prompt list" : "Collapse prompt list"}
                  >
                    {isPromptListCollapsed ? <PanelRightOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{isPromptListCollapsed ? "Expand prompt list" : "Collapse prompt list"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
           <Dialog open={isPromptDialogOpen} onOpenChange={(isOpen) => { setIsPromptDialogOpen(isOpen); if(!isOpen) resetPromptDialogForm();}}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className={cn("mt-2 w-full", isPromptListCollapsed && "md:hidden")}
                onClick={handleOpenNewPromptDialog}
                disabled={addPromptTemplateMutation.isPending || updatePromptTemplateMutation.isPending || !currentUserId}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                <span className={cn(isPromptListCollapsed && "md:hidden")}>New Template</span>
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

      <div className="flex-1 flex flex-col min-w-0"> 
         {renderEditorArea()}
      </div>

      <AlertDialog
        open={isConfirmDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsConfirmDeleteDialogOpen(open);
          if (!open) {
            setPromptIdPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the prompt template and all its versions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {setIsConfirmDeleteDialogOpen(false); setPromptIdPendingDelete(null);}}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePrompt}
              disabled={deletePromptTemplateMutation.isPending && deletePromptTemplateMutation.variables === promptIdPendingDelete}
              className={cn(deletePromptTemplateMutation.isPending && deletePromptTemplateMutation.variables === promptIdPendingDelete && "bg-destructive/70" )}
            >
              {(deletePromptTemplateMutation.isPending && deletePromptTemplateMutation.variables === promptIdPendingDelete) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
