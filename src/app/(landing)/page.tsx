
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Rocket, LogIn } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-secondary p-8 text-center">
      <div className="mb-8">
        <Rocket className="w-24 h-24 text-primary" />
      </div>
      <h1 className="text-5xl font-bold font-headline mb-6 text-foreground">
        Welcome to EvalFlow
      </h1>
      <p className="text-xl text-muted-foreground mb-10 max-w-2xl">
        Streamline your AI model evaluations with powerful tools for schema definition, dataset management, prompt engineering, and performance analysis.
      </p>
      <div className="space-x-4">
        <Link href="/auth/login">
          <Button size="lg" className="font-semibold">
            <LogIn className="mr-2 h-5 w-5" />
            Get Started / Log In
          </Button>
        </Link>
        {/* 
        <Link href="/dashboard">
          <Button size="lg" className="font-semibold">
            <LogIn className="mr-2 h-5 w-5" />
            Go to Dashboard
          </Button>
        </Link>
        */}
        <Button size="lg" variant="outline" className="font-semibold">
          Learn More
        </Button>
      </div>
      <footer className="absolute bottom-8 text-muted-foreground text-sm">
        © {new Date().getFullYear()} EvalFlow. Built with Firebase Studio.
      </footer>
    </div>
  );
}
