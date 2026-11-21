export function ScoreGauge({ score, size = 120 }: { score: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 70 ? "#10b981" : clamped >= 40 ? "#f59e0b" : "#f43f5e";
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = Math.PI * r; // half circle
  const filled = (clamped / 100) * circumference;
  const cy = size / 2;

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size / 2 + stroke} viewBox={`0 0 ${size} ${size / 2 + stroke}`}>
        <path
          d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="text-slate-200 dark:text-slate-800"
        />
        <path
          d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="absolute bottom-0 text-center">
        <div className="text-2xl font-bold tabular-nums" style={{ color }}>
          {clamped}%
        </div>
      </div>
    </div>
  );
}
