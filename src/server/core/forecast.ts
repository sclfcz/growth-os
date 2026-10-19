export function monteCarloForecast(itemCount: number, dailyBudgetMinutes: number, minutesPerItem = 25, samples = 1000): { p50: number; p80: number } {
 if (itemCount <= 0) return { p50: 0, p80: 0 };
 const perDay = Math.max(1, Math.floor(dailyBudgetMinutes / minutesPerItem));
 const days = Array.from({ length: samples }, (_, i) => Math.ceil(itemCount/perDay) + (i % 7 === 0 ? 1 : 0));
 days.sort((a,b) => a-b);
 return { p50: days[Math.floor((days.length-1)*0.5)] ?? 0, p80: days[Math.floor((days.length-1)*0.8)] ?? 0 };
}
