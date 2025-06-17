
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
import { PlusCircle, Edit2, Trash2, Database, FileUp, Download, Eye, FileSpreadsheet, AlertTriangle, SheetIcon, Settings2, LinkIcon, Loader2, CheckSquare } from "lucide-react";
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
import type { EvalParameterForPrompts as EvaluationParameterForMapping } from '@/app/(app)/prompts/page'; // Re-using from prompts for now
import { toast } from '@/hooks/use-toast';

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
  columnMapping?: Record<string, string>; // Input param name -> Sheet column name
  groundTruthMapping?: Record<string, string>; // Eval param ID -> Sheet column name
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
type NewDatasetVersionFirestoreData = Omit<DatasetVersion, 'id' | 'createdAt' | 'selectedSheetName' | 'columnMapping' | 'groundTruthMapping'> & { createdAt: FieldValue };
type UpdateVersionMappingPayload = { datasetId: string; versionId: string; selectedSheetName: string | null; columnMapping: Record<string, string>; groundTruthMapping: Record<string, string> };

interface InputParameterForMapping {
  id: string;
  name: string;
}

const UNMAP_VALUE = "__[NONE]__"; // Special value for "Do Not Map" options


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

const fetchInputParametersForMapping = async (userId: string | null): Promise<InputParameterForMapping[]> => {
  if (!userId) return [];
  const paramsCollectionRef = collection(db, 'users', userId, 'inputParameters');
  const paramsQuery = query(paramsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(paramsQuery);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    name: docSnap.data().name as string,
  }));
};

