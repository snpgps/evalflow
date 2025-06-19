
'use client';

import React, { type FC } from 'react'; 
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
  promptTemplateText: string | null | undefined; 
}

const FormattedInputDataDisplay: FC<{ data: Record<string, any> }> = ({ data }) => {
  const dataKeys = Object.keys(data);
  let isLikelyConversational = false;
  const conversationalPairs = [
    ['user', 'bot'], ['User', 'Bot'],
    ['customer', 'agent'], ['Customer', 'Agent'],
    ['query', 'response'], ['Query', 'Response'],
    ['input', 'output']
  ];
  
  let conversationContent: string | null = null;

  // Heuristic 1: Check for common paired keys (simple first match)
  for (const pair of conversationalPairs) {
    if (dataKeys.some(k => k.toLowerCase().includes(pair[0])) && dataKeys.some(k => k.toLowerCase().includes(pair[1]))) {
      isLikelyConversational = true;
      // Attempt to find actual keys
      const key1 = dataKeys.find(k => k.toLowerCase().includes(pair[0]));
      const key2 = dataKeys.find(k => k.toLowerCase().includes(pair[1]));
      if (key1 && key2) {
          conversationContent = `${key1}: ${String(data[key1])}\n${key2}: ${String(data[key2])}`;
          const otherKeys = dataKeys.filter(k => k !== key1 && k !== key2);
          if (otherKeys.length > 0) {
              conversationContent += `\n--- Other Data ---\n` + otherKeys.map(k => `${k}: ${String(data[k])}`).join('\n');
          }
      }
      break;
    }
  }
  
  // Heuristic 2: Check for numbered turns if not matched by pair
  if (!isLikelyConversational) {
    const turnKeys = dataKeys.filter(key => /^(user_turn_|bot_turn_|turn_)\d+/i.test(key) || /^(userquery|botresponse|userMessage|botMessage)\d*$/i.test(key) );
    if (turnKeys.length > 1) {
        isLikelyConversational = true;
        conversationContent = turnKeys
            .sort((a, b) => { // Basic sort by number if present
                const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
                const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
                return numA - numB || a.localeCompare(b);
            })
            .map(key => `${key}: ${String(data[key])}`)
            .join('\n');
    }
  }

  // Heuristic 3: Check for a single key that looks like a transcript
  if (!isLikelyConversational && dataKeys.length === 1) {
    const singleKey = dataKeys[0];
    const value = data[singleKey];
    if (typeof value === 'string' && (value.includes('\n') || value.length > 150)) { // Increased length threshold
        if (/(transcript|conversation|chat_log|dialogue|history)/i.test(singleKey)) {
            isLikelyConversational = true;
            // Attempt to make transcript more readable
            conversationContent = value.split('\n').map(line => {
                if (/^(user[:\s]|client[:\s]|customer[:\s])/i.test(line)) return `\n👤 ${line}`;
                if (/^(bot[:\s]|agent[:\s]|system[:\s])/i.test(line)) return `\n🤖 ${line}`;
                return line;
            }).join('\n').trim();
        }
    }
  }

  if (isLikelyConversational && conversationContent) {
    return <pre className="whitespace-pre-wrap bg-muted/30 p-1 rounded-sm text-[10px]">{conversationContent}</pre>;
  }

  return <pre className="whitespace-pre-wrap bg-muted/30 p-1 rounded-sm text-[10px]">{JSON.stringify(data, null, 2)}</pre>;
};


const OriginalResultsTableTab: FC<ResultsTableTabProps> = ({
  runDetails, filteredResultsToDisplay, evalParamDetailsForLLM, summarizationDefDetailsForLLM,
  filterStates, onFilterChange, onOpenQuestionDialog, onDownloadResults, canDownloadResults,
  promptTemplateText 
}) => {

  const getUniqueLabelsForParam = (paramId: string): string[] => {
    if (!runDetails.results) return [];
    const labels = new Set<string>();
    runDetails.results.forEach(item => {
        const output = item.judgeLlmOutput?.[paramId]; 
        if (output?.chosenLabel && !output.error) {
            labels.add(output.chosenLabel);
        }
    });
    return Array.from(labels).sort();
  };

  const getFilteredInputDataForDisplay = (inputData: Record<string, any>, templateText: string | null | undefined): Record<string, any> => {
    if (!templateText) return inputData; 
    const filteredData: Record<string, any> = {};
    const placeholderRegex = /{{(.*?)}}/g;
    let match;
    const placeholdersInTemplate = new Set<string>();
    while ((match = placeholderRegex.exec(templateText)) !== null) {
        placeholdersInTemplate.add(match[1].trim());
    }

    for (const key in inputData) {
        if (placeholdersInTemplate.has(key)) {
            filteredData[key] = inputData[key];
        }
    }
    // If no placeholders were found in the template (e.g. hardcoded prompt), show all inputData as a fallback.
    return Object.keys(filteredData).length > 0 ? filteredData : inputData;
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
            <Table>
              <TableHeader>
                <TableRow>
                  {runDetails.selectedVisibleInputParamNames && runDetails.selectedVisibleInputParamNames.length > 0 &&
                    runDetails.selectedVisibleInputParamNames.map(paramName => (
                      <TableHead key={`vis-col-header-${paramName}`} className="min-w-[120px] sm:min-w-[150px] align-top">{paramName}</TableHead>
                    ))
                  }
                  <TableHead className="min-w-[150px] sm:min-w-[200px]">Input Data (Used in Prompt)</TableHead>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResultsToDisplay.map((item, index) => {
                  const filteredInputDataForCell = getFilteredInputDataForDisplay(item.inputData, promptTemplateText);
                  return (
                    <TableRow key={`result-${index}`}>
                      {runDetails.selectedVisibleInputParamNames && runDetails.selectedVisibleInputParamNames.length > 0 &&
                        runDetails.selectedVisibleInputParamNames.map(paramName => (
                          <TableCell key={`vis-cell-${index}-${paramName}`} className="text-xs align-top whitespace-pre-wrap" title={String(item.inputData[paramName])}>
                            {String(item.inputData[paramName] ?? 'N/A')}
                          </TableCell>
                        ))
                      }
                      <TableCell className="text-xs align-top">
                          <FormattedInputDataDisplay data={filteredInputDataForCell} />
                      </TableCell>
                      {evalParamDetailsForLLM?.map(paramDetail => {
                        const paramId = paramDetail.id; const outputForCell = item.judgeLlmOutput?.[paramId]; const groundTruthValue = item.groundTruth ? item.groundTruth[paramId] : undefined; const llmLabel = outputForCell?.chosenLabel; const gtLabel = groundTruthValue; const isMatch = runDetails.runType === 'GroundTruth' && gtLabel !== undefined && llmLabel && !outputForCell?.error && String(llmLabel).trim().toLowerCase() === String(gtLabel).trim().toLowerCase(); const showGroundTruth = runDetails.runType === 'GroundTruth' && gtLabel !== undefined && gtLabel !== null && String(gtLabel).trim() !== '';
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
                      {summarizationDefDetailsForLLM?.map(summDef => { const paramId = summDef.id; const outputForCell = item.judgeLlmOutput?.[paramId]; return ( <TableCell key={paramId} className="text-xs align-top"> <div>{outputForCell?.generatedSummary || (outputForCell?.error ? <span className="text-destructive">ERROR: {outputForCell.error}</span> : 'N/A')}</div> </TableCell> ); })}
                    </TableRow>
                  )})}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const ResultsTableTab = React.memo(OriginalResultsTableTab);



