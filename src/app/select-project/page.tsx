
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building, Loader2, AlertTriangle, PlusCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useQuery, useMutation, QueryClient, QueryClientProvider, useQueryClient as useTanstackQueryClientHook } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

interface Project {
  id: string; 
  displayName: string; 
}

const fetchProjects = async (): Promise<Project[]> => {
  console.log("fetchProjects (select-project page): Attempting to fetch projects...");
  if (!db) {
    console.error("fetchProjects (select-project page): Firestore DB instance is not available.");
    throw new Error("Database not available. Check Firebase initialization.");
  }

  const usersCollectionRef = collection(db, 'users');
  console.log("fetchProjects (select-project page): Created collection reference for 'users'.");

  try {
    console.log("fetchProjects (select-project page): Calling getDocs(usersCollectionRef)...");
    const usersSnapshot = await getDocs(usersCollectionRef);
    console.log(`fetchProjects (select-project page): getDocs returned. Snapshot empty: ${usersSnapshot.empty}, size: ${usersSnapshot.size}`);

    if (usersSnapshot.empty) {
      console.warn("fetchProjects (select-project page): Firestore 'users' collection snapshot is empty.");
      return [];
    }
    const projects = usersSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        displayName: data.projectName || doc.id 
      };
    });
    console.log("fetchProjects (select-project page): Successfully mapped projects:", projects.map(p=> `${p.id} (${p.displayName})`));
    return projects.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (e: any) {
    console.error("fetchProjects (select-project page): Error during getDocs or mapping:", e);
    if (e.code) {
        console.error(`fetchProjects (select-project page): Firestore error code: ${e.code}, message: ${e.message}`);
    }
    throw new Error(`Failed to fetch projects: ${e.message}.`);
  }
};

const queryClientTanstack = new QueryClient();

