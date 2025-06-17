
'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
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
import { Bell, LogOut, User, Settings, Sun, Moon, Building, ExternalLink } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

// Helper function to generate title from pathname
const generateTitle = (pathname: string): string => {
  if (pathname === '/') return 'Login - EvalFlow'; 
  if (pathname === '/select-project') return 'Select Project';
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

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkTheme(isDark);
    const storedEmail = localStorage.getItem('authenticatedUserEmail');
    if (storedEmail) {
      setUserEmail(storedEmail);
    }
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    setIsDarkTheme(!isDarkTheme);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('authenticatedUserUID');
      localStorage.removeItem('authenticatedUserEmail');
      localStorage.removeItem('currentUserId'); // This key is used for project context
      router.push('/'); // Redirect to login page
    } catch (error) {
      console.error("Error signing out: ", error);
      toast({title: "Sign Out Error", description: "Could not sign out.", variant: "destructive"});
    }
  };
  
  const getAvatarFallback = (id: string | null) => {
    if (!id) return 'U'; // User fallback
    const parts = id.split(/[\s@_.-]/).map(part => part.charAt(0).toUpperCase()); // Split by more delimiters
    if (parts.length > 1 && parts[0] && parts[1]) return parts[0] + parts[1];
    return id.substring(0, 2).toUpperCase() || 'U';
  }

  const isPublicPage = pathname === '/' || pathname === '/select-project';


  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6 shadow-sm">
      {!isPublicPage && <SidebarTrigger className="md:hidden" />}
      <div className="flex-1">
        <h1 className="text-xl font-semibold font-headline">{pageTitle}</h1>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {isDarkTheme ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        
        {!isPublicPage && authUid && (
          <>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              <span className="sr-only">Notifications</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    {/* Using auth user email for avatar text if available */}
                    <AvatarImage src={`https://placehold.co/100x100.png?text=${getAvatarFallback(userEmail || authUid)}`} alt="User Avatar" data-ai-hint="person user" />
                    <AvatarFallback>{getAvatarFallback(userEmail || authUid)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <p className="font-medium truncate text-sm">User: {userEmail || authUid}</p>
                  {selectedProjectId && <p className="text-xs text-muted-foreground truncate">Project: {selectedProjectId}</p>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/select-project')}>
                  <ExternalLink className="mr-2 h-4 w-4" /> 
                  <span>Switch Project Context</span>
                </DropdownMenuItem>
                 <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
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
  );
}

