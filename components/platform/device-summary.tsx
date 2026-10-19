type DeviceDatum = {
  label: string;
  value: number;
};

const deviceColors: Record<string, string> = {
  desktop: "#2f4a6f",
  mobile: "#c99a4e",
  tablet: "#2f7d5b",
  other: "#8a4f7d",
  unknown: "#7b8794",
};

const deviceOrder = [
  "desktop",
  "mobile",
  "tablet",
  "other",
  "unknown",
];

export function DeviceSummary({
  data,
}: {
  data: DeviceDatum[];
}) {
  const total = data.reduce(
    (sum, item) => sum + Math.max(0, item.value),
    0,
  );

  const ordered = [...data].sort((left, right) => {
    const leftOrder = deviceOrder.indexOf(
      left.label.toLowerCase(),
    );
    const rightOrder = deviceOrder.indexOf(
      right.label.toLowerCase(),
    );

    return (
      (leftOrder === -1 ? 99 : leftOrder) -
      (rightOrder === -1 ? 99 : rightOrder)
    );
  });

  return (
    <section
      aria-label="Device activity summary"
      className="platform-device-summary"
    >
      <div className="platform-device-summary-heading">
        <h4>Device Summary</h4>
        <span>
          {total.toLocaleString("en-US")} page views
        </span>
      </div>

      {total === 0 ? (
        <p className="muted">No device activity yet.</p>
      ) : (
        <div className="platform-device-summary-grid">
          {ordered
            .filter((item) => item.value > 0)
            .map((item) => {
              const percentage =
                (item.value / total) * 100;

              const color =
                deviceColors[item.label.toLowerCase()] ??
                deviceColors.unknown;

              return (
                <article
                  className="platform-device-summary-card"
                  key={item.label}
                >
                  <div className="platform-device-summary-card-heading">
                    <span>{item.label}</span>
                    <strong>
                      {Math.round(percentage)}%
                    </strong>
                  </div>

                  <strong className="platform-device-summary-count">
                    {item.value.toLocaleString("en-US")}
                  </strong>

                  <div
                    aria-label={`${item.label}: ${item.value} page views`}
                    className="platform-device-summary-track"
                    role="img"
                  >
                    <span
                      style={{
                        backgroundColor: color,
                        width: `${percentage}%`,
                      }}
                    />
                  </div>
                </article>
              );
            })}
        </div>
      )}
    </section>
  );
}
