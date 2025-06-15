
'use client';

import React, { type FC } from 'react'; 
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Loader2, DatabaseZap, Wand2, Download, FileSearch, Tags, ClockIcon, CheckCheckIcon, CalendarDaysIcon, InfoIcon } from "lucide-react";
import type { Timestamp } from 'firebase/firestore';
import type { EvalRun } from '@/app/(app)/runs/[runId]/page';
import { Badge } from '@/components/ui/badge';

export interface RunHeaderCardProps {
  runDetails: EvalRun;
  isPreviewDataLoading: boolean;
  canFetchData: boolean;
  isRunTerminal: boolean;
  canStartLLMTask: boolean;
  isLoadingEvalParamsForLLMHook: boolean;
  isLoadingSummarizationDefsForLLMHook: boolean;
  canSuggestImprovements: boolean;
  onFetchAndPreviewData: () => void;
  onSimulateRunExecution: () => void;
  onSuggestImprovementsClick: () => void;
  isLoadingSuggestion: boolean;
  formatTimestamp: (timestamp?: Timestamp, includeTime?: boolean) => string;
  getStatusBadge: (status?: EvalRun['status']) => JSX.Element;
  onShowFullPromptClick: () => void; // New prop
  canShowFullPrompt: boolean; // New prop
  isLoadingPromptTemplate: boolean; // New prop
}

const OriginalRunHeaderCard: FC<RunHeaderCardProps> = ({
  runDetails, isPreviewDataLoading, canFetchData, isRunTerminal, canStartLLMTask,
  isLoadingEvalParamsForLLMHook, isLoadingSummarizationDefsForLLMHook,
  canSuggestImprovements, onFetchAndPreviewData, onSimulateRunExecution,
  onSuggestImprovementsClick, isLoadingSuggestion, formatTimestamp, getStatusBadge,
  onShowFullPromptClick, canShowFullPrompt, isLoadingPromptTemplate
}) => {
  const runDuration = runDetails.status === 'Completed' && runDetails.createdAt && runDetails.completedAt 
    ? `${((runDetails.completedAt.toMillis() - runDetails.createdAt.toMillis()) / 1000).toFixed(1)}s` 
    : runDetails.summaryMetrics?.duration || 'N/A';

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex-grow">
            <div className="flex items-center gap-3 mb-1">
              <FileSearch className="h-7 w-7 text-primary" />
              <CardTitle className="text-xl md:text-2xl font-headline">{runDetails.name}</CardTitle>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center ml-0 md:ml-10 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs"><InfoIcon className="mr-1.5 h-3 w-3"/>ID: {runDetails.id}</Badge>
              <Badge variant="outline" className="text-xs">{runDetails.runType === 'GroundTruth' ? <CheckCheckIcon className="mr-1.5 h-3 w-3 text-green-600"/> : <Tags className="mr-1.5 h-3 w-3"/>}{runDetails.runType === 'GroundTruth' ? 'Ground Truth' : 'Product'}</Badge>
              <div className="flex items-center">{getStatusBadge(runDetails.status)}</div>
              <Badge variant="outline" className="text-xs"><CalendarDaysIcon className="mr-1.5 h-3 w-3"/>Created: {formatTimestamp(runDetails.createdAt, true)}</Badge>
              {runDetails.status === 'Completed' && runDetails.completedAt && (
                <Badge variant="outline" className="text-xs"><CalendarDaysIcon className="mr-1.5 h-3 w-3"/>Completed: {formatTimestamp(runDetails.completedAt, true)}</Badge>
              )}
              <Badge variant="outline" className="text-xs"><ClockIcon className="mr-1.5 h-3 w-3"/>Duration: {runDuration}</Badge>
               <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onShowFullPromptClick} 
                  disabled={!canShowFullPrompt || isLoadingPromptTemplate} 
                  title="View Full Prompt for First Row"
                  className="h-7 w-7 ml-1" 
                >
                  {isLoadingPromptTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <InfoIcon className="h-4 w-4 text-blue-500" />}
               </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto self-start md:self-center shrink-0">
            <Button variant="outline" onClick={onFetchAndPreviewData} disabled={isPreviewDataLoading || (runDetails.status === 'Running' || runDetails.status === 'Processing') || !canFetchData || isRunTerminal} className="w-full sm:w-auto">
              {isPreviewDataLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
              {runDetails.previewedDatasetSample && runDetails.previewedDatasetSample.length > 0 ? 'Refetch Sample' : 'Fetch & Preview Sample'}
            </Button>
            <Button variant="default" onClick={onSimulateRunExecution} disabled={(runDetails.status === 'Running' || runDetails.status === 'Processing') || !canStartLLMTask || isRunTerminal } className="w-full sm:w-auto">
              {(runDetails.status === 'Running' || runDetails.status === 'Processing') || isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {(runDetails.status === 'Running' || runDetails.status === 'Processing') ? 'Processing...' : ((isLoadingEvalParamsForLLMHook || isLoadingSummarizationDefsForLLMHook) ? 'Loading Config...' : (runDetails.status === 'Failed' ? 'Retry Eval' : 'Start Eval'))}
            </Button>
            {canSuggestImprovements && (
              <Button variant="outline" onClick={onSuggestImprovementsClick} disabled={isLoadingSuggestion} className="w-full sm:w-auto">
                <Wand2 className="mr-2 h-4 w-4" /> Suggest Improvements
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

export const RunHeaderCard = React.memo(OriginalRunHeaderCard);
