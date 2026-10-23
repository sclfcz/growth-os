import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
export const getLogicalDate = (now: Date = new Date(), timezoneName = process.env.TIMEZONE ?? 'Asia/Shanghai', dayStartHour = Number(process.env.DAY_START_HOUR ?? 3)): string => {
  const local = dayjs(now).tz(timezoneName);
  return local.subtract(local.hour() < dayStartHour ? 1 : 0, 'day').format('YYYY-MM-DD');
};
export const getLogicalDayStart = (now: Date = new Date(), timezoneName = process.env.TIMEZONE ?? 'Asia/Shanghai', dayStartHour = Number(process.env.DAY_START_HOUR ?? 3)): number =>
  dayjs.tz(getLogicalDate(now, timezoneName, dayStartHour), timezoneName).startOf('day').add(dayStartHour, 'hour').valueOf();
export const getCalendarDate = (now: Date = new Date(), timezoneName = process.env.TIMEZONE ?? 'Asia/Shanghai'): string => dayjs(now).tz(timezoneName).format('YYYY-MM-DD');
export const addDays = (date: string, days: number): string => dayjs.tz(date, process.env.TIMEZONE ?? 'Asia/Shanghai').add(days, 'day').format('YYYY-MM-DD');
export const logicalDateTime = (date: string, time: string, timezoneName = process.env.TIMEZONE ?? 'Asia/Shanghai', dayStartHour = Number(process.env.DAY_START_HOUR ?? 3)): string => {
  const calendarDate = Number(time.slice(0, 2)) < dayStartHour ? addDays(date, 1) : date;
  return dayjs.tz(`${calendarDate}T${time}:00`, timezoneName).toISOString();
};
export const dateDistance = (from: string, to: string): number => dayjs.tz(to, process.env.TIMEZONE ?? 'Asia/Shanghai').diff(dayjs.tz(from, process.env.TIMEZONE ?? 'Asia/Shanghai'), 'day');
export const daysRemainingInMonth = (date: string): number => dayjs.tz(date, process.env.TIMEZONE ?? 'Asia/Shanghai').daysInMonth() - Number(date.slice(8, 10)) + 1;
export const weekdayOf = (date: string): number => dayjs.tz(date, process.env.TIMEZONE ?? 'Asia/Shanghai').day();