// Fetch Evaluation Parameters for Ground Truth Mapping
const fetchEvaluationParametersForGtMapping = async (userId: string | null): Promise<EvaluationParameterForMapping[]> => {
  if (!userId) return [];
  const evalParamsCollectionRef = collection(db, 'users', userId, 'evaluationParameters');
  const q = query(evalParamsCollectionRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name || 'Unnamed Eval Param',
      definition: data.definition || '', // Not strictly needed for mapping but good for consistency
      // categorizationLabels and requiresRationale not needed for mapping UI here
    };
  });
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

  const { data: inputParametersForMapping = [], isLoading: isLoadingInputParams } = useQuery<InputParameterForMapping[], Error>({
    queryKey: ['inputParametersForMapping', currentUserId],
    queryFn: () => fetchInputParametersForMapping(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const { data: evaluationParametersForGtMapping = [], isLoading: isLoadingEvalParamsForGt } = useQuery<EvaluationParameterForMapping[], Error>({
    queryKey: ['evaluationParametersForGtMapping', currentUserId],
    queryFn: () => fetchEvaluationParametersForGtMapping(currentUserId),
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
  const [mappingDialogCurrentGtMapping, setMappingDialogCurrentGtMapping] = useState<Record<string, string>>({});


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
          } catch (storageError: any) {
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
      toast({ title: "Error", description: `Failed to delete dataset: ${error.message}. Check console for details.`, variant: "destructive"});
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
      toast({ title: "Upload Error", description: `Failed to upload version: ${error.message}. Check console.`, variant: "destructive"});
      console.error("Error in addDatasetVersionMutation:", error);
    }
  });

  const updateVersionMappingMutation = useMutation<void, Error, UpdateVersionMappingPayload>({
    mutationFn: async ({ datasetId, versionId, selectedSheetName, columnMapping, groundTruthMapping }) => {
      if (!currentUserId) throw new Error("User not identified for updating mapping.");
      const versionDocRef = doc(db, 'users', currentUserId, 'datasets', datasetId, 'versions', versionId);
      await updateDoc(versionDocRef, { selectedSheetName, columnMapping, groundTruthMapping });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', currentUserId] });
      setIsMappingDialogOpen(false);
    },
    onError: (error) => {
      console.error("Error updating version mapping:", error);
      toast({ title: "Mapping Error", description: `Failed to update mapping: ${error.message}`, variant: "destructive"});
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

  const handleMappingDialogSheetSelect = async (newSheetName: string, directBlobForExcel?: Blob, directFileNameForExcel?: string) => {
    setMappingDialogSelectedSheet(newSheetName);
    setMappingDialogSheetColumnHeaders([]); 

    const blobToUse = directBlobForExcel || mappingDialogFileData?.blob;
    const fileNameToUse = directFileNameForExcel || mappingDialogFileData?.name;

    if (blobToUse && fileNameToUse && fileNameToUse.toLowerCase().endsWith('.xlsx') && newSheetName) {
        try {
            const arrayBuffer = await blobToUse.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const worksheet = workbook.Sheets[newSheetName];
            if (worksheet) {
                const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: null });
                const rawHeaders = jsonData[0] || [];
                const actualRawHeaders = Array.isArray(rawHeaders) ? rawHeaders : [];
                const headers = actualRawHeaders.map(header => String(header ?? "").trim()).filter(h => h !== '');
                
                setMappingDialogSheetColumnHeaders(headers);

                if (headers.length === 0 && actualRawHeaders.length > 0) {
                    toast({title: "Excel Parsing", description: `Sheet '${newSheetName}' has a header row, but no valid column names found or all are empty.`, variant: "default"});
                } else if (headers.length === 0) {
                     toast({title: "Excel Parsing", description: `Sheet '${newSheetName}' appears to be empty or has no header row.`, variant: "default"});
                }
                
                // Use current version's mappings if available, otherwise attempt auto-map
                const currentVersionMapping = versionBeingMapped?.version.columnMapping || {};
                const currentVersionGtMapping = versionBeingMapped?.version.groundTruthMapping || {};

                if (Object.keys(currentVersionMapping).length === 0 && headers.length > 0) {
                    const initialMapping: Record<string, string> = {};
                    inputParametersForMapping.forEach(param => {
                        const foundColumn = headers.find(h => String(h).toLowerCase() === param.name.toLowerCase());
                        if (foundColumn) initialMapping[param.name] = String(foundColumn);
                    });
                    setMappingDialogCurrentColumnMapping(initialMapping);
                }
                if (Object.keys(currentVersionGtMapping).length === 0 && headers.length > 0) {
                    const initialGtMapping: Record<string, string> = {};
                    evaluationParametersForGtMapping.forEach(evalParam => {
                        const foundColumn = headers.find(h => String(h).toLowerCase() === evalParam.name.toLowerCase());
                        if (foundColumn) initialGtMapping[evalParam.id] = String(foundColumn);
                    });
                    setMappingDialogCurrentGtMapping(initialGtMapping);
                }
            } else {
                toast({title: "Excel Parsing Error", description: `Sheet '${newSheetName}' could not be read.`, variant: "destructive"});
            }
        } catch (error) {
            console.error("Error parsing selected sheet:", error);
            toast({title: "Excel Parsing Error", description: "Failed to parse selected sheet.", variant: "destructive"});
        }
    }
  };

  const handleMappingDialogColumnMappingChange = (schemaParamName: string, selectedValueFromDropdown: string | undefined) => {
    setMappingDialogCurrentColumnMapping(prev => {
        const newMapping = { ...prev };
        if (selectedValueFromDropdown === undefined || selectedValueFromDropdown === UNMAP_VALUE) {
            delete newMapping[schemaParamName];
        } else {
            const selectedIndex = parseInt(selectedValueFromDropdown, 10);
            if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < mappingDialogSheetColumnHeaders.length) {
                 newMapping[schemaParamName] = mappingDialogSheetColumnHeaders[selectedIndex];
            } else {
                 delete newMapping[schemaParamName]; 
            }
        }
        return newMapping;
    });
  };

  const handleMappingDialogGtMappingChange = (evalParamId: string, selectedValueFromDropdown: string | undefined) => {
    setMappingDialogCurrentGtMapping(prev => {
        const newMapping = { ...prev };
        if (selectedValueFromDropdown === undefined || selectedValueFromDropdown === UNMAP_VALUE) {
            delete newMapping[evalParamId];
        } else {
            const selectedIndex = parseInt(selectedValueFromDropdown, 10);
            if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < mappingDialogSheetColumnHeaders.length) {
                newMapping[evalParamId] = mappingDialogSheetColumnHeaders[selectedIndex];
            } else {
                delete newMapping[evalParamId];
            }
        }
        return newMapping;
    });
  };


  const handleSaveMappingSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!versionBeingMapped || !mappingDialogFileData || !currentUserId) {
        toast({title: "Mapping Save Error", description: "Critical information missing for saving mapping.", variant: "destructive"});
        return;
    }
    if (mappingDialogFileData.name.toLowerCase().endsWith('.xlsx') && mappingDialogSheetNames.length > 0 && !mappingDialogSelectedSheet) {
      toast({title: "Mapping Save Error", description: "Please select a sheet from the Excel file for mapping.", variant: "destructive"});
      return;
    }
     if (mappingDialogSheetColumnHeaders.length === 0 && mappingDialogFileData.blob.size > 0 && (mappingDialogFileData.name.toLowerCase().endsWith('.csv') || (mappingDialogFileData.name.toLowerCase().endsWith('.xlsx') && mappingDialogSelectedSheet))) {
        toast({title: "Mapping Save Error", description: "No column headers could be determined from the selected file/sheet. Cannot save mapping.", variant: "destructive"});
        return;
    }

    const payload: UpdateVersionMappingPayload = {
        datasetId: versionBeingMapped.datasetId,
        versionId: versionBeingMapped.version.id,
        selectedSheetName: mappingDialogFileData.name.toLowerCase().endsWith('.csv') ? null : mappingDialogSelectedSheet,
        columnMapping: mappingDialogCurrentColumnMapping,
        groundTruthMapping: mappingDialogCurrentGtMapping,
    };
    updateVersionMappingMutation.mutate(payload);
  };

  const handleDatasetSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !datasetName.trim()) {
      toast({title: "Validation Error", description: "Dataset Name is required.", variant: "destructive"});
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
    setVersionBeingMapped({datasetId, version});
    setIsMappingDialogOpen(true);
    
    setMappingDialogFileData(null);
    setMappingDialogSheetNames([]);
    setMappingDialogSelectedSheet('');
    setMappingDialogSheetColumnHeaders([]); 

    setMappingDialogCurrentColumnMapping(version.columnMapping || {});
    setMappingDialogCurrentGtMapping(version.groundTruthMapping || {});

    if (!version.storagePath) {
        toast({ title: "Mapping Error", description: "This version does not have an associated file in storage. Cannot configure mapping.", variant: "destructive"});
        setIsMappingDialogOpen(false);
        return;
    }

    setIsLoadingMappingData(true);
    try {
        const fileRef = storageRef(storage, version.storagePath);
        const blob = await getBlob(fileRef);
        const localFileData = {blob, name: version.fileName};
        setMappingDialogFileData(localFileData); 

        if (localFileData.name.toLowerCase().endsWith('.xlsx')) {
            const arrayBuffer = await localFileData.blob.arrayBuffer(); 
            const workbookForSheetNames = XLSX.read(arrayBuffer, { type: 'array', sheets: 0, bookFiles: false, bookProps: false, bookDeps: false, bookSheets: false, sheetStubs: true });
            const filteredSheetNames = workbookForSheetNames.SheetNames.map(name => String(name).trim()).filter(name => name !== '');
            setMappingDialogSheetNames(filteredSheetNames);

            let sheetNameToLoadHeadersFor = version.selectedSheetName;
            if (!sheetNameToLoadHeadersFor && filteredSheetNames.length === 1) {
                sheetNameToLoadHeadersFor = filteredSheetNames[0]; 
            }
            
            if (sheetNameToLoadHeadersFor && filteredSheetNames.includes(sheetNameToLoadHeadersFor)) {
                setMappingDialogSelectedSheet(sheetNameToLoadHeadersFor);
                await handleMappingDialogSheetSelect(sheetNameToLoadHeadersFor, localFileData.blob, localFileData.name);
            } else if (filteredSheetNames.length > 0 && version.selectedSheetName && !filteredSheetNames.includes(version.selectedSheetName)) {
                console.warn(`Previously selected sheet "${version.selectedSheetName}" not found in the file. Clearing selection.`);
                toast({title: "Sheet Not Found", description: `Previously selected sheet "${version.selectedSheetName}" not found in the file. Please re-select.`, variant: "default"});
                setMappingDialogSelectedSheet('');
                setMappingDialogSheetColumnHeaders([]);
            } else if (filteredSheetNames.length === 0 && localFileData.blob.size > 0) {
                toast({ title: "Excel File Error", description: "The selected Excel file contains no valid sheet names or no sheets.", variant: "warning"});
                setMappingDialogSheetColumnHeaders([]);
            }
        } else if (localFileData.name.toLowerCase().endsWith('.csv')) {
            const text = await localFileData.blob.text();
            const lines = text.split(/\r\n|\n|\r/);
            if (lines.length > 0 && lines[0].trim() !== '') {
                const csvHeaders = lines[0].split(',').map(h => String(h.replace(/^"|"$/g, '').trim())).filter(h => h !== '');
                setMappingDialogSheetColumnHeaders(csvHeaders);
                 if (csvHeaders.length === 0) { toast({ title: "CSV Parsing", description: "CSV file has a header row, but no valid column names could be extracted or all are empty.", variant: "warning" }); }

                const currentVersionMapping = version.columnMapping || {};
                const currentVersionGtMapping = version.groundTruthMapping || {};
                
                if (Object.keys(currentVersionMapping).length === 0 && csvHeaders.length > 0 && inputParametersForMapping.length > 0) {
                    const initialMapping: Record<string, string> = {};
                    inputParametersForMapping.forEach(param => {
                        const foundColumn = csvHeaders.find(h => String(h).toLowerCase() === param.name.toLowerCase());
                        if (foundColumn) initialMapping[param.name] = String(foundColumn);
                    });
                    setMappingDialogCurrentColumnMapping(initialMapping);
                }
                if (Object.keys(currentVersionGtMapping).length === 0 && csvHeaders.length > 0 && evaluationParametersForGtMapping.length > 0) {
                     const initialGtMapping: Record<string, string> = {};
                     evaluationParametersForGtMapping.forEach(evalParam => {
                         const foundColumn = csvHeaders.find(h => String(h).toLowerCase() === evalParam.name.toLowerCase());
                         if (foundColumn) initialGtMapping[evalParam.id] = String(foundColumn);
                     });
                     setMappingDialogCurrentGtMapping(initialGtMapping);
                }
            } else {
                 toast({ title: "CSV Parsing", description: "CSV file appears to be empty or has no header row.", variant: "warning"});
                 setMappingDialogSheetColumnHeaders([]);
            }
        }
    } catch (error) {
        console.error("Error fetching or parsing file for mapping:", error);
        toast({title: "File Load Error", description: `Failed to load file data for mapping: ${(error as Error).message}`, variant: "destructive"});
        setIsMappingDialogOpen(false); 
    } finally {
        setIsLoadingMappingData(false);
    }
  };


  const handleCreateNewDatasetClick = () => {
    if (!currentUserId) {
      toast({title: "Login Required", description: "Please log in to create a dataset.", variant: "destructive"});
      return;
    }
    resetDatasetForm();
    setIsDatasetDialogOpen(true);
  };

  const showInputParamMappingUI = (
    mappingDialogFileData &&
    inputParametersForMapping.length > 0 &&
    (
      (mappingDialogFileData.name.toLowerCase().endsWith('.xlsx') && mappingDialogSelectedSheet && mappingDialogSheetColumnHeaders.length > 0) ||
      (mappingDialogFileData.name.toLowerCase().endsWith('.csv') && mappingDialogSheetColumnHeaders.length > 0)
    )
  );

  const showGtParamMappingUI = (
    mappingDialogFileData &&
    evaluationParametersForGtMapping.length > 0 &&
    (
      (mappingDialogFileData.name.toLowerCase().endsWith('.xlsx') && mappingDialogSelectedSheet && mappingDialogSheetColumnHeaders.length > 0) ||
      (mappingDialogFileData.name.toLowerCase().endsWith('.csv') && mappingDialogSheetColumnHeaders.length > 0)
    )
  );


  const isInitialUploadButtonDisabled = !selectedFileUpload || !currentUserId || addDatasetVersionMutation.isPending;

  const isSaveMappingButtonDisabled = !!(
    !mappingDialogFileData ||
    !versionBeingMapped ||
    !currentUserId ||
    updateVersionMappingMutation.isPending ||
    isLoadingMappingData ||
    (mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') && mappingDialogSheetNames.length > 0 && !mappingDialogSelectedSheet) ||
    (mappingDialogSheetColumnHeaders.length === 0 && mappingDialogFileData && mappingDialogFileData.blob.size > 0 && (mappingDialogFileData.name.toLowerCase().endsWith('.csv') || (mappingDialogFileData.name.toLowerCase().endsWith('.xlsx') && mappingDialogSelectedSheet)))
  );


  if (isLoadingUserId || (isLoadingDatasets && currentUserId) || (isLoadingInputParams && currentUserId) || (isLoadingEvalParamsForGt && currentUserId)) {
    return <div className="space-y-6 p-4 md:p-0"><Card><CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-full sm:w-56" /></CardContent></Card></div>;
  }
  if (fetchDatasetsError) {
    return <Card className="m-4 md:m-0"><CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2"/>Error</CardTitle></CardHeader><CardContent><p>{fetchDatasetsError.message}</p></CardContent></Card>;
  }

  return (
    <div className="space-y-6 p-4 md:p-0">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3"><Database className="h-7 w-7 text-primary" />
            <div><CardTitle className="text-xl md:text-2xl font-headline">Dataset Management</CardTitle><CardDescription>Upload, version, and manage your datasets. Map columns to Input Parameters and optionally to Evaluation Parameters for Ground Truth.</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent>
           <Dialog open={isDatasetDialogOpen} onOpenChange={(isOpen) => { setIsDatasetDialogOpen(isOpen); if(!isOpen) resetDatasetForm();}}>
             <DialogTrigger asChild>
                <Button onClick={handleCreateNewDatasetClick} disabled={!currentUserId || addDatasetMutation.isPending || updateDatasetMutation.isPending} className="w-full sm:w-auto">
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
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <div><CardTitle className="text-lg md:text-xl">{dataset.name}</CardTitle><CardDescription className="mb-1">{dataset.description || "No description."}</CardDescription></div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                 <Button variant="outline" size="sm" onClick={() => openEditDatasetDialog(dataset)} disabled={!currentUserId} className="w-full sm:w-auto"><Edit2 className="h-4 w-4 mr-2" /> Edit Info</Button>
                 <Button size="sm" onClick={() => openUploadVersionDialog(dataset.id)} disabled={!currentUserId} className="w-full sm:w-auto"><FileUp className="mr-2 h-4 w-4" /> Upload New Version</Button>
                 <Button variant="destructive" size="sm" onClick={() => handleDeleteDataset(dataset.id)} disabled={!currentUserId || (deleteDatasetMutation.isPending && deleteDatasetMutation.variables === dataset.id)} className="w-full sm:w-auto"><Trash2 className="h-4 w-4 mr-2" /> Delete Dataset</Button>
              </div>
            </CardHeader>
            <CardContent>
              {dataset.versions.length === 0 ? (<p className="text-sm text-muted-foreground">No versions uploaded.</p>) : (
                <Table className="table-fixed">
                  <TableHeader><TableRow>
                    <TableHead className="w-[60px] sm:w-[80px]">Ver.</TableHead>
                    <TableHead className="w-2/5 sm:w-1/3">File Name</TableHead>
                    <TableHead className="hidden sm:table-cell w-1/5">Date</TableHead>
                    <TableHead className="hidden md:table-cell w-[100px]">Size</TableHead>
                    <TableHead className="w-1/5 sm:w-[100px]">Source</TableHead>
                    <TableHead className="w-[100px] sm:w-[120px]">Mapping</TableHead>
                    <TableHead className="text-right w-[90px] sm:w-auto">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {dataset.versions.map((version) => (
                      <TableRow key={version.id} className="hover:bg-muted/50">
                        <TableCell><Badge variant="secondary">v{version.versionNumber}</Badge></TableCell>
                        <TableCell className="font-medium truncate max-w-[100px] sm:max-w-xs" title={version.fileName}>{version.fileName}</TableCell>
                        <TableCell className="hidden sm:table-cell truncate" title={version.uploadDate}>{version.uploadDate}</TableCell>
                        <TableCell className="hidden md:table-cell truncate" title={version.size}>{version.size}</TableCell>
                        <TableCell className="truncate max-w-[80px] sm:max-w-[100px]" title={version.selectedSheetName || (version.fileName.toLowerCase().endsWith('.csv') && version.columnMapping && Object.keys(version.columnMapping).length > 0 ? "CSV" : "N/A")}>
                          {version.selectedSheetName || (version.fileName.toLowerCase().endsWith('.csv') && version.columnMapping && Object.keys(version.columnMapping).length > 0 ? "CSV" : "N/A")}
                        </TableCell>
                        <TableCell>
                          {(version.columnMapping && Object.keys(version.columnMapping).length > 0) || (version.groundTruthMapping && Object.keys(version.groundTruthMapping).length > 0)
                            ? <Badge variant="default" className="bg-green-500 hover:bg-green-600">Configured</Badge>
                            : <Badge variant="destructive">Pending</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-1">
                               <Button variant="outline" size="sm" onClick={() => openMappingDialog(dataset.id, version)} disabled={!currentUserId || !version.storagePath} className="w-full sm:w-auto">
                                 <Settings2 className="h-4 w-4 mr-0 sm:mr-1"/> <span className="hidden sm:inline">{ (version.columnMapping && Object.keys(version.columnMapping).length > 0) || (version.groundTruthMapping && Object.keys(version.groundTruthMapping).length > 0) ? "Edit Map" : "Set Map"}</span>
                               </Button>
                               <Button variant="ghost" size="icon" className="hidden" title="Review Data (Not Implemented)"><Eye className="h-4 w-4" /></Button>
                               <Button variant="ghost" size="icon" className="hidden" title="Download Version (Not Implemented)"><Download className="h-4 w-4" /></Button>
                           </div>
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
        <DialogContent className="sm:max-w-2xl flex flex-col max-h-[85vh] p-0">
          <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
            <DialogTitle>Configure Mapping for {versionBeingMapped?.version.fileName} (v{versionBeingMapped?.version.versionNumber})</DialogTitle>
            <DialogDescription>Select a sheet (for Excel) and map Input Parameters to columns, and optionally Evaluation Parameters to Ground Truth columns.</DialogDescription>
          </DialogHeader>
          {isLoadingMappingData ? (
             <div className="flex-grow flex items-center justify-center p-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-3">Loading file data for mapping...</p>
            </div>
          ) : (
            <>
              <div className="flex-grow overflow-y-auto p-6">
                <form id="mapping-dialog-form" onSubmit={handleSaveMappingSubmit} className="space-y-4">
                  <div className="space-y-6">
                    {mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') && mappingDialogSheetNames.length > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                         <Label htmlFor="mapping-sheet-select" className="flex items-center"><SheetIcon className="mr-2 h-4 w-4 text-green-600"/>Select Sheet</Label>
                        <Select value={mappingDialogSelectedSheet} onValueChange={(value) => handleMappingDialogSheetSelect(value)} required={mappingDialogSheetNames.length > 0}>
                          <SelectTrigger id="mapping-sheet-select"><SelectValue placeholder="Select a sheet" /></SelectTrigger>
                          <SelectContent>
                            {mappingDialogSheetNames
                              .filter(name => name && String(name).trim() !== '')
                              .map((name, idx) => <SelectItem key={`map-sheet-${idx}`} value={name}>{name}</SelectItem>)
                            }
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') && mappingDialogSheetNames.length === 0 && mappingDialogFileData.blob.size > 0 && (
                      <p className="text-sm text-amber-700 pt-2 border-t">No sheets found in the Excel file. Check file.</p>
                    )}

                    { showInputParamMappingUI && (
                      <div className="space-y-3 pt-3 border-t">
                        <Label className="flex items-center"><LinkIcon className="mr-2 h-4 w-4 text-blue-600"/>Map Input Parameters to File Columns</Label>
                        <p className="text-xs text-muted-foreground">
                          Map parameters to columns in '{mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') ? mappingDialogSelectedSheet : 'your CSV file'}'. These are inputs to your model.
                        </p>
                        <Card className="p-4 bg-muted/30 max-h-60 overflow-y-auto">
                           <div className="space-y-3">
                            {inputParametersForMapping.map(param => {
                               const currentMappedColumnName = mappingDialogCurrentColumnMapping[param.name];
                               const selectedIndex = currentMappedColumnName !== undefined
                                 ? mappingDialogSheetColumnHeaders.findIndex(header => header === currentMappedColumnName)
                                 : -1;
                              return (
                                <div key={param.id} className="grid grid-cols-2 gap-2 items-center">
                                  <Label htmlFor={`map-dialog-${param.id}`} className="text-sm font-medium truncate" title={param.name}>{param.name}:</Label>
                                  <Select
                                    value={selectedIndex !== -1 ? selectedIndex.toString() : UNMAP_VALUE}
                                    onValueChange={(value) => handleMappingDialogColumnMappingChange(param.name, value)}
                                  >
                                    <SelectTrigger id={`map-dialog-${param.id}`} className="h-9 text-xs">
                                      <SelectValue placeholder="Select column" />
                                    </SelectTrigger>
                                    <SelectContent>
                                       <SelectItem value={UNMAP_VALUE}>-- Do Not Map --</SelectItem>
                                      {mappingDialogSheetColumnHeaders
                                        .filter(col => col && String(col).trim() !== '')
                                        .map((col, index) => <SelectItem key={`map-col-header-${index}`} value={index.toString()}>{col}</SelectItem>)
                                      }
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })}
                          </div>
                        </Card>
                      </div>
                    )}
                     {((mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') && mappingDialogSelectedSheet) || (mappingDialogFileData?.name.toLowerCase().endsWith('.csv') && mappingDialogSheetColumnHeaders.length > 0)) && inputParametersForMapping.length === 0 && !isLoadingInputParams && (
                       <p className="text-sm text-amber-700 pt-2 border-t">No input parameters found for mapping. Please define them in Input Parameter Schema.</p>
                     )}

                    {/* Ground Truth Mapping Section */}
                    { showGtParamMappingUI && (
                      <div className="space-y-3 pt-3 border-t">
                        <Label className="flex items-center"><CheckSquare className="mr-2 h-4 w-4 text-green-600"/>Map Evaluation Parameters to Ground Truth Columns (Optional)</Label>
                         <p className="text-xs text-muted-foreground">
                          For "Ground Truth Runs", map Evaluation Parameters to columns in your file that contain the correct/expected labels.
                        </p>
                        <Card className="p-4 bg-muted/30 max-h-60 overflow-y-auto">
                           <div className="space-y-3">
                            {evaluationParametersForGtMapping.map(evalParam => {
                              const currentMappedGtColumnName = mappingDialogCurrentGtMapping[evalParam.id];
                              const selectedGtIndex = currentMappedGtColumnName !== undefined
                                ? mappingDialogSheetColumnHeaders.findIndex(header => header === currentMappedGtColumnName)
                                : -1;
                              return (
                                <div key={`gt-${evalParam.id}`} className="grid grid-cols-2 gap-2 items-center">
                                  <Label htmlFor={`gt-map-dialog-${evalParam.id}`} className="text-sm font-medium truncate" title={evalParam.name}>{evalParam.name}:</Label>
                                  <Select
                                    value={selectedGtIndex !== -1 ? selectedGtIndex.toString() : UNMAP_VALUE}
                                    onValueChange={(value) => handleMappingDialogGtMappingChange(evalParam.id, value)}
                                  >
                                    <SelectTrigger id={`gt-map-dialog-${evalParam.id}`} className="h-9 text-xs">
                                      <SelectValue placeholder="Select GT column" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={UNMAP_VALUE}>-- Do Not Map --</SelectItem>
                                      {mappingDialogSheetColumnHeaders
                                        .filter(col => col && String(col).trim() !== '')
                                        .map((col, index) => <SelectItem key={`gt-map-col-header-${index}`} value={index.toString()}>{col}</SelectItem>)
                                      }
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })}
                          </div>
                        </Card>
                      </div>
                    )}
                    {((mappingDialogFileData?.name.toLowerCase().endsWith('.xlsx') && mappingDialogSelectedSheet) || (mappingDialogFileData?.name.toLowerCase().endsWith('.csv') && mappingDialogSheetColumnHeaders.length > 0)) && evaluationParametersForGtMapping.length === 0 && !isLoadingEvalParamsForGt && (
                       <p className="text-sm text-amber-700 pt-2 border-t">No evaluation parameters found for ground truth mapping. Please define them in Evaluation Parameters.</p>
                     )}


                     {mappingDialogFileData && mappingDialogSheetColumnHeaders.length === 0 && mappingDialogFileData.blob.size > 0 &&
                       ((mappingDialogFileData.name.toLowerCase().endsWith('.csv')) || (mappingDialogFileData.name.toLowerCase().endsWith('.xlsx') && mappingDialogSelectedSheet)) && (
                      <p className="text-sm text-red-600 pt-2 border-t">Could not parse headers from the file/sheet. Ensure a valid header row exists.</p>
                     )}
                  </div>
                </form>
              </div>
              <DialogFooter className="p-6 pt-4 border-t flex-shrink-0">
                <Button type="button" variant="outline" onClick={() => {setIsMappingDialogOpen(false); resetMappingDialogState();}}>Cancel</Button>
                <Button type="submit" form="mapping-dialog-form" disabled={isSaveMappingButtonDisabled}>
                  {updateVersionMappingMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving Mapping...</> : 'Save Mapping'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

