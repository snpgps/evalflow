
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, type User } from 'firebase/auth';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChromeIcon, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("LoginPage: User authenticated, UID:", user.uid);
        localStorage.setItem('authenticatedUserUID', user.uid);
        if (user.email) {
            localStorage.setItem('authenticatedUserEmail', user.email);
        }
        router.push('/select-project'); 
      } else {
        console.log("LoginPage: No user authenticated.");
        localStorage.removeItem('authenticatedUserUID');
        localStorage.removeItem('authenticatedUserEmail');
        localStorage.removeItem('currentUserId');
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      // Auth state change will handle redirect via useEffect
      toast({ title: "Signed In", description: `Welcome ${result.user.displayName || result.user.email}!` });
    } catch (error: any) {
      console.error("Google Sign-In Error Object:", error); // Log the full error object
      let detailedErrorMessage = `Code: ${error.code || 'N/A'}. Message: ${error.message || "Could not sign in with Google."}`;
      
      if (error.customData) {
        detailedErrorMessage += ` CustomData: ${JSON.stringify(error.customData)}`;
      }
      
      toast({ 
        title: "Sign-In Failed", 
        description: `${detailedErrorMessage}. Try disabling browser extensions or using incognito mode.`,
        variant: "destructive",
        duration: 9000 // Longer duration for error messages
      });
      setIsSigningIn(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-2">
           <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            {/* EvalFlow Logo SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 16.5a2.5 2.5 0 1 1-5 0c0 .83.26 1.93.72 2.78.42.77.98 1.52 1.78 2.22a2.5 2.5 0 0 0 3.54 0c.8-.7 1.36-1.45 1.78-2.22.46-.85.72-1.95.72-2.78Z"/><path d="M18 11c.94-.09 1.46-1.24.87-1.99L17 7c-1.6-1.71-4.23-2.02-6.28-.79a5.5 5.5 0 0 0-3.17 3.17c-1.23 2.05-.92 4.68.79 6.28L11 17c.75.59 1.9.07 1.99-.87V11Z"/><path d="M12.15 5.15c1.1-1.18 2.88-1.65 4.35-1.15s2.53 1.88 2.5 3.5c-.02.89-.32 1.75-.85 2.5"/><path d="m12 12.5.47-.51c.4-.43.4-1.11 0-1.54L9 7.5"/></svg>
           </div>
          <CardTitle className="text-3xl font-headline">Welcome to EvalFlow</CardTitle>
          <CardDescription>Please sign in to continue to your projects.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <Button onClick={handleGoogleSignIn} className="w-full h-12 text-lg" disabled={isSigningIn}>
            {isSigningIn ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <ChromeIcon className="mr-2 h-5 w-5" />
            )}
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        By signing in, you agree to our (placeholder) Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}
