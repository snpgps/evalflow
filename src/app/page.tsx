
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building, Loader2, AlertTriangle, PlusCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useQuery, useMutation, QueryClient, QueryClientProvider, useQueryClient as useTanstackQueryClientHook } from '@tanstack/react-query';

interface Project {
  id: string;
  name: string;
}

const fetchProjects = async (): Promise<Project[]> => {
  console.log("fetchProjects: Attempting to fetch projects...");
  if (!db) {
    console.error("fetchProjects: Firestore DB instance is not available. Firebase might not have initialized correctly. Check src/lib/firebase.ts logs.");
    throw new Error("Database not available. Check Firebase initialization.");
  }

  try {
    const actualProjectId = db.app.options.projectId;
    console.log(`fetchProjects: Firestore instance is configured for project ID: ${actualProjectId}`);
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== actualProjectId) {
        console.warn(`fetchProjects: Mismatch! Environment NEXT_PUBLIC_FIREBASE_PROJECT_ID is ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}, but Firestore instance is using ${actualProjectId}. Ensure your .env.local is correct and the build picked it up.`);
    }
  } catch (e) {
    console.warn("fetchProjects: Could not retrieve projectId from db instance options.", e);
  }

  const usersCollectionRef = collection(db, 'users');
  console.log("fetchProjects: Created collection reference for 'users'.");

  try {
    console.log("fetchProjects: Calling getDocs(usersCollectionRef)...");
    const usersSnapshot = await getDocs(usersCollectionRef);
    console.log(`fetchProjects: getDocs returned. Snapshot empty: ${usersSnapshot.empty}, size: ${usersSnapshot.size}`);

    if (usersSnapshot.empty) {
      console.warn("fetchProjects: Firestore 'users' collection snapshot is empty. This means getDocs returned no documents. Possible reasons: 1) No documents in the 'users' collection of the connected project. 2) Firestore security rules are blocking read access (even if you think they are open, double-check paths and conditions). 3) The application is connected to the wrong Firestore project (check environment variables and firebase.ts logs).");
      return [];
    }
    const projects = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      name: `Project: ${doc.id}`
    }));
    console.log("fetchProjects: Successfully mapped projects:", projects.map(p=>p.id));
    return projects;
  } catch (e: any) {
    console.error("fetchProjects: Error during getDocs or mapping:", e);
    if (e.code) {
        console.error(`fetchProjects: Firestore error code: ${e.code}, message: ${e.message}`);
    }
    throw new Error(`Failed to fetch projects: ${e.message}. Check console and Firestore security rules.`);
  }
};


const queryClientTanstack = new QueryClient();

function SelectProjectPageComponent() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [newProjectIdInput, setNewProjectIdInput] = useState('');
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] = useState(false);
  const router = useRouter();
  const tanstackQueryClient = useTanstackQueryClientHook();

  const { data: availableProjects = [], isLoading, error, refetch: refetchProjects } = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 5 * 60 * 1000,
  });

  const createProjectMutation = useMutation<void, Error, string>({
    mutationFn: async (newProjectId: string) => {
      if (!db) throw new Error("Database not initialized.");
      // Basic validation for project ID (Firestore doc IDs have restrictions)
      if (!/^[a-zA-Z0-9_.-]+$/.test(newProjectId) || newProjectId.includes('/') || newProjectId === '.' || newProjectId === '..') {
        throw new Error("Invalid Project ID. Use only letters, numbers, underscores, hyphens, periods. Cannot contain '/' or be '.' or '..'.");
      }
      const projectDocRef = doc(db, 'users', newProjectId);
      await setDoc(projectDocRef, { createdAt: serverTimestamp() });
    },
    onSuccess: (_, newProjectId) => {
      toast({ title: "Project Created", description: `Project "${newProjectId}" successfully created.` });
      tanstackQueryClient.invalidateQueries({ queryKey: ['projects'] });
      setSelectedProjectId(newProjectId); // Auto-select the new project
      localStorage.setItem('currentUserId', newProjectId);
      setIsCreateProjectDialogOpen(false);
      setNewProjectIdInput('');
      router.push('/dashboard');
    },
    onError: (creationError) => {
      toast({ title: "Error Creating Project", description: creationError.message, variant: "destructive" });
    },
  });

  const handleSelectProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProjectId) {
      localStorage.setItem('currentUserId', selectedProjectId);
      router.push('/dashboard');
    } else {
      toast({ title: "Selection Required", description: "Please select a project to continue.", variant: "destructive" });
    }
  };

  const handleCreateProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectIdInput.trim()) {
      toast({ title: "Project ID Required", description: "Please enter a unique ID for the new project.", variant: "destructive" });
      return;
    }
    createProjectMutation.mutate(newProjectIdInput.trim());
  };


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
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId} required disabled={availableProjects.length === 0}>
                  <SelectTrigger id="project-select" className="h-12 text-base px-4">
                    <SelectValue placeholder={availableProjects.length === 0 ? "No projects found" : "Select an existing project..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!isLoading && !error && availableProjects.length === 0 && (
                <div className="text-xs text-muted-foreground text-left pt-2 px-1 space-y-1">
                  <p className="font-medium">No projects found. This could be due to:</p>
                  <ul className="list-disc list-inside pl-4">
                    <li>No project/user documents currently exist in the Firestore 'users' collection.</li>
                    <li>
                      An incorrect Firebase project configuration.
                      <strong> Check your browser's developer console</strong> for logs from `firebase.ts` and `page.tsx (fetchProjects)`.
                      Compare the logged 'Project ID' with the Project ID shown in your Firebase Console (where you see your 'users' data). They MUST match.
                      Verify your `NEXT_PUBLIC_FIREBASE_PROJECT_ID` environment variable.
                    </li>
                    <li>
                      Firestore security rules are preventing access to list documents in the 'users' collection.
                      Ensure your rules allow `list` access on the `users` path (e.g., <code>{`match /users/{userId} { allow read: if true; }`}</code> for open access, or a more specific rule).
                    </li>
                  </ul>
                  <p className="mt-1">Please check your Firebase project setup, data, and security rules. You might need to refresh this page after making changes.</p>
                </div>
              )}
            </div>
            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={!selectedProjectId || isLoading || !!error}>
              <Building className="mr-2 h-5 w-5" />
              Proceed to Selected Project
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t">
            <Dialog open={isCreateProjectDialogOpen} onOpenChange={setIsCreateProjectDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-12 text-base" onClick={() => setIsCreateProjectDialogOpen(true)}>
                  <PlusCircle className="mr-2 h-5 w-5" /> Create New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Project</DialogTitle>
                  <DialogDescription>
                    Enter a unique ID for your new project. This ID will be used to store its data.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateProjectSubmit} className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="new-project-id">New Project ID</Label>
                    <Input
                      id="new-project-id"
                      value={newProjectIdInput}
                      onChange={(e) => setNewProjectIdInput(e.target.value)}
                      placeholder="e.g., my_awesome_project"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Allowed: letters, numbers, underscores, hyphens, periods. No spaces or slashes.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => {setIsCreateProjectDialogOpen(false); setNewProjectIdInput('');}}>Cancel</Button>
                    <Button type="submit" disabled={createProjectMutation.isPending || !newProjectIdInput.trim()}>
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

export default function HomePage() {
  // Ensure QueryClientProvider wraps the component that uses useQuery
  return (
    <QueryClientProvider client={queryClientTanstack}>
      <SelectProjectPageComponent />
    </QueryClientProvider>
  );
}
