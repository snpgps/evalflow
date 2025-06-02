
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn } from 'lucide-react';

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const router = useRouter();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (userId.trim()) {
      localStorage.setItem('currentUserId', userId.trim());
      router.push('/dashboard');
    } else {
      alert('Please enter a User ID.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LogIn className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-headline">Welcome to EvalFlow</CardTitle>
          <CardDescription>Enter your User ID to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="userId" className="text-base">User ID</Label>
              <Input
                id="userId"
                type="text"
                placeholder="Enter your User ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                className="h-12 text-base px-4"
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base font-semibold">
              <LogIn className="mr-2 h-5 w-5" />
              Proceed
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        This is a simplified login. In a real application, this would involve authentication.
      </p>
    </div>
  );
}
