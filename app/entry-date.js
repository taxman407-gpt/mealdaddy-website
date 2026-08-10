function validLocalDateParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day, date };
}

export function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function quickDateOptions(now = new Date(), recentDays = 14) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
  return Array.from({ length: recentDays + 1 }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const prefix = offset === 0 ? "Today" : offset === 1 ? "Yesterday" : formatter.format(date);
    return { value: localDateValue(date), label: offset < 2 ? `${prefix} · ${formatter.format(date)}` : prefix };
  });
}

export function occurredAtForEntryDate(value, now = new Date()) {
  const parts = validLocalDateParts(value);
  if (!parts) throw new Error("Choose a valid date for this entry.");
  const todayValue = localDateValue(now);
  if (value > todayValue) throw new Error("Meal entries cannot be dated in the future.");
  const occurredAt = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );
  return occurredAt.toISOString();
}

export function entryDateDisplayLabel(value, now = new Date()) {
  const parts = validLocalDateParts(value);
  if (!parts) return "the selected date";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (value === localDateValue(today)) return "today";
  if (value === localDateValue(yesterday)) return "yesterday";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parts.date);
}
