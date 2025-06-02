import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LifeBuoy, Mail, MessageSquare, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <LifeBuoy className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">Help &amp; Support</CardTitle>
              <CardDescription>Find resources and get assistance with EvalFlow.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">If you need help or have questions about using EvalFlow, please explore the resources below or contact our support team.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center"><BookOpen className="mr-2 h-5 w-5 text-primary" /> Documentation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Explore our comprehensive documentation for detailed guides and tutorials.</p>
                <Link href="/docs" passHref><Button variant="outline">Go to Docs (Placeholder)</Button></Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center"><MessageSquare className="mr-2 h-5 w-5 text-primary" /> FAQs</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Find answers to frequently asked questions about EvalFlow.</p>
                <Link href="/faq" passHref><Button variant="outline">View FAQs (Placeholder)</Button></Link>
              </CardContent>
            </Card>
             <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center"><Mail className="mr-2 h-5 w-5 text-primary" /> Contact Support</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Can't find what you're looking for? Reach out to our support team.</p>
                <Link href="mailto:support@evalflow.com" passHref><Button variant="default">Email Support</Button></Link>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
