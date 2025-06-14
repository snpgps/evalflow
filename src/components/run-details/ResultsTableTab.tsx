
'use client';

import type { FC } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { MessageSquareText, MessageSquareQuote, CheckCircle, XCircle, Filter as FilterIcon, Download, ListChecks } from "lucide-react";
import type { EvalRun, EvalRunResultItem, EvalParamDetailForPrompt, SummarizationDefDetailForPrompt, AllFilterStates, FilterValueMatchMismatch, FilterValueSelectedLabel } from '@/app/(app)/runs/[runId]/page';

export interface ResultsTableTabProps {
  runDetails: EvalRun;
  filteredResultsToDisplay: EvalRunResultItem[];
  evalParamDetailsForLLM: EvalParamDetailForPrompt[];
  summarizationDefDetailsForLLM: SummarizationDefDetailForPrompt[];
  filterStates: AllFilterStates;
  onFilterChange: (paramId: string, filterType: 'matchMismatch' | 'label', value: FilterValueMatchMismatch | FilterValueSelectedLabel) => void;
  onOpenQuestionDialog: (item: EvalRunResultItem, paramId: string, rowIndex: number) => void;
  onDownloadResults: () => void;
  canDownloadResults: boolean;
}

export const ResultsTableTab: FC<ResultsTableTabProps> = ({
  runDetails, filteredResultsToDisplay, evalParamDetailsForLLM, summarizationDefDetailsForLLM,
  filterStates, onFilterChange, onOpenQuestionDialog, onDownloadResults, canDownloadResults
}) => {

  const getUniqueLabelsForParam = (paramId: string): string[] => {
    if (!runDetails.results) return [];
    const labels = new Set<string>();
    runDetails.results.forEach(item => {
        const output = item.judgeLlmOutput[paramId];
        if (output?.chosenLabel && !output.error) {
            labels.add(output.chosenLabel);
        }
    });
    return Array.from(labels).sort();
  };


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>Detailed LLM Task Results</CardTitle>
            <CardDescription>Row-by-row results from the Genkit LLM flow on the processed data.</CardDescription>
        </div>
        <Button variant="outline" onClick={onDownloadResults} disabled={!canDownloadResults}>
            <Download className="mr-2 h-4 w-4" /> Download Results
        </Button>
      </CardHeader>
      <CardContent>
        {filteredResultsToDisplay.length === 0 ? ( <p className="text-muted-foreground">No LLM categorization results for the current filter. {runDetails.status === 'DataPreviewed' ? 'Start Eval.' : (runDetails.status === 'Pending' ? 'Fetch data sample.' : (runDetails.status === 'Running' || runDetails.status === 'Processing' ? 'Categorization in progress...' : (Object.values(filterStates).some(f => f.matchMismatch !== 'all' || f.selectedLabel !== 'all') ? 'Try adjusting filters.' : 'Run may have failed or has no results.')))}</p> ) : (
          <div className="max-h-[600px] overflow-auto">
            <Table><TableHeader><TableRow><TableHead className="min-w-[150px] sm:min-w-[200px]">Input Data (Mapped)</TableHead>
            {evalParamDetailsForLLM?.map(paramDetail => {
              const uniqueLabels = getUniqueLabelsForParam(paramDetail.id);
              return (
              <TableHead key={paramDetail.id} className="min-w-[200px] sm:min-w-[250px] align-top">
                <div className="flex items-center gap-1">
                  <span>{paramDetail.name}</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
                        <FilterIcon className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-3 space-y-3">
                      {runDetails.runType === 'GroundTruth' && (
                        <div className="space-y-1">
                          <Label htmlFor={`gt-filter-${paramDetail.id}`} className="text-xs font-medium">Ground Truth Match</Label>
                          <Select
                            value={filterStates[paramDetail.id]?.matchMismatch || 'all'}
                            onValueChange={(value) => onFilterChange(paramDetail.id, 'matchMismatch', value as FilterValueMatchMismatch)}
                          >
                            <SelectTrigger id={`gt-filter-${paramDetail.id}`} className="h-8 text-xs w-full bg-background focus:ring-primary focus:border-primary">
                              <SelectValue>
                                { filterStates[paramDetail.id]?.matchMismatch === 'match' ? 'Matches Only' : filterStates[paramDetail.id]?.matchMismatch === 'mismatch' ? 'Mismatches Only' : 'Show All (GT)' }
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent> <SelectItem value="all">Show All (GT)</SelectItem> <SelectItem value="match">Ground Truth Matches</SelectItem> <SelectItem value="mismatch">Ground Truth Mismatches</SelectItem> </SelectContent>
                          </Select>
                        </div>
                      )}
                      {uniqueLabels.length > 0 && (
                        <div className="space-y-1">
                          <Label htmlFor={`label-filter-${paramDetail.id}`} className="text-xs font-medium">LLM Chosen Label</Label>
                          <Select
                              value={filterStates[paramDetail.id]?.selectedLabel || 'all'}
                              onValueChange={(value) => onFilterChange(paramDetail.id, 'label', value as FilterValueSelectedLabel)}
                          >
                              <SelectTrigger id={`label-filter-${paramDetail.id}`} className="h-8 text-xs w-full bg-background focus:ring-primary focus:border-primary">
                                  <SelectValue placeholder="Filter by Label" />
                              </SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="all">All Labels</SelectItem>
                                  {uniqueLabels.map(label => <SelectItem key={label} value={label}>{label}</SelectItem>)}
                              </SelectContent>
                          </Select>
                        </div>
                      )}
                       {runDetails.runType !== 'GroundTruth' && uniqueLabels.length === 0 && (
                        <p className="text-xs text-muted-foreground">No specific filters available for this parameter.</p>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </TableHead>
            )})}
            {summarizationDefDetailsForLLM?.map(summDef => ( <TableHead key={summDef.id} className="min-w-[200px] sm:min-w-[300px] align-top">{summDef.name} (Summary)</TableHead> ))}
            </TableRow></TableHeader>
              <TableBody>{filteredResultsToDisplay.map((item, index) => (<TableRow key={`result-${index}`}><TableCell className="text-xs align-top"><pre className="whitespace-pre-wrap bg-muted/30 p-1 rounded-sm">{JSON.stringify(item.inputData, null, 2)}</pre></TableCell>
                {evalParamDetailsForLLM?.map(paramDetail => {
                  const paramId = paramDetail.id; const outputForCell = item.judgeLlmOutput[paramId]; const groundTruthValue = item.groundTruth ? item.groundTruth[paramId] : undefined; const llmLabel = outputForCell?.chosenLabel; const gtLabel = groundTruthValue; const isMatch = runDetails.runType === 'GroundTruth' && gtLabel !== undefined && llmLabel && !outputForCell?.error && String(llmLabel).trim().toLowerCase() === String(gtLabel).trim().toLowerCase(); const showGroundTruth = runDetails.runType === 'GroundTruth' && gtLabel !== undefined && gtLabel !== null && String(gtLabel).trim() !== '';
                  return (
                    <TableCell key={paramId} className="text-xs align-top">
                      <div className="flex justify-between items-start">
                        <div>
                          <div><strong>LLM Label:</strong> {outputForCell?.chosenLabel || (outputForCell?.error ? 'ERROR' : 'N/A')}</div>
                          {outputForCell?.error && <div className="text-destructive text-[10px]">Error: {outputForCell.error}</div>}
                          {showGroundTruth && !outputForCell?.error && ( <div className={`mt-1 pt-1 border-t border-dashed ${isMatch ? 'border-green-300' : 'border-red-300'}`}> <div className="flex items-center"> <strong>GT:</strong>&nbsp;{gtLabel} {isMatch ? <CheckCircle className="h-3.5 w-3.5 ml-1 text-green-500"/> : <XCircle className="h-3.5 w-3.5 ml-1 text-red-500"/>} </div> </div> )}
                          {outputForCell?.rationale && ( <details className="mt-1"> <summary className="cursor-pointer text-blue-600 hover:underline text-[10px] flex items-center"> <MessageSquareText className="h-3 w-3 mr-1"/> LLM Rationale </summary> <p className="text-[10px] bg-blue-50 p-1 rounded border border-blue-200 mt-0.5 whitespace-pre-wrap max-w-xs">{outputForCell.rationale}</p> </details> )}
                        </div>
                        {outputForCell && !outputForCell.error && outputForCell.chosenLabel && ( <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 ml-1" title="Question this Judgement" onClick={() => onOpenQuestionDialog(item, paramId, index)}> <MessageSquareQuote className="h-4 w-4 text-muted-foreground hover:text-primary"/> </Button> )}
                      </div>
                    </TableCell>
                  );
                })}
                {summarizationDefDetailsForLLM?.map(summDef => { const paramId = summDef.id; const outputForCell = item.judgeLlmOutput[paramId]; return ( <TableCell key={paramId} className="text-xs align-top"> <div>{outputForCell?.generatedSummary || (outputForCell?.error ? <span className="text-destructive">ERROR: {outputForCell.error}</span> : 'N/A')}</div> </TableCell> ); })}
                </TableRow>))}</TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
