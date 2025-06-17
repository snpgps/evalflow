
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithRedirect, onAuthStateChanged, getRedirectResult, type User } from 'firebase/auth';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Rocket } from 'lucide-react'; // Rocket imported
import { toast } from '@/hooks/use-toast';

// Google Logo SVG
const GoogleLogoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.6379 10.2226C19.6379 9.51611 19.5736 8.83547 19.4529 8.18066H10V11.9781H15.4648C15.2515 13.0901 14.6015 14.0449 13.6467 14.6949V17.1003H16.9781C18.6807 15.5697 19.6379 13.1126 19.6379 10.2226Z" fill="#4285F4"/>
    <path d="M10 20C12.7053 20 15.004 19.071 16.9781 17.1003L13.6467 14.6949C12.7576 15.3191 11.4741 15.7175 10 15.7175C7.43089 15.7175 5.24664 14.0008 4.40025 11.6471H0.928955V14.1274C2.86621 17.6193 6.20543 20 10 20Z" fill="#34A853"/>
    <path d="M4.40025 11.647C4.18689 11.0229 4.07104 10.3422 4.07104 9.63788C4.07104 8.93356 4.18689 8.25291 4.40025 7.62878V5.14844H0.928955C0.329436 6.38272 0 7.96153 0 9.63788C0 11.3142 0.329436 12.893 0.928955 14.1274L4.40025 11.647Z" fill="#FBBC05"/>
    <path d="M10 3.55822C11.6172 3.55822 12.9008 4.1299 13.9815 5.14844L17.054 2.07591C15.004 0.290078 12.7053 0 10 0C6.20543 0 2.86621 2.38069 0.928955 5.14844L4.40025 7.62878C5.24664 5.27501 7.43089 3.55822 10 3.55822Z" fill="#EA4335"/>
  </svg>
);


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
        setIsLoading(false); 
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

  // Handle redirect result
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          // User is signed in.
          // onAuthStateChanged will handle storing UID and redirecting.
          console.log("LoginPage: Google Sign-In Redirect Result - User:", result.user.uid);
          toast({ title: "Signed In", description: `Welcome ${result.user.displayName || result.user.email}!` });
        } else {
          // No redirect result or user is null
          console.log("LoginPage: No redirect result or user is null.");
        }
      })
      .catch((error) => {
        // Handle Errors here.
        console.error("LoginPage: Google Sign-In Error Object (from getRedirectResult):", error);
        let detailedErrorMessage = `Code: ${error.code || 'N/A'}. Message: ${error.message || "Could not process sign-in redirect."}`;
        if (error.customData) { detailedErrorMessage += ` CustomData: ${JSON.stringify(error.customData)}`; }
        toast({ 
          title: "Sign-In Failed", 
          description: `${detailedErrorMessage}. Try disabling browser extensions or using incognito mode.`,
          variant: "destructive",
          duration: 9000
        });
      })
      .finally(() => {
        setIsLoading(false); // Ensure loading is stopped after redirect processing
        setIsSigningIn(false); // Also reset signingIn state
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setIsLoading(true); // Show loading state immediately
    const provider = new GoogleAuthProvider();
    try {
      await signInWithRedirect(auth, provider);
      // Redirect will happen, getRedirectResult will handle the response
    } catch (error: any) {
      console.error("LoginPage: Google Sign-In Error Object (from signInWithRedirect):", error);
      let detailedErrorMessage = `Code: ${error.code || 'N/A'}. Message: ${error.message || "Could not start Google Sign-In."}`;
      if (error.customData) { detailedErrorMessage += ` CustomData: ${JSON.stringify(error.customData)}`; }
      toast({ 
        title: "Sign-In Failed", 
        description: `${detailedErrorMessage}. Try disabling browser extensions or using incognito mode.`,
        variant: "destructive",
        duration: 9000
      });
      setIsSigningIn(false);
      setIsLoading(false);
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
            <Rocket className="h-8 w-8" /> {/* Replaced SVG with Rocket icon */}
           </div>
          <CardTitle className="text-3xl font-headline">Welcome to EvalFlow</CardTitle>
          <CardDescription>Please sign in to continue to your projects.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <Button onClick={handleGoogleSignIn} className="w-full h-12 text-lg" disabled={isSigningIn}>
            {isSigningIn ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <GoogleLogoIcon />
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

