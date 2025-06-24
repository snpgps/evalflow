
'use client';

import React, { type FC } from 'react'; // Imported React
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart as RechartsBarChartElement, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Bar as RechartsBar, LabelList } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { BarChartHorizontalBig, CheckCheck, Info } from "lucide-react";
import type { EvalRun, ParameterChartData } from '@/app/(app)/runs/[runId]/page';

export interface MetricsBreakdownTabProps {
  runDetails: EvalRun;
  metricsBreakdownData: ParameterChartData[];
}

const CustomizedLabel: FC<any> = ({ x, y, width, payload }) => {
  if (!payload) return null; // Defensive check to prevent crash if payload is undefined
  const { percentage } = payload;
  if (percentage === undefined || width < 25) { // Hide label if bar is too small
    return null;
  }
  return (
    <text x={x + width - 5} y={y + 10} fill="hsl(var(--card-foreground))" textAnchor="end" dominantBaseline="middle" fontSize={10} fontWeight="500">
      {percentage.toFixed(1)}%
    </text>
  );
};

const OriginalMetricsBreakdownTab: FC<MetricsBreakdownTabProps> = ({ runDetails, metricsBreakdownData }) => {
  return (
    <>
      {metricsBreakdownData.length === 0 && (!runDetails?.results || runDetails.results.length === 0) && (
        <Card> <CardHeader> <CardTitle className="flex items-center"> <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Metrics Breakdown (Labels) </CardTitle> </CardHeader> <CardContent> <p className="text-muted-foreground">No results available to generate label breakdown.</p> </CardContent> </Card>
      )}
      {metricsBreakdownData.map(paramChart => (
        <Card key={paramChart.parameterId} className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center"> <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/> {paramChart.parameterName} </CardTitle>
            {runDetails.runType === 'GroundTruth' && paramChart.accuracy !== undefined && ( <CardDescription className="flex items-center mt-1"> <CheckCheck className="h-4 w-4 mr-1.5 text-green-600" /> Accuracy: {paramChart.accuracy.toFixed(1)}% {paramChart.totalCompared !== undefined && ` (${(paramChart.accuracy/100 * paramChart.totalCompared).toFixed(0)}/${paramChart.totalCompared} correct)`} </CardDescription> )}
            {runDetails.runType === 'Product' && ( <CardDescription className="flex items-center mt-1"> <Info className="h-4 w-4 mr-1.5 text-blue-600" /> Label distribution. </CardDescription> )}
          </CardHeader>
          <CardContent>
            {paramChart.data.length === 0 ? ( <p className="text-muted-foreground">No data recorded for this parameter.</p> ) : (
              <ChartContainer config={{ count: { label: "Count" } }} className="w-full" style={{ height: `${Math.max(150, paramChart.data.length * 40 + 60)}px` }}>
                <RechartsBarChartElement data={paramChart.data} layout="vertical" margin={{ right: 30, left: 70, top: 5, bottom: 20 }}> 
                    <CartesianGrid strokeDasharray="3 3" /> 
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} /> 
                    <YAxis dataKey="labelName" type="category" width={120} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={0} /> 
                    <RechartsTooltip content={<ChartTooltipContent />} cursor={{ fill: 'hsl(var(--muted))' }} /> 
                    <RechartsBar dataKey="count" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} barSize={20}>
                        <LabelList content={<CustomizedLabel />} />
                    </RechartsBar> 
                </RechartsBarChartElement>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      ))}
      {runDetails?.results && runDetails.results.length > 0 && metricsBreakdownData.length === 0 && ( <Card> <CardHeader> <CardTitle className="flex items-center"> <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Metrics Breakdown (Labels) </CardTitle> </CardHeader> <CardContent> <p className="text-muted-foreground">Results are present, but no label counts could be generated for evaluation parameters.</p> </CardContent> </Card> )}
    </>
  );
};

export const MetricsBreakdownTab = React.memo(OriginalMetricsBreakdownTab);
