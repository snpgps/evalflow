
'use client';

import { useState, type ChangeEvent, type FormEvent, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlusCircle, Edit2, Trash2, Database, FileUp, Download, Eye, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase';
import { 
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, 
  query, orderBy, writeBatch, type Timestamp, type FieldValue 
} from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

// Interfaces for data structure
interface DatasetVersion {
  id: string; // Firestore document ID
  versionNumber: number;
  fileName: string;
  uploadDate: string; // ISO String
  size: string; // e.g. "2.5MB"
  records: number;
  createdAt?: Timestamp; // Firestore Timestamp
}

interface Dataset {
  id: string; // Firestore document ID
  name: string;
  description: string;
  versions: DatasetVersion[];
  productSchemaId: string; 
  createdAt?: Timestamp; // Firestore Timestamp
}

// Type for new dataset data (without id, versions, createdAt)
type NewDatasetData = Omit<Dataset, 'id' | 'versions' | 'createdAt'> & { createdAt: FieldValue };
// Type for dataset update payload
type DatasetUpdatePayload = { id: string } & Partial<Omit<Dataset, 'id' | 'versions' | 'createdAt'>>;

// Type for new dataset version data
type NewDatasetVersionData = Omit<DatasetVersion, 'id' | 'createdAt'> & { createdAt: FieldValue };


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

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isDatasetDialogOpen, setIsDatasetDialogOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  
  const [datasetName, setDatasetName] = useState('');
  const [datasetDescription, setDatasetDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentDatasetIdForUpload, setCurrentDatasetIdForUpload] = useState<string | null>(null);


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
      
      // Delete all versions in the subcollection first
      const versionsCollectionRef = collection(db, 'users', currentUserId, 'datasets', datasetIdToDelete, 'versions');
      const versionsSnapshot = await getDocs(versionsCollectionRef);
      const batch = writeBatch(db);
      versionsSnapshot.docs.forEach(versionDoc => {
        batch.delete(versionDoc.ref);
      });
      await batch.commit();

      // Then delete the dataset document
      const datasetDocRef = doc(db, 'users', currentUserId, 'datasets', datasetIdToDelete);
      await deleteDoc(datasetDocRef);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', currentUserId] });
    },
  });

  const addDatasetVersionMutation = useMutation<void, Error, { datasetId: string; versionData: NewDatasetVersionData }>({
    mutationFn: async ({ datasetId, versionData }) => {
      if (!currentUserId) throw new Error("User not identified for adding version.");
      await addDoc(collection(db, 'users', currentUserId, 'datasets', datasetId, 'versions'), versionData);
    },
    onSuccess: _ => {
      queryClient.invalidateQueries({queryKey: ['datasets', currentUserId]});
      setSelectedFile(null);
      setIsUploadDialogOpen(false);
      setCurrentDatasetIdForUpload(null);
    }
  });


  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUploadSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !currentDatasetIdForUpload || !currentUserId) return;

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
      records: 0, // Placeholder, actual parsing not implemented here
      createdAt: serverTimestamp(),
    };
    
    addDatasetVersionMutation.mutate({ datasetId: currentDatasetIdForUpload, versionData: newVersionData });
  };
  
  const handleDatasetSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !datasetName.trim()) {
      alert("Dataset name is required.");
      return;
    }

    if (editingDataset) {
      const payload: DatasetUpdatePayload = {
        id: editingDataset.id,
        name: datasetName.trim(),
        description: datasetDescription.trim(),
        // productSchemaId is not editable in this dialog for simplicity
      };
      updateDatasetMutation.mutate(payload);
    } else {
      const newDataset: NewDatasetData = {
        name: datasetName.trim(),
        description: datasetDescription.trim(),
        productSchemaId: 'temp-schema-id', // Placeholder
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

  if (isLoadingUserId || (isLoadingDatasets && currentUserId)) {
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
              <CardDescription>Upload, version, and manage your datasets. Ensure columns map to your defined product parameters.</CardDescription>
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
                {/* Future: Select Product Parameter Schema */}
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{dataset.name}</CardTitle>
                <CardDescription>{dataset.description}</CardDescription>
              </div>
              <div className="flex gap-2">
                 <Button variant="outline" size="sm" onClick={() => openEditDatasetDialog(dataset)} disabled={!currentUserId || updateDatasetMutation.isPending}>
                    <Edit2 className="h-4 w-4 mr-2" /> Edit Info
                  </Button>
                <Button size="sm" onClick={() => openUploadDialog(dataset.id)} disabled={!currentUserId || addDatasetVersionMutation.isPending}>
                  <FileUp className="mr-2 h-4 w-4" /> Upload New Version
                </Button>
                 <Button variant="destructiveOutline" size="sm" onClick={() => handleDeleteDataset(dataset.id)} disabled={!currentUserId || deleteDatasetMutation.isPending && deleteDatasetMutation.variables === dataset.id}>
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
                        <TableCell><Badge variant="secondary">v{version.versionNumber}</Badge></TableCell>
                        <TableCell className="font-medium">{version.fileName}</TableCell>
                        <TableCell>{version.uploadDate}</TableCell>
                        <TableCell>{version.size}</TableCell>
                        <TableCell>{version.records.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                           <Button variant="ghost" size="icon" className="mr-2" title="Review Schema/Sample (Not Implemented)">
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
      
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload New Dataset Version</DialogTitle>
            <DialogDescription>
              Upload an Excel (XLSX) or CSV file. Ensure columns match the defined product parameters. File content is not processed/stored in this demo.
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
            <p className="text-xs text-muted-foreground">Note: Record count will be set to 0. Actual file parsing is not implemented.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsUploadDialogOpen(false)}>Cancel</Button>
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


    

    