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
import { Bell, LogOut, User, Settings, Sun, Moon, LogIn } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Helper function to generate title from pathname
const generateTitle = (pathname: string): string => {
  if (pathname === '/dashboard') return 'Dashboard';
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'EvalFlow';
  
  if (segments[0] === 'runs' && segments.length > 1 && segments[1] !== 'new') {
    return `Run Details`;
  }
  if (segments[0] === 'auth' && segments[1] === 'login') {
    return 'Login';
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

  const handleLogout = () => {
    localStorage.removeItem('currentUserId');
    router.push('/auth/login');
  };
  
  const getAvatarFallback = (id: string | null) => {
    if (!id) return '??';
    // Simple fallback for User ID
    return id.substring(0, 2).toUpperCase();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6 shadow-sm">
      {(!pathname.startsWith('/auth') && pathname !== '/') && <SidebarTrigger className="md:hidden" />}
      <div className="flex-1">
        <h1 className="text-xl font-semibold font-headline">{pageTitle}</h1>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {isDarkTheme ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        
        {(!pathname.startsWith('/auth') && pathname !== '/') && (
          <>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              <span className="sr-only">Notifications</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={`https://placehold.co/100x100.png?text=${getAvatarFallback(userId)}`} alt="User Avatar" data-ai-hint="person avatar" />
                    <AvatarFallback>{getAvatarFallback(userId)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {userId ? (
                  <>
                    <DropdownMenuLabel>
                      <p className="font-medium truncate">User ID: {userId}</p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/settings')}>
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile (Settings)</span>
                    </DropdownMenuItem>
                     <DropdownMenuItem onClick={() => router.push('/settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={() => router.push('/auth/login')}>
                    <LogIn className="mr-2 h-4 w-4" />
                    <span>Log In</span>
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