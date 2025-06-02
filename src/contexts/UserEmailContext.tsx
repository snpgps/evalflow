
'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface UserEmailContextType {
  userEmail: string | null;
  setUserEmail: Dispatch<SetStateAction<string | null>>;
  isLoading: boolean;
}

const UserEmailContext = createContext<UserEmailContextType | undefined>(undefined);

export function UserEmailProvider({ children }: { children: ReactNode }) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedEmail = localStorage.getItem('currentUserEmail');
    if (storedEmail) {
      setUserEmail(storedEmail);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading && !userEmail) {
      // Only redirect if not already on a public page or login page
      if (!window.location.pathname.startsWith('/auth') && window.location.pathname !== '/') {
         router.push('/auth/login');
      }
    }
  }, [userEmail, isLoading, router]);

  const handleSetUserEmail = (email: string | null) => {
    if (email) {
      localStorage.setItem('currentUserEmail', email);
    } else {
      localStorage.removeItem('currentUserEmail');
    }
    setUserEmail(email);
  };
  
  // Expose a setter that also updates localStorage
  const contextSetUserEmail: Dispatch<SetStateAction<string | null>> = (valueOrFn) => {
    if (typeof valueOrFn === 'function') {
      setUserEmail(prev => {
        const newValue = valueOrFn(prev);
        if (newValue) localStorage.setItem('currentUserEmail', newValue);
        else localStorage.removeItem('currentUserEmail');
        return newValue;
      });
    } else {
      if (valueOrFn) localStorage.setItem('currentUserEmail', valueOrFn);
      else localStorage.removeItem('currentUserEmail');
      setUserEmail(valueOrFn);
    }
  };


  return (
    <UserEmailContext.Provider value={{ userEmail, setUserEmail: contextSetUserEmail, isLoading }}>
      {children}
    </UserEmailContext.Provider>
  );
}

export function useUserEmail() {
  const context = useContext(UserEmailContext);
  if (context === undefined) {
    throw new Error('useUserEmail must be used within a UserEmailProvider');
  }
  return context;
}
