export type StudyTimeSegment = { startedAt: string; endedAt: string | null };
export type StudyTimeRowLike = { startedAt: string; endedAt: string | null; segmentsJson?: string | null };

export function getStudyTimeSegments(row: StudyTimeRowLike): StudyTimeSegment[] {
  if (row.segmentsJson) {
    try {
      const parsed: unknown = JSON.parse(row.segmentsJson);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(segment =>
        typeof segment === 'object' && segment !== null &&
        typeof (segment as StudyTimeSegment).startedAt === 'string' &&
        ((segment as StudyTimeSegment).endedAt === null || typeof (segment as StudyTimeSegment).endedAt === 'string'),
      )) return parsed as StudyTimeSegment[];
    } catch { /* Fall back to the original single start/end interval. */ }
  }
  return [{ startedAt: row.startedAt, endedAt: row.endedAt }];
}

export function getStudyTimeIntervals(row: StudyTimeRowLike, now = Date.now()) {
  return getStudyTimeSegments(row).map(segment => ({
    start: Date.parse(segment.startedAt),
    end: segment.endedAt ? Date.parse(segment.endedAt) : now,
  })).filter(interval => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start);
}

export function getStudyTimeSeconds(row: StudyTimeRowLike, now = Date.now()) {
  return Math.floor(getStudyTimeIntervals(row, now).reduce((total, interval) => total + interval.end - interval.start, 0) / 1000);
}

export function hasRunningStudyTimeSegment(row: StudyTimeRowLike) {
  return getStudyTimeSegments(row).some(segment => segment.endedAt === null);
}

export function isStudyTimePaused(row: StudyTimeRowLike) {
  return row.endedAt === null && !hasRunningStudyTimeSegment(row);
}
