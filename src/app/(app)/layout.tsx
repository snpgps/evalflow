'use client';

import { SidebarProvider, Sidebar, SidebarInset, SidebarContent } from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Header } from '@/components/layout/header';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

const queryClient = new QueryClient();

function AppContent({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // This effect handles redirection for protected (app) routes.
    const storedUserId = localStorage.getItem('currentUserId');
    if (storedUserId) {
      setCurrentUserId(storedUserId);
    }
    setIsLoadingUserId(false);
  }, []);

  useEffect(() => {
    if (!isLoadingUserId && !currentUserId) {
      router.push('/auth/login');
    }
  }, [currentUserId, isLoadingUserId, router]);

  // Show skeleton loader for (app) pages while user data is loading.
  if (isLoadingUserId) {
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
  
  // If loading is finished, but there's no currentUserId,
  // it means the redirect from useEffect is in progress or has just been initiated.
  if (!currentUserId) {
    return (
       <div className="flex flex-col flex-1 min-h-screen items-center justify-center bg-background">
          <p>Redirecting to login...</p>
       </div>
    );
  }

  // If currentUserId is set (and isLoadingUserId is false), render the main app content.
  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
        <SidebarContent>
          <SidebarNav />
        </SidebarContent>
      </Sidebar>
      <div className="flex flex-col flex-1 min-h-screen">
        <Header userId={currentUserId} />
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