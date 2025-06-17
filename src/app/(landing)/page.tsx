
'use client';

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Rocket, Building } from "lucide-react";
import { useState, useEffect } from 'react';

export default function LandingPage() {
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-secondary p-4 sm:p-8 text-center">
      <div className="mb-8">
        <Rocket className="w-20 h-20 sm:w-24 sm:h-24 text-primary" />
      </div>
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold font-headline mb-6 text-foreground">
        Welcome to EvalFlow
      </h1>
      <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-md sm:max-w-2xl">
        Streamline your AI model evaluations with powerful tools for schema definition, dataset management, prompt engineering, and performance analysis.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:space-x-4">
        <Link href="/select-project" className="w-full sm:w-auto">
          <Button size="lg" className="font-semibold w-full sm:w-auto">
            <Building className="mr-2 h-5 w-5" />
            Select Project
          </Button>
        </Link>
      </div>
      <footer className="absolute bottom-4 sm:bottom-8 text-muted-foreground text-xs sm:text-sm">
        {currentYear !== null ? `© ${currentYear} EvalFlow. Built with Firebase Studio.` : '© EvalFlow. Built with Firebase Studio.'}
      </footer>
    </div>
  );
}
