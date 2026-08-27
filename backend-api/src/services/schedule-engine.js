export function minutesInTimeZone(value = new Date(), timeZone = 'Asia/Kolkata') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value)).filter((item) => item.type !== 'literal').map((item) => [item.type, Number(item.value)]));
  return parts.hour * 60 + parts.minute;
}

export function findOpenSchedule(schedules = [], currentMinutes, grace = {}, requestedShowId = null) {
  const enabled = schedules.filter((item) => item.enabled);
  const candidates = requestedShowId ? enabled.filter((item) => item.id === requestedShowId) : enabled;
  return candidates.sort((left, right) => effectiveEnd(left, grace) - effectiveEnd(right, grace)).find((schedule) => {
    const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
    const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute + Number(grace[schedule.id] ?? 0);
    return currentMinutes >= start && currentMinutes <= end;
  }) ?? null;
}

export function resultPublishReady(schedule, resultDate, currentDate, currentMinutes, graceMinutes = 0) {
  if (resultDate < currentDate) return true;
  if (resultDate > currentDate) return false;
  if (!schedule?.endTime) return true;
  const [hour, minute] = schedule.endTime.split(':').map(Number);
  return currentMinutes >= hour * 60 + minute + Number(graceMinutes) + 1;
}

function effectiveEnd(schedule, grace) {
  const [hour, minute] = schedule.endTime.split(':').map(Number);
  return hour * 60 + minute + Number(grace[schedule.id] ?? 0);
}
