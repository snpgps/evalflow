'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, Database, FileUp, Download, Eye, FileSpreadsheet } from "lucide-react";
import { Badge } from '@/components/ui/badge';

interface DatasetVersion {
  id: string;
  version: number;
  fileName: string;
  uploadDate: string;
  size: string;
  records: number;
}

interface Dataset {
  id: string;
  name: string;
  description: string;
  versions: DatasetVersion[];
  productSchemaId: string; // Link to a product parameter schema
}

const initialDatasets: Dataset[] = [
  { 
    id: '1', 
    name: 'Chatbot Product Support Q&A', 
    description: 'Dataset for evaluating chatbot responses on product support queries.',
    productSchemaId: '1',
    versions: [
      { id: 'v1', version: 1, fileName: 'chatbot_prod_support_v1.csv', uploadDate: '2024-07-15', size: '2.3MB', records: 10520 },
      { id: 'v2', version: 2, fileName: 'chatbot_prod_support_v2.xlsx', uploadDate: '2024-07-20', size: '2.5MB', records: 11000 },
    ]
  },
  { 
    id: '2', 
    name: 'E-commerce Product Description Generation', 
    description: 'Dataset for evaluating generated product descriptions.',
    productSchemaId: '2',
    versions: [
      { id: 'v1-ecom', version: 1, fileName: 'ecommerce_desc_v1.csv', uploadDate: '2024-07-18', size: '500KB', records: 2500 },
    ]
  },
];

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>(initialDatasets);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isDatasetDialogOpen, setIsDatasetDialogOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  
  const [datasetName, setDatasetName] = useState('');
  const [datasetDescription, setDatasetDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentDatasetIdForUpload, setCurrentDatasetIdForUpload] = useState<string | null>(null);


  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUploadSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !currentDatasetIdForUpload) return;

    const datasetIndex = datasets.findIndex(d => d.id === currentDatasetIdForUpload);
    if (datasetIndex === -1) return;

    const newVersion: DatasetVersion = {
      id: `v${Date.now()}`,
      version: datasets[datasetIndex].versions.length + 1,
      fileName: selectedFile.name,
      uploadDate: new Date().toISOString().split('T')[0],
      size: `${(selectedFile.size / (1024 * 1024)).toFixed(2)}MB`,
      records: 0, // Placeholder, would be parsed from file
    };
    
    const updatedDatasets = [...datasets];
    updatedDatasets[datasetIndex].versions.push(newVersion);
    updatedDatasets[datasetIndex].versions.sort((a,b) => b.version - a.version); // Sort by version desc

    setDatasets(updatedDatasets);
    setSelectedFile(null);
    setIsUploadDialogOpen(false);
    setCurrentDatasetIdForUpload(null);
  };
  
  const handleDatasetSubmit = (e: FormEvent) => {
    e.preventDefault();
    const newDataset: Dataset = {
      id: editingDataset ? editingDataset.id : Date.now().toString(),
      name: datasetName,
      description: datasetDescription,
      versions: editingDataset ? editingDataset.versions : [],
      productSchemaId: 'temp-schema-id', // Placeholder
    };

    if (editingDataset) {
      setDatasets(datasets.map(d => d.id === editingDataset.id ? newDataset : d));
    } else {
      setDatasets([newDataset, ...datasets]);
    }
    resetDatasetForm();
    setIsDatasetDialogOpen(false);
  };
  
  const resetDatasetForm = () => {
    setDatasetName('');
    setDatasetDescription('');
    setEditingDataset(null);
  };

  const openEditDatasetDialog = (dataset: Dataset) => {
    setEditingDataset(dataset);
    setDatasetName(dataset.name);
    setDatasetDescription(dataset.description);
    setIsDatasetDialogOpen(true);
  };
  
  const handleDeleteDataset = (id: string) => {
    setDatasets(datasets.filter(d => d.id !== id));
  };

  const openUploadDialog = (datasetId: string) => {
    setCurrentDatasetIdForUpload(datasetId);
    setIsUploadDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Database className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">Dataset Management</CardTitle>
              <CardDescription>Upload, version, and manage your datasets. Ensure columns map to your defined product parameters.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
           <Dialog open={isDatasetDialogOpen} onOpenChange={(isOpen) => { setIsDatasetDialogOpen(isOpen); if(!isOpen) resetDatasetForm();}}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingDataset(null); resetDatasetForm(); setIsDatasetDialogOpen(true); }}>
                <PlusCircle className="mr-2 h-5 w-5" /> Create New Dataset
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingDataset ? 'Edit' : 'Create New'} Dataset</DialogTitle>
                <DialogDescription>
                  Define a new dataset collection. You can upload versions to it later.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleDatasetSubmit} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="dataset-name">Dataset Name</Label>
                  <Input id="dataset-name" value={datasetName} onChange={(e) => setDatasetName(e.target.value)} placeholder="e.g., Customer Service Chat Logs" required />
                </div>
                <div>
                  <Label htmlFor="dataset-desc">Description</Label>
                  <Textarea id="dataset-desc" value={datasetDescription} onChange={(e) => setDatasetDescription(e.target.value)} placeholder="Briefly describe this dataset." />
                </div>
                {/* Future: Select Product Parameter Schema */}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {setIsDatasetDialogOpen(false); resetDatasetForm();}}>Cancel</Button>
                  <Button type="submit">{editingDataset ? 'Save Changes' : 'Create Dataset'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {datasets.length === 0 ? (
         <Card>
          <CardContent className="text-center text-muted-foreground py-12">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No datasets created yet.</h3>
            <p className="text-sm mb-4">Click "Create New Dataset" to get started with your evaluations.</p>
          </CardContent>
        </Card>
      ) : (
        datasets.map((dataset) => (
          <Card key={dataset.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{dataset.name}</CardTitle>
                <CardDescription>{dataset.description}</CardDescription>
              </div>
              <div className="flex gap-2">
                 <Button variant="outline" size="sm" onClick={() => openEditDatasetDialog(dataset)}>
                    <Edit2 className="h-4 w-4 mr-2" /> Edit Info
                  </Button>
                <Button size="sm" onClick={() => openUploadDialog(dataset.id)}>
                  <FileUp className="mr-2 h-4 w-4" /> Upload New Version
                </Button>
                 <Button variant="destructiveOutline" size="sm" onClick={() => handleDeleteDataset(dataset.id)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Dataset
                  </Button>
              </div>
            </CardHeader>
            <CardContent>
              {dataset.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No versions uploaded for this dataset yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead>Upload Date</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataset.versions.map((version) => (
                      <TableRow key={version.id} className="hover:bg-muted/50">
                        <TableCell><Badge variant="secondary">v{version.version}</Badge></TableCell>
                        <TableCell className="font-medium">{version.fileName}</TableCell>
                        <TableCell>{version.uploadDate}</TableCell>
                        <TableCell>{version.size}</TableCell>
                        <TableCell>{version.records.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                           <Button variant="ghost" size="icon" className="mr-2" title="Review Schema/Sample">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Download Version">
                            <Download className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))
      )}
      
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload New Dataset Version</DialogTitle>
            <DialogDescription>
              Upload an Excel (XLSX) or CSV file. Ensure columns match the defined product parameters.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUploadSubmit} className="space-y-4 py-4">
            <div>
              <Label htmlFor="dataset-file">Dataset File (.xlsx, .csv)</Label>
              <Input id="dataset-file" type="file" accept=".xlsx,.csv" onChange={handleFileChange} required />
            </div>
            {selectedFile && (
              <p className="text-sm text-muted-foreground">Selected: {selectedFile.name} ({(selectedFile.size / (1024*1024)).toFixed(2)} MB)</p>
            )}
            {/* Future: Add mapping UI preview here */}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsUploadDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!selectedFile}>Upload Version</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
