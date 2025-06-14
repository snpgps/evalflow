
'use client';

import type { FC } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ListChecks } from "lucide-react";
import type { EvalRun } from '@/app/(app)/runs/[runId]/page';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from '@/components/ui/scroll-area';

export interface RunProgressAndLogsProps {
  runDetails: EvalRun;
  isPreviewDataLoading: boolean;
  isLoadingEvalParamsForLLMHook: boolean;
  isLoadingSummarizationDefsForLLMHook: boolean;
  simulationLog: string[];
  previewDataError: string | null;
}

export const RunProgressAndLogs: FC<RunProgressAndLogsProps> = ({
  runDetails, isPreviewDataLoading, isLoadingEvalParamsForLLMHook, isLoadingSummarizationDefsForLLMHook, simulationLog, previewDataError
}) => {
  const showProgress = isPreviewDataLoading || (runDetails.status === 'Running' || runDetails.status === 'Processing') || isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook;
  const progressLabel = (runDetails.status === 'Running' || runDetails.status === 'Processing') ? 'Eval Progress' : (isPreviewDataLoading ? 'Data Fetch Progress' : 'Loading Config...');
  const progressValue = (runDetails.status === 'Running' || runDetails.status === 'Processing') ? runDetails.progress || 0 : (isPreviewDataLoading || isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook ? 50 : 0);

  return (
    <Card>
        <CardContent className="pt-6 space-y-4">
            {showProgress && (
                <div className="mb-4">
                    <Label>{progressLabel}: {progressValue}%</Label>
                    <Progress value={progressValue} className="w-full h-2 mt-1 mb-2" />
                </div>
            )}
            {simulationLog.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="item-1">
                        <AccordionTrigger className="text-sm py-2 hover:no-underline">
                            <div className="flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-muted-foreground" />
                                View Detailed Logs ({simulationLog.length} entries)
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            <ScrollArea className="h-40 max-h-40 w-full rounded-md border p-3 bg-muted/30 text-xs">
                                {simulationLog.map((log, i) => <p key={`log-${i}`} className="whitespace-pre-wrap font-mono leading-tight">{log}</p>)}
                            </ScrollArea>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}
            {previewDataError && !isPreviewDataLoading && (
                <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Data Preview Error</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{previewDataError}</AlertDescription></Alert>
            )}
            {runDetails.errorMessage && runDetails.status === 'Failed' && !isPreviewDataLoading && (
                <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Run Failed</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{runDetails.errorMessage}</AlertDescription></Alert>
            )}
        </CardContent>
    </Card>
  );
};
