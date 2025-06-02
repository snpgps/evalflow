
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
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !userEmail && pathname !== '/' && !pathname.startsWith('/auth')) {
      router.push('/auth/login');
    }
  }, [userEmail, isLoading, router, pathname]);

  if (isLoading && pathname !== '/' && !pathname.startsWith('/auth')) {
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
  
  if (!userEmail && pathname !== '/' && !pathname.startsWith('/auth')) {
     // Still loading or redirecting, show basic loader or null
    return (
       <div className="flex flex-col flex-1 min-h-screen items-center justify-center bg-background">
          <p>Loading user information...</p>
       </div>
    );
  }

  // Allow access to dashboard and other app routes if userEmail is set
  // Or if specifically on /auth/login or landing page (handled by UserEmailProvider logic)
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