function SelectProjectPageComponentInternal() {
  const [selectedProjectIdState, setSelectedProjectIdState] = useState(''); 
  const [newProjectIdInput, setNewProjectIdInput] = useState('');
  const [newProjectDisplayNameInput, setNewProjectDisplayNameInput] = useState('');
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] = useState(false);
  
  const router = useRouter();
  const tanstackQueryClientHook = useTanstackQueryClientHook(); 
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const storedAuthUid = localStorage.getItem('authenticatedUserUID');
    if (storedAuthUid) {
      setAuthUid(storedAuthUid);
    } else {
      router.push('/'); 
    }
    setIsAuthLoading(false);
  }, [router]);

  const { data: availableProjects = [], isLoading, error } = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 5 * 60 * 1000,
    enabled: !isAuthLoading && !!authUid,
  });

  const createProjectMutation = useMutation<void, Error, { projectId: string; displayName: string }>({
    mutationFn: async ({ projectId, displayName }) => {
      if (!db) throw new Error("Database not initialized.");
      if (!/^[a-zA-Z0-9_.-]+$/.test(projectId) || projectId.includes('/') || projectId === '.' || projectId === '..') {
        throw new Error("Invalid Project ID. Use only letters, numbers, underscores, hyphens, periods. Cannot contain '/' or be '.' or '..'.");
      }
      const projectDocRef = doc(db, 'users', projectId);
      await setDoc(projectDocRef, { 
        projectName: displayName,
        createdAt: serverTimestamp(),
      });
    },
    onSuccess: (_, { projectId, displayName }) => {
      toast({ title: "Project Created", description: `Project "${displayName}" (ID: ${projectId}) successfully created.` });
      tanstackQueryClientHook.invalidateQueries({ queryKey: ['projects'] });
      setSelectedProjectIdState(projectId);
      localStorage.setItem('currentUserId', projectId);
      localStorage.setItem('currentProjectDisplayName', displayName); 
      setIsCreateProjectDialogOpen(false);
      setNewProjectIdInput('');
      setNewProjectDisplayNameInput('');
      router.push('/dashboard');
    },
    onError: (creationError) => {
      toast({ title: "Error Creating Project", description: creationError.message, variant: "destructive" });
    },
  });

  const handleSelectProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProjectIdState) {
      const selectedProject = availableProjects.find(p => p.id === selectedProjectIdState);
      localStorage.setItem('currentUserId', selectedProjectIdState);
      if (selectedProject) {
        localStorage.setItem('currentProjectDisplayName', selectedProject.displayName);
      } else {
        localStorage.removeItem('currentProjectDisplayName'); // Should not happen if selection is from list
      }
      router.push('/dashboard');
    } else {
      toast({ title: "Selection Required", description: "Please select a project to continue.", variant: "destructive" });
    }
  };

  const handleCreateProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectIdInput.trim() || !newProjectDisplayNameInput.trim()) {
      toast({ title: "Project ID and Display Name Required", description: "Please enter a unique ID and a display name for the new project.", variant: "destructive" });
      return;
    }
    createProjectMutation.mutate({ projectId: newProjectIdInput.trim(), displayName: newProjectDisplayNameInput.trim() });
  };

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-headline">Select Project</CardTitle>
          <CardDescription>Choose an existing project or create a new one to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSelectProjectSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="project-select" className="text-base">Existing Projects</Label>
              {isLoading && (
                <div className="flex items-center justify-center h-12 border rounded-md bg-muted/50">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading projects...</span>
                </div>
              )}
              {error && !isLoading && (
                <div className="flex items-center justify-center h-auto border border-destructive/50 rounded-md bg-destructive/10 text-destructive p-3 text-sm">
                  <AlertTriangle className="h-5 w-5 mr-2 shrink-0" />
                  <div>
                    <p className="font-semibold">Error loading projects:</p>
                    <p>{error.message}</p>
                  </div>
                </div>
              )}
              {!isLoading && !error && (
                <Select value={selectedProjectIdState} onValueChange={setSelectedProjectIdState} required disabled={availableProjects.length === 0}>
                  <SelectTrigger id="project-select" className="h-12 text-base px-4">
                    <SelectValue placeholder={availableProjects.length === 0 ? "No projects found" : "Select an existing project..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.displayName} <span className="text-xs text-muted-foreground ml-2">(ID: {project.id})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!isLoading && !error && availableProjects.length === 0 && (
                <div className="text-xs text-muted-foreground text-left pt-2 px-1 space-y-1">
                  <p className="font-medium">No projects found. This could be due to:</p>
                  <ul className="list-disc list-inside pl-4">
                    <li>No project documents currently exist in the Firestore 'users' collection.</li>
                    <li>An incorrect Firebase project configuration. <strong>Check browser console logs.</strong></li>
                    <li>Firestore security rules preventing access to list documents in 'users'.</li>
                  </ul>
                </div>
              )}
            </div>
            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={!selectedProjectIdState || isLoading || !!error}>
              <Building className="mr-2 h-5 w-5" />
              Proceed to Selected Project
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t">
            <Dialog open={isCreateProjectDialogOpen} onOpenChange={setIsCreateProjectDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-12 text-base" onClick={() => { setNewProjectIdInput(''); setNewProjectDisplayNameInput(''); setIsCreateProjectDialogOpen(true);}}>
                  <PlusCircle className="mr-2 h-5 w-5" /> Create New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Project</DialogTitle>
                  <DialogDescription>
                    Enter a unique ID and a display name for your new project.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateProjectSubmit} className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="new-project-id">New Project ID (Immutable)</Label>
                    <Input
                      id="new-project-id"
                      value={newProjectIdInput}
                      onChange={(e) => setNewProjectIdInput(e.target.value)}
                      placeholder="e.g., my_project_alpha"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Allowed: letters, numbers, underscores, hyphens, periods. No spaces or slashes. This ID cannot be changed later.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="new-project-display-name">Project Display Name</Label>
                    <Input
                      id="new-project-display-name"
                      value={newProjectDisplayNameInput}
                      onChange={(e) => setNewProjectDisplayNameInput(e.target.value)}
                      placeholder="e.g., My Awesome Project"
                      required
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => {setIsCreateProjectDialogOpen(false); setNewProjectIdInput(''); setNewProjectDisplayNameInput('');}}>Cancel</Button>
                    <Button type="submit" disabled={createProjectMutation.isPending || !newProjectIdInput.trim() || !newProjectDisplayNameInput.trim()}>
                      {createProjectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create & Proceed
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Each project represents a distinct workspace for your evaluations.
      </p>
    </div>
  );
}

export default function SelectProjectPage() {
  return (
    <QueryClientProvider client={queryClientTanstack}>
      <SelectProjectPageComponentInternal />
    </QueryClientProvider>
  );
}
    