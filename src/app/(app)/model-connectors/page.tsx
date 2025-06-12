
'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, PlugZap, Eye, EyeOff, AlertTriangle, Loader2 } from "lucide-react";
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, type Timestamp, type FieldValue } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useProject } from '@/contexts/ProjectContext';

interface ModelConnector {
  id: string; // Firestore document ID
  name: string;
  provider: 'OpenAI' | 'Vertex AI' | 'Azure OpenAI' | 'Local LLM' | 'Anthropic' | 'Other';
  apiKey: string;
  config: string; // JSON string for other configurations, will include "model" if selected
  createdAt?: Timestamp;
}

type ModelConnectorCreationPayload = Omit<ModelConnector, 'id' | 'createdAt'> & { createdAt: FieldValue };
type ModelConnectorUpdatePayload = Partial<Omit<ModelConnector, 'id' | 'createdAt'>> & { id: string };

const VERTEX_AI_MODELS = [
  "gemini-1.5-pro-latest",
  "gemini-1.5-flash-latest",
  "gemini-1.0-pro",
  "gemini-1.0-pro-001",
  "gemini-1.0-pro-vision",
  "gemini-2.0-flash", 
  "text-bison",
  "chat-bison",
];
const OPENAI_MODELS = [
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.5", 
  "gpt-3.5-turbo",
];
const AZURE_OPENAI_MODELS = [ 
  "gpt-4 (via Azure)",
  "gpt-35-turbo (via Azure)", 
];
const ANTHROPIC_MODELS = [
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
  "claude-2.1",
  "claude-2.0",
  "claude-instant-1.2",
];


const fetchModelConnectors = async (userId: string | null, projectId: string | null): Promise<ModelConnector[]> => {
  if (!userId || !projectId) return [];
  const connectorsCollection = collection(db, 'users', userId, 'projects', projectId, 'modelConnectors');
  const q = query(connectorsCollection, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ModelConnector));
};

