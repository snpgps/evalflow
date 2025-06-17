
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
import { Bell, LogOut, User, Settings, Sun, Moon, Building } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Helper function to generate title from pathname
const generateTitle = (pathname: string): string => {
  if (pathname === '/') return 'Select Project'; // New homepage title
  if (pathname === '/dashboard') return 'Dashboard';
  
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'EvalFlow'; // Should not happen if / is select project
  
  if (segments[0] === 'runs' && segments.length > 1 && segments[1] !== 'new') {
    return `Run Details`;
  }

  const title = segments[segments.length -1]
    .replace(/-/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
  return title || 'EvalFlow';
};


export function Header({ userId }: { userId: string | null }) {
  const pathname = usePathname();
  const pageTitle = generateTitle(pathname);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkTheme(isDark);
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    setIsDarkTheme(!isDarkTheme);
  };

  const handleSwitchProject = () => {
    localStorage.removeItem('currentUserId');
    router.push('/'); // Redirect to homepage (now select-project)
  };
  
  const getAvatarFallback = (id: string | null) => {
    if (!id) return 'P';
    const parts = id.split('_').map(part => part.charAt(0).toUpperCase());
    if (parts.length > 1) return parts.slice(0,2).join('');
    return id.substring(0, 1).toUpperCase() || 'P';
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6 shadow-sm">
      {pathname !== '/' && <SidebarTrigger className="md:hidden" />}
      <div className="flex-1">
        <h1 className="text-xl font-semibold font-headline">{pageTitle}</h1>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {isDarkTheme ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        
        {pathname !== '/' && (
          <>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              <span className="sr-only">Notifications</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={`https://placehold.co/100x100.png?text=${getAvatarFallback(userId)}`} alt="Project Avatar" data-ai-hint="building office" />
                    <AvatarFallback>{getAvatarFallback(userId)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {userId ? (
                  <>
                    <DropdownMenuLabel>
                      <p className="font-medium truncate">Project: {userId}</p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                     <DropdownMenuItem onClick={() => router.push('/settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSwitchProject}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Switch Project</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={() => router.push('/')}>
                    <Building className="mr-2 h-4 w-4" />
                    <span>Select Project</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </header>
  );
}
