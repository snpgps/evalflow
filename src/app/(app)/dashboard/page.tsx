
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Rocket, ListChecks, Target, PlayCircle, Lightbulb, ArrowRight } from "lucide-react";

const quickAccessItems = [
  { title: "Define Schema", description: "Set up your product parameters.", href: "/schema-definition", icon: ListChecks, color: "text-blue-500" },
  { title: "Setup Evaluations", description: "Create evaluation criteria.", href: "/evaluation-parameters", icon: Target, color: "text-green-500" },
  { title: "Run New Eval", description: "Start a new evaluation run.", href: "/runs", icon: PlayCircle, color: "text-purple-500" },
  { title: "View Insights", description: "Analyze prompt performance.", href: "/insights", icon: Lightbulb, color: "text-yellow-500" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Rocket className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">Welcome to EvalFlow!</CardTitle>
              <CardDescription>Your central hub for AI model evaluation and optimization.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">
            Get started by defining your product and evaluation parameters, uploading datasets, and running your first evaluation. Use the AI Insights tool to enhance your prompts and improve model accuracy.
          </p>
          <Link href="/runs">
            <Button>
              <PlayCircle className="mr-2 h-5 w-5" />
              Start New Evaluation
            </Button>
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {quickAccessItems.map((item) => (
          <Card key={item.title} className="hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <div className="flex items-center gap-3">
                <item.icon className={`h-7 w-7 ${item.color}`} />
                <CardTitle className="text-lg font-headline">{item.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
              <Link href={item.href}>
                <Button variant="outline" size="sm" className="w-full">
                  Go to {item.title.split(" ")[0]}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
