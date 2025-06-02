
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail } from 'lucide-react';
import { useUserEmail } from '@/contexts/UserEmailContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const { setUserEmail } = useUserEmail();
  const router = useRouter();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setUserEmail(email.trim());
      router.push('/dashboard');
    }
  };

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <Mail className="mx-auto h-12 w-12 text-primary mb-4" />
        <CardTitle className="text-2xl font-headline">Enter Your Email</CardTitle>
        <CardDescription>
          Please enter your email to access your EvalFlow data.
          This is a prototype and does not involve actual authentication.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
