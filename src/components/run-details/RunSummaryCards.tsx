
'use client';

import type { FC } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvalRun } from '@/app/(app)/runs/[runId]/page';

export interface RunSummaryCardsProps {
  runDetails: EvalRun;
  getStatusBadge: (status?: EvalRun['status']) => JSX.Element;
}

export const RunSummaryCards: FC<RunSummaryCardsProps> = ({ runDetails, getStatusBadge }) => {
  return (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
      <Card><CardHeader className="pb-2"><CardDescription>Status</CardDescription><CardTitle className="text-2xl md:text-3xl">{getStatusBadge(runDetails.status)}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">{runDetails.progress !== undefined && (runDetails.status === 'Running' || runDetails.status === 'Processing') ? `${runDetails.progress}% complete` : `Rows to process: ${runDetails.previewedDatasetSample?.length || 'N/A (Fetch sample first)'}`}</div></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Duration</CardDescription><CardTitle className="text-3xl md:text-3xl">{runDetails.summaryMetrics?.duration || (runDetails.status === 'Completed' && runDetails.createdAt && runDetails.completedAt ? `${((runDetails.completedAt.toMillis() - runDetails.createdAt.toMillis()) / 1000).toFixed(1)}s` : 'N/A')}</CardTitle></CardHeader><CardContent><div className="text-xs text-muted-foreground">&nbsp;</div></CardContent></Card>
    </div>
  );
};
