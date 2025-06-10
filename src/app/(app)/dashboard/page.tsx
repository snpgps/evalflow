
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Rocket, LayoutDashboard, Settings2, Target, Database, FileText, PlugZap, PlayCircle, Lightbulb, ArrowRight } from "lucide-react";

const workflowSteps = [
  {
    title: "Define Product Schema",
    description: "Set up your input parameters. If you're analysing a bot, setup input fields for User conversation, Bot Context, API response time, etc. You should add all the relevant columns from your logs table.",
    href: "/schema-definition",
    icon: Settings2,
    color: "text-sky-500",
    stepNumber: 1,
  },
  {
    title: "Craft Evaluation Criteria",
    description: "Define how your AI's responses will be judged, including specific labels and whether rationale is required.",
    href: "/evaluation-parameters",
    icon: Target,
    color: "text-green-500",
    stepNumber: 2,
  },
  {
    title: "Prepare Your Data",
    description: "Upload datasets and map columns to your product schema. Optionally, map columns for ground truth comparisons.",
    href: "/datasets",
    icon: Database,
    color: "text-orange-500",
    stepNumber: 3,
  },
  {
    title: "Engineer Your Prompts",
    description: "Create, version, and refine the prompt templates you'll be testing for your AI product.",
    href: "/prompts",
    icon: FileText,
    color: "text-purple-500",
    stepNumber: 4,
  },
  {
    title: "Connect Judge LLMs",
    description: "Configure connections to Large Language Models (like Gemini) that will act as automated evaluators.",
    href: "/model-connectors",
    icon: PlugZap,
    color: "text-red-500",
    stepNumber: 5,
  },
  {
    title: "Execute Evaluation Runs",
    description: "Launch evaluation jobs by combining your prompts, data, and judge LLMs to see how your AI performs.",
    href: "/runs",
    icon: PlayCircle,
    color: "text-indigo-500",
    stepNumber: 6,
  },
  {
    title: "Unlock AI Insights",
    description: "Analyze run results, identify areas for improvement, and get AI-driven suggestions to enhance your prompts.",
    href: "/insights",
    icon: Lightbulb,
    color: "text-yellow-500",
    stepNumber: 7,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8 p-4 md:p-0">
      <Card className="shadow-lg border-primary/20">
        <CardHeader className="pb-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <LayoutDashboard className="h-8 w-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl md:text-3xl font-headline">Welcome to EvalFlow!</CardTitle>
              <CardDescription className="text-base mt-1">
                Your intelligent assistant for AI model evaluation and prompt optimization.
                Follow the steps below to get started or jump to any section.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">
            EvalFlow helps you systematically define, test, and improve your AI applications.
            Begin by setting up your product and evaluation parameters, then manage your data and prompts,
            run evaluations, and finally, leverage AI insights to iterate and enhance performance.
          </p>
          <Link href="/runs">
            <Button size="lg">
              <PlayCircle className="mr-2 h-5 w-5" />
              View & Create Evaluation Runs
            </Button>
          </Link>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-semibold font-headline mb-2 tracking-tight">Your Evaluation Journey</h2>
        <p className="text-muted-foreground mb-6">
          Follow these steps to effectively evaluate and optimize your AI models and prompts.
        </p>
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {workflowSteps.map((item) => (
            <Card key={item.title} className="hover:shadow-xl transition-shadow duration-300 flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2.5 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-lg ${item.color}`}>
                    <item.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg font-headline leading-tight">
                    <span className="text-sm font-normal text-primary block mb-0.5">Step {item.stepNumber}</span>
                    {item.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-sm text-muted-foreground mb-4 min-h-[60px]">{item.description}</p>
              </CardContent>
              <CardContent className="pt-0">
                 <Link href={item.href} className="block">
                  <Button variant="outline" className="w-full group">
                    Go to {item.title.split(" ")[0]}
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
