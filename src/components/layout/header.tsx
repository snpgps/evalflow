
'use client';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogOut, User, Sun, Moon, Building, ExternalLink, Edit2, Loader2 } from 'lucide-react'; 
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

// Helper function to generate title from pathname
const generateTitle = (pathname: string): string => {
  if (pathname === '/') return 'Select Project';
  if (pathname === '/dashboard') return 'Dashboard';
  
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'EvalFlow';
  
  if (segments[0] === 'runs' && segments.length > 1 && segments[1] !== 'new') {
    return `Run Details`;
  }

  const title = segments[segments.length -1]
    .replace(/-/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
  return title || 'EvalFlow';
};


export function Header({ authUid, selectedProjectId }: { authUid: string | null, selectedProjectId: string | null }) {
  const pathname = usePathname();
  const pageTitle = generateTitle(pathname);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const queryClientHook = useQueryClient();

  const [isRenameProjectDialogOpen, setIsRenameProjectDialogOpen] = useState(false);
  const [projectDisplayNameForEdit, setProjectDisplayNameForEdit] = useState('');
  const [currentProjectStoredName, setCurrentProjectStoredName] = useState('');


  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkTheme(isDark);
    const storedEmail = localStorage.getItem('authenticatedUserEmail');
    if (storedEmail) {
      setUserEmail(storedEmail);
    }
    const storedProjectName = localStorage.getItem('currentProjectDisplayName');
    if (storedProjectName) {
        setCurrentProjectStoredName(storedProjectName);
    }
  }, [selectedProjectId]); 

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    setIsDarkTheme(!isDarkTheme);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('authenticatedUserUID');
      localStorage.removeItem('authenticatedUserEmail');
      localStorage.removeItem('currentUserId');
      localStorage.removeItem('currentProjectDisplayName');
      router.push('/'); 
    } catch (error) {
      console.error("Error signing out: ", error);
      toast({title: "Sign Out Error", description: "Could not sign out.", variant: "destructive"});
    }
  };
  
  const getAvatarFallback = (id: string | null) => {
    if (!id) return 'U'; 
    const parts = id.split(/[\s@_.-]/).map(part => part.charAt(0).toUpperCase()); 
    if (parts.length > 1 && parts[0] && parts[1]) return parts[0] + parts[1];
    return id.substring(0, 2).toUpperCase() || 'U';
  }

  const isPublicPage = pathname === '/';

  const openRenameProjectDialog = () => {
    const storedName = localStorage.getItem('currentProjectDisplayName');
    setProjectDisplayNameForEdit(storedName || selectedProjectId || '');
    setIsRenameProjectDialogOpen(true);
  };

  const updateProjectNameMutation = useMutation<void, Error, { projectId: string; newDisplayName: string }>({
    mutationFn: async ({ projectId, newDisplayName }) => {
      if (!db) throw new Error("Database not initialized.");
      const projectDocRef = doc(db, 'users', projectId);
      await updateDoc(projectDocRef, { projectName: newDisplayName });
    },
    onSuccess: (_, variables) => {
      toast({ title: "Project Name Updated", description: `Project display name changed to "${variables.newDisplayName}".` });
      localStorage.setItem('currentProjectDisplayName', variables.newDisplayName);
      setCurrentProjectStoredName(variables.newDisplayName);
      queryClientHook.invalidateQueries({ queryKey: ['projects'] }); 
      setIsRenameProjectDialogOpen(false);
    },
    onError: (updateError) => {
      toast({ title: "Error Updating Project Name", description: updateError.message, variant: "destructive" });
    }
  });

  const handleRenameProjectSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !projectDisplayNameForEdit.trim()) {
      toast({ title: "Validation Error", description: "Project display name cannot be empty.", variant: "destructive" });
      return;
    }
    updateProjectNameMutation.mutate({ projectId: selectedProjectId, newDisplayName: projectDisplayNameForEdit.trim() });
  };


  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6 shadow-sm">
        {/* SidebarTrigger removed from here */}
        <div className="flex-1">
          <h1 className="text-xl font-semibold font-headline">{pageTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {isDarkTheme ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          
          {!isPublicPage && authUid && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={`https://placehold.co/100x100.png?text=${getAvatarFallback(userEmail || authUid)}`} alt="User Avatar" data-ai-hint="person user" />
                      <AvatarFallback>{getAvatarFallback(userEmail || authUid)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>
                    <p className="font-medium truncate text-sm">User: {userEmail || authUid}</p>
                    {selectedProjectId && <p className="text-xs text-muted-foreground truncate">Project: {currentProjectStoredName || selectedProjectId}</p>}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/')}>
                    <ExternalLink className="mr-2 h-4 w-4" /> 
                    <span>Switch Project Context</span>
                  </DropdownMenuItem>
                  {selectedProjectId && (
                    <DropdownMenuItem onClick={openRenameProjectDialog}>
                      <Edit2 className="mr-2 h-4 w-4" />
                      <span>Rename Current Project</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </header>

      <Dialog open={isRenameProjectDialogOpen} onOpenChange={setIsRenameProjectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>
              Change the display name for project ID: <code className="font-mono bg-muted px-1 rounded-sm">{selectedProjectId}</code>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameProjectSubmit} className="space-y-4 py-4">
            <div>
              <Label htmlFor="rename-project-display-name">New Project Display Name</Label>
              <Input
                id="rename-project-display-name"
                value={projectDisplayNameForEdit}
                onChange={(e) => setProjectDisplayNameForEdit(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRenameProjectDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateProjectNameMutation.isPending || !projectDisplayNameForEdit.trim()}>
                {updateProjectNameMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Display Name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
    