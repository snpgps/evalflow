
'use client';

import { useState, type ChangeEvent, type FormEvent, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Edit2, Trash2, Database, FileUp, Download, Eye, FileSpreadsheet, AlertTriangle, SheetIcon, Settings2, LinkIcon } from "lucide-react";
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
  selectedSheetName?: string | null; 
  columnMapping?: Record<string, string>; 
  createdAt?: Timestamp; 
}

interface Dataset {
  id: string; // Firestore document ID
  name: string;
  description: string;
  versions: DatasetVersion[];
  createdAt?: Timestamp; 
}

type NewDatasetData = Omit<Dataset, 'id' | 'versions' | 'createdAt'> & { createdAt: FieldValue };
type DatasetUpdatePayload = { id: string } & Partial<Omit<Dataset, 'id' | 'versions' | 'createdAt'>>;
type NewDatasetVersionData = Omit<DatasetVersion, 'id' | 'createdAt' | 'selectedSheetName' | 'columnMapping'> & { createdAt: FieldValue };
type UpdateVersionMappingPayload = { datasetId: string; versionId: string; selectedSheetName: string | null; columnMapping: Record<string, string> };


interface ProductParameterForMapping {
  id: string;
  name: string;
}

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

  // State for "Create/Edit Dataset" Dialog
  const [isDatasetDialogOpen, setIsDatasetDialogOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [datasetDescription, setDatasetDescription] = useState('');
  
  // State for "Upload New Version" Dialog (Simplified)
  const [isUploadVersionDialogOpen, setIsUploadVersionDialogOpen] = useState(false);
  const [currentDatasetIdForUpload, setCurrentDatasetIdForUpload] = useState<string | null>(null);
  const [selectedFileUpload, setSelectedFileUpload] = useState<File | null>(null);
  
  // State for "Update Mapping" Dialog
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [versionBeingMapped, setVersionBeingMapped] = useState<{datasetId: string; version: DatasetVersion} | null>(null);
  const [mappingDialogFile, setMappingDialogFile] = useState<File | null>(null);
  const [mappingDialogSheetNames, setMappingDialogSheetNames] = useState<string[]>([]);
  const [mappingDialogSelectedSheet, setMappingDialogSelectedSheet] = useState<string>('');
  const [mappingDialogSheetColumnHeaders, setMappingDialogSheetColumnHeaders] = useState<string[]>([]);
  const [mappingDialogCurrentColumnMapping, setMappingDialogCurrentColumnMapping] = useState<Record<string, string>>({});


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
      versionsSnapshot.docs.forEach(versionDoc => { batch.delete(versionDoc.ref); });
      await batch.commit();
      const datasetDocRef = doc(db, 'users', currentUserId, 'datasets', datasetIdToDelete);
      await deleteDoc(datasetDocRef);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasets', currentUserId] }),
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
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['datasets', currentUserId]});
      resetUploadVersionDialogState();
      setIsUploadVersionDialogOpen(false);
    }
  });
  
  const updateVersionMappingMutation = useMutation<void, Error, UpdateVersionMappingPayload>({
    mutationFn: async ({ datasetId, versionId, selectedSheetName, columnMapping }) => {
      if (!currentUserId) throw new Error("User not identified for updating mapping.");
      const versionDocRef = doc(db, 'users', currentUserId, 'datasets', datasetId, 'versions', versionId);
      await updateDoc(versionDocRef, { selectedSheetName, columnMapping });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', currentUserId] });
      resetMappingDialogState();
      setIsMappingDialogOpen(false);
    },
    onError: (error) => {
      console.error("Error updating version mapping:", error);
      alert(`Failed to update mapping: ${error.message}`);
    }
  });

  const resetDatasetForm = () => {
    setDatasetName('');
    setDatasetDescription('');
    setEditingDataset(null);
  };

  const resetUploadVersionDialogState = () => {
    setSelectedFileUpload(null);
    setCurrentDatasetIdForUpload(null);
  };

  const resetMappingDialogState = () => {
    setVersionBeingMapped(null);
    setMappingDialogFile(null);
    setMappingDialogSheetNames([]);
    setMappingDialogSelectedSheet('');
    setMappingDialogSheetColumnHeaders([]);
    setMappingDialogCurrentColumnMapping({});
  };
  
  // For initial "Upload New Version" dialog
  const handleSelectedFileChangeForUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFileUpload(file || null);
  };

  const handleInitialUploadSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFileUpload || !currentDatasetIdForUpload || !currentUserId) return;

    const targetDataset = datasets.find(d => d.id === currentDatasetIdForUpload);
    if (!targetDataset) return;

    const newVersionNumber = targetDataset.versions.length > 0 
      ? Math.max(...targetDataset.versions.map(v => v.versionNumber)) + 1 
      : 1;

    const newVersionData: NewDatasetVersionData = {
      versionNumber: newVersionNumber,
      fileName: selectedFileUpload.name,
      uploadDate: new Date().toISOString().split('T')[0],
      size: `${(selectedFileUpload.size / (1024 * 1024)).toFixed(2)}MB`,
      records: 0, // Will be updated after mapping if we implement record counting
      createdAt: serverTimestamp(),
    };
    
    addDatasetVersionMutation.mutate({ datasetId: currentDatasetIdForUpload, versionData: newVersionData });
  };

  // For "Update Mapping" Dialog
  const handleMappingDialogFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !versionBeingMapped) {
        setMappingDialogFile(null);
        return;
    }
    // Basic check if the re-selected file name matches the original version's file name.
    // This is a soft check; users could technically select a different file.
    if (file.name !== versionBeingMapped.version.fileName) {
        alert(`Warning: The selected file "${file.name}" does not match the original file name "${versionBeingMapped.version.fileName}". Please ensure you select the correct file for mapping.`);
    }

    setMappingDialogFile(file);
    setMappingDialogSheetNames([]);
    setMappingDialogSelectedSheet('');
    setMappingDialogSheetColumnHeaders([]);
    setMappingDialogCurrentColumnMapping({});

    if (file.name.endsWith('.xlsx')) {
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = e.target?.result;
                if (data) {
                    const workbook = XLSX.read(data, { type: 'array' });
                    const filteredSheetNames = workbook.SheetNames.map(name => String(name).trim()).filter(name => name !== '');
                    setMappingDialogSheetNames(filteredSheetNames);
                    if (filteredSheetNames.length === 0) {
                        alert("The selected Excel file contains no valid sheet names or no sheets.");
                    }
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error("Error parsing XLSX for mapping dialog:", error);
            alert("Failed to parse Excel file for mapping. Please ensure it's a valid .xlsx file.");
        }
    } else if (file.name.endsWith('.csv')) {
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                if (text) {
                    const lines = text.split(/\r\n|\n|\r/);
                    if (lines.length > 0 && lines[0].trim() !== '') {
                        const headers = lines[0].split(',').map(h => String(h.replace(/^"|"$/g, '').trim())).filter(Boolean);
                        setMappingDialogSheetColumnHeaders(headers);
                        if (headers.length === 0) {
                             alert("CSV file has a header row, but no valid column names could be extracted or all are empty.");
                        }
                        // For CSV, "selectedSheet" can be the filename to trigger mapping UI
                        setMappingDialogSelectedSheet(file.name); 
                        // Attempt initial mapping
                        const initialMapping: Record<string, string> = {};
                        productParametersForMapping.forEach(param => {
                            const foundColumn = headers.find(h => String(h).toLowerCase() === param.name.toLowerCase());
                            if (foundColumn) initialMapping[param.name] = String(foundColumn);
                        });
                        setMappingDialogCurrentColumnMapping(initialMapping);
                    } else {
                         alert("CSV file appears to be empty or has no header row.");
                    }
                }
            };
            reader.readAsText(file);
        } catch (error) {
            console.error("Error parsing CSV for mapping dialog:", error);
            alert("Failed to parse CSV file for mapping. Please ensure it's a valid .csv file.");
        }
    }
  };

  const handleMappingDialogSheetSelect = (sheetName: string) => {
    setMappingDialogSelectedSheet(sheetName);
    setMappingDialogSheetColumnHeaders([]);
    setMappingDialogCurrentColumnMapping({});

    if (mappingDialogFile && mappingDialogFile.name.endsWith('.xlsx') && sheetName) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target?.result;
            if (data) {
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[sheetName];
                if (worksheet) {
                    const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
                    const rawHeaders = jsonData[0] || [];
                    const headers = rawHeaders.map(header => String(header).trim()).filter(Boolean);
                    setMappingDialogSheetColumnHeaders(headers);
                    if (headers.length === 0 && rawHeaders.length > 0) {
                        alert(`Sheet '${sheetName}' has a header row, but no valid column names found or all are empty.`);
                    } else if (headers.length === 0) {
                         alert(`Sheet '${sheetName}' appears to be empty or has no header row.`);
                    }
                    // Attempt initial mapping
                    const initialMapping: Record<string, string> = {};
                    productParametersForMapping.forEach(param => {
                        const foundColumn = headers.find(h => String(h).toLowerCase() === param.name.toLowerCase());
                        if (foundColumn) initialMapping[param.name] = String(foundColumn);
                    });
                    setMappingDialogCurrentColumnMapping(initialMapping);
                } else {
                    alert(`Sheet '${sheetName}' could not be read.`);
                }
            }
        };
        reader.readAsArrayBuffer(mappingDialogFile);
    }
  };

  const handleMappingDialogColumnMappingChange = (schemaParamName: string, sheetColumnName: string) => {
    setMappingDialogCurrentColumnMapping(prev => ({ ...prev, [schemaParamName]: sheetColumnName }));
  };

  const handleSaveMappingSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!versionBeingMapped || !mappingDialogFile || !currentUserId) {
        alert("Critical information missing for saving mapping.");
        return;
    }
    if (mappingDialogFile.name.endsWith('.xlsx') && mappingDialogSheetNames.length > 0 && !mappingDialogSelectedSheet) {
      alert("Please select a sheet from the Excel file for mapping.");
      return;
    }
    if (mappingDialogSheetColumnHeaders.length === 0 && mappingDialogFile.size > 0) {
        alert("No column headers could be determined from the selected file/sheet. Cannot save mapping.");
        return;
    }

    const payload: UpdateVersionMappingPayload = {
        datasetId: versionBeingMapped.datasetId,
        versionId: versionBeingMapped.version.id,
        selectedSheetName: mappingDialogFile.name.endsWith('.csv') ? null : mappingDialogSelectedSheet,
        columnMapping: mappingDialogCurrentColumnMapping,
    };
    updateVersionMappingMutation.mutate(payload);
  };

  // General Functions
  const handleDatasetSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !datasetName.trim()) {
      alert("Dataset Name is required.");
      return;
    }
    if (editingDataset) {
      updateDatasetMutation.mutate({ id: editingDataset.id, name: datasetName.trim(), description: datasetDescription.trim() });
    } else {
      addDatasetMutation.mutate({ name: datasetName.trim(), description: datasetDescription.trim(), createdAt: serverTimestamp() });
    }
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

  const openUploadVersionDialog = (datasetId: string) => {
    resetUploadVersionDialogState(); 
    setCurrentDatasetIdForUpload(datasetId);
    setIsUploadVersionDialogOpen(true);
  };
  
  const openMappingDialog = (datasetId: string, version: DatasetVersion) => {
    resetMappingDialogState();
    setVersionBeingMapped({datasetId, version});
    // Pre-fill with existing mapping if available
    if(version.selectedSheetName && version.fileName.endsWith('.xlsx')) setMappingDialogSelectedSheet(version.selectedSheetName);
    if(version.columnMapping) setMappingDialogCurrentColumnMapping(version.columnMapping);
    // Note: File needs to be re-selected by user for security/simplicity reasons
    setIsMappingDialogOpen(true);
  };

  const handleCreateNewDatasetClick = () => {
    if (!currentUserId) {
      alert("Please log in to create a dataset.");
      return;
    }
    resetDatasetForm();
    setIsDatasetDialogOpen(true);
  };

  const showMappingUIInDialog = (
    mappingDialogFile &&
    mappingDialogSheetColumnHeaders.length > 0 &&
    productParametersForMapping.length > 0 &&
    ((mappingDialogFile.name.endsWith('.xlsx') && mappingDialogSelectedSheet) || 
     (mappingDialogFile.name.endsWith('.csv') && mappingDialogSheetColumnHeaders.length > 0)) 
  );
  
  const isInitialUploadButtonDisabled = !selectedFileUpload || !currentUserId || addDatasetVersionMutation.isPending;
  
  const isSaveMappingButtonDisabled = 
    !mappingDialogFile ||
    !versionBeingMapped ||
    !currentUserId ||
    updateVersionMappingMutation.isPending ||
    (mappingDialogFile?.name.endsWith('.xlsx') && mappingDialogSheetNames.length > 0 && !mappingDialogSelectedSheet) ||
    (mappingDialogSheetColumnHeaders.length === 0 && mappingDialogFile && mappingDialogFile.size > 0);


  if (isLoadingUserId || (isLoadingDatasets && currentUserId) || (isLoadingProdParams && currentUserId)) {
    return <div className="space-y-6"><Card><CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-56" /></CardContent></Card></div>;
  }
  if (fetchDatasetsError) {
    return <Card><CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2"/>Error</CardTitle></CardHeader><CardContent><p>{fetchDatasetsError.message}</p></CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3"><Database className="h-7 w-7 text-primary" />
            <div><CardTitle className="text-2xl font-headline">Dataset Management</CardTitle><CardDescription>Upload, version, and manage your datasets. Map columns to Product Parameters after uploading.</CardDescription></div>
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
              <DialogHeader><DialogTitle>{editingDataset ? 'Edit' : 'Create New'} Dataset</DialogTitle><DialogDescription>Define a new dataset collection.</DialogDescription></DialogHeader>
              <form onSubmit={handleDatasetSubmit} className="space-y-4 py-4">
                <div><Label htmlFor="dataset-name">Dataset Name</Label><Input id="dataset-name" value={datasetName} onChange={(e) => setDatasetName(e.target.value)} required /></div>
                <div><Label htmlFor="dataset-desc">Description</Label><Textarea id="dataset-desc" value={datasetDescription} onChange={(e) => setDatasetDescription(e.target.value)} /></div>
                <DialogFooter><Button type="button" variant="outline" onClick={() => {setIsDatasetDialogOpen(false); resetDatasetForm();}}>Cancel</Button><Button type="submit" disabled={!currentUserId || addDatasetMutation.isPending || updateDatasetMutation.isPending}>{addDatasetMutation.isPending || updateDatasetMutation.isPending ? 'Saving...' : (editingDataset ? 'Save Changes' : 'Create Dataset')}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {!currentUserId && !isLoadingUserId ? (
        <Card><CardContent className="text-center text-muted-foreground py-12"><p>Please log in to manage datasets.</p></CardContent></Card>
      ) : datasets.length === 0 && !isLoadingDatasets ? (
         <Card><CardContent className="text-center text-muted-foreground py-12"><FileSpreadsheet className="mx-auto h-12 w-12 mb-4" /><h3 className="text-xl font-semibold mb-2">No datasets.</h3></CardContent></Card>
      ) : (
        datasets.map((dataset) => (
          <Card key={dataset.id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div><CardTitle>{dataset.name}</CardTitle><CardDescription className="mb-1">{dataset.description || "No description."}</CardDescription></div>
              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                 <Button variant="outline" size="sm" onClick={() => openEditDatasetDialog(dataset)} disabled={!currentUserId}><Edit2 className="h-4 w-4 mr-2" /> Edit Info</Button>
                 <Button size="sm" onClick={() => openUploadVersionDialog(dataset.id)} disabled={!currentUserId}><FileUp className="mr-2 h-4 w-4" /> Upload New Version</Button>
                 <Button variant="destructive" size="sm" onClick={() => handleDeleteDataset(dataset.id)} disabled={!currentUserId || (deleteDatasetMutation.isPending && deleteDatasetMutation.variables === dataset.id)}><Trash2 className="h-4 w-4 mr-2" /> Delete Dataset</Button>
              </div>
            </CardHeader>
            <CardContent>
              {dataset.versions.length === 0 ? (<p className="text-sm text-muted-foreground">No versions uploaded.</p>) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>File Name</TableHead><TableHead>Upload Date</TableHead><TableHead>Size</TableHead><TableHead>Source/Sheet</TableHead><TableHead>Mapping</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {dataset.versions.map((version) => (
                      <TableRow key={version.id} className="hover:bg-muted/50">
                        <TableCell><Badge variant="secondary">v{version.versionNumber}</Badge></TableCell>
                        <TableCell className="font-medium">{version.fileName}</TableCell>
                        <TableCell>{version.uploadDate}</TableCell>
                        <TableCell>{version.size}</TableCell>
                        <TableCell>{version.selectedSheetName || (version.fileName.endsWith('.csv') && version.columnMapping ? "CSV" : "N/A")}</TableCell>
                        <TableCell>
                          {version.columnMapping && Object.keys(version.columnMapping).length > 0 
                            ? <Badge variant="default" className="bg-green-500 hover:bg-green-600">Configured</Badge> 
                            : <Badge variant="outline">Pending</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                           <Button variant="outline" size="sm" className="mr-2" onClick={() => openMappingDialog(dataset.id, version)} disabled={!currentUserId}>
                             <Settings2 className="h-4 w-4 mr-2"/> {version.columnMapping && Object.keys(version.columnMapping).length > 0 ? "Edit Mapping" : "Set Mapping"}
                           </Button>
                           <Button variant="ghost" size="icon" className="mr-2" title="Review Data (Not Implemented)"><Eye className="h-4 w-4" /></Button>
                           <Button variant="ghost" size="icon" title="Download Version (Not Implemented)"><Download className="h-4 w-4" /></Button>
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
      
      {/* Simplified "Upload New Version" Dialog */}
      <Dialog open={isUploadVersionDialogOpen} onOpenChange={(isOpen) => {setIsUploadVersionDialogOpen(isOpen); if(!isOpen) resetUploadVersionDialogState();}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Upload New Dataset Version</DialogTitle><DialogDescription>Select a .xlsx or .csv file to upload. Mapping will be configured separately.</DialogDescription></DialogHeader>
          <form onSubmit={handleInitialUploadSubmit} className="space-y-4 py-4">
            <div><Label htmlFor="new-version-file">Dataset File (.xlsx, .csv)</Label><Input id="new-version-file" type="file" accept=".xlsx,.csv" onChange={handleSelectedFileChangeForUpload} required /></div>
            {selectedFileUpload && (<p className="text-sm text-muted-foreground">Selected: {selectedFileUpload.name} ({(selectedFileUpload.size / (1024*1024)).toFixed(2)} MB)</p>)}
            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => {setIsUploadVersionDialogOpen(false); resetUploadVersionDialogState();}}>Cancel</Button>
              <Button type="submit" disabled={isInitialUploadButtonDisabled}>{addDatasetVersionMutation.isPending ? 'Uploading...' : 'Upload File'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* "Update Mapping" Dialog */}
      <Dialog open={isMappingDialogOpen} onOpenChange={(isOpen) => {setIsMappingDialogOpen(isOpen); if(!isOpen) resetMappingDialogState();}}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Mapping for {versionBeingMapped?.version.fileName} (v{versionBeingMapped?.version.versionNumber})</DialogTitle>
            <DialogDescription>Re-select the file to parse sheets/columns, then map to Product Parameters.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveMappingSubmit} className="space-y-4 py-4">
            <ScrollArea className="max-h-[70vh] p-1">
            <div className="space-y-4 pr-4">
              <div>
                <Label htmlFor="mapping-file-reselect">Re-select File</Label>
                <Input id="mapping-file-reselect" type="file" accept=".xlsx,.csv" onChange={handleMappingDialogFileChange} required />
                 {mappingDialogFile && (<p className="text-sm text-muted-foreground mt-1">Selected for mapping: {mappingDialogFile.name}</p>)}
              </div>

              {mappingDialogFile?.name.endsWith('.xlsx') && mappingDialogSheetNames.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                   <Label htmlFor="mapping-sheet-select" className="flex items-center"><SheetIcon className="mr-2 h-4 w-4 text-green-600"/>Select Sheet</Label>
                  <Select value={mappingDialogSelectedSheet} onValueChange={handleMappingDialogSheetSelect} required={mappingDialogSheetNames.length > 0}>
                    <SelectTrigger id="mapping-sheet-select"><SelectValue placeholder="Select a sheet" /></SelectTrigger>
                    <SelectContent>{mappingDialogSheetNames.map((name, idx) => <SelectItem key={`map-sheet-${idx}`} value={name}>{name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {mappingDialogFile?.name.endsWith('.xlsx') && mappingDialogSheetNames.length === 0 && mappingDialogFile.size > 0 && (
                <p className="text-sm text-amber-700 pt-2 border-t">No sheets found or file not yet parsed. Check file.</p>
              )}

              { showMappingUIInDialog && (
                <div className="space-y-3 pt-3 border-t">
                  <Label className="flex items-center"><LinkIcon className="mr-2 h-4 w-4 text-blue-600"/>Map Product Parameters to Columns</Label>
                  <p className="text-xs text-muted-foreground">
                    Map parameters to columns in '{mappingDialogFile?.name.endsWith('.xlsx') ? mappingDialogSelectedSheet : 'your CSV file'}'.
                  </p>
                  <Card className="p-4 bg-muted/30 max-h-60 overflow-y-auto">
                     <div className="space-y-3">
                      {productParametersForMapping.map(param => (
                        <div key={param.id} className="grid grid-cols-2 gap-2 items-center">
                          <Label htmlFor={`map-dialog-${param.id}`} className="text-sm font-medium truncate" title={param.name}>{param.name}:</Label>
                          <Select
                            value={mappingDialogCurrentColumnMapping[param.name] || ''}
                            onValueChange={(value) => handleMappingDialogColumnMappingChange(param.name, value)}
                          >
                            <SelectTrigger id={`map-dialog-${param.id}`} className="h-9 text-xs"><SelectValue placeholder="Select column" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value=""><em>None</em></SelectItem>
                              {mappingDialogSheetColumnHeaders.map((col, index) => <SelectItem key={`map-col-header-${index}`} value={col}>{col}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}
               {((mappingDialogFile?.name.endsWith('.xlsx') && mappingDialogSelectedSheet) || (mappingDialogFile?.name.endsWith('.csv') && mappingDialogSheetColumnHeaders.length > 0)) && productParametersForMapping.length === 0 && !isLoadingProdParams && (
                 <p className="text-sm text-amber-700 pt-2 border-t">No product parameters found for mapping.</p>
               )}
               {mappingDialogFile && mappingDialogSheetColumnHeaders.length === 0 && mappingDialogFile.size > 0 && (
                <p className="text-sm text-red-600 pt-2 border-t">Could not parse headers. Ensure a valid header row.</p>
               )}
            </div>
            </ScrollArea>
            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => {setIsMappingDialogOpen(false); resetMappingDialogState();}}>Cancel</Button>
              <Button type="submit" disabled={isSaveMappingButtonDisabled}>
                {updateVersionMappingMutation.isPending ? 'Saving Mapping...' : 'Save Mapping'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}


    