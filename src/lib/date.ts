const CHALLENGE_TIME_ZONE = "America/Chicago";
const CHICAGO_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CHALLENGE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getChicagoDateTimeParts(now: Date) {
  const parts = CHICAGO_DATE_TIME_FORMATTER.formatToParts(now);

  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.get("year")),
    month: Number(lookup.get("month")),
    day: Number(lookup.get("day")),
    hour: Number(lookup.get("hour")),
    minute: Number(lookup.get("minute")),
  };
}

function formatIsoDateFromParts(parts: {
  year: number;
  month: number;
  day: number;
}) {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function getPreviousChicagoDate(parts: {
  year: number;
  month: number;
  day: number;
}) {
  const chicagoMiddayUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 12);
  const previousDay = new Date(chicagoMiddayUtc - 24 * 60 * 60 * 1000);

  return {
    year: previousDay.getUTCFullYear(),
    month: previousDay.getUTCMonth() + 1,
    day: previousDay.getUTCDate(),
  };
}

export function getTodayIsoDate() {
  const chicagoNow = getChicagoDateTimeParts(new Date());

  if (chicagoNow.hour === 0 && chicagoNow.minute === 0) {
    return formatIsoDateFromParts(getPreviousChicagoDate(chicagoNow));
  }

  return formatIsoDateFromParts(chicagoNow);
}

export function formatChallengeDate(date: string) {
  const parsedDate = new Date(`${date}T12:00:00.000Z`);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsedDate);
}
