
'use client';

import React, { type FC } from 'react'; // Imported React
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle as CardTitleInner } from "@/components/ui/card"; // Renamed to avoid conflict
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle as AlertTitleInner } from "@/components/ui/alert"; // Renamed
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquareQuote, Loader2, AlertTriangle } from "lucide-react";
import type { QuestioningItemContext, EvalRun } from '@/app/(app)/runs/[runId]/page';
import type { AnalyzeJudgmentDiscrepancyOutput } from '@/ai/flows/analyze-judgment-discrepancy';


export interface QuestionJudgmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  itemData: QuestioningItemContext | null;
  userQuestion: string;
  onUserQuestionChange: (value: string) => void;
  analysisResult: AnalyzeJudgmentDiscrepancyOutput | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  onSubmitAnalysis: () => void;
  runDetails: EvalRun | null;
}

const OriginalQuestionJudgmentDialog: FC<QuestionJudgmentDialogProps> = ({
  isOpen, onOpenChange, itemData, userQuestion, onUserQuestionChange,
  analysisResult, isAnalyzing, analysisError, onSubmitAnalysis, runDetails
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center"><MessageSquareQuote className="mr-2 h-5 w-5 text-primary"/>Question Bot&apos;s Judgement</DialogTitle>
          <DialogDescription>Analyze a specific judgment made by the LLM. Provide your reasoning for a deeper AI analysis.</DialogDescription>
        </DialogHeader>
        <div className="flex-grow min-h-0 overflow-y-auto">
          <ScrollArea className="h-full w-full">
            {itemData && (
              <div className="space-y-4 p-6 text-sm">
                <Card className="p-3 bg-muted/40">
                  <CardHeader className="p-0 pb-2"><CardTitleInner className="text-sm">Item Details (Row {itemData.rowIndex + 1})</CardTitleInner></CardHeader>
                  <CardContent className="p-0 space-y-1 text-xs">
                    <div><strong>Input Data:</strong> <pre className="whitespace-pre-wrap bg-background p-1 rounded-sm text-[10px]">{JSON.stringify(itemData.inputData, null, 2)}</pre></div>
                    <div><strong>Evaluation Parameter:</strong> {itemData.paramName}</div>
                    <div><strong>Judge LLM Label:</strong> {itemData.judgeLlmOutput.chosenLabel}</div>
                    {itemData.judgeLlmOutput.rationale && <div><strong>Judge LLM Rationale:</strong> <span className="italic">{itemData.judgeLlmOutput.rationale}</span></div>}
                    {runDetails?.runType === 'GroundTruth' && <div><strong>Ground Truth Label:</strong> {itemData.groundTruthLabel || 'N/A'}</div>}
                  </CardContent>
                </Card>
                <div>
                  <Label htmlFor="userQuestionText">Your Question/Reasoning for Discrepancy:</Label>
                  <Textarea id="userQuestionText" value={userQuestion} onChange={(e) => onUserQuestionChange(e.target.value)} placeholder="e.g., 'I believe the LLM missed the nuance...'" rows={4} className="mt-1" />
                </div>
                {isAnalyzing && ( <div className="flex items-center space-x-2 pt-2"> <Loader2 className="h-5 w-5 animate-spin text-primary" /> <p className="text-muted-foreground">AI is analyzing...</p> </div> )}
                {analysisError && !isAnalyzing && ( <Alert variant="destructive"> <AlertTriangle className="h-4 w-4" /> <AlertTitleInner>Analysis Error</AlertTitleInner> <AlertDescription>{analysisError}</AlertDescription> </Alert> )}
                {analysisResult && !isAnalyzing && (
                  <Card className="mt-4 p-4 border-primary/30">
                    <CardHeader className="p-0 pb-2"><CardTitleInner className="text-base text-primary">AI Analysis of Judgement</CardTitleInner></CardHeader>
                    <CardContent className="p-0 space-y-2 text-xs">
                      <p><strong>Analysis:</strong> {analysisResult.analysis}</p>
                      <div className="flex items-center gap-2"> <strong>Agrees with User Concern:</strong> <Badge variant={analysisResult.agreesWithUserConcern ? "default" : "secondary"} className={analysisResult.agreesWithUserConcern ? "bg-green-100 text-green-700 border-green-300" : ""}> {analysisResult.agreesWithUserConcern ? 'Yes' : 'No'} </Badge> </div>
                      {analysisResult.potentialFailureReasons && <p><strong>Potential Failure Reasons:</strong> {analysisResult.potentialFailureReasons}</p>}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
        <DialogFooter className="p-6 pt-4 border-t mt-auto flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmitAnalysis} disabled={isAnalyzing || !userQuestion.trim() || !itemData}>
            {isAnalyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</> : "Submit for Analysis"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const QuestionJudgmentDialog = React.memo(OriginalQuestionJudgmentDialog);
