
'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp, type Timestamp, type FieldValue } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from '@/hooks/use-toast';

interface Project {
  id: string;
  name: string;
  createdAt: Timestamp;
  userId: string;
}

type NewProjectData = {
  name: string;
  createdAt: FieldValue;
  userId: string;
};

interface ProjectContextType {
  projects: Project[];
  selectedProjectId: string | null;
  setSelectedProjectId: (projectId: string | null) => void;
  isLoadingProjects: boolean;
  createProject: (projectName: string) => Promise<string | null>;
  currentUserId: string | null;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    if (storedUserId) {
      setCurrentUserId(storedUserId);
    } else {
      setIsLoadingProjects(false); 
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setProjects([]);
      setSelectedProjectIdState(null);
      setIsLoadingProjects(false);
      return;
    }

    setIsLoadingProjects(true);
    const projectsCollectionRef = collection(db, 'users', currentUserId, 'projects');
    const q = query(projectsCollectionRef, orderBy('createdAt', 'desc'));

    getDocs(q)
      .then(snapshot => {
        const fetchedProjects = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Project));
        setProjects(fetchedProjects);

        const storedProjectId = localStorage.getItem(`selectedProjectId_${currentUserId}`);
        if (storedProjectId && fetchedProjects.some(p => p.id === storedProjectId)) {
          setSelectedProjectIdState(storedProjectId);
        } else if (fetchedProjects.length > 0) {
          setSelectedProjectIdState(fetchedProjects[0].id);
          localStorage.setItem(`selectedProjectId_${currentUserId}`, fetchedProjects[0].id);
        } else {
          setSelectedProjectIdState(null);
          localStorage.removeItem(`selectedProjectId_${currentUserId}`);
        }
      })
      .catch(error => {
        console.error("Error fetching projects:", error);
        toast({ title: "Error", description: "Could not fetch projects.", variant: "destructive" });
        setProjects([]);
        setSelectedProjectIdState(null);
      })
      .finally(() => {
        setIsLoadingProjects(false);
      });
  }, [currentUserId]);

  const setSelectedProjectId = (projectId: string | null) => {
    setSelectedProjectIdState(projectId);
    if (currentUserId) {
      if (projectId) {
        localStorage.setItem(`selectedProjectId_${currentUserId}`, projectId);
      } else {
        localStorage.removeItem(`selectedProjectId_${currentUserId}`);
      }
    }
  };

  const createProject = async (projectName: string): Promise<string | null> => {
    if (!currentUserId) {
      toast({ title: "Error", description: "User not identified. Cannot create project.", variant: "destructive" });
      return null;
    }
    if (!projectName.trim()) {
      toast({ title: "Validation Error", description: "Project name cannot be empty.", variant: "destructive" });
      return null;
    }
    try {
      const newProjectData: NewProjectData = {
        name: projectName.trim(),
        createdAt: serverTimestamp(),
        userId: currentUserId,
      };
      const docRef = await addDoc(collection(db, 'users', currentUserId, 'projects'), newProjectData);
      const newProject: Project = {
        id: docRef.id,
        name: newProjectData.name,
        createdAt: Timestamp.now(), 
        userId: currentUserId,
      };
      setProjects(prevProjects => [newProject, ...prevProjects].sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis())); // ensure order after adding
      setSelectedProjectId(newProject.id);
      toast({ title: "Success", description: `Project "${newProject.name}" created.` });
      return docRef.id;
    } catch (error) {
      console.error("Error creating project:", error);
      toast({ title: "Error", description: "Failed to create project.", variant: "destructive" });
      return null;
    }
  };

  return (
    <ProjectContext.Provider value={{ projects, selectedProjectId, setSelectedProjectId, isLoadingProjects, createProject, currentUserId }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextType {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
