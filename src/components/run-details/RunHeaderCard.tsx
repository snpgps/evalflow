
'use client';

import type { FC } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Loader2, DatabaseZap, Wand2, Download, FileSearch } from "lucide-react";
import type { Timestamp } from 'firebase/firestore';
import type { EvalRun } from '@/app/(app)/runs/[runId]/page';

export interface RunHeaderCardProps {
  runDetails: EvalRun;
  isPreviewDataLoading: boolean;
  canFetchData: boolean;
  isRunTerminal: boolean;
  canStartLLMTask: boolean;
  isLoadingEvalParamsForLLMHook: boolean;
  isLoadingSummarizationDefsForLLMHook: boolean;
  canSuggestImprovements: boolean;
  canDownloadResults: boolean;
  onFetchAndPreviewData: () => void;
  onSimulateRunExecution: () => void;
  onSuggestImprovementsClick: () => void;
  onDownloadResults: () => void;
  isLoadingSuggestion: boolean;
  formatTimestamp: (timestamp?: Timestamp, includeTime?: boolean) => string;
}

export const RunHeaderCard: FC<RunHeaderCardProps> = ({
  runDetails, isPreviewDataLoading, canFetchData, isRunTerminal, canStartLLMTask,
  isLoadingEvalParamsForLLMHook, isLoadingSummarizationDefsForLLMHook,
  canSuggestImprovements, canDownloadResults, onFetchAndPreviewData, onSimulateRunExecution,
  onSuggestImprovementsClick, onDownloadResults, isLoadingSuggestion, formatTimestamp
}) => {
  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex-grow">
          <div className="flex items-center gap-3">
            <FileSearch className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl md:text-3xl font-headline">{runDetails.name}</CardTitle>
          </div>
          <CardDescription className="mt-1 ml-0 md:ml-11 text-xs md:text-sm">
            Run ID: {runDetails.id} | Type: {runDetails.runType === 'GroundTruth' ? 'Ground Truth Comparison' : 'Product Evaluation'} | Created: {formatTimestamp(runDetails.createdAt, true)}{runDetails.status === 'Completed' && runDetails.completedAt && ` | Completed: ${formatTimestamp(runDetails.completedAt, true)}`}
          </CardDescription>
        </div>
        <div className="flex flex-col items-start md:items-end gap-2 w-full md:w-auto">
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto self-start md:self-center">
            <Button variant="outline" onClick={onFetchAndPreviewData} disabled={isPreviewDataLoading || (runDetails.status === 'Running' || runDetails.status === 'Processing') || !canFetchData || isRunTerminal} className="w-full sm:w-auto">
              {isPreviewDataLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
              {runDetails.previewedDatasetSample && runDetails.previewedDatasetSample.length > 0 ? 'Refetch Sample' : 'Fetch & Preview Sample'}
            </Button>
            <Button variant="default" onClick={onSimulateRunExecution} disabled={(runDetails.status === 'Running' || runDetails.status === 'Processing') || !canStartLLMTask || isRunTerminal } className="w-full sm:w-auto">
              {(runDetails.status === 'Running' || runDetails.status === 'Processing') || isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {(runDetails.status === 'Running' || runDetails.status === 'Processing') ? 'Processing...' : ((isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook) ? 'Loading Config...' : (runDetails.status === 'Failed' ? 'Retry LLM Tasks' : 'Start LLM Tasks'))}
            </Button>
            {canSuggestImprovements && (
              <Button variant="outline" onClick={onSuggestImprovementsClick} disabled={isLoadingSuggestion} className="w-full sm:w-auto">
                <Wand2 className="mr-2 h-4 w-4" /> Suggest Improvements
              </Button>
            )}
            <Button variant="outline" onClick={onDownloadResults} disabled={!canDownloadResults} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" /> Download Results
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};
