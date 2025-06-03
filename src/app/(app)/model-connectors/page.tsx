
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

interface ModelConnector {
  id: string; // Firestore document ID
  name: string;
  provider: 'OpenAI' | 'Vertex AI' | 'Azure OpenAI' | 'Local LLM' | 'Other';
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
  "gemini-2.0-flash", // Specific model used for image gen in Genkit docs
  "text-bison",
  "chat-bison",
];
const OPENAI_MODELS = [
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.5", // (Orion)
  "gpt-3.5-turbo",
];
const AZURE_OPENAI_MODELS = [ // These are common underlying model types; deployment name is key.
  "gpt-4 (via Azure)",
  "gpt-35-turbo (via Azure)", // Common shorthand for gpt-3.5-turbo on Azure
];


const fetchModelConnectors = async (userId: string | null): Promise<ModelConnector[]> => {
  if (!userId) return [];
  const connectorsCollection = collection(db, 'users', userId, 'modelConnectors');
  const q = query(connectorsCollection, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ModelConnector));
};

export default function ModelConnectorsPage() {
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

  const { data: connectors = [], isLoading: isLoadingConnectors, error: fetchConnectorsError } = useQuery<ModelConnector[], Error>({
    queryKey: ['modelConnectors', currentUserId],
    queryFn: () => fetchModelConnectors(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConnector, setEditingConnector] = useState<ModelConnector | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  const [connectorName, setConnectorName] = useState('');
  const [provider, setProvider] = useState<'OpenAI' | 'Vertex AI' | 'Azure OpenAI' | 'Local LLM' | 'Other'>('OpenAI');
  const [apiKey, setApiKey] = useState('');
  const [config, setConfig] = useState('{}'); // Bound to textarea, stores full JSON string
  const [selectedModelForDropdown, setSelectedModelForDropdown] = useState('');


  // Effect to update the 'config' string when provider or selectedModelForDropdown changes
  useEffect(() => {
    // Don't run if the dialog isn't open and we are not editing, or if provider isn't set
    if (!isDialogOpen && !editingConnector) return;
    if (!provider && !editingConnector) return; // Avoid running on initial mount before provider is set for a new connector

    const effectiveProvider = editingConnector?.provider || provider;

    try {
      let currentConfigJson: any = {};
      // Try to parse existing config, but gracefully handle if it's not valid JSON yet (e.g. user is typing)
      if (config.trim() !== "") {
        try {
          currentConfigJson = JSON.parse(config);
        } catch (e) {
          // If current config is invalid, and we have a model to set, start with that.
          // Otherwise, we'll preserve the invalid user input for now.
          if (selectedModelForDropdown) currentConfigJson = {};
          else return; // Don't overwrite invalid JSON if no model change is driving an update
        }
      }

      const relevantProvidersForModelDropdown = ["OpenAI", "Vertex AI", "Azure OpenAI"];

      if (relevantProvidersForModelDropdown.includes(effectiveProvider) && selectedModelForDropdown) {
        currentConfigJson.model = selectedModelForDropdown;
      } else {
        // If provider doesn't use dropdown OR no model is selected in dropdown, remove 'model' key
        delete currentConfigJson.model;
      }
      
      const newConfigString = Object.keys(currentConfigJson).length === 0 ? '{}' : JSON.stringify(currentConfigJson, null, 2);

      // Only setConfig if the string content would actually change, to avoid loops if formatting is the only difference
      if (newConfigString !== config.trim()) {
         setConfig(newConfigString);
      }

    } catch (e) {
      // This catch is for JSON.parse if it somehow still fails (should be handled above)
      console.error("Error processing config for model update:", e);
      // Potentially set to a clean state if really broken
      // setConfig(JSON.stringify({ model: selectedModelForDropdown }, null, 2));
    }
  }, [provider, selectedModelForDropdown, editingConnector]); // Do NOT add `config` to dependency array - it creates a loop.


  const addConnectorMutation = useMutation<void, Error, ModelConnectorCreationPayload>({
    mutationFn: async (newConnectorData) => {
      if (!currentUserId) throw new Error("User not identified.");
      await addDoc(collection(db, 'users', currentUserId, 'modelConnectors'), newConnectorData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelConnectors', currentUserId] });
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
      if (!currentUserId) throw new Error("User not identified.");
      const { id, ...dataToUpdate } = connectorToUpdate;
      const docRef = doc(db, 'users', currentUserId, 'modelConnectors', id);
      await updateDoc(docRef, dataToUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelConnectors', currentUserId] });
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
      if (!currentUserId) throw new Error("User not identified.");
      await deleteDoc(doc(db, 'users', currentUserId, 'modelConnectors', connectorIdToDelete));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelConnectors', currentUserId] });
      toast({ title: "Success", description: "Model connector deleted." });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to delete connector: ${error.message}`, variant: "destructive" });
    }
  });


  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
        toast({title: "Error", description: "User not identified.", variant: "destructive"});
        return;
    }
    if (!connectorName.trim() || !apiKey.trim()) {
        toast({title: "Validation Error", description: "Connector Name and API Key are required.", variant: "destructive"});
        return;
    }

    let finalConfig = '{}';
    try {
      // Ensure what's in the textarea is valid JSON, or default it.
      JSON.parse(config); // This will throw if invalid
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
    setEditingConnector(connector); // Important to set this first
    setConnectorName(connector.name);
    setProvider(connector.provider);
    setApiKey(connector.apiKey);
    const loadedConfig = connector.config || '{}';
    setConfig(loadedConfig); // Set the textarea content

    // Manually pre-select model dropdown based on loaded config and provider
    try {
      if (loadedConfig.trim() !== "") {
        const parsedConfig = JSON.parse(loadedConfig);
        if (parsedConfig.model && typeof parsedConfig.model === 'string') {
          const currentModels = connector.provider === "Vertex AI" ? VERTEX_AI_MODELS : connector.provider === "OpenAI" ? OPENAI_MODELS : connector.provider === "Azure OpenAI" ? AZURE_OPENAI_MODELS : [];
          if (currentModels.includes(parsedConfig.model)) {
            setSelectedModelForDropdown(parsedConfig.model);
          } else {
            setSelectedModelForDropdown(''); // Model in config not valid for current provider
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
     if (!currentUserId) {
        toast({title: "Error", description: "User not identified.", variant: "destructive"});
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
    resetForm();
    setIsDialogOpen(true);
  };

  const toggleApiKeyVisibility = (id: string) => {
    setShowApiKey(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const currentModelsForProvider = provider === "Vertex AI" ? VERTEX_AI_MODELS :
                                  provider === "OpenAI" ? OPENAI_MODELS :
                                  provider === "Azure OpenAI" ? AZURE_OPENAI_MODELS :
                                  [];
  const showModelDropdown = ["OpenAI", "Vertex AI", "Azure OpenAI"].includes(provider);


  if (isLoadingUserId || (isLoadingConnectors && currentUserId)) {
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
              <CardDescription>Manage your Judge LLM connections. API keys and configurations are stored in Firestore.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Dialog open={isDialogOpen} onOpenChange={(isOpen) => { setIsDialogOpen(isOpen); if(!isOpen) resetForm();}}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenNewDialog} disabled={!currentUserId || addConnectorMutation.isPending || updateConnectorMutation.isPending} className="w-full sm:w-auto">
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
                  <Select value={provider} onValueChange={(value: any) => { setProvider(value); setSelectedModelForDropdown(''); /* Reset model on provider change */ }}>
                    <SelectTrigger id="conn-provider">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OpenAI">OpenAI</SelectItem>
                      <SelectItem value="Vertex AI">Vertex AI (Gemini)</SelectItem>
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
                      // If user types in config, try to update dropdown
                      try {
                        const parsed = JSON.parse(e.target.value);
                        if (parsed.model && typeof parsed.model === 'string' && currentModelsForProvider.includes(parsed.model)) {
                          setSelectedModelForDropdown(parsed.model);
                        } else if (!parsed.model && selectedModelForDropdown) {
                           // If user deletes model from textarea, clear dropdown
                           //setSelectedModelForDropdown(''); // This might cause issues if provider still expects model
                        }
                      } catch (err) { /* Ignore parse errors while typing */ }
                    }} 
                    placeholder='e.g., { "temperature": 0.7, "maxOutputTokens": 1024 }' 
                    rows={3} 
                  />
                   <p className="text-xs text-muted-foreground mt-1">
                     Use this for settings like temperature, token limits, or Azure-specific fields like <code className="bg-muted p-0.5 rounded-sm">{'{ "deployment": "my-deployment" }'}</code>.
                     The "model" field will be managed by the dropdown above if applicable.
                   </p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {setIsDialogOpen(false); resetForm();}}>Cancel</Button>
                  <Button type="submit" disabled={addConnectorMutation.isPending || updateConnectorMutation.isPending || !currentUserId}>
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
          <CardDescription>Your configured Judge LLM connections. {currentUserId ? `(User ID: ${currentUserId})` : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {!currentUserId && !isLoadingUserId ? (
             <div className="text-center text-muted-foreground py-8"><p>Please log in to manage model connectors.</p></div>
          ) : connectors.length === 0 && !isLoadingConnectors ? (
             <div className="text-center text-muted-foreground py-8">
              <PlugZap className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p>No model connectors configured yet.</p>
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
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(conn)} disabled={!currentUserId || updateConnectorMutation.isPending || deleteConnectorMutation.isPending}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(conn.id)} className="text-destructive hover:text-destructive/90" disabled={!currentUserId || deleteConnectorMutation.isPending && deleteConnectorMutation.variables === conn.id}>
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
