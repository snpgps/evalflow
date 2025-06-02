'use client';

import { useState, type FormEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, Target, GripVertical, CheckCircle, XCircle } from "lucide-react";

interface EvalParameter {
  id: string;
  name: string;
  definition: string;
  goodExample: string;
  badExample: string;
}

const initialEvalParameters: EvalParameter[] = [
  { id: '1', name: 'Hallucination', definition: 'Did the bot invent facts or provide information not present in the source?', goodExample: 'Response sticks to provided documents.', badExample: 'Bot mentions a feature that does not exist.' },
  { id: '2', name: 'Context Relevance', definition: 'Is the response grounded in the provided data/context?', goodExample: 'Answer directly uses information from the user query and product details.', badExample: 'Response is generic and not tailored to the specific product.' },
  { id: '3', name: 'Groundedness', definition: 'Does the response make claims that can be verified against the provided source documents?', goodExample: 'All statements are supported by the context.', badExample: 'The model makes an unsupported claim.' },
];

export default function EvaluationParametersPage() {
  const [evalParameters, setEvalParameters] = useState<EvalParameter[]>(initialEvalParameters);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvalParam, setEditingEvalParam] = useState<EvalParameter | null>(null);

  const [paramName, setParamName] = useState('');
  const [paramDefinition, setParamDefinition] = useState('');
  const [goodExample, setGoodExample] = useState('');
  const [badExample, setBadExample] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const newEvalParam: EvalParameter = {
      id: editingEvalParam ? editingEvalParam.id : Date.now().toString(),
      name: paramName,
      definition: paramDefinition,
      goodExample,
      badExample,
    };

    if (editingEvalParam) {
      setEvalParameters(evalParameters.map(p => p.id === editingEvalParam.id ? newEvalParam : p));
    } else {
      setEvalParameters([...evalParameters, newEvalParam]);
    }
    resetForm();
    setIsDialogOpen(false);
  };

  const resetForm = () => {
    setParamName('');
    setParamDefinition('');
    setGoodExample('');
    setBadExample('');
    setEditingEvalParam(null);
  };

  const openEditDialog = (param: EvalParameter) => {
    setEditingEvalParam(param);
    setParamName(param.name);
    setParamDefinition(param.definition);
    setGoodExample(param.goodExample);
    setBadExample(param.badExample);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setEvalParameters(evalParameters.filter(p => p.id !== id));
  };
  
  // Placeholder for drag-and-drop reordering logic
  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, id: string) => {
    e.dataTransfer.setData("evalParamId", id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLTableRowElement>, targetId: string) => {
    const draggedId = e.dataTransfer.getData("evalParamId");
    // Implement reordering logic here
    console.log(`Drag ${draggedId} to ${targetId}`);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Target className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">Evaluation Parameters</CardTitle>
              <CardDescription>Define the metrics and criteria for evaluating your AI model's performance. Each parameter should include a clear definition and examples.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Dialog open={isDialogOpen} onOpenChange={(isOpen) => { setIsDialogOpen(isOpen); if(!isOpen) resetForm();}}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingEvalParam(null); resetForm(); setIsDialogOpen(true); }}>
                <PlusCircle className="mr-2 h-5 w-5" /> Add New Evaluation Parameter
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingEvalParam ? 'Edit' : 'Add New'} Evaluation Parameter</DialogTitle>
                <DialogDescription>
                  Define a criterion for evaluating model outputs. Include examples of good and bad responses.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
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
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {setIsDialogOpen(false); resetForm();}}>Cancel</Button>
                  <Button type="submit">{editingEvalParam ? 'Save Changes' : 'Add Parameter'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Defined Evaluation Parameters</CardTitle>
          <CardDescription>Manage your existing evaluation parameters. Drag to reorder.</CardDescription>
        </CardHeader>
        <CardContent>
          {evalParameters.length === 0 ? (
             <div className="text-center text-muted-foreground py-8">
              <p>No evaluation parameters defined yet.</p>
              <p className="text-sm">Click "Add New Evaluation Parameter" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Reorder</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Definition</TableHead>
                  <TableHead>Good Example</TableHead>
                  <TableHead>Bad Example</TableHead>
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evalParameters.map((param) => (
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
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{param.definition}</TableCell>
                    <TableCell className="text-sm text-green-600 max-w-xs truncate"><CheckCircle className="inline h-4 w-4 mr-1" />{param.goodExample}</TableCell>
                    <TableCell className="text-sm text-red-600 max-w-xs truncate"><XCircle className="inline h-4 w-4 mr-1" />{param.badExample}</TableCell>
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
