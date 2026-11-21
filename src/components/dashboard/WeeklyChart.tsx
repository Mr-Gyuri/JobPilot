"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function WeeklyChart({ data }: { data: { weekStart: string; count: number }[] }) {
  const chartData = data.map((point) => ({
    ...point,
    label: new Date(point.weekStart).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
  }));
  const hasAny = chartData.some((point) => point.count > 0);

  return (
    <div className="space-y-2">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              className="fill-slate-500"
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="fill-slate-500" />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(value) => {
                const count = Number(value);
                return [`${count} application${count === 1 ? "" : "s"}`, ""];
              }}
              labelFormatter={(label) => `Week of ${String(label)}`}
            />
            <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {!hasAny && (
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          No applications marked as applied yet — drag a card to the Applied column to start the
          count.
        </p>
      )}
    </div>
  );
}
