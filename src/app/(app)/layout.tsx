
'use client'; // This layout now needs to be a client component for UserEmailProvider & Tanstack Query

import { SidebarProvider, Sidebar, SidebarInset, SidebarContent } from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Header } from '@/components/layout/header';
import { UserEmailProvider, useUserEmail } from '@/contexts/UserEmailContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';


const queryClient = new QueryClient();

function AppContent({ children }: { children: React.ReactNode }) {
  const { userEmail, isLoading } = useUserEmail();
  const router = useRouter();
  // const pathname = usePathname(); // Pathname is not strictly needed for guard logic if AppLayout is correctly scoped

  useEffect(() => {
    // This effect handles redirection for protected (app) routes.
    // If user data has loaded, and there's no user email, redirect to login.
    if (!isLoading && !userEmail) {
      router.push('/auth/login');
    }
  }, [userEmail, isLoading, router]);

  // Show skeleton loader for (app) pages while user data is loading.
  if (isLoading) {
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
  
  // If loading is finished, but there's no userEmail,
  // it means the redirect from useEffect is in progress or has just been initiated.
  // Show a loading/redirecting message.
  if (!userEmail) {
     // This state implies redirection is about to happen or has happened.
    return (
       <div className="flex flex-col flex-1 min-h-screen items-center justify-center bg-background">
          <p>Redirecting to login...</p>
       </div>
    );
  }

  // If userEmail is set (and isLoading is false), render the main app content.
  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
        <SidebarContent>
          <SidebarNav />
        </SidebarContent>
      </Sidebar>
      <div className="flex flex-col flex-1 min-h-screen">
        <Header />
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
      <UserEmailProvider>
        <AppContent>{children}</AppContent>
      </UserEmailProvider>
    </QueryClientProvider>
  );
}
