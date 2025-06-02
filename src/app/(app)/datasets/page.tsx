
'use client';

import { useState, type ChangeEvent, type FormEvent, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogTrigger, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Edit2, Trash2, Database, FileUp, Download, Eye, FileSpreadsheet, AlertTriangle, SheetIcon, Settings2 } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase';
import { 
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, 
  query, orderBy, writeBatch, type Timestamp, type FieldValue 
} from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';
import { ScrollArea } from '@/components/ui/scroll-area';

// Interfaces for data structure
interface DatasetVersion {
  id: string; // Firestore document ID
  versionNumber: number;
  fileName: string;
  uploadDate: string; // ISO String
  size: string; // e.g. "2.5MB"
  records: number;
  selectedSheetName?: string; // For XLSX files
  columnMapping?: Record<string, string>; // e.g., { schemaParamName: sheetColumnName }
  createdAt?: Timestamp; // Firestore Timestamp
}

interface Dataset {
  id: string; // Firestore document ID
  name: string;
  description: string;
  versions: DatasetVersion[];
  createdAt?: Timestamp; // Firestore Timestamp
}

// Type for new dataset data (without id, versions, createdAt)
type NewDatasetData = Omit<Dataset, 'id' | 'versions' | 'createdAt'> & { createdAt: FieldValue };
// Type for dataset update payload
type DatasetUpdatePayload = { id: string } & Partial<Omit<Dataset, 'id' | 'versions' | 'createdAt'>>;

// Type for new dataset version data
type NewDatasetVersionData = Omit<DatasetVersion, 'id' | 'createdAt'> & { createdAt: FieldValue };

// Minimal interface for Product Parameters fetched for mapping
interface ProductParameterForMapping {
  id: string;
  name: string;
}

// Firestore interactions
const fetchDatasetsWithVersions = async (userId: string | null): Promise<Dataset[]> => {
  if (!userId) return [];
  const datasetsCollectionRef = collection(db, 'users', userId, 'datasets');
  const datasetsQuery = query(datasetsCollectionRef, orderBy('createdAt', 'desc'));
  const datasetsSnapshot = await getDocs(datasetsQuery);

  const datasetsData: Dataset[] = [];

  for (const datasetDoc of datasetsSnapshot.docs) {
    const datasetInfo = datasetDoc.data() as Omit<Dataset, 'id' | 'versions'>;
    
    const versionsCollectionRef = collection(db, 'users', userId, 'datasets', datasetDoc.id, 'versions');
    const versionsQuery = query(versionsCollectionRef, orderBy('versionNumber', 'desc'));
    const versionsSnapshot = await getDocs(versionsQuery);
    const versions = versionsSnapshot.docs.map(versionDocSnap => ({
      id: versionDocSnap.id,
      ...versionDocSnap.data()
    } as DatasetVersion));

    datasetsData.push({
      id: datasetDoc.id,
      ...datasetInfo,
      versions,
    });
  }
  return datasetsData;
};

const fetchProductParametersForMapping = async (userId: string | null): Promise<ProductParameterForMapping[]> => {
  if (!userId) return [];
  const paramsCollectionRef = collection(db, 'users', userId, 'productParameters');
  const paramsQuery = query(paramsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(paramsQuery);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    name: docSnap.data().name as string, 
  }));
};


