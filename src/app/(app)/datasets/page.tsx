

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
import { PlusCircle, Edit2, Trash2, Database, FileUp, Download, Eye, FileSpreadsheet, AlertTriangle, SheetIcon, Settings2, LinkIcon, Loader2 } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { db, storage } from '@/lib/firebase';
import { 
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, 
  query, orderBy, writeBatch, type Timestamp, type FieldValue, getDoc
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getBlob, deleteObject } from 'firebase/storage';
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
  storagePath?: string; 
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
type NewDatasetVersionFirestoreData = Omit<DatasetVersion, 'id' | 'createdAt' | 'selectedSheetName' | 'columnMapping' | 'storagePath'> & { createdAt: FieldValue };
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

  const [isDatasetDialogOpen, setIsDatasetDialogOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [datasetDescription, setDatasetDescription] = useState('');
  
  const [isUploadVersionDialogOpen, setIsUploadVersionDialogOpen] = useState(false);
  const [currentDatasetIdForUpload, setCurrentDatasetIdForUpload] = useState<string | null>(null);
  const [selectedFileUpload, setSelectedFileUpload] = useState<File | null>(null);
  
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [isLoadingMappingData, setIsLoadingMappingData] = useState(false);
  const [versionBeingMapped, setVersionBeingMapped] = useState<{datasetId: string; version: DatasetVersion} | null>(null);
  const [mappingDialogFileData, setMappingDialogFileData] = useState<{blob: Blob, name: string} | null>(null);
  const [mappingDialogSheetNames, setMappingDialogSheetNames] = useState<string[]>([]);
  const [mappingDialogSelectedSheet, setMappingDialogSelectedSheet] = useState<string>('');
  const [mappingDialogSheetColumnHeaders, setMappingDialogSheetColumnHeaders] = useState<string[]>([]);
  const [mappingDialogCurrentColumnMapping, setMappingDialogCurrentColumnMapping] = useState<Record<string, string>>({});

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

      for (const versionDoc of versionsSnapshot.docs) {
        const versionData = versionDoc.data() as DatasetVersion;
        if (versionData.storagePath) {
          try {
            const fileRef = storageRef(storage, versionData.storagePath);
            await deleteObject(fileRef);
            console.log(`Successfully deleted file from storage: ${versionData.storagePath}`);
          } catch (storageError: any) {
            // Log specific Firebase Storage errors, but don't halt the Firestore deletion
            if (storageError.code === 'storage/object-not-found') {
              console.warn(`File not found in storage, skipping deletion: ${versionData.storagePath}`);
            } else {
              console.error(`Error deleting file ${versionData.storagePath} from storage:`, storageError);
            }
          }
        }
        batch.delete(versionDoc.ref);
      }
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

  const addDatasetVersionMutation = useMutation<void, Error, { datasetId: string; versionFirestoreData: NewDatasetVersionFirestoreData; fileToUpload: File }>({
    mutationFn: async ({ datasetId, versionFirestoreData, fileToUpload }) => {
      if (!currentUserId) throw new Error("User not identified for adding version.");

      const versionDocRef = await addDoc(collection(db, 'users', currentUserId, 'datasets', datasetId, 'versions'), versionFirestoreData);
      const versionId = versionDocRef.id;

      const filePath = `users/${currentUserId}/datasets/${datasetId}/versions/${versionId}/${fileToUpload.name}`;
      const fileStorageRef = storageRef(storage, filePath);

      await uploadBytes(fileStorageRef, fileToUpload);

      await updateDoc(versionDocRef, { storagePath: filePath });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['datasets', currentUserId]});
      resetUploadVersionDialogState();
      setIsUploadVersionDialogOpen(false);
    },
    onError: (error) => {
      alert(`Failed to upload version: ${error.message}. Check console for details.`);
      console.error("Error in addDatasetVersionMutation:", error);
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
    setMappingDialogFileData(null);
    setMappingDialogSheetNames([]);
    setMappingDialogSelectedSheet('');
    setMappingDialogSheetColumnHeaders([]);
    setMappingDialogCurrentColumnMapping({});
    setIsLoadingMappingData(false);
  };
  
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

    const newVersionFirestoreData: NewDatasetVersionFirestoreData = {
      versionNumber: newVersionNumber,
      fileName: selectedFileUpload.name,
      uploadDate: new Date().toISOString().split('T')[0],
      size: `${(selectedFileUpload.size / (1024 * 1024)).toFixed(2)}MB`,
      records: 0, 
      createdAt: serverTimestamp(),
    };
    
    addDatasetVersionMutation.mutate({ datasetId: currentDatasetIdForUpload, versionFirestoreData: newVersionFirestoreData, fileToUpload: selectedFileUpload });
  };
  
  const parseFileDataForMapping = async (fileData: {blob: Blob, name: string}) => {
    setMappingDialogSheetNames([]);
    setMappingDialogSelectedSheet('');
    setMappingDialogSheetColumnHeaders([]);
    // Do NOT reset setMappingDialogCurrentColumnMapping here, as it might be pre-filled

    const fileName = fileData.name.toLowerCase();

    if (fileName.endsWith('.xlsx')) {
        try {
            const arrayBuffer = await fileData.blob.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array', sheets: 0, bookFiles: false, bookProps: false, bookDeps: false, bookSheets: false, bookStrings: false, sheetStubs: true });
            const filteredSheetNames = workbook.SheetNames
              .map(name => String(name).trim())
              .filter(name => name !== ''); // Ensure non-empty sheet names
            setMappingDialogSheetNames(filteredSheetNames);
            if (filteredSheetNames.length === 0) {
                alert("The selected Excel file contains no valid sheet names or no sheets.");
            }
        } catch (error) {
            console.error("Error parsing XLSX for mapping dialog:", error);
            alert("Failed to parse Excel file for mapping. Please ensure it's a valid .xlsx file.");
        }
    } else if (fileName.endsWith('.csv')) {
        try {
            const text = await fileData.blob.text();
            const lines = text.split(/\r\n|\n|\r/);
            if (lines.length > 0 && lines[0].trim() !== '') {
                const headers = lines[0].split(',')
                  .map(h => String(h.replace(/^"|"$/g, '').trim()))
                  .filter(h => h !== ''); // Ensure non-empty headers
                setMappingDialogSheetColumnHeaders(headers);
                if (headers.length === 0) {
                     alert("CSV file has a header row, but no valid column names could be extracted or all are empty.");
                }
                setMappingDialogSelectedSheet(fileData.name); // For CSV, sheet name is effectively the file name

                // Auto-map if not already mapped from version data
                if (Object.keys(mappingDialogCurrentColumnMapping).length === 0) {
                    const initialMapping: Record<string, string> = {};
                    productParametersForMapping.forEach(param => {
                        const foundColumn = headers.find(h => String(h).toLowerCase() === param.name.toLowerCase());
                        if (foundColumn) initialMapping[param.name] = String(foundColumn);
                    });
                    setMappingDialogCurrentColumnMapping(initialMapping);
                }

            } else {
                 alert("CSV file appears to be empty or has no header row.");
            }
        } catch (error) {
            console.error("Error parsing CSV for mapping dialog:", error);
            alert("Failed to parse CSV file for mapping. Please ensure it's a valid .csv file.");
        }
    }
  };

  const handleMappingDialogSheetSelect = async (sheetName: string) => {
    setMappingDialogSelectedSheet(sheetName);
    setMappingDialogSheetColumnHeaders([]); 
    // Do NOT reset mappingDialogCurrentColumnMapping here, as it might be pre-filled for this sheet

    if (mappingDialogFileData && mappingDialogFileData.name.toLowerCase().endsWith('.xlsx') && sheetName) {
        try {
            const arrayBuffer = await mappingDialogFileData.blob.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const worksheet = workbook.Sheets[sheetName];
            if (worksheet) {
                const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
                const rawHeaders = jsonData[0] || [];
                const headers = rawHeaders
                    .map(header => String(header).trim())
                    .filter(h => h !== ''); // Ensure non-empty headers
                setMappingDialogSheetColumnHeaders(headers);

                if (headers.length === 0 && rawHeaders.length > 0) {
                    alert(`Sheet '${sheetName}' has a header row, but no valid column names found or all are empty.`);
                } else if (headers.length === 0) {
                     alert(`Sheet '${sheetName}' appears to be empty or has no header row.`);
                }
                
                // Auto-map if not already mapped from version data for this specific sheet
                if (Object.keys(mappingDialogCurrentColumnMapping).length === 0 || (versionBeingMapped && versionBeingMapped.version.selectedSheetName !== sheetName)) {
                    const initialMapping: Record<string, string> = {};
                    productParametersForMapping.forEach(param => {
                        const foundColumn = headers.find(h => String(h).toLowerCase() === param.name.toLowerCase());
                        if (foundColumn) initialMapping[param.name] = String(foundColumn);
                    });
                    setMappingDialogCurrentColumnMapping(initialMapping);
                }

            } else {
                alert(`Sheet '${sheetName}' could not be read.`);
            }
        } catch (error) {
            console.error("Error parsing selected sheet:", error);
            alert("Failed to parse selected sheet.");
        }
    }
  };

  const handleMappingDialogColumnMappingChange = (schemaParamName: string, sheetColumnName: string) => {
    setMappingDialogCurrentColumnMapping(prev => ({ ...prev, [schemaParamName]: sheetColumnName }));
  };

  const handleSaveMappingSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!versionBeingMapped || !mappingDialogFileData || !currentUserId) {
        alert("Critical information missing for saving mapping.");
        return;
    }
    if (mappingDialogFileData.name.toLowerCase().endsWith('.xlsx') && mappingDialogSheetNames.length > 0 && !mappingDialogSelectedSheet) {
      alert("Please select a sheet from the Excel file for mapping.");
      return;
    }
     if (mappingDialogSheetColumnHeaders.length === 0 && mappingDialogFileData.blob.size > 0) {
        alert("No column headers could be determined from the selected file/sheet. Cannot save mapping.");
        return;
    }

    const payload: UpdateVersionMappingPayload = {
        datasetId: versionBeingMapped.datasetId,
        versionId: versionBeingMapped.version.id,
        selectedSheetName: mappingDialogFileData.name.toLowerCase().endsWith('.csv') ? null : mappingDialogSelectedSheet,
        columnMapping: mappingDialogCurrentColumnMapping,
    };
    updateVersionMappingMutation.mutate(payload);
  };

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
    if (confirm('Are you sure you want to delete this dataset and all its versions and associated files? This action cannot be undone.')) {
      deleteDatasetMutation.mutate(id);
    }
  };

  const openUploadVersionDialog = (datasetId: string) => {
    resetUploadVersionDialogState(); 
    setCurrentDatasetIdForUpload(datasetId);
    setIsUploadVersionDialogOpen(true);
  };
  
  const openMappingDialog = async (datasetId: string, version: DatasetVersion) => {
    resetMappingDialogState(); // Reset most state first
    setVersionBeingMapped({datasetId, version});
    setIsMappingDialogOpen(true);

    if (!version.storagePath) {
        alert("Error: This version does not have an associated file in storage. Cannot configure mapping.");
        setIsMappingDialogOpen(false);
        return;
    }
    
    setIsLoadingMappingData(true);
    try {
        const fileRef = storageRef(storage, version.storagePath);
        const blob = await getBlob(fileRef);
        setMappingDialogFileData({blob, name: version.fileName}); // Set file data first

        // Pre-fill column mapping from version, if exists, BEFORE parsing file
        if (version.columnMapping) {
            setMappingDialogCurrentColumnMapping(version.columnMapping);
        }
        
        await parseFileDataForMapping({blob, name: version.fileName}); // This will populate sheet names/headers

        // Pre-select sheet and trigger header parsing if an XLSX sheet was previously selected
        if(version.selectedSheetName && version.fileName.toLowerCase().endsWith('.xlsx')) {
            // Check if this sheet is still valid from parseFileDataForMapping
            if (mappingDialogSheetNames.includes(version.selectedSheetName)) {
                 setMappingDialogSelectedSheet(version.selectedSheetName);
                 await handleMappingDialogSheetSelect(version.selectedSheetName); // This will parse headers for the selected sheet
            } else {
                console.warn(`Previously selected sheet "${version.selectedSheetName}" not found in the file.`);
                 // If pre-selected sheet is no longer valid, clear the selection,
                 // but keep existing column mapping if user wants to re-map to a new sheet
                 setMappingDialogSelectedSheet('');
            }
        }
    } catch (error) {
        console.error("Error fetching or parsing file for mapping:", error);
        alert(`Failed to load file data for mapping: ${(error as Error).message}`);
        resetMappingDialogState();
        setIsMappingDialogOpen(false);
    } finally {
        setIsLoadingMappingData(false);
    }
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
    mappingDialogFileData &&
    productParametersForMapping.length > 0 &&
    (
      (mappingDialogFileData.name.toLowerCase().endsWith('.xlsx') && mappingDialogSelectedSheet && mappingDialogSheetColumnHeaders.length > 0) || 
      (mappingDialogFileData.name.toLowerCase().endsWith('.csv') && mappingDialogSheetColumnHeaders.length > 0)
    )
  );
  
  const isInitialUploadButtonDisabled = !selectedFileUpload || !currentUserId || addDatasetVersionMutation.isPending;
  
  const isSaveMappingButtonDisabled = 
    !mappingDialogFileData ||
    !versionBeingMapped ||
    !currentUserId ||
    updateVersionMappingMutation.isPending ||
    isLoadingMappingData ||
    (mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') && mappingDialogSheetNames.length > 0 && !mappingDialogSelectedSheet) ||
    (mappingDialogSheetColumnHeaders.length === 0 && mappingDialogFileData && mappingDialogFileData.blob.size > 0);

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
                        <TableCell>{version.selectedSheetName || (version.fileName.toLowerCase().endsWith('.csv') && version.columnMapping && Object.keys(version.columnMapping).length > 0 ? "CSV" : "N/A")}</TableCell>
                        <TableCell>
                          {version.columnMapping && Object.keys(version.columnMapping).length > 0 
                            ? <Badge variant="default" className="bg-green-500 hover:bg-green-600">Configured</Badge> 
                            : <Badge variant="outline">Pending</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                           <Button variant="outline" size="sm" className="mr-2" onClick={() => openMappingDialog(dataset.id, version)} disabled={!currentUserId || !version.storagePath}>
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
      
      <Dialog open={isUploadVersionDialogOpen} onOpenChange={(isOpen) => {setIsUploadVersionDialogOpen(isOpen); if(!isOpen) resetUploadVersionDialogState();}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Upload New Dataset Version</DialogTitle><DialogDescription>Select a .xlsx or .csv file to upload. Mapping will be configured separately.</DialogDescription></DialogHeader>
          <form onSubmit={handleInitialUploadSubmit} className="space-y-4 py-4">
            <div><Label htmlFor="new-version-file">Dataset File (.xlsx, .csv)</Label><Input id="new-version-file" type="file" accept=".xlsx,.csv" onChange={handleSelectedFileChangeForUpload} required /></div>
            {selectedFileUpload && (<p className="text-sm text-muted-foreground">Selected: {selectedFileUpload.name} ({(selectedFileUpload.size / (1024*1024)).toFixed(2)} MB)</p>)}
            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => {setIsUploadVersionDialogOpen(false); resetUploadVersionDialogState();}}>Cancel</Button>
              <Button type="submit" disabled={isInitialUploadButtonDisabled}>
                {addDatasetVersionMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : 'Upload File'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isMappingDialogOpen} onOpenChange={(isOpen) => {setIsMappingDialogOpen(isOpen); if(!isOpen) resetMappingDialogState();}}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Mapping for {versionBeingMapped?.version.fileName} (v{versionBeingMapped?.version.versionNumber})</DialogTitle>
            <DialogDescription>Select a sheet (for Excel) and map Product Parameters to columns from the file.</DialogDescription>
          </DialogHeader>
          {isLoadingMappingData ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-3">Loading file data for mapping...</p>
            </div>
          ) : (
            <form onSubmit={handleSaveMappingSubmit} className="space-y-4 py-4">
              <ScrollArea className="max-h-[70vh] p-1">
              <div className="space-y-4 pr-4">
                {mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') && mappingDialogSheetNames.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                     <Label htmlFor="mapping-sheet-select" className="flex items-center"><SheetIcon className="mr-2 h-4 w-4 text-green-600"/>Select Sheet</Label>
                    <Select value={mappingDialogSelectedSheet} onValueChange={handleMappingDialogSheetSelect} required={mappingDialogSheetNames.length > 0}>
                      <SelectTrigger id="mapping-sheet-select"><SelectValue placeholder="Select a sheet" /></SelectTrigger>
                      <SelectContent>
                        {mappingDialogSheetNames
                          .filter(name => name && name.trim() !== '')
                          .map((name, idx) => <SelectItem key={`map-sheet-${idx}`} value={name}>{name}</SelectItem>)
                        }
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') && mappingDialogSheetNames.length === 0 && mappingDialogFileData.blob.size > 0 && (
                  <p className="text-sm text-amber-700 pt-2 border-t">No sheets found in the Excel file. Check file.</p>
                )}

                { showMappingUIInDialog && (
                  <div className="space-y-3 pt-3 border-t">
                    <Label className="flex items-center"><LinkIcon className="mr-2 h-4 w-4 text-blue-600"/>Map Product Parameters to Columns</Label>
                    <p className="text-xs text-muted-foreground">
                      Map parameters to columns in '{mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') ? mappingDialogSelectedSheet : 'your CSV file'}'.
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
                                {mappingDialogSheetColumnHeaders
                                  .filter(col => col && col.trim() !== '')
                                  .map((col, index) => <SelectItem key={`map-col-header-${index}`} value={col}>{col}</SelectItem>)
                                }
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}
                 {((mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') && mappingDialogSelectedSheet) || (mappingDialogFileData?.name.toLowerCase().endsWith('.csv') && mappingDialogSheetColumnHeaders.length > 0)) && productParametersForMapping.length === 0 && !isLoadingProdParams && (
                   <p className="text-sm text-amber-700 pt-2 border-t">No product parameters found for mapping. Please define them in Schema Definition.</p>
                 )}
                 {mappingDialogFileData && mappingDialogSheetColumnHeaders.length === 0 && mappingDialogFileData.blob.size > 0 && 
                   ((mappingDialogFileData.name.toLowerCase().endsWith('.csv')) || (mappingDialogFileData.name.toLowerCase().endsWith('.xlsx') && mappingDialogSelectedSheet)) && (
                  <p className="text-sm text-red-600 pt-2 border-t">Could not parse headers from the file/sheet. Ensure a valid header row exists.</p>
                 )}
              </div>
              </ScrollArea>
              <DialogFooter className="pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => {setIsMappingDialogOpen(false); resetMappingDialogState();}}>Cancel</Button>
                <Button type="submit" disabled={isSaveMappingButtonDisabled}>
                  {updateVersionMappingMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving Mapping...</> : 'Save Mapping'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

