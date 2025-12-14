'use client';

import React from 'react';
import {
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export interface PlotData {
  type: 'line' | 'scatter' | 'bar';
  title?: string;
  data: Array<{ [key: string]: number | string }>;
  xKey: string;
  yKey: string;
  color?: string;
}

interface PlotRendererProps {
  plotData: PlotData;
  width?: number | string;
  height?: number | string;
}

/**
 * PlotRenderer - Visualization component for workflow outputs
 *
 * Supports multiple chart types:
 * - Line charts (convergence, time series)
 * - Scatter plots (data points)
 * - Bar charts (comparisons)
 *
 * Used for displaying results from:
 * - VQE convergence traces
 * - Optimization iterations
 * - Data analysis outputs
 */
export default function PlotRenderer({
  plotData,
  width = '100%',
  height = 400
}: PlotRendererProps) {
  const { type, title, data, xKey, yKey, color = '#00ff00' } = plotData;

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-black border border-terminal-border rounded"
        style={{ width, height }}
      >
        <p className="text-terminal-dim text-sm">No data to display</p>
      </div>
    );
  }

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 20, right: 30, left: 20, bottom: 20 },
    };

    switch (type) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey={xKey}
              stroke="#888"
              style={{ fontSize: '12px', fill: '#888' }}
            />
            <YAxis
              stroke="#888"
              style={{ fontSize: '12px', fill: '#888' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#00ff00',
              }}
            />
            <Legend
              wrapperStyle={{ color: '#888', fontSize: '12px' }}
            />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        );

      case 'scatter':
        return (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey={xKey}
              type="number"
              stroke="#888"
              style={{ fontSize: '12px', fill: '#888' }}
            />
            <YAxis
              dataKey={yKey}
              type="number"
              stroke="#888"
              style={{ fontSize: '12px', fill: '#888' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#00ff00',
              }}
              cursor={{ strokeDasharray: '3 3' }}
            />
            <Legend
              wrapperStyle={{ color: '#888', fontSize: '12px' }}
            />
            <Scatter
              name={yKey}
              fill={color}
              fillOpacity={0.6}
            />
          </ScatterChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey={xKey}
              stroke="#888"
              style={{ fontSize: '12px', fill: '#888' }}
            />
            <YAxis
              stroke="#888"
              style={{ fontSize: '12px', fill: '#888' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#00ff00',
              }}
            />
            <Legend
              wrapperStyle={{ color: '#888', fontSize: '12px' }}
            />
            <Bar
              dataKey={yKey}
              fill={color}
              fillOpacity={0.8}
            />
          </BarChart>
        );

      default:
        return <div>Unsupported chart type: {type}</div>;
    }
  };

  return (
    <div
      className="bg-black border border-terminal-border rounded p-4"
      style={{ width, height: 'auto' }}
    >
      {title && (
        <h3 className="text-terminal-accent-green text-sm font-mono mb-4 text-center">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Example usage:
 *
 * // VQE convergence plot
 * const convergenceData = {
 *   type: 'line' as const,
 *   title: 'VQE Convergence',
 *   data: [
 *     { iteration: 0, energy: -0.5 },
 *     { iteration: 1, energy: -0.8 },
 *     { iteration: 2, energy: -1.0 },
 *     { iteration: 3, energy: -1.137 },
 *   ],
 *   xKey: 'iteration',
 *   yKey: 'energy',
 *   color: '#00ff00',
 * };
 *
 * <PlotRenderer plotData={convergenceData} />
 */
