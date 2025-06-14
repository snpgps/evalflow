
'use client';

import React, { type FC } from 'react'; // Imported React
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { EvalRun, EvalParamDetailForPrompt, SummarizationDefDetailForPrompt, ContextDocumentDisplayDetail } from '@/app/(app)/runs/[runId]/page';

export interface RunConfigTabProps {
  runDetails: EvalRun;
  evalParamDetailsForLLM: EvalParamDetailForPrompt[];
  summarizationDefDetailsForLLM: SummarizationDefDetailForPrompt[];
  selectedContextDocDetails: ContextDocumentDisplayDetail[];
  isLoadingSelectedContextDocs: boolean;
}

const OriginalRunConfigTab: FC<RunConfigTabProps> = ({ runDetails, evalParamDetailsForLLM, summarizationDefDetailsForLLM, selectedContextDocDetails, isLoadingSelectedContextDocs }) => {
  // Helper to parse config string and get model, safely
  const getModelFromConfig = (configString?: string): string | null => {
    if (!configString) return null;
    try {
      const parsed = JSON.parse(configString);
      return parsed.model || null;
    } catch (e) {
      return null;
    }
  };
  const directClientModel = getModelFromConfig(runDetails.modelConnectorConfigString);


  return (
    <Card>
      <CardHeader><CardTitle>Run Configuration Details</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <p><strong>Run Type:</strong> {runDetails.runType === 'GroundTruth' ? 'Ground Truth Comparison' : 'Product Evaluation'}</p>
          <p><strong>Dataset:</strong> {runDetails.datasetName || runDetails.datasetId}{runDetails.datasetVersionNumber ? ` (v${runDetails.datasetVersionNumber})` : ''}</p>
          <div> {/* Changed from p to div */}
            <strong>Model Connector:</strong> {runDetails.modelConnectorName || runDetails.modelConnectorId}
            {runDetails.modelConnectorProvider && <Badge variant="outline" className="ml-1 text-xs">Provider: {runDetails.modelConnectorProvider}</Badge>}
            { (runDetails.modelConnectorProvider !== 'Anthropic' && runDetails.modelConnectorProvider !== 'OpenAI' && runDetails.modelIdentifierForGenkit) ?
              <Badge variant="outline" className="ml-1 text-xs">Using (Genkit): {runDetails.modelIdentifierForGenkit}</Badge> :
              ((runDetails.modelConnectorProvider === 'Anthropic' || runDetails.modelConnectorProvider === 'OpenAI') && directClientModel) ?
              <Badge variant="outline" className="ml-1 text-xs">Using (Direct): {directClientModel}</Badge> :
              null
            }
          </div>
          <p><strong>Prompt Template:</strong> {runDetails.promptName || runDetails.promptId}{runDetails.promptVersionNumber ? ` (v${runDetails.promptVersionNumber})` : ''}</p>
          <p><strong>Test on Rows Config:</strong> {runDetails.runOnNRows === 0 ? 'All (capped)' : `First ${runDetails.runOnNRows} (capped)`}</p>
          <p><strong>LLM Concurrency Limit:</strong> {runDetails.concurrencyLimit || 'Default (3)'}</p>
          <div><strong>Evaluation Parameters:</strong> {evalParamDetailsForLLM && evalParamDetailsForLLM.length > 0 ? ( <ul className="list-disc list-inside ml-4 mt-1"> {evalParamDetailsForLLM.map(ep => <li key={ep.id}>{ep.name} (ID: {ep.id}){ep.requiresRationale ? <Badge variant="outline" className="ml-2 text-xs border-blue-400 text-blue-600">Rationale Requested</Badge> : ''}</li>)} </ul> ) : (runDetails.selectedEvalParamNames && runDetails.selectedEvalParamNames.length > 0 ? ( <ul className="list-disc list-inside ml-4 mt-1"> {runDetails.selectedEvalParamNames.map(name => <li key={name}>{name}</li>)} </ul> ) : "None selected for labeling.")} </div>
          <div><strong>Summarization Definitions:</strong> {summarizationDefDetailsForLLM && summarizationDefDetailsForLLM.length > 0 ? ( <ul className="list-disc list-inside ml-4 mt-1"> {summarizationDefDetailsForLLM.map(sd => <li key={sd.id}>{sd.name} (ID: {sd.id})</li>)} </ul> ) : (runDetails.selectedSummarizationDefNames && runDetails.selectedSummarizationDefNames.length > 0 ? ( <ul className="list-disc list-inside ml-4 mt-1"> {runDetails.selectedSummarizationDefNames.map(name => <li key={name}>{name}</li>)} </ul> ) : "None selected for summarization.")} </div>
          {runDetails.selectedContextDocumentIds && runDetails.selectedContextDocumentIds.length > 0 && (
            <div><strong>Context Documents:</strong>
                {isLoadingSelectedContextDocs ? <Skeleton className="h-5 w-24 mt-1" /> :
                    selectedContextDocDetails.length > 0 ? (
                        <ul className="list-disc list-inside ml-4 mt-1">
                            {selectedContextDocDetails.map(doc => <li key={doc.id} title={doc.fileName}>{doc.name}</li>)}
                        </ul>
                    ) : <span className="text-muted-foreground"> Details not found.</span>
                }
                <p className="text-xs text-muted-foreground mt-1">Note: Full context caching integration via Genkit is model-dependent and might require specific flow adjustments not yet implemented.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export const RunConfigTab = React.memo(OriginalRunConfigTab);
