'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCircle } from 'lucide-react'; // Changed icon

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const router = useRouter();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (userId.trim()) {
      localStorage.setItem('currentUserId', userId.trim());
      router.push('/dashboard');
    }
  };

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <UserCircle className="mx-auto h-12 w-12 text-primary mb-4" />
        <CardTitle className="text-2xl font-headline">Enter Your User ID</CardTitle>
        <CardDescription>
          Please enter your User ID to access your EvalFlow data.
          This ID will be used to scope your data in Firestore.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="userId">User ID</Label>
            <Input
              id="userId"
              type="text"
              placeholder="your-unique-user-id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              className="text-base"
            />
          </div>
          <Button type="submit" className="w-full font-semibold" size="lg">
            Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}