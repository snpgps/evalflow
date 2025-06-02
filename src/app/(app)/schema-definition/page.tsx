'use client';

import { useState, type FormEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, Settings2, GripVertical } from "lucide-react";

interface ProductParameter {
  id: string;
  name: string;
  type: 'text' | 'dropdown' | 'textarea';
  definition: string;
  options?: string[]; // For dropdown type
}

const initialParameters: ProductParameter[] = [
  { id: '1', name: 'Reference Metadata', type: 'textarea', definition: 'Contextual information or documents relevant to the interaction.' },
  { id: '2', name: 'Chatbot-User Conversation', type: 'textarea', definition: 'The full transcript of the conversation between the chatbot and the user.' },
  { id: '3', name: 'Product Details', type: 'textarea', definition: 'Specific information about the product being discussed.' },
];

export default function SchemaDefinitionPage() {
  const [parameters, setParameters] = useState<ProductParameter[]>(initialParameters);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingParameter, setEditingParameter] = useState<ProductParameter | null>(null);
  const [parameterName, setParameterName] = useState('');
  const [parameterType, setParameterType] = useState<'text' | 'dropdown' | 'textarea'>('text');
  const [parameterDefinition, setParameterDefinition] = useState('');
  const [dropdownOptions, setDropdownOptions] = useState('');


  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const newParam: ProductParameter = {
      id: editingParameter ? editingParameter.id : Date.now().toString(),
      name: parameterName,
      type: parameterType,
      definition: parameterDefinition,
      options: parameterType === 'dropdown' ? dropdownOptions.split(',').map(opt => opt.trim()) : undefined,
    };

    if (editingParameter) {
      setParameters(parameters.map(p => p.id === editingParameter.id ? newParam : p));
    } else {
      setParameters([...parameters, newParam]);
    }
    resetForm();
    setIsDialogOpen(false);
  };

  const resetForm = () => {
    setParameterName('');
    setParameterType('text');
    setParameterDefinition('');
    setDropdownOptions('');
    setEditingParameter(null);
  };

  const openEditDialog = (param: ProductParameter) => {
    setEditingParameter(param);
    setParameterName(param.name);
    setParameterType(param.type);
    setParameterDefinition(param.definition);
    setDropdownOptions(param.options?.join(', ') || '');
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setParameters(parameters.filter(p => p.id !== id));
  };
  
  // Placeholder for drag-and-drop reordering logic
  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, id: string) => {
    e.dataTransfer.setData("parameterId", id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLTableRowElement>, targetId: string) => {
    const draggedId = e.dataTransfer.getData("parameterId");
    // Implement reordering logic here
    console.log(`Drag ${draggedId} to ${targetId}`);
  };


  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
             <Settings2 className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">Product Parameter Schema</CardTitle>
              <CardDescription>Define the structured fields for your AI product evaluations. These parameters will be used for dataset mapping and prompt templating.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Dialog open={isDialogOpen} onOpenChange={(isOpen) => { setIsDialogOpen(isOpen); if(!isOpen) resetForm();}}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingParameter(null); resetForm(); setIsDialogOpen(true); }}>
                <PlusCircle className="mr-2 h-5 w-5" /> Add New Parameter
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>{editingParameter ? 'Edit' : 'Add New'} Product Parameter</DialogTitle>
                <DialogDescription>
                  Define a field for your product data. This will be used to structure datasets and create prompt variables.
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
                  <Button type="submit">{editingParameter ? 'Save Changes' : 'Add Parameter'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Defined Parameters</CardTitle>
          <CardDescription>Manage your existing product parameters. Drag to reorder.</CardDescription>
        </CardHeader>
        <CardContent>
          {parameters.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>No product parameters defined yet.</p>
              <p className="text-sm">Click "Add New Parameter" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Reorder</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Definition</TableHead>
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parameters.map((param) => (
                  <TableRow 
                    key={param.id} 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, param.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, param.id)}
                    className="hover:bg-muted/50 cursor-grab"
                  >
                    <TableCell><GripVertical className="h-5 w-5 text-muted-foreground" /></TableCell>
                    <TableCell className="font-medium">{param.name}</TableCell>
                    <TableCell className="capitalize">{param.type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{param.definition}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(param)} className="mr-2">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(param.id)} className="text-destructive hover:text-destructive/90">
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
