import { cn } from "~/lib/utils";
import type { ThreadUsageDay, ThreadUsageHistory } from "~/lib/thread-list";

interface ThreadUsageHeatmapProps {
  history: ThreadUsageHistory;
}

type CalendarCell = ThreadUsageDay | null;

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short" });
const DAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const INTENSITY_CLASSES = [
  "border-border/70 bg-muted",
  "border-transparent bg-emerald-100 dark:bg-emerald-950",
  "border-transparent bg-emerald-300 dark:bg-emerald-800",
  "border-transparent bg-emerald-500 dark:bg-emerald-600",
  "border-transparent bg-emerald-700 dark:bg-emerald-400",
] as const;

export function ThreadUsageHeatmap({ history }: ThreadUsageHeatmapProps) {
  const weeks = buildCalendarWeeks(history.days);
  const monthLabels = buildMonthLabels(weeks);
  const totalLabel =
    history.totalCount === 1
      ? "1 indexed session"
      : `${history.totalCount} indexed sessions`;
  const gridTemplateColumns = `repeat(${weeks.length}, 0.625rem)`;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Usage history</h2>
          <p className="text-sm text-muted-foreground">
            {totalLabel} in the last year
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDateLabel(history.startDate)} - {formatDateLabel(history.endDate)}
        </p>
      </div>

      <div className="rounded-md border px-4 py-4">
        <div className="overflow-x-auto pb-1">
          <div className="min-w-max">
            <div
              aria-hidden="true"
              className="mb-1 grid gap-[3px] pl-8 text-[10px] leading-3 text-muted-foreground"
              style={{ gridTemplateColumns }}
            >
              {monthLabels.map((month) => (
                <span
                  className="truncate"
                  key={`${month.label}-${month.column}`}
                  style={{ gridColumn: `${month.column + 1} / span 4` }}
                >
                  {month.label}
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <div
                aria-hidden="true"
                className="grid grid-rows-7 gap-[3px] text-right text-[10px] leading-[0.625rem] text-muted-foreground"
              >
                {WEEKDAY_LABELS.map((label, index) => (
                  <span className="h-2.5 w-6" key={`${label}-${index}`}>
                    {label}
                  </span>
                ))}
              </div>

              <div
                aria-label={`Daily usage from ${formatDateLabel(
                  history.startDate,
                )} to ${formatDateLabel(history.endDate)}`}
                className="grid grid-flow-col grid-rows-7 gap-[3px]"
                role="grid"
                style={{ gridTemplateColumns }}
              >
                {weeks.flatMap((week, weekIndex) =>
                  week.map((day, dayIndex) =>
                    day ? (
                      <span
                        aria-label={formatCellLabel(day)}
                        className={cn(
                          "block size-2.5 rounded-[2px] border",
                          getIntensityClass(day.count, history.maxCount),
                        )}
                        key={day.date}
                        role="gridcell"
                        title={formatCellLabel(day)}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="block size-2.5"
                        key={`empty-${weekIndex}-${dayIndex}`}
                      />
                    ),
                  ),
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-[3px]" aria-hidden="true">
            {INTENSITY_CLASSES.map((className) => (
              <span
                className={cn("block size-2.5 rounded-[2px] border", className)}
                key={className}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </section>
  );
}

function buildCalendarWeeks(days: ThreadUsageDay[]): CalendarCell[][] {
  const firstDay = days[0];

  if (!firstDay) {
    return [];
  }

  const leadingEmptyCells = parseDateKey(firstDay.date).getDay();
  const cells: CalendarCell[] = [
    ...Array.from({ length: leadingEmptyCells }, () => null),
    ...days,
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: CalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return weeks;
}

function buildMonthLabels(
  weeks: CalendarCell[][],
): Array<{ column: number; label: string }> {
  const labels: Array<{ column: number; label: string }> = [];
  let lastMonthKey: string | undefined;

  weeks.forEach((week, column) => {
    const firstDayOfMonth = week.find(
      (day) => day && parseDateKey(day.date).getDate() === 1,
    );
    const labelDay = firstDayOfMonth ?? (labels.length === 0 ? week.find(Boolean) : null);

    if (!labelDay) {
      return;
    }

    const date = parseDateKey(labelDay.date);
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

    if (monthKey === lastMonthKey) {
      return;
    }

    labels.push({
      column,
      label: MONTH_FORMATTER.format(date),
    });
    lastMonthKey = monthKey;
  });

  return labels;
}

function getIntensityClass(count: number, maxCount: number): string {
  return INTENSITY_CLASSES[getIntensityLevel(count, maxCount)];
}

function getIntensityLevel(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || maxCount <= 0) {
    return 0;
  }

  const ratio = count / maxCount;

  if (ratio <= 0.25) {
    return 1;
  }

  if (ratio <= 0.5) {
    return 2;
  }

  if (ratio <= 0.75) {
    return 3;
  }

  return 4;
}

function formatCellLabel(day: ThreadUsageDay): string {
  const sessionLabel = day.count === 1 ? "1 session" : `${day.count} sessions`;

  return `${sessionLabel} on ${formatDateLabel(day.date)}`;
}

function formatDateLabel(dateKey: string): string {
  return DAY_FORMATTER.format(parseDateKey(dateKey));
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}
