const submissionTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatSubmissionTime(iso: string): { label: string; full: string; dateTime: string } {
  const date = new Date(iso);
  const dateTime = date.toISOString();
  return {
    label: `${dateTime.slice(0, 10)} ${submissionTime.format(date)} UTC`,
    full: `${dateTime} (UTC)`,
    dateTime,
  };
}
