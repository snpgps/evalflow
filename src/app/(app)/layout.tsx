
'use client';

import { SidebarProvider, Sidebar, SidebarInset, SidebarContent } from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Header } from '@/components/layout/header';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation'; // Import usePathname
import { Skeleton } from '@/components/ui/skeleton';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const queryClient = new QueryClient();

function AppContent({ children }: { children: React.ReactNode }) {
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoadingAuthState, setIsLoadingAuthState] = useState(true);
  const router = useRouter();
  const pathname = usePathname(); // Get current pathname

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUid(user.uid);
        localStorage.setItem('authenticatedUserUID', user.uid);
        if(user.email) localStorage.setItem('authenticatedUserEmail', user.email);
        
        // Check for selected project ID
        const storedProjectId = localStorage.getItem('currentUserId'); // This is the key used by existing pages
        if (storedProjectId) {
          setSelectedProjectId(storedProjectId);
        } else {
          // Only redirect to /select-project if not already there
          if (pathname !== '/') { // Check against the new homepage path for project selection
            router.push('/'); 
          }
        }
      } else {
        setAuthUid(null);
        setSelectedProjectId(null);
        localStorage.removeItem('authenticatedUserUID');
        localStorage.removeItem('authenticatedUserEmail');
        localStorage.removeItem('currentUserId');
        // Only redirect to login if not already on the login page
        if (pathname !== '/') { 
          router.push('/'); 
        }
      }
      setIsLoadingAuthState(false);
    });
    return () => unsubscribe();
  }, [router, pathname]); // Add pathname to dependencies


  if (isLoadingAuthState) {
    return (
       <div className="flex flex-col flex-1 min-h-screen">
        <Skeleton className="h-16 w-full" />
        <div className="flex flex-1">
          <Skeleton className="w-64 h-full hidden md:block" />
          <main className="flex-1 p-6 bg-background">
            <Skeleton className="h-32 w-full mb-6" />
            <Skeleton className="h-64 w-full" />
          </main>
        </div>
      </div>
    );
  }
  
  // If authUid is set, but selectedProjectId is not, redirect to project selection (which is now '/')
  if (authUid && !selectedProjectId && pathname !== '/') {
     router.push('/');
     return <div className="flex flex-col flex-1 min-h-screen items-center justify-center bg-background"><p>Redirecting to project selection...</p></div>;
  }


  // If selectedProjectId is not set (which means user is not logged in or hasn't selected a project)
  // and we are not already on a public page, redirect.
  if (!authUid && pathname !== '/') { 
      // This is now primarily handled by onAuthStateChanged. 
      // If user is not authenticated and not on login page, they'll be redirected by the effect.
      // This block acts as an additional safeguard during initial render before effect runs.
      return (
         <div className="flex flex-col flex-1 min-h-screen items-center justify-center bg-background">
            <p>Loading session or redirecting to login...</p>
         </div>
      );
  }


  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
        <SidebarContent>
          <SidebarNav />
        </SidebarContent>
      </Sidebar>
      <div className="flex flex-col flex-1 min-h-screen">
        {/* Pass both auth UID and selected Project ID to Header */}
        <Header authUid={authUid} selectedProjectId={selectedProjectId} />
        <SidebarInset>
          <main className="flex-1 p-6 bg-background">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent>{children}</AppContent>
    </QueryClientProvider>
  );
}
