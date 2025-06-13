
'use client';

import type { FC } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Wand2, Loader2, AlertTriangle, Info, Copy, FileText as FileTextIcon } from "lucide-react";
import type { SuggestRecursivePromptImprovementsOutput } from '@/ai/flows/suggest-recursive-prompt-improvements';
import { toast } from '@/hooks/use-toast';

export interface ImprovementSuggestionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  error: string | null;
  result: SuggestRecursivePromptImprovementsOutput | null;
}

export const ImprovementSuggestionDialog: FC<ImprovementSuggestionDialogProps> = ({ isOpen, onOpenChange, isLoading, error, result }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader> <DialogTitle className="flex items-center"><Wand2 className="mr-2 h-5 w-5 text-primary"/>Prompt Improvement Suggestions</DialogTitle> <DialogDescription> Based on mismatches in this Ground Truth run, here are suggestions to improve your prompt. </DialogDescription> </DialogHeader>
        <ScrollArea className="flex-grow pr-2 -mr-2">
          {isLoading && ( <div className="flex flex-col items-center justify-center py-10"> <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" /> <p className="text-muted-foreground">Generating suggestions...</p> </div> )}
          {error && !isLoading && ( <Alert variant="destructive" className="my-4"> <AlertTriangle className="h-4 w-4" /> <AlertTitle>Error Generating Suggestions</AlertTitle> <AlertDescription>{error}</AlertDescription> </Alert> )}
          {result && !isLoading && ( <div className="space-y-6 py-4"> <div> <Label htmlFor="suggested-prompt" className="text-base font-semibold">Suggested Prompt Template</Label> <div className="relative mt-1"> <Textarea id="suggested-prompt" value={result.suggestedPromptTemplate} readOnly rows={10} className="bg-muted/30 font-mono text-xs"/> <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => { navigator.clipboard.writeText(result.suggestedPromptTemplate); toast({ title: "Copied!"}); }}> <Copy className="h-4 w-4" /> </Button> </div> </div> <div> <Label htmlFor="suggestion-reasoning" className="text-base font-semibold">Reasoning</Label> <div className="relative mt-1"> <Textarea id="suggestion-reasoning" value={result.reasoning} readOnly rows={8} className="bg-muted/30 text-sm"/> <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => { navigator.clipboard.writeText(result.reasoning); toast({ title: "Copied!"}); }}> <Copy className="h-4 w-4" /> </Button> </div> </div> <Alert> <Info className="h-4 w-4"/> <AlertTitle>Next Steps</AlertTitle> <AlertDescription> Review the suggested prompt. If you like it, copy it and create a new version of your prompt template on the "Prompts" page. Then, create a new evaluation run using this updated prompt version. </AlertDescription> </Alert> </div> )}
        </ScrollArea>
        <DialogFooter className="pt-4 border-t"> <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button> </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