export default function ModelConnectorsPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);
  const { selectedProjectId, isLoadingProjects } = useProject();
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

  const { data: connectors = [], isLoading: isLoadingConnectors, error: fetchConnectorsError } = useQuery<ModelConnector[], Error>({
    queryKey: ['modelConnectors', currentUserId, selectedProjectId],
    queryFn: () => fetchModelConnectors(currentUserId, selectedProjectId),
    enabled: !!currentUserId && !!selectedProjectId && !isLoadingUserId && !isLoadingProjects,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConnector, setEditingConnector] = useState<ModelConnector | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  const [connectorName, setConnectorName] = useState('');
  const [provider, setProvider] = useState<'OpenAI' | 'Vertex AI' | 'Azure OpenAI' | 'Local LLM' | 'Anthropic' | 'Other'>('OpenAI');
  const [apiKey, setApiKey] = useState('');
  const [config, setConfig] = useState('{}'); 
  const [selectedModelForDropdown, setSelectedModelForDropdown] = useState('');


  useEffect(() => {
    if (!isDialogOpen && !editingConnector) return;
    if (!provider && !editingConnector) return; 

    const effectiveProvider = editingConnector?.provider || provider;

    try {
      let currentConfigJson: any = {};
      if (config.trim() !== "") {
        try {
          currentConfigJson = JSON.parse(config);
        } catch (e) {
          if (selectedModelForDropdown) currentConfigJson = {};
          else return; 
        }
      }

      const relevantProvidersForModelDropdown = ["OpenAI", "Vertex AI", "Azure OpenAI", "Anthropic"];

      if (relevantProvidersForModelDropdown.includes(effectiveProvider) && selectedModelForDropdown) {
        currentConfigJson.model = selectedModelForDropdown;
      } else {
        delete currentConfigJson.model;
      }
      
      const newConfigString = Object.keys(currentConfigJson).length === 0 ? '{}' : JSON.stringify(currentConfigJson, null, 2);

      if (newConfigString !== config.trim()) {
         setConfig(newConfigString);
      }

    } catch (e) {
      console.error("Error processing config for model update:", e);
    }
  }, [provider, selectedModelForDropdown, editingConnector, isDialogOpen]); 


  const addConnectorMutation = useMutation<void, Error, ModelConnectorCreationPayload>({
    mutationFn: async (newConnectorData) => {
      if (!currentUserId || !selectedProjectId) throw new Error("User or Project not identified.");
      await addDoc(collection(db, 'users', currentUserId, 'projects', selectedProjectId, 'modelConnectors'), newConnectorData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelConnectors', currentUserId, selectedProjectId] });
      toast({ title: "Success", description: "Model connector added." });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to add connector: ${error.message}`, variant: "destructive" });
    }
  });

  const updateConnectorMutation = useMutation<void, Error, ModelConnectorUpdatePayload>({
    mutationFn: async (connectorToUpdate) => {
      if (!currentUserId || !selectedProjectId) throw new Error("User or Project not identified.");
      const { id, ...dataToUpdate } = connectorToUpdate;
      const docRef = doc(db, 'users', currentUserId, 'projects', selectedProjectId, 'modelConnectors', id);
      await updateDoc(docRef, dataToUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelConnectors', currentUserId, selectedProjectId] });
      toast({ title: "Success", description: "Model connector updated." });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to update connector: ${error.message}`, variant: "destructive" });
    }
  });

  const deleteConnectorMutation = useMutation<void, Error, string>({
    mutationFn: async (connectorIdToDelete) => {
      if (!currentUserId || !selectedProjectId) throw new Error("User or Project not identified.");
      await deleteDoc(doc(db, 'users', currentUserId, 'projects', selectedProjectId, 'modelConnectors', connectorIdToDelete));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelConnectors', currentUserId, selectedProjectId] });
      toast({ title: "Success", description: "Model connector deleted." });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to delete connector: ${error.message}`, variant: "destructive" });
    }
  });


  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !selectedProjectId) {
        toast({title: "Error", description: "User or Project not identified.", variant: "destructive"});
        return;
    }
    if (!connectorName.trim() || !apiKey.trim()) {
        toast({title: "Validation Error", description: "Connector Name and API Key are required.", variant: "destructive"});
        return;
    }

    let finalConfig = '{}';
    try {
      JSON.parse(config); 
      finalConfig = config.trim() === "" ? '{}' : config.trim();
    } catch (err) {
      toast({title: "Configuration Error", description: "Additional Configuration contains invalid JSON. Please correct it or leave it as {} an empty object.", variant: "destructive"});
      return;
    }
    

    const connectorData = {
      name: connectorName.trim(),
      provider,
      apiKey: apiKey.trim(),
      config: finalConfig,
    };

    if (editingConnector) {
      updateConnectorMutation.mutate({ ...connectorData, id: editingConnector.id });
    } else {
      addConnectorMutation.mutate({ ...connectorData, createdAt: serverTimestamp() });
    }
  };

  const resetForm = () => {
    setConnectorName('');
    setProvider('OpenAI');
    setApiKey('');
    setConfig('{}');
    setSelectedModelForDropdown('');
    setEditingConnector(null);
  };

  const openEditDialog = (connector: ModelConnector) => {
    setEditingConnector(connector); 
    setConnectorName(connector.name);
    setProvider(connector.provider);
    setApiKey(connector.apiKey);
    const loadedConfig = connector.config || '{}';
    setConfig(loadedConfig); 

    try {
      if (loadedConfig.trim() !== "") {
        const parsedConfig = JSON.parse(loadedConfig);
        if (parsedConfig.model && typeof parsedConfig.model === 'string') {
          const currentModels = 
            connector.provider === "Vertex AI" ? VERTEX_AI_MODELS : 
            connector.provider === "OpenAI" ? OPENAI_MODELS : 
            connector.provider === "Azure OpenAI" ? AZURE_OPENAI_MODELS : 
            connector.provider === "Anthropic" ? ANTHROPIC_MODELS : [];
          if (currentModels.includes(parsedConfig.model)) {
            setSelectedModelForDropdown(parsedConfig.model);
          } else {
            setSelectedModelForDropdown(''); 
          }
        } else {
          setSelectedModelForDropdown('');
        }
      } else {
         setSelectedModelForDropdown('');
      }
    } catch (e) {
      setSelectedModelForDropdown('');
      console.warn("Failed to parse connector.config in openEditDialog for model dropdown", e);
    }
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
     if (!currentUserId || !selectedProjectId) {
        toast({title: "Error", description: "User or Project not identified.", variant: "destructive"});
        return;
    }
    if (confirm('Are you sure you want to delete this model connector?')) {
        deleteConnectorMutation.mutate(id);
    }
  };

  const handleOpenNewDialog = () => {
    if (!currentUserId) {
      toast({title: "Login Required", description: "Please log in to add connectors.", variant: "destructive"});
      return;
    }
    if (!selectedProjectId) {
      toast({title: "Project Required", description: "Please select a project to add connectors.", variant: "destructive"});
      return;
    }
    resetForm();
    setIsDialogOpen(true);
  };

  const toggleApiKeyVisibility = (id: string) => {
    setShowApiKey(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const currentModelsForProvider = 
    provider === "Vertex AI" ? VERTEX_AI_MODELS :
    provider === "OpenAI" ? OPENAI_MODELS :
    provider === "Azure OpenAI" ? AZURE_OPENAI_MODELS :
    provider === "Anthropic" ? ANTHROPIC_MODELS : [];
  const showModelDropdown = ["OpenAI", "Vertex AI", "Azure OpenAI", "Anthropic"].includes(provider);


  if (isLoadingUserId || isLoadingProjects || (isLoadingConnectors && currentUserId && selectedProjectId)) {
    return (
      <div className="space-y-6 p-4 md:p-0">
        <Card className="shadow-lg"><CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-full sm:w-52" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (fetchConnectorsError) {
    return (
        <Card className="shadow-lg m-4 md:m-0">
            <CardHeader><CardTitle className="text-xl md:text-2xl text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Data</CardTitle></CardHeader>
            <CardContent><p>{fetchConnectorsError.message}</p></CardContent>
        </Card>
    );
  }


  return (
    <div className="space-y-6 p-4 md:p-0">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <PlugZap className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-xl md:text-2xl font-headline">Model Connectors</CardTitle>
              <CardDescription>Manage your Judge LLM connections for the current project. API keys and configurations are stored in Firestore.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Dialog open={isDialogOpen} onOpenChange={(isOpen) => { setIsDialogOpen(isOpen); if(!isOpen) resetForm();}}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenNewDialog} disabled={!currentUserId || !selectedProjectId || addConnectorMutation.isPending || updateConnectorMutation.isPending} className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-5 w-5" /> Add New Connector
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingConnector ? 'Edit' : 'Add New'} Model Connector</DialogTitle>
                <DialogDescription>
                  Configure a connection to a Judge LLM provider.
                  <br/><span className="text-xs text-amber-600">API keys are sensitive. Ensure your Firestore rules are secure.</span>
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="conn-name">Connector Name</Label>
                  <Input id="conn-name" value={connectorName} onChange={(e) => setConnectorName(e.target.value)} placeholder="e.g., My Gemini Pro" required />
                </div>
                <div>
                  <Label htmlFor="conn-provider">LLM Provider</Label>
                  <Select value={provider} onValueChange={(value: any) => { setProvider(value); setSelectedModelForDropdown(''); }}>
                    <SelectTrigger id="conn-provider">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OpenAI">OpenAI</SelectItem>
                      <SelectItem value="Vertex AI">Vertex AI (Gemini)</SelectItem>
                      <SelectItem value="Anthropic">Anthropic (Claude)</SelectItem>
                      <SelectItem value="Azure OpenAI">Azure OpenAI</SelectItem>
                      <SelectItem value="Local LLM">Local LLM</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {showModelDropdown && (
                  <div>
                    <Label htmlFor="conn-model">Select Model</Label>
                    <Select value={selectedModelForDropdown} onValueChange={setSelectedModelForDropdown}>
                      <SelectTrigger id="conn-model">
                        <SelectValue placeholder={`Select a ${provider} model`} />
                      </SelectTrigger>
                      <SelectContent>
                        {currentModelsForProvider.map(modelName => (
                          <SelectItem key={modelName} value={modelName}>{modelName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                     <p className="text-xs text-muted-foreground mt-1">The selected model will be set as <code className="bg-muted p-0.5 rounded-sm">"model": "..."</code> in the JSON configuration.</p>
                  </div>
                )}

                <div>
                  <Label htmlFor="conn-api-key">API Key</Label>
                  <Input id="conn-api-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API Key" required />
                </div>
                <div>
                  <Label htmlFor="conn-config">Additional Configuration (JSON)</Label>
                  <Textarea 
                    id="conn-config" 
                    value={config} 
                    onChange={(e) => {
                      setConfig(e.target.value);
                      try {
                        const parsed = JSON.parse(e.target.value);
                        if (parsed.model && typeof parsed.model === 'string' && currentModelsForProvider.includes(parsed.model)) {
                          setSelectedModelForDropdown(parsed.model);
                        }
                      } catch (err) { /* Ignore parse errors while typing */ }
                    }} 
                    placeholder='e.g., { "temperature": 0.7, "maxOutputTokens": 1024 }' 
                    rows={3} 
                  />
                   <p className="text-xs text-muted-foreground mt-1">
                     Use this for settings like temperature, token limits, or provider-specific fields like Azure's <code className="bg-muted p-0.5 rounded-sm">{'{ "deployment": "my-deployment" }'}</code> or Anthropic's <code className="bg-muted p-0.5 rounded-sm">{'{ "anthropic_version": "bedrock-2023-05-31" }'}</code>.
                     The "model" field will be managed by the dropdown above if applicable.
                   </p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {setIsDialogOpen(false); resetForm();}}>Cancel</Button>
                  <Button type="submit" disabled={addConnectorMutation.isPending || updateConnectorMutation.isPending || !currentUserId || !selectedProjectId}>
                     {(addConnectorMutation.isPending || updateConnectorMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingConnector ? 'Save Changes' : 'Add Connector'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Connectors</CardTitle>
          <CardDescription>Your configured Judge LLM connections for the current project.
            {!currentUserId ? " Please log in." : !selectedProjectId ? " Please select a project." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!currentUserId && !isLoadingUserId ? (
             <div className="text-center text-muted-foreground py-8"><p>Please log in to manage model connectors.</p></div>
          ): !selectedProjectId && !isLoadingProjects ? (
            <div className="text-center text-muted-foreground py-8"><p>Please select a project to view its model connectors.</p></div>
          ) : connectors.length === 0 && !isLoadingConnectors ? (
             <div className="text-center text-muted-foreground py-8">
              <PlugZap className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p>No model connectors configured for this project yet.</p>
              <p className="text-sm">Click "Add New Connector" to get started.</p>
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/4 sm:w-1/5">Name</TableHead>
                  <TableHead className="hidden sm:table-cell w-1/5">Provider</TableHead>
                  <TableHead className="w-2/5 sm:w-1/3">API Key</TableHead>
                  <TableHead className="hidden md:table-cell w-1/4">Configuration</TableHead>
                  <TableHead className="text-right w-[80px] sm:w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectors.map((conn) => (
                  <TableRow key={conn.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium truncate" title={conn.name}>{conn.name}</TableCell>
                    <TableCell className="hidden sm:table-cell truncate" title={conn.provider}>{conn.provider}</TableCell>
                    <TableCell className="truncate">
                      <div className="flex items-center">
                        <span className="truncate">{showApiKey[conn.id] ? conn.apiKey : '••••••••••••••••'}</span>
                        <Button variant="ghost" size="icon" onClick={() => toggleApiKeyVisibility(conn.id)} className="ml-1 sm:ml-2 h-7 w-7 shrink-0">
                          {showApiKey[conn.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell truncate" title={conn.config}>{conn.config || '{}'}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-0">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(conn)} disabled={!currentUserId || !selectedProjectId || updateConnectorMutation.isPending || deleteConnectorMutation.isPending}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(conn.id)} className="text-destructive hover:text-destructive/90" disabled={!currentUserId || !selectedProjectId || deleteConnectorMutation.isPending && deleteConnectorMutation.variables === conn.id}>
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
