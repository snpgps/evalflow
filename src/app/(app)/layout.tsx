
'use client';

import { SidebarProvider, Sidebar, SidebarInset, SidebarContent } from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Header } from '@/components/layout/header';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const queryClient = new QueryClient();

function AppContent({ children }: { children: React.ReactNode }) {
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoadingAuthState, setIsLoadingAuthState] = useState(true);
  const router = useRouter();

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
          router.push('/select-project'); // Authenticated, but no project selected
        }
      } else {
        setAuthUid(null);
        setSelectedProjectId(null);
        localStorage.removeItem('authenticatedUserUID');
        localStorage.removeItem('authenticatedUserEmail');
        localStorage.removeItem('currentUserId');
        router.push('/'); // Not authenticated, go to login
      }
      setIsLoadingAuthState(false);
    });
    return () => unsubscribe();
  }, [router]);


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
  
  // If authUid is set, but selectedProjectId is not, redirect to select-project
  // This can happen if user logs in, then clears `currentUserId` manually or an error occurs
  if (authUid && !selectedProjectId && router.pathname !== '/select-project') {
     // This check is now mostly handled by onAuthStateChanged, but good for safety
     // Or if they land directly on an app page without selecting project first
     router.push('/select-project');
     return <div className="flex flex-col flex-1 min-h-screen items-center justify-center bg-background"><p>Redirecting to project selection...</p></div>;
  }


  // If selectedProjectId is not set (which means user is not logged in or hasn't selected a project)
  // and we are not already on a public page, redirect.
  // The onAuthStateChanged above handles the main auth check and redirect to login.
  // This secondary check handles cases where user is auth'd but hasn't selected a project.
  if (!selectedProjectId && authUid) { 
      // We are here if user is authenticated but hasn't selected a project.
      // The router.push('/select-project') in onAuthStateChanged should handle this.
      // This block might not be strictly necessary if onAuthStateChanged always fires and redirects.
      // However, keeping it ensures that if they somehow land on an app page without project selection, they are redirected.
      // router.push('/select-project');
      return (
         <div className="flex flex-col flex-1 min-h-screen items-center justify-center bg-background">
            <p>Loading project context or redirecting...</p>
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

