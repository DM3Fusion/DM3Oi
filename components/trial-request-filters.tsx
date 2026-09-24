"use client";

import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
} from "react";

type Props = {
  status: string;
  range: string;
  query: string;
  from: string;
  through: string;
};

export function TrialRequestFilters({
  status,
  range,
  query,
  from,
  through,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(query);
  const firstSearchRender = useRef(true);

  function replaceParams(
    changes: Record<string, string | null>,
  ) {
    const params = new URLSearchParams(
      searchParams.toString(),
    );

    for (const [key, value] of Object.entries(changes)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const next = params.toString();

    router.replace(
      next ? `${pathname}?${next}` : pathname,
      { scroll: false },
    );
  }

  useEffect(() => {
    if (firstSearchRender.current) {
      firstSearchRender.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      replaceParams({
        q: search.trim() || null,
      });
    }, 250);

    return () => window.clearTimeout(timeout);
    // URL params intentionally update after debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters =
    status !== "ALL" ||
    range !== "7d" ||
    Boolean(search.trim());

  return (
    <section className="panel trial-request-admin-filters">
      <div className="form-grid">
        <label>
          Search
          <input
            type="search"
            value={search}
            placeholder="Request, company, contact, email, operational need"
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </label>

        <label>
          Status
          <select
            value={status}
            onChange={(event) =>
              replaceParams({
                status:
                  event.target.value === "ALL"
                    ? null
                    : event.target.value,
              })
            }
          >
            <option value="ALL">All requests</option>
            <option value="NEW">New</option>
            <option value="CONTACTED">
              Contacted
            </option>
            <option value="QUALIFIED">
              Qualified
            </option>
            <option value="DECLINED">
              Declined
            </option>
            <option value="CONVERTED">
              Converted
            </option>
          </select>
        </label>

        <label>
          Date Range
          <select
            value={range}
            onChange={(event) => {
              const nextRange = event.target.value;

              replaceParams({
                range:
                  nextRange === "7d"
                    ? null
                    : nextRange,
                from:
                  nextRange === "custom"
                    ? from || null
                    : null,
                through:
                  nextRange === "custom"
                    ? through || null
                    : null,
              });
            }}
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        {range === "custom" ? (
          <>
            <label>
              From
              <input
                type="date"
                value={from}
                onChange={(event) =>
                  replaceParams({
                    from:
                      event.target.value || null,
                  })
                }
              />
            </label>

            <label>
              Through
              <input
                type="date"
                value={through}
                min={from || undefined}
                onChange={(event) =>
                  replaceParams({
                    through:
                      event.target.value || null,
                  })
                }
              />
            </label>
          </>
        ) : null}

        {hasFilters ? (
          <div className="actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setSearch("");
                router.replace(pathname, {
                  scroll: false,
                });
              }}
            >
              Clear Filters
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
