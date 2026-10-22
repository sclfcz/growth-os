export function forecastFirstPassDays(input: {
 remainingNewItems: number;
 dailyBudgetMinutes: number;
 averageMinutesPerItem: number;
 dailyQuestionLimit: number;
 todayNewCapacity: number;
}): { p50: number; p80: number } {
 const { remainingNewItems, dailyBudgetMinutes, averageMinutesPerItem, dailyQuestionLimit, todayNewCapacity } = input;
 if (remainingNewItems <= 0) return { p50: 0, p80: 0 };
 const minutesPerItem = Math.max(1, averageMinutesPerItem);
 const perDay = Math.max(1, Math.min(dailyQuestionLimit, Math.floor(dailyBudgetMinutes / minutesPerItem)));
 const remainingAfterToday = Math.max(0, remainingNewItems - todayNewCapacity);
 const p50 = 1 + Math.ceil(remainingAfterToday / perDay);
 // P80 adds one flexible day per week; the estimate still excludes reviews that become due later.
 return { p50, p80: p50 + Math.ceil(p50 / 7) };
}

/** @deprecated Use forecastFirstPassDays, which also respects the daily question cap. */
export function monteCarloForecast(itemCount: number, dailyBudgetMinutes: number, minutesPerItem = 25, samples = 1000): { p50: number; p80: number } {
 if (itemCount <= 0) return { p50: 0, p80: 0 };
 const perDay = Math.max(1, Math.floor(dailyBudgetMinutes / minutesPerItem));
 const days = Array.from({ length: samples }, (_, index) => Math.ceil(itemCount / perDay) + (index % 7 === 0 ? 1 : 0));
 days.sort((a, b) => a - b);
 return { p50: days[Math.floor((days.length - 1) * 0.5)] ?? 0, p80: days[Math.floor((days.length - 1) * 0.8)] ?? 0 };
}
