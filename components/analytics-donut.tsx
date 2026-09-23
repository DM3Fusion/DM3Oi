type DonutDatum = {
  label: string;
  value: number;
};

const mutedPalette = [
  "#718096", // slate
  "#7f9aaa", // muted blue
  "#839b8a", // sage
  "#9a8d9b", // dusty mauve
  "#9a927b", // muted sand
  "#6f8f8b", // dusty teal
];

function displayPercent(
  value: number,
  total: number,
) {
  if (!total) return "0%";

  return `${Math.round((value / total) * 100)}%`;
}

export function AnalyticsDonut({
  data,
  title,
  centerLabel = "Views",
}: {
  data: DonutDatum[];
  title: string;
  centerLabel?: string;
}) {
  const positive = data.filter(
    (item) => item.value > 0,
  );

  const total = positive.reduce(
    (sum, item) => sum + item.value,
    0,
  );

  const radius = 42;
  const circumference =
    2 * Math.PI * radius;

  return (
    <div className="analytics-donut-block">
      <h4>{title}</h4>

      {total === 0 ? (
        <p className="muted">
          No activity yet.
        </p>
      ) : (
        <div className="analytics-donut-layout">
          <div className="analytics-donut-chart">
            <svg
              aria-label={`${title} donut chart`}
              role="img"
              viewBox="0 0 120 120"
            >
              <circle
                className="analytics-donut-track"
                cx="60"
                cy="60"
                fill="none"
                r={radius}
                strokeWidth="15"
              />

              {positive.map(
                (item, index) => {
                  const fraction =
                    item.value / total;

                  const segment =
                    fraction * circumference;

                  const precedingFraction =
                    positive
                      .slice(0, index)
                      .reduce(
                        (sum, preceding) =>
                          sum +
                          preceding.value / total,
                        0,
                      );

                  const offset =
                    -precedingFraction *
                    circumference;

                  return (
                    <circle
                      cx="60"
                      cy="60"
                      fill="none"
                      key={item.label}
                      r={radius}
                      stroke={
                        mutedPalette[
                          index %
                            mutedPalette.length
                        ]
                      }
                      strokeDasharray={`${segment} ${circumference - segment}`}
                      strokeDashoffset={offset}
                      strokeLinecap="butt"
                      strokeWidth="15"
                      transform="rotate(-90 60 60)"
                    />
                  );
                },
              )}
            </svg>

            <div className="analytics-donut-center">
              <strong>{total}</strong>
              <span>{centerLabel}</span>
            </div>
          </div>

          <div className="analytics-donut-legend">
            {positive.map(
              (item, index) => (
                <div key={item.label}>
                  <span
                    className="analytics-donut-swatch"
                    style={{
                      background:
                        mutedPalette[
                          index %
                            mutedPalette.length
                        ],
                    }}
                  />

                  <span className="analytics-donut-legend-label">
                    {item.label}
                  </span>

                  <strong>
                    {displayPercent(
                      item.value,
                      total,
                    )}
                  </strong>

                  <small>
                    {item.value}
                  </small>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
