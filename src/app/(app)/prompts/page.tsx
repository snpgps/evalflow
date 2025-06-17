
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


export interface InputParameterForPrompts {
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

const FIXED_INPUT_DATA_HEADER = `--- INPUT DATA ---`;
const FIXED_INPUT_DATA_FOOTER = `--- END INPUT DATA ---`;
const FIXED_CRITERIA_HEADER = `--- DETAILED INSTRUCTIONS & CRITERIA ---`;
const FIXED_CRITERIA_INSTRUCTIONS_PART = `
Your task is to analyze the provided input data and then perform two types of tasks:
1.  **Evaluation Labeling**: For each specified Evaluation Parameter, choose the most appropriate label based on its definition and the input data.
2.  **Summarization**: For each specified Summarization Task, generate a concise summary based on its definition and the input data.
`;

const defaultSystemPromptContent = `You are an impartial and rigorous evaluator of AI-generated outputs. Your task is to judge the quality of responses to a given input based on objective criteria. You must not add new content, speculate, or favor any model. Score only based on how well the response meets the criteria.`;
const defaultInputDataSectionContent = `Your input data and definition goes here. Use the "Input Parameters" sidebar to insert placeholders like {{ParameterName}} for data that will be dynamically filled from your dataset.\nExample:\n"Below is the full conversation transcript between the shopper and the voicebot : "{{conv_full_conversation}}"\nUser Selected Language: {{User Language}}\n"`;


const fetchInputParametersForPrompts = async (userId: string | null): Promise<InputParameterForPrompts[]> => {
  if (!userId) return [];
  const paramsCollectionRef = collection(db, 'users', userId, 'inputParameters');
  const paramsQuery = query(paramsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(paramsQuery);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    name: docSnap.data().name as string || 'Unnamed Parameter',
    description: docSnap.data().description as string || '',
  }));
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

  const [systemPromptContent, setSystemPromptContent] = useState(defaultSystemPromptContent);
  const [inputDataSectionContent, setInputDataSectionContent] = useState(defaultInputDataSectionContent);
  const [versionNotes, setVersionNotes] = useState('');
  
  const inputDataTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [isPromptListCollapsed, setIsPromptListCollapsed] = useState(false);
  const [isInstructionsDialogOpen, setIsInstructionsDialogOpen] = useState(false);
  
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [promptIdPendingDelete, setPromptIdPendingDelete] = useState<string | null>(null);


  useEffect(() => {
    const storedProjectId = localStorage.getItem('currentUserId');
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

  const { data: inputParameters = [], isLoading: isLoadingInputParams, error: fetchInputParamsError } = useQuery<InputParameterForPrompts[], Error>({
    queryKey: ['inputParametersForPrompts', currentUserId],
    queryFn: () => fetchInputParametersForPrompts(currentUserId),
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
        setSystemPromptContent(defaultSystemPromptContent);
        setInputDataSectionContent(defaultInputDataSectionContent);
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
        let sysPrompt = defaultSystemPromptContent;
        let inputDataSect = defaultInputDataSectionContent;

        const inputDataHeaderIndex = fullTemplate.indexOf(FIXED_INPUT_DATA_HEADER);
        const inputDataFooterIndex = fullTemplate.indexOf(FIXED_INPUT_DATA_FOOTER);
        
        if (inputDataHeaderIndex !== -1) {
            sysPrompt = fullTemplate.substring(0, inputDataHeaderIndex).trim();
            if (inputDataFooterIndex !== -1 && inputDataFooterIndex > inputDataHeaderIndex) {
                inputDataSect = fullTemplate.substring(inputDataHeaderIndex + FIXED_INPUT_DATA_HEADER.length, inputDataFooterIndex).trim();
            } else {
                // If footer is missing, assume input data section is everything after header until criteria
                const criteriaHeaderIndex = fullTemplate.indexOf(FIXED_CRITERIA_HEADER);
                if (criteriaHeaderIndex !== -1 && criteriaHeaderIndex > inputDataHeaderIndex) {
                    inputDataSect = fullTemplate.substring(inputDataHeaderIndex + FIXED_INPUT_DATA_HEADER.length, criteriaHeaderIndex).trim();
                } else {
                    inputDataSect = fullTemplate.substring(inputDataHeaderIndex + FIXED_INPUT_DATA_HEADER.length).trim();
                }
            }
        } else {
            // No input data header found, try to guess based on criteria header
            const criteriaHeaderIndex = fullTemplate.indexOf(FIXED_CRITERIA_HEADER);
            if (criteriaHeaderIndex !== -1) {
                sysPrompt = fullTemplate.substring(0, criteriaHeaderIndex).trim();
            } else {
                sysPrompt = fullTemplate; // Assume entire template is system prompt if no markers
            }
        }
        
        setSystemPromptContent(sysPrompt);
        setInputDataSectionContent(inputDataSect);
        setVersionNotes(currentVersionObj.notes);
      } else {
        setSystemPromptContent(defaultSystemPromptContent);
        setInputDataSectionContent(defaultInputDataSectionContent);
        setVersionNotes('Initial version notes');
      }
    } else {
      setSelectedVersion(null);
      setSystemPromptContent(defaultSystemPromptContent);
      setInputDataSectionContent(defaultInputDataSectionContent);
      setVersionNotes('');
    }
  }, [promptsData, selectedPromptId, selectedVersionId]);


  const addPromptTemplateMutation = useMutation<string, Error, { name: string; description: string }>({
    mutationFn: async ({ name, description }) => {
      if (!currentUserId) throw new Error("Project not selected.");

      const fullInitialTemplate = `${defaultSystemPromptContent.trim()}\n${FIXED_INPUT_DATA_HEADER}\n${defaultInputDataSectionContent.trim()}\n${FIXED_INPUT_DATA_FOOTER}\n\n${FIXED_CRITERIA_HEADER}\n${FIXED_CRITERIA_INSTRUCTIONS_PART.trim()}`;

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

  const addPromptVersionMutation = useMutation<string, Error, { promptId: string; systemContent: string; inputDataContent: string; notes: string }>({
    mutationFn: async ({ promptId, systemContent, inputDataContent, notes }) => {
      if (!currentUserId || !selectedPrompt) throw new Error("Project or prompt not identified.");

      const fullTemplateToSave = `${systemContent.trim()}\n${FIXED_INPUT_DATA_HEADER}\n${inputDataContent.trim()}\n${FIXED_INPUT_DATA_FOOTER}\n\n${FIXED_CRITERIA_HEADER}\n${FIXED_CRITERIA_INSTRUCTIONS_PART.trim()}`;
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

  const updatePromptVersionMutation = useMutation<void, Error, { promptId: string; versionId: string; systemContent: string; inputDataContent: string; notes: string }>({
    mutationFn: async ({ promptId, versionId, systemContent, inputDataContent, notes }) => {
      if (!currentUserId) throw new Error("Project not selected.");
      const fullTemplateToSave = `${systemContent.trim()}\n${FIXED_INPUT_DATA_HEADER}\n${inputDataContent.trim()}\n${FIXED_INPUT_DATA_FOOTER}\n\n${FIXED_CRITERIA_HEADER}\n${FIXED_CRITERIA_INSTRUCTIONS_PART.trim()}`;
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

  const insertIntoInputDataTextarea = (textToInsert: string) => {
    const textarea = inputDataTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = textarea.value;
      const before = currentText.substring(0, start);
      const after = currentText.substring(end, currentText.length);

      setInputDataSectionContent(before + textToInsert + after);

      textarea.focus();
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
      }, 0);
    }
  };

  const insertInputParameter = (variableName: string) => {
    insertIntoInputDataTextarea(`{{${variableName}}}`);
  };

  const handleSaveVersion = () => {
    if (!selectedPrompt || !selectedVersion || !currentUserId) {
      toast({ title: "Error", description: "No prompt or version selected to save.", variant: "destructive" });
      return;
    }
    updatePromptVersionMutation.mutate({
      promptId: selectedPrompt.id,
      versionId: selectedVersion.id,
      systemContent: systemPromptContent,
      inputDataContent: inputDataSectionContent,
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
      systemContent: systemPromptContent,
      inputDataContent: inputDataSectionContent,
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
                                <li><strong className="font-medium">System Prompt:</strong> Edit this in its dedicated textarea. It should contain your overall system instructions (how the AI should behave, its persona, global rules).</li>
                                <li><strong className="font-medium">Input Data Section:</strong> Edit this in its dedicated textarea. This is where you structure how dynamic data will be presented to the LLM.
                                    <ul className="list-disc pl-5 space-y-0.5 mt-1">
                                        <li>Use the "Input Parameters" sidebar to insert placeholders like <code>{`{{ParameterName}}`}</code>.</li>
                                        <li>Example for Input Data Section:
                                            <pre className="bg-muted p-1 rounded-sm text-[10px] my-0.5 whitespace-pre-wrap break-words">{
`Plant Photo Description: {{PlantDescription}}
User's Question: {{UserQuestion}}`
                                            }</pre>
                                        </li>
                                    </ul>
                                </li>
                                <li><strong className="font-medium">Fixed Markers & Criteria:</strong> The system automatically inserts <code>{FIXED_INPUT_DATA_HEADER}</code> and <code>{FIXED_INPUT_DATA_FOOTER}</code> around your "Input Data Section". It also appends <code>{FIXED_CRITERIA_HEADER}</code> and <code>{FIXED_CRITERIA_INSTRUCTIONS_PART.trim().substring(0,70)}...</code>. During an eval run, the specific definitions of your selected Evaluation Parameters and Summarization Tasks are appended below the criteria instructions. These fixed parts are shown read-only.</li>
                            </ol>
                            
                            <h3 className="font-semibold mt-2">Key Points:</h3>
                            <ul className="list-disc pl-5 space-y-1 text-xs break-words">
                                <li className="break-words">You edit the "System Prompt" and "Input Data Section" in their respective textareas.</li>
                                <li className="break-words">The system handles assembling the full prompt for the LLM by combining your editable parts with the fixed markers and the dynamically appended criteria definitions.</li>
                                <li className="break-words">The Judge LLM is already instructed by the system (via backend flow logic) to output a JSON array containing its judgments and summaries based on the full constructed prompt.</li>
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
                 <Label htmlFor="system-prompt-area" className="font-medium text-base">System Prompt</Label>
                <Textarea
                  id="system-prompt-area"
                  value={systemPromptContent}
                  onChange={(e) => setSystemPromptContent(e.target.value)}
                  placeholder={!selectedVersion && selectedPrompt.versions.length === 0 ? "Create a version to start editing." : "Enter your system-level instructions here..."}
                  className="flex-1 resize-none font-mono text-sm min-h-[150px] md:min-h-[180px] mt-1"
                  disabled={!selectedVersion || updatePromptVersionMutation.isPending}
                />
              </div>
              
              <div>
                 <Label htmlFor="input-data-section-area" className="font-medium text-base">Input Data Section</Label>
                 <p className="text-xs text-muted-foreground mb-1">
                    Define how your input data will be presented to the LLM. Use placeholders from the "Input Parameters" sidebar.
                 </p>
                <Textarea
                  ref={inputDataTextareaRef}
                  id="input-data-section-area"
                  value={inputDataSectionContent}
                  onChange={(e) => setInputDataSectionContent(e.target.value)}
                  placeholder={!selectedVersion && selectedPrompt.versions.length === 0 ? "Create a version to start editing." : "Define how your input data will be presented..."}
                  className="flex-1 resize-none font-mono text-sm min-h-[150px] md:min-h-[180px] mt-1"
                  disabled={!selectedVersion || updatePromptVersionMutation.isPending}
                />
              </div>

              <div className="mt-1 p-3 rounded-md bg-muted/50 border text-sm whitespace-pre-wrap text-muted-foreground font-mono">
                {FIXED_INPUT_DATA_HEADER}
              </div>
              <div className="mt-1 p-3 rounded-md bg-muted/50 border text-sm whitespace-pre-wrap text-muted-foreground font-mono">
                {FIXED_INPUT_DATA_FOOTER}
              </div>
              
              <div className="space-y-2 pt-4 border-t mt-4">
                <Label className="font-medium text-base text-muted-foreground">System-Appended Instructions & Criteria (Read-Only)</Label>
                <div className="mt-1 p-3 rounded-md bg-muted/50 border text-sm whitespace-pre-wrap text-muted-foreground font-mono">
                  {FIXED_CRITERIA_HEADER}
                </div>
                <div className="mt-1 p-3 rounded-md bg-muted/50 border text-sm whitespace-pre-wrap text-muted-foreground">
                  {FIXED_CRITERIA_INSTRUCTIONS_PART.trim()}
                  <p className="text-xs italic mt-2">(The system will append selected evaluation parameter and summarization definitions below these instructions during a run.)</p>
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
                    {inputParameters.map(param => (
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
          <Button variant="outline" onClick={() => { if(systemPromptContent || inputDataSectionContent) navigator.clipboard.writeText(`${systemPromptContent}\n${FIXED_INPUT_DATA_HEADER}\n${inputDataSectionContent}\n${FIXED_INPUT_DATA_FOOTER}`); toast({title:"Full user-editable prompt content copied!"})}} disabled={!selectedVersion || (!systemPromptContent && !inputDataSectionContent)} className="w-full sm:w-auto">
            <Copy className="mr-2 h-4 w-4" /> Copy User Content
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
