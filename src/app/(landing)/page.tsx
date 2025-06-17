
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket, ArrowRight, LogIn, Palette, CheckSquare, BarChart3, Users, Settings, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const features = [
  { title: "Define Input Schema", description: "Structure your AI's input parameters for consistent evaluations.", icon: CheckSquare, color: "text-sky-500" },
  { title: "Craft Evaluation Criteria", description: "Set objective standards for judging AI performance.", icon: Palette, color: "text-green-500" },
  { title: "Manage Datasets & Prompts", description: "Organize your test data and prompt versions efficiently.", icon: BarChart3, color: "text-orange-500" },
  { title: "Run & Analyze Evals", description: "Execute evaluation runs and gain insights from detailed results.", icon: Users, color: "text-purple-500" },
];

export default function LandingPage() {
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Rocket className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold font-headline">EvalFlow</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/select-project" passHref>
              <Button>
                Select Project
                <LogIn className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-16 md:py-24 lg:py-32 bg-gradient-to-br from-primary/10 via-background to-background">
          <div className="container px-4 md:px-6 text-center">
            <div className="mx-auto max-w-3xl space-y-6">
              <h1 className="text-4xl font-bold tracking-tight font-headline sm:text-5xl md:text-6xl text-primary">
                Streamline Your AI Evaluations with EvalFlow
              </h1>
              <p className="text-lg text-muted-foreground md:text-xl">
                Define, execute, and analyze AI model performance systematically. Make data-driven decisions to build better AI products, faster.
              </p>
              <div>
                <Link href="/select-project" passHref>
                  <Button size="lg" className="group">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 md:py-24 bg-background">
          <div className="container px-4 md:px-6">
            <div className="mx-auto max-w-5xl space-y-12">
              <div className="text-center space-y-4">
                <h2 className="text-3xl font-bold tracking-tight font-headline sm:text-4xl">Powerful Features for Comprehensive AI Evaluation</h2>
                <p className="text-lg text-muted-foreground">
                  Everything you need to test, iterate, and improve your AI models and prompts.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-2">
                {features.map((feature) => (
                  <Card key={feature.title} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                      <div className={`p-3 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-lg ${feature.color}`}>
                        <feature.icon className="h-7 w-7" />
                      </div>
                      <CardTitle className="text-xl font-headline">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="py-16 md:py-24 bg-muted/50">
          <div className="container px-4 md:px-6 text-center">
            <div className="mx-auto max-w-2xl space-y-6">
              <h2 className="text-3xl font-bold tracking-tight font-headline sm:text-4xl">Ready to Elevate Your AI?</h2>
              <p className="text-lg text-muted-foreground">
                Join EvalFlow today and start building more reliable and effective AI applications.
              </p>
              <Link href="/select-project" passHref>
                <Button size="lg" variant="default">
                  Start Evaluating Now
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-background">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 md:flex-row">
          <div className="flex items-center gap-2">
            <Rocket className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">EvalFlow</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {year} Firebase Studio. All rights reserved.
          </p>
          <div className="flex gap-4">
            <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">Documentation (Stub)</Link>
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">Privacy (Stub)</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