export default function DatasetsPage() {
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

  const { data: datasets = [], isLoading: isLoadingDatasets, error: fetchDatasetsError } = useQuery<Dataset[], Error>({
    queryKey: ['datasets', currentUserId],
    queryFn: () => fetchDatasetsWithVersions(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const { data: productParametersForMapping = [], isLoading: isLoadingProdParams } = useQuery<ProductParameterForMapping[], Error>({
    queryKey: ['productParametersForMapping', currentUserId],
    queryFn: () => fetchProductParametersForMapping(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isDatasetDialogOpen, setIsDatasetDialogOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  
  const [datasetName, setDatasetName] = useState('');
  const [datasetDescription, setDatasetDescription] = useState('');
  
  // State for file upload dialog
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentDatasetIdForUpload, setCurrentDatasetIdForUpload] = useState<string | null>(null);
  const [availableSheetNames, setAvailableSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetColumnHeaders, setSheetColumnHeaders] = useState<string[]>([]);
  const [currentColumnMapping, setCurrentColumnMapping] = useState<Record<string, string>>({});


  // Mutations
  const addDatasetMutation = useMutation<void, Error, NewDatasetData>({
    mutationFn: async (newDataset) => {
      if (!currentUserId) throw new Error("User not identified for add operation.");
      await addDoc(collection(db, 'users', currentUserId, 'datasets'), newDataset);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', currentUserId] });
      resetDatasetForm();
      setIsDatasetDialogOpen(false);
    },
  });

  const updateDatasetMutation = useMutation<void, Error, DatasetUpdatePayload>({
    mutationFn: async (datasetToUpdate) => {
      if (!currentUserId) throw new Error("User not identified for update operation.");
      const { id, ...dataToUpdate } = datasetToUpdate;
      const docRef = doc(db, 'users', currentUserId, 'datasets', id);
      await updateDoc(docRef, dataToUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', currentUserId] });
      resetDatasetForm();
      setIsDatasetDialogOpen(false);
    },
  });

  const deleteDatasetMutation = useMutation<void, Error, string>({
    mutationFn: async (datasetIdToDelete) => {
      if (!currentUserId) throw new Error("User not identified for delete operation.");
      
      const versionsCollectionRef = collection(db, 'users', currentUserId, 'datasets', datasetIdToDelete, 'versions');
      const versionsSnapshot = await getDocs(versionsCollectionRef);
      const batch = writeBatch(db);
      versionsSnapshot.docs.forEach(versionDoc => {
        batch.delete(versionDoc.ref);
      });
      await batch.commit();

      const datasetDocRef = doc(db, 'users', currentUserId, 'datasets', datasetIdToDelete);
      await deleteDoc(datasetDocRef);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', currentUserId] });
    },
    onError: (error, variables) => {
      console.error(`Error deleting dataset ${variables}:`, error);
      alert(`Failed to delete dataset: ${error.message}. Check console for details.`);
    }
  });

  const addDatasetVersionMutation = useMutation<void, Error, { datasetId: string; versionData: NewDatasetVersionData }>({
    mutationFn: async ({ datasetId, versionData }) => {
      if (!currentUserId) throw new Error("User not identified for adding version.");
      await addDoc(collection(db, 'users', currentUserId, 'datasets', datasetId, 'versions'), versionData);
    },
    onSuccess: _ => {
      queryClient.invalidateQueries({queryKey: ['datasets', currentUserId]});
      resetUploadDialogState();
      setIsUploadDialogOpen(false);
    }
  });

  const resetUploadDialogState = () => {
    setSelectedFile(null);
    setCurrentDatasetIdForUpload(null);
    setAvailableSheetNames([]);
    setSelectedSheet('');
    setSheetColumnHeaders([]);
    setCurrentColumnMapping({});
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const currentDatasetId = currentDatasetIdForUpload; 
    resetUploadDialogState(); 
    setCurrentDatasetIdForUpload(currentDatasetId); 

    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (file.name.endsWith('.xlsx')) {
        try {
          const reader = new FileReader();
          reader.onload = (e) => {
            const data = e.target?.result;
            if (data) {
              const workbook = XLSX.read(data, { type: 'array' });
              setAvailableSheetNames(workbook.SheetNames);
              if (workbook.SheetNames.length > 0) {
                // Auto-select first sheet can be done here if desired, or let user choose
              }
            }
          };
          reader.readAsArrayBuffer(file);
        } catch (error) {
          console.error("Error parsing XLSX file:", error);
          alert("Failed to parse Excel file. Please ensure it's a valid .xlsx file.");
          const currentDatasetIdOnError = currentDatasetIdForUpload;
          resetUploadDialogState();
          setCurrentDatasetIdForUpload(currentDatasetIdOnError);
        }
      }
    } else {
      setSelectedFile(null);
    }
  };

  const handleSheetSelection = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setSheetColumnHeaders([]); 
    setCurrentColumnMapping({}); 

    if (selectedFile && sheetName) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        if (data) {
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[sheetName];
          if (worksheet) {
            const headers: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] as any[];
            setSheetColumnHeaders(headers.map(String)); 
            
            const initialMapping: Record<string, string> = {};
            productParametersForMapping.forEach(param => {
                const foundColumn = headers.find(h => String(h).toLowerCase() === param.name.toLowerCase());
                if (foundColumn) {
                    initialMapping[param.name] = String(foundColumn);
                }
            });
            setCurrentColumnMapping(initialMapping);
          }
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    }
  };
  
  const handleColumnMappingChange = (schemaParamName: string, sheetColumnName: string) => {
    setCurrentColumnMapping(prev => ({ ...prev, [schemaParamName]: sheetColumnName }));
  };


  const handleUploadSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !currentDatasetIdForUpload || !currentUserId) return;
    if (selectedFile.name.endsWith('.xlsx') && !selectedSheet && availableSheetNames.length > 0) {
      alert("Please select a sheet from the Excel file.");
      return;
    }

    const targetDataset = datasets.find(d => d.id === currentDatasetIdForUpload);
    if (!targetDataset) return;

    const newVersionNumber = targetDataset.versions.length > 0 
      ? Math.max(...targetDataset.versions.map(v => v.versionNumber)) + 1 
      : 1;

    const newVersionData: NewDatasetVersionData = {
      versionNumber: newVersionNumber,
      fileName: selectedFile.name,
      uploadDate: new Date().toISOString().split('T')[0],
      size: `${(selectedFile.size / (1024 * 1024)).toFixed(2)}MB`,
      records: 0, 
      createdAt: serverTimestamp(),
    };

    if (selectedFile.name.endsWith('.xlsx') && selectedSheet) {
      newVersionData.selectedSheetName = selectedSheet;
      newVersionData.columnMapping = currentColumnMapping;
    }
    
    addDatasetVersionMutation.mutate({ datasetId: currentDatasetIdForUpload, versionData: newVersionData });
  };
  
  const handleDatasetSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !datasetName.trim()) {
      alert("Dataset Name is required.");
      return;
    }

    if (editingDataset) {
      const payload: DatasetUpdatePayload = {
        id: editingDataset.id,
        name: datasetName.trim(),
        description: datasetDescription.trim(),
      };
      updateDatasetMutation.mutate(payload);
    } else {
      const newDataset: NewDatasetData = {
        name: datasetName.trim(),
        description: datasetDescription.trim(),
        createdAt: serverTimestamp(),
      };
      addDatasetMutation.mutate(newDataset);
    }
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
    if (!currentUserId) return;
    if (confirm('Are you sure you want to delete this dataset and all its versions? This action cannot be undone.')) {
      deleteDatasetMutation.mutate(id);
    }
  };

  const openUploadDialog = (datasetId: string) => {
    resetUploadDialogState(); 
    setCurrentDatasetIdForUpload(datasetId);
    setIsUploadDialogOpen(true);
  };

  const handleCreateNewDatasetClick = () => {
    if (!currentUserId) {
      alert("Please log in to create a dataset.");
      return;
    }
    setEditingDataset(null);
    resetDatasetForm();
    setIsDatasetDialogOpen(true);
  }

  if (isLoadingUserId || (isLoadingDatasets && currentUserId) || (isLoadingProdParams && currentUserId)) {
    return (
      <div className="space-y-6">
        <Card className="shadow-lg"><CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-56" /></CardContent></Card>
        {[1,2].map(i => <Card key={i}><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>)}
      </div>
    );
  }

  if (fetchDatasetsError) {
    return (
       <Card className="shadow-lg">
        <CardHeader><CardTitle className="text-2xl font-headline text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Error Loading Datasets</CardTitle></CardHeader>
        <CardContent><p>Could not fetch datasets: {fetchDatasetsError.message}</p><p className="mt-2 text-sm text-muted-foreground">Please ensure you are logged in and have a stable internet connection.</p></CardContent>
      </Card>
    )
  }


  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Database className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">Dataset Management</CardTitle>
              <CardDescription>Upload, version, and manage your datasets. Map columns to Product Parameters for Excel files.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
           <Dialog open={isDatasetDialogOpen} onOpenChange={(isOpen) => { setIsDatasetDialogOpen(isOpen); if(!isOpen) resetDatasetForm();}}>
            <DialogTrigger asChild>
              <Button onClick={handleCreateNewDatasetClick} disabled={!currentUserId || addDatasetMutation.isPending || updateDatasetMutation.isPending}>
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
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {setIsDatasetDialogOpen(false); resetDatasetForm();}}>Cancel</Button>
                  <Button type="submit" disabled={!currentUserId || addDatasetMutation.isPending || updateDatasetMutation.isPending}>
                    {addDatasetMutation.isPending || updateDatasetMutation.isPending ? 'Saving...' : (editingDataset ? 'Save Changes' : 'Create Dataset')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {!currentUserId && !isLoadingUserId ? (
        <Card><CardContent className="text-center text-muted-foreground py-12"><p>Please log in to manage datasets.</p></CardContent></Card>
      ) : datasets.length === 0 && !isLoadingDatasets ? (
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
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{dataset.name}</CardTitle>
                <CardDescription className="mb-1">{dataset.description || "No description."}</CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                 <Button variant="outline" size="sm" onClick={() => openEditDatasetDialog(dataset)} disabled={!currentUserId || updateDatasetMutation.isPending}>
                    <Edit2 className="h-4 w-4 mr-2" /> Edit Info
                  </Button>
                <Button size="sm" onClick={() => openUploadDialog(dataset.id)} disabled={!currentUserId || addDatasetVersionMutation.isPending}>
                  <FileUp className="mr-2 h-4 w-4" /> Upload New Version
                </Button>
                 <Button variant="destructive" size="sm" onClick={() => handleDeleteDataset(dataset.id)} disabled={!currentUserId || (deleteDatasetMutation.isPending && deleteDatasetMutation.variables === dataset.id)}>
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
                      <TableHead>Sheet</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataset.versions.map((version) => (
                      <TableRow key={version.id} className="hover:bg-muted/50">
                        <TableCell><Badge variant="secondary">v{version.versionNumber}</Badge></TableCell>
                        <TableCell className="font-medium">{version.fileName}</TableCell>
                        <TableCell>{version.uploadDate}</TableCell>
                        <TableCell>{version.size}</TableCell>
                        <TableCell>{version.records.toLocaleString()}</TableCell>
                        <TableCell>{version.selectedSheetName || 'N/A'}</TableCell>
                        <TableCell className="text-right">
                           <Button variant="ghost" size="icon" className="mr-2" title="Review Data/Mapping (Not Implemented)">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Download Version (Not Implemented)">
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
      
      <Dialog open={isUploadDialogOpen} onOpenChange={(isOpen) => {setIsUploadDialogOpen(isOpen); if(!isOpen) resetUploadDialogState();}}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload New Dataset Version</DialogTitle>
            <DialogDescription>
              Upload an Excel (XLSX) or CSV file. For XLSX, you can select a sheet and map columns.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUploadSubmit} className="space-y-4 py-4">
            <ScrollArea className="max-h-[70vh] p-1">
            <div className="space-y-4 pr-4">
              <div>
                <Label htmlFor="dataset-file">Dataset File (.xlsx, .csv)</Label>
                <Input id="dataset-file" type="file" accept=".xlsx,.csv" onChange={handleFileChange} required />
              </div>
              {selectedFile && (
                <p className="text-sm text-muted-foreground">Selected: {selectedFile.name} ({(selectedFile.size / (1024*1024)).toFixed(2)} MB)</p>
              )}

              {selectedFile?.name.endsWith('.xlsx') && availableSheetNames.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                   <Label htmlFor="sheet-select" className="flex items-center"><SheetIcon className="mr-2 h-4 w-4 text-green-600"/>Select Sheet</Label>
                  <Select value={selectedSheet} onValueChange={handleSheetSelection} required>
                    <SelectTrigger id="sheet-select"><SelectValue placeholder="Select a sheet" /></SelectTrigger>
                    <SelectContent>
                      {availableSheetNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedFile?.name.endsWith('.xlsx') && selectedSheet && sheetColumnHeaders.length > 0 && productParametersForMapping.length > 0 && (
                <div className="space-y-3 pt-3 border-t">
                  <Label className="flex items-center"><Settings2 className="mr-2 h-4 w-4 text-blue-600"/>Map Schema Parameters to Sheet Columns</Label>
                  <p className="text-xs text-muted-foreground">
                    Map parameters from your 'Schema Definition' to columns in '{selectedSheet}'. Mappings are used to prepare data for prompts.
                  </p>
                  <Card className="p-4 bg-muted/30 max-h-60 overflow-y-auto">
                     <div className="space-y-3">
                      {productParametersForMapping.map(param => (
                        <div key={param.id} className="grid grid-cols-2 gap-2 items-center">
                          <Label htmlFor={`map-${param.id}`} className="text-sm font-medium truncate" title={param.name}>{param.name}:</Label>
                          <Select
                            value={currentColumnMapping[param.name] || ''}
                            onValueChange={(value) => handleColumnMappingChange(param.name, value)}
                          >
                            <SelectTrigger id={`map-${param.id}`} className="h-9 text-xs">
                              <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value=""><em>None</em></SelectItem>
                              {sheetColumnHeaders.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}
               {selectedFile?.name.endsWith('.xlsx') && selectedSheet && productParametersForMapping.length === 0 && !isLoadingProdParams && (
                 <p className="text-sm text-amber-700">No product parameters found. Please define some in 'Schema Definition' to enable column mapping.</p>
               )}

              <p className="text-xs text-muted-foreground pt-2">Note: Record count will be set to 0. Actual file content storage/processing is not implemented in this step.</p>
            </div>
            </ScrollArea>
            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => {setIsUploadDialogOpen(false); resetUploadDialogState();}}>Cancel</Button>
              <Button type="submit" disabled={!selectedFile || !currentUserId || addDatasetVersionMutation.isPending}>
                {addDatasetVersionMutation.isPending ? 'Uploading...' : 'Upload Version'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}


    