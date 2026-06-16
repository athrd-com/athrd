"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { ThreadUsageDay, ThreadUsageHistory } from "~/lib/thread-list";

interface ThreadUsageHeatmapProps {
  history: ThreadUsageHistory;
}

type CalendarCell = ThreadUsageDay | null;
type MonthLabel = {
  column: number;
  label: string;
  span: number;
};

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const WEEKDAY_COLUMN_WIDTH = "1.5rem";
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
  const gridTemplateColumns = `${WEEKDAY_COLUMN_WIDTH} repeat(${weeks.length}, minmax(0.625rem, 1fr))`;

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
          <div className="min-w-[42rem] w-full">
            <div
              aria-hidden="true"
              className="mb-1 grid gap-[3px] text-[10px] leading-3 text-muted-foreground"
              style={{ gridTemplateColumns }}
            >
              <span />
              {monthLabels.map((month) => (
                <span
                  className="truncate"
                  key={`${month.label}-${month.column}`}
                  style={{
                    gridColumn: `${month.column + 2} / span ${month.span}`,
                  }}
                >
                  {month.label}
                </span>
              ))}
            </div>

            <TooltipProvider delayDuration={100}>
              <div
                aria-label={`Daily usage from ${formatDateLabel(
                  history.startDate,
                )} to ${formatDateLabel(history.endDate)}`}
                className="grid grid-rows-7 gap-[3px]"
                role="grid"
                style={{ gridTemplateColumns }}
              >
                {Array.from({ length: 7 }, (_, dayIndex) => (
                  <WeekdayLabel
                    dayIndex={dayIndex}
                    key={`weekday-${dayIndex}`}
                  />
                ))}
                {weeks.flatMap((week, weekIndex) =>
                  week.map((day, dayIndex) => (
                    <HeatmapCell
                      day={day}
                      dayIndex={dayIndex}
                      key={day?.date ?? `empty-${weekIndex}-${dayIndex}`}
                      maxCount={history.maxCount}
                      weekIndex={weekIndex}
                    />
                  )),
                )}
              </div>
            </TooltipProvider>
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

function WeekdayLabel({ dayIndex }: { dayIndex: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex min-h-2.5 items-center justify-end pr-1 text-[10px] leading-none text-muted-foreground"
      style={{ gridColumn: 1, gridRow: dayIndex + 1 }}
    >
      {WEEKDAY_LABELS[dayIndex]}
    </span>
  );
}

function HeatmapCell({
  day,
  dayIndex,
  maxCount,
  weekIndex,
}: {
  day: CalendarCell;
  dayIndex: number;
  maxCount: number;
  weekIndex: number;
}) {
  if (!day) {
    return (
      <span
        aria-hidden="true"
        className="block aspect-square min-h-2.5 w-full"
        style={{ gridColumn: weekIndex + 2, gridRow: dayIndex + 1 }}
      />
    );
  }

  const label = formatCellLabel(day);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className={cn(
            "block aspect-square min-h-2.5 w-full rounded-[2px] border",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            getIntensityClass(day.count, maxCount),
          )}
          role="gridcell"
          style={{ gridColumn: weekIndex + 2, gridRow: dayIndex + 1 }}
          tabIndex={0}
        />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
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
): MonthLabel[] {
  const labels: Array<Omit<MonthLabel, "span">> = [];
  let lastMonthKey: string | undefined;

  weeks.forEach((week, column) => {
    const labelDay = week.find(
      (day) => day && parseDateKey(day.date).getDate() === 1,
    );

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

  return labels.map((label, index) => ({
    ...label,
    span: (labels[index + 1]?.column ?? weeks.length) - label.column,
  }));
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
