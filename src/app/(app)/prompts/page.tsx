'use client';

import { useState, type FormEvent, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, FileText, Versions, Save, Copy, ListFilter, Tag } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PromptVariable {
  id: string;
  name: string;
  description: string;
}

// Mock product parameters, these would come from Schema Definition
const availableProductParameters: PromptVariable[] = [
  { id: '1', name: 'reference_metadata', description: 'Contextual information' },
  { id: '2', name: 'user_conversation', description: 'Chatbot-user conversation' },
  { id: '3', name: 'product_details', description: 'Specific product information' },
  { id: '4', name: 'user_query', description: 'The last query from the user' },
];

interface PromptVersion {
  id: string;
  versionNumber: number;
  template: string;
  notes: string;
  createdAt: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  versions: PromptVersion[];
  currentVersionId: string | null;
}

const initialPrompts: PromptTemplate[] = [
  {
    id: 'prompt1',
    name: 'Product Support Judge Prompt',
    description: 'Prompt for evaluating chatbot responses in product support scenarios.',
    versions: [
      { id: 'v1a', versionNumber: 1, template: "Evaluate the following conversation based on accuracy and helpfulness:\n\nContext:\n{{reference_metadata}}\n\nConversation:\n{{user_conversation}}\n\nIs the chatbot's last response accurate and helpful?", notes: 'Initial version', createdAt: '2024-07-20' },
      { id: 'v2a', versionNumber: 2, template: "Analyze the chatbot's final response in the context of the user's query and provided product details.\n\nProduct Details:\n{{product_details}}\n\nUser Query:\n{{user_query}}\n\nConversation History:\n{{user_conversation}}\n\nEvaluate for: {{evaluation_criteria}}.", notes: 'Added evaluation criteria placeholder', createdAt: '2024-07-21' },
    ],
    currentVersionId: 'v2a',
  }
];

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>(initialPrompts);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(prompts[0] || null);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(selectedPrompt?.versions.find(v => v.id === selectedPrompt.currentVersionId) || null);
  
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [promptName, setPromptName] = useState('');
  const [promptDescription, setPromptDescription] = useState('');

  const [promptTemplateContent, setPromptTemplateContent] = useState(selectedVersion?.template || '');
  const [versionNotes, setVersionNotes] = useState(selectedVersion?.notes || '');
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selectedPrompt && selectedPrompt.currentVersionId) {
      const currentVer = selectedPrompt.versions.find(v => v.id === selectedPrompt.currentVersionId);
      setSelectedVersion(currentVer || null);
      setPromptTemplateContent(currentVer?.template || '');
      setVersionNotes(currentVer?.notes || '');
    } else if (selectedPrompt && selectedPrompt.versions.length > 0) {
      // Default to latest version if currentVersionId is not set
      const latestVersion = selectedPrompt.versions.sort((a,b) => b.versionNumber - a.versionNumber)[0];
      setSelectedVersion(latestVersion);
      setPromptTemplateContent(latestVersion.template);
      setVersionNotes(latestVersion.notes);
    } else {
      setSelectedVersion(null);
      setPromptTemplateContent('');
      setVersionNotes('');
    }
  }, [selectedPrompt]);

  const handleSelectPrompt = (promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    setSelectedPrompt(prompt || null);
  };

  const handleSelectVersion = (versionId: string) => {
    if (!selectedPrompt) return;
    const version = selectedPrompt.versions.find(v => v.id === versionId);
    setSelectedVersion(version || null);
    setPromptTemplateContent(version?.template || '');
    setVersionNotes(version?.notes || '');
  };

  const insertVariable = (variableName: string) => {
    const textarea = promptTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);
      const variableToInsert = `{{${variableName}}}`;
      setPromptTemplateContent(before + variableToInsert + after);
      textarea.focus();
      // Move cursor to after the inserted variable
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + variableToInsert.length;
      }, 0);
    }
  };

  const handleSaveVersion = () => {
    if (!selectedPrompt || !selectedVersion) return; // Or create new if no version selected
    
    const updatedVersion: PromptVersion = {
      ...selectedVersion,
      template: promptTemplateContent,
      notes: versionNotes,
    };
    
    const updatedPrompt: PromptTemplate = {
      ...selectedPrompt,
      versions: selectedPrompt.versions.map(v => v.id === selectedVersion.id ? updatedVersion : v),
    };
    
    setPrompts(prompts.map(p => p.id === selectedPrompt.id ? updatedPrompt : p));
    setSelectedPrompt(updatedPrompt); // Refresh selected prompt state
    alert('Version saved!');
  };

  const handleCreateNewVersion = () => {
    if (!selectedPrompt) return;
    const latestVersionNum = Math.max(0, ...selectedPrompt.versions.map(v => v.versionNumber));
    const newVersion: PromptVersion = {
      id: `v_new_${Date.now()}`,
      versionNumber: latestVersionNum + 1,
      template: promptTemplateContent, // Or a base template
      notes: 'New version created from v' + (selectedVersion?.versionNumber || latestVersionNum),
      createdAt: new Date().toISOString().split('T')[0],
    };

    const updatedPrompt: PromptTemplate = {
      ...selectedPrompt,
      versions: [...selectedPrompt.versions, newVersion],
      currentVersionId: newVersion.id,
    };

    setPrompts(prompts.map(p => p.id === selectedPrompt.id ? updatedPrompt : p));
    setSelectedPrompt(updatedPrompt);
    setSelectedVersion(newVersion); // Switch to new version
    setPromptTemplateContent(newVersion.template);
    setVersionNotes(newVersion.notes);
  };
  
  const handlePromptDialogSubmit = (e: FormEvent) => {
    e.preventDefault();
    const baseTemplate = "Your prompt template here. Use {{variable_name}} for parameters.";
    const initialVersion: PromptVersion = {
      id: `v_init_${Date.now()}`,
      versionNumber: 1,
      template: baseTemplate,
      notes: 'Initial version',
      createdAt: new Date().toISOString().split('T')[0],
    };

    const newPrompt: PromptTemplate = {
      id: editingPrompt ? editingPrompt.id : `prompt_${Date.now()}`,
      name: promptName,
      description: promptDescription,
      versions: editingPrompt ? editingPrompt.versions : [initialVersion],
      currentVersionId: editingPrompt ? editingPrompt.currentVersionId : initialVersion.id,
    };

    if (editingPrompt) {
      setPrompts(prompts.map(p => p.id === editingPrompt.id ? newPrompt : p));
    } else {
      setPrompts([newPrompt, ...prompts]);
      setSelectedPrompt(newPrompt); // Select the new prompt
    }
    resetPromptDialogForm();
    setIsPromptDialogOpen(false);
  };

  const resetPromptDialogForm = () => {
    setPromptName('');
    setPromptDescription('');
    setEditingPrompt(null);
  };

  const openEditPromptDialog = (prompt: PromptTemplate) => {
    setEditingPrompt(prompt);
    setPromptName(prompt.name);
    setPromptDescription(prompt.description);
    setIsPromptDialogOpen(true);
  };

  const handleDeletePrompt = (promptId: string) => {
    setPrompts(prompts.filter(p => p.id !== promptId));
    if (selectedPrompt?.id === promptId) {
      setSelectedPrompt(prompts.length > 1 ? prompts.filter(p=>p.id !== promptId)[0] : null);
    }
  };


  return (
    <div className="flex h-[calc(100vh-theme(spacing.28))] gap-6"> {/* Adjust height based on header */}
      {/* Prompt List Sidebar */}
      <Card className="w-1/4 min-w-[300px] flex flex-col shadow-lg">
        <CardHeader className="border-b">
          <CardTitle>Prompt Templates</CardTitle>
          <CardDescription>Manage your Judge LLM prompts.</CardDescription>
           <Dialog open={isPromptDialogOpen} onOpenChange={(isOpen) => { setIsPromptDialogOpen(isOpen); if(!isOpen) resetPromptDialogForm();}}>
            <DialogTrigger asChild>
              <Button size="sm" className="mt-2 w-full" onClick={() => { setEditingPrompt(null); resetPromptDialogForm(); setIsPromptDialogOpen(true); }}>
                <PlusCircle className="mr-2 h-4 w-4" /> New Prompt
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingPrompt ? 'Edit' : 'Create New'} Prompt Template</DialogTitle>
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
                  <Button type="submit">{editingPrompt ? 'Save Changes' : 'Create Prompt'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <ScrollArea className="flex-1">
          <CardContent className="p-0">
            {prompts.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <FileText className="mx-auto h-10 w-10 mb-2" />
                <p>No prompts created yet.</p>
              </div>
            ) : (
              prompts.map(p => (
                <div
                  key={p.id}
                  className={`p-3 border-b cursor-pointer hover:bg-muted/50 ${selectedPrompt?.id === p.id ? 'bg-muted font-semibold' : ''}`}
                  onClick={() => handleSelectPrompt(p.id)}
                >
                  <div className="flex justify-between items-center">
                    <span>{p.name}</span>
                    <div className="flex gap-1">
                       <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditPromptDialog(p);}}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/90" onClick={(e) => {e.stopPropagation(); handleDeletePrompt(p.id)}}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                </div>
              ))
            )}
          </CardContent>
        </ScrollArea>
      </Card>

      {/* Prompt Editor Area */}
      {selectedPrompt ? (
        <Card className="flex-1 flex flex-col shadow-lg">
          <CardHeader className="border-b">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl font-headline">{selectedPrompt.name}</CardTitle>
                <CardDescription>{selectedPrompt.description}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select
                    value={selectedVersion?.id || ''}
                    onValueChange={(versionId) => handleSelectVersion(versionId)}
                    disabled={selectedPrompt.versions.length === 0}
                  >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedPrompt.versions.sort((a,b) => b.versionNumber - a.versionNumber).map(v => (
                      <SelectItem key={v.id} value={v.id}>Version {v.versionNumber} ({v.createdAt})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={handleCreateNewVersion} disabled={!selectedPrompt}>
                  <Versions className="mr-2 h-4 w-4" /> New Version
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 flex">
            {/* Editor */}
            <div className="flex-1 p-4 flex flex-col">
              <Label htmlFor="prompt-template-area" className="mb-2 font-medium">Prompt Template (Version {selectedVersion?.versionNumber || 'N/A'})</Label>
              <Textarea
                ref={promptTextareaRef}
                id="prompt-template-area"
                value={promptTemplateContent}
                onChange={(e) => setPromptTemplateContent(e.target.value)}
                placeholder="Enter your prompt template here. Use {{variable_name}} to insert parameters."
                className="flex-1 resize-none font-code text-sm"
                disabled={!selectedVersion}
              />
              <Label htmlFor="version-notes" className="mt-4 mb-2 font-medium">Version Notes</Label>
              <Input 
                id="version-notes" 
                value={versionNotes} 
                onChange={(e) => setVersionNotes(e.target.value)} 
                placeholder="Notes for this version (e.g., 'Improved clarity on instructions')" 
                disabled={!selectedVersion}
              />
            </div>
            {/* Variables Sidebar */}
            <div className="w-1/3 min-w-[250px] border-l p-4 bg-muted/30">
              <h3 className="text-md font-semibold mb-3">Available Parameters</h3>
              <ScrollArea className="h-[calc(100%-40px)]"> {/* Adjust height */}
              {availableProductParameters.length === 0 ? (
                <p className="text-sm text-muted-foreground">No product parameters defined. Go to Schema Definition.</p>
              ) : (
                <div className="space-y-2">
                  {availableProductParameters.map(param => (
                    <Card key={param.id} className="p-2 shadow-sm bg-background">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">{param.name}</span>
                        </div>
                        <Button size="xs" variant="outline" onClick={() => insertVariable(param.name)} title={`Insert {{${param.name}}}`}>
                          Insert
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 pl-6">{param.description}</p>
                    </Card>
                  ))}
                </div>
              )}
              </ScrollArea>
            </div>
          </CardContent>
          <CardFooter className="border-t pt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(promptTemplateContent)} disabled={!selectedVersion}>
              <Copy className="mr-2 h-4 w-4" /> Copy Template
            </Button>
            <Button onClick={handleSaveVersion} disabled={!selectedVersion}>
              <Save className="mr-2 h-4 w-4" /> Save Current Version
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card className="flex-1 flex items-center justify-center shadow-lg">
          <div className="text-center text-muted-foreground p-8">
            <FileText className="mx-auto h-16 w-16 mb-4" />
            <h2 className="text-xl font-semibold">No Prompt Selected</h2>
            <p>Select a prompt from the list or create a new one to start editing.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
