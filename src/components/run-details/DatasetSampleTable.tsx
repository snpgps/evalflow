
'use client';

import type { FC } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EvalRun } from '@/app/(app)/runs/[runId]/page';

const MAX_ROWS_FOR_PROCESSING_DISPLAY_ONLY: number = 200; // Should match the one in page.tsx

export interface DatasetSampleTableProps {
  displayedPreviewData: Array<Record<string, any>>;
  previewTableHeaders: string[];
  runDetails: EvalRun;
}

export const DatasetSampleTable: FC<DatasetSampleTableProps> = ({ displayedPreviewData, previewTableHeaders, runDetails }) => {
  if (displayedPreviewData.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Dataset Sample Preview (Input Data Only)</CardTitle><CardDescription>Showing {displayedPreviewData.length} rows that will be processed. (Configured N: {runDetails.runOnNRows === 0 ? 'All' : runDetails.runOnNRows}, System processing limit: {MAX_ROWS_FOR_PROCESSING_DISPLAY_ONLY} rows). Ground truth data (if any) is used internally.</CardDescription></CardHeader>
      <CardContent><div className="max-h-96 overflow-auto"><Table><TableHeader><TableRow>{previewTableHeaders.map(header => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{displayedPreviewData.map((row, rowIndex) => (<TableRow key={`preview-row-${rowIndex}`}>{previewTableHeaders.map(header => <TableCell key={`preview-cell-${rowIndex}-${header}`} className="text-xs max-w-[150px] sm:max-w-[200px] truncate" title={String(row[header])}>{String(row[header])}</TableCell>)}</TableRow>))}</TableBody></Table></div></CardContent>
    </Card>
  );
};
