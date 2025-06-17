
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Project {
  id: string;
  name: string;
}

const fetchProjects = async (): Promise<Project[]> => {
  if (!db) {
    console.error("Firestore DB is not initialized in fetchProjects.");
    throw new Error("Database not available. Check Firebase initialization (src/lib/firebase.ts).");
  }
  const usersCollectionRef = collection(db, 'users');
  try {
    const usersSnapshot = await getDocs(usersCollectionRef);
    if (usersSnapshot.empty) {
      console.warn("fetchProjects: Firestore 'users' collection is empty or not accessible. Check Firestore data and security rules.");
      return [];
    }
    return usersSnapshot.docs.map(doc => ({
      id: doc.id,
      name: `Project: ${doc.id}`
    }));
  } catch (e: any) {
    console.error("fetchProjects: Error fetching documents from 'users' collection:", e);
    throw new Error(`Failed to fetch projects: ${e.message}. Check console and Firestore security rules.`);
  }
};

const queryClient = new QueryClient();

function SelectProjectPageComponent() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const router = useRouter();

  const { data: availableProjects = [], isLoading, error } = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProjectId) {
      localStorage.setItem('currentUserId', selectedProjectId);
      router.push('/dashboard');
    } else {
      toast({ title: "Selection Required", description: "Please select a project to continue.", variant: "destructive" });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-headline">Select Project</CardTitle>
          <CardDescription>Choose a project to continue working on.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="project-select" className="text-base">Project</Label>
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
                    <SelectValue placeholder={availableProjects.length === 0 ? "No projects found" : "Select a project..."} />
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
                    <li>Firestore security rules are preventing access to list documents in the 'users' collection.
                        Ensure your rules allow read access (e.g., <code>{`match /users/{userId} { allow read: if true; }`}</code> for open access, or a more specific rule).
                    </li>
                    <li>An incorrect Firebase project configuration in your application's environment variables.</li>
                  </ul>
                  <p className="mt-1">Please check your Firebase project setup, data, and security rules. You might need to refresh this page after making changes.</p>
                </div>
              )}
            </div>
            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={!selectedProjectId || isLoading || !!error}>
              <Building className="mr-2 h-5 w-5" />
              Proceed to Project
            </Button>
          </form>
        </CardContent>
      </Card>
       <p className="mt-8 text-center text-sm text-muted-foreground">
        Each project maps to a distinct data space in the backend.
      </p>
    </div>
  );
}

export default function HomePage() {
  return (
    <QueryClientProvider client={queryClient}>
      <SelectProjectPageComponent />
    </QueryClientProvider>
  );
}
