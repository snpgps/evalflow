
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building } from 'lucide-react'; // Icon for project selection
import { toast } from '@/hooks/use-toast';

// These "projects" map to backend "userIds"
const availableProjects = [
  { name: "Default Project", id: "default_user_main" },
  { name: "Analytics Team Project", id: "analytics_team_project" },
  { name: "Chatbot Development", id: "chatbot_dev_project" },
  { name: "Research Initiative Alpha", id: "research_alpha_project" },
  { name: "General Testing Space", id: "test_space_001" }
];

export default function SelectProjectPage() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProjectId) {
      localStorage.setItem('currentUserId', selectedProjectId); // Still storing as 'currentUserId'
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
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId} required>
                <SelectTrigger id="project-select" className="h-12 text-base px-4">
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name} (ID: {project.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={!selectedProjectId}>
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
