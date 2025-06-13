
'use client';

import type { FC } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import type { EvalRun } from '@/app/(app)/runs/[runId]/page';

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
  const progressLabel = (runDetails.status === 'Running' || runDetails.status === 'Processing') ? 'LLM Progress' : (isPreviewDataLoading ? 'Data Fetch Progress' : 'Loading Config...');
  const progressValue = (runDetails.status === 'Running' || runDetails.status === 'Processing') ? runDetails.progress || 0 : (isPreviewDataLoading || isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook ? 50 : 0);

  return (
    <CardContent>
      {showProgress && (
        <>
          <Label>{progressLabel}: {progressValue}%</Label>
          <Progress value={progressValue} className="w-full h-2 mt-1 mb-2" />
        </>
      )}
      {simulationLog.length > 0 && (
        <Card className="max-h-40 overflow-y-auto p-2 bg-muted/50 text-xs">
          <p className="font-semibold mb-1">Log:</p>
          {simulationLog.map((log, i) => <p key={i} className="whitespace-pre-wrap font-mono">{log}</p>)}
        </Card>
      )}
      {previewDataError && !isPreviewDataLoading && (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Data Preview Error</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{previewDataError}</AlertDescription></Alert>
      )}
      {runDetails.errorMessage && runDetails.status === 'Failed' && !isPreviewDataLoading && (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Run Failed</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{runDetails.errorMessage}</AlertDescription></Alert>
      )}
    </CardContent>
  );
};
