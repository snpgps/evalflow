
'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, CheckCircle, XCircle, FileText, PlugZap } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy, type Timestamp } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { testAnthropicConnection, type TestAnthropicConnectionInput, type TestAnthropicConnectionOutput } from '@/ai/flows/test-anthropic-connection-flow';

interface ModelConnectorForTest {
  id: string;
  name: string;
  provider: string;
  genkitModelId?: string; // e.g., anthropic/claude-3-haiku-20240307
  apiKeyIsSet: boolean; // To give a hint, actual key not fetched to client
}

const fetchAnthropicConnectors = async (userId: string | null): Promise<ModelConnectorForTest[]> => {
  if (!userId) return [];
  const connectorsCollection = collection(db, 'users', userId, 'modelConnectors');
  const q = query(
    connectorsCollection, 
    where('provider', '==', 'Anthropic'), 
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    let genkitModelId: string | undefined;
    if (data.config) {
        try {
            const parsedConfig = JSON.parse(data.config);
            if (parsedConfig.model) {
                genkitModelId = `anthropic/${parsedConfig.model}`;
            }
        } catch (e) {
            console.warn("Could not parse config for model ID", data.name);
        }
    }
    return { 
      id: docSnap.id, 
      name: data.name as string,
      provider: data.provider as string,
      genkitModelId: genkitModelId,
      apiKeyIsSet: !!data.apiKey, // Just check if it exists, not its value
    };
  });
};

export default function TestConnectionsPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingUserId, setIsLoadingUserId] = useState(true);

  const [selectedConnectorId, setSelectedConnectorId] = useState<string>('');
  const [testPrompt, setTestPrompt] = useState<string>("Hello Claude! Please respond with a single word: 'Acknowledged'.");
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestAnthropicConnectionOutput | null>(null);

  useEffect(() => {
    const storedUserId = localStorage.getItem('currentUserId');
    setCurrentUserId(storedUserId || null);
    setIsLoadingUserId(false);
  }, []);

  const { data: anthropicConnectors = [], isLoading: isLoadingConnectors } = useQuery<ModelConnectorForTest[], Error>({
    queryKey: ['anthropicConnectorsForTest', currentUserId],
    queryFn: () => fetchAnthropicConnectors(currentUserId),
    enabled: !!currentUserId && !isLoadingUserId,
  });

  const selectedConnectorDetails = anthropicConnectors.find(c => c.id === selectedConnectorId);

  const handleTestConnection = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedConnectorDetails || !selectedConnectorDetails.genkitModelId) {
      toast({ title: "Error", description: "Please select a valid Anthropic connector with a configured model.", variant: "destructive" });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const input: TestAnthropicConnectionInput = {
        modelId: selectedConnectorDetails.genkitModelId,
        testPrompt: testPrompt,
      };
      const result = await testAnthropicConnection(input);
      setTestResult(result);
      if (result.success) {
        toast({ title: "Test Successful", description: `Connected to ${result.modelUsed || selectedConnectorDetails.genkitModelId} successfully.` });
      } else {
        toast({ title: "Test Failed", description: result.error || "Unknown error.", variant: "destructive" });
      }
    } catch (error: any) {
      console.error("Error calling test connection flow:", error);
      setTestResult({ success: false, error: error.message || "Flow execution failed." });
      toast({ title: "Flow Error", description: error.message || "Failed to execute test flow.", variant: "destructive" });
    } finally {
      setIsTesting(false);
    }
  };
  
  if (isLoadingUserId) return <div className="p-6">Loading user...</div>;
  if (!currentUserId) return <Card className="m-4"><CardContent className="p-6 text-center text-muted-foreground">Please log in to test connections.</CardContent></Card>;

  return (
    <div className="space-y-6 p-4 md:p-0">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <PlugZap className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-xl md:text-2xl font-headline">Test Anthropic Connections</CardTitle>
              <CardDescription>Verify your configured Anthropic (Claude) model connectors by sending a simple test prompt.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <form onSubmit={handleTestConnection}>
          <CardContent className="space-y-4">
            <Alert variant="default">
              <FileText className="h-4 w-4" />
              <AlertTitle>Environment Variable Required</AlertTitle>
              <AlertDescription>
                For these tests to succeed, ensure the <code className="font-mono bg-muted px-1 py-0.5 rounded-sm">ANTHROPIC_API_KEY</code> environment variable is set correctly in your Next.js server environment. The API key stored in EvalFlow's Model Connectors is for record-keeping and potential future use, but Genkit typically relies on environment variables for the Anthropic plugin.
              </AlertDescription>
            </Alert>
            <div>
              <Label htmlFor="connector-select">Select Anthropic Connector</Label>
              <Select
                value={selectedConnectorId}
                onValueChange={setSelectedConnectorId}
                required
                disabled={isLoadingConnectors || anthropicConnectors.length === 0}
              >
                <SelectTrigger id="connector-select">
                  <SelectValue placeholder={isLoadingConnectors ? "Loading connectors..." : (anthropicConnectors.length === 0 ? "No Anthropic connectors found" : "Select an Anthropic connector")} />
                </SelectTrigger>
                <SelectContent>
                  {anthropicConnectors.map(connector => (
                    <SelectItem key={connector.id} value={connector.id} disabled={!connector.genkitModelId}>
                      {connector.name} ({connector.genkitModelId || 'Model not configured'})
                      {!connector.apiKeyIsSet && <span className="text-xs text-destructive ml-2">(API Key Missing in EvalFlow)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedConnectorDetails && !selectedConnectorDetails.genkitModelId && (
                <p className="text-xs text-destructive mt-1">This connector does not have a model specified in its configuration JSON. Cannot be tested.</p>
              )}
            </div>
            <div>
              <Label htmlFor="test-prompt">Test Prompt</Label>
              <Textarea
                id="test-prompt"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="Enter a simple prompt for the test."
                rows={3}
                required
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isTesting || !selectedConnectorId || !selectedConnectorDetails?.genkitModelId}>
              {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
              {isTesting ? "Testing..." : "Test Connection"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {testResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              {testResult.success ? <CheckCircle className="mr-2 h-5 w-5 text-green-500" /> : <XCircle className="mr-2 h-5 w-5 text-destructive" />}
              Test Result
            </CardTitle>
            <CardDescription>Model Tested: {testResult.modelUsed || "N/A"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {testResult.success ? (
              <Alert variant="default" className="border-green-500">
                <AlertTitle className="text-green-700">Connection Successful!</AlertTitle>
                <AlertDescription>
                  <p className="font-semibold">Response:</p>
                  <pre className="mt-1 whitespace-pre-wrap bg-muted p-2 rounded-md text-sm">{testResult.responseText}</pre>
                  {testResult.usage && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <p className="font-semibold">Usage:</p>
                      <pre>{JSON.stringify(testResult.usage, null, 2)}</pre>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>Connection Failed</AlertTitle>
                <AlertDescription>{testResult.error || "An unknown error occurred."}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
