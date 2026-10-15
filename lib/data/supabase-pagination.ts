export const SUPABASE_MAX_PAGE_SIZE = 1000;

export interface SupabasePaginationQueryError {
  code?: string;
  message: string;
}

export interface SupabasePageResult<Row> {
  data: Row[] | null;
  error: SupabasePaginationQueryError | null;
}

export interface SupabaseOrderedRangeQuery<Row> {
  order(
    column: string,
    options: { ascending: boolean },
  ): SupabaseOrderedRangeQuery<Row>;
  range(
    from: number,
    to: number,
  ): PromiseLike<SupabasePageResult<Row>>;
}

export interface SupabaseOrder {
  ascending: boolean;
  column: string;
}

export class SupabasePaginationError extends Error {
  readonly collection: string;
  readonly from: number;
  readonly queryError: SupabasePaginationQueryError;
  readonly to: number;

  constructor(input: {
    collection: string;
    from: number;
    queryError: SupabasePaginationQueryError;
    to: number;
  }) {
    super(
      `Unable to load complete ${input.collection} collection at rows ${input.from}-${input.to}: ${input.queryError.message}`,
    );
    this.name = "SupabasePaginationError";
    this.collection = input.collection;
    this.from = input.from;
    this.queryError = input.queryError;
    this.to = input.to;
  }
}

export async function fetchAllSupabaseRows<Row>(
  queryFactory: () => SupabaseOrderedRangeQuery<Row>,
  options: {
    collection: string;
    orderBy: readonly [SupabaseOrder, ...SupabaseOrder[]];
    pageSize?: number;
  },
) {
  const pageSize = options.pageSize ?? SUPABASE_MAX_PAGE_SIZE;

  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > SUPABASE_MAX_PAGE_SIZE
  ) {
    throw new RangeError(
      `Supabase page size must be between 1 and ${SUPABASE_MAX_PAGE_SIZE}.`,
    );
  }

  const rows: Row[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    let query = queryFactory();

    for (const order of options.orderBy) {
      query = query.order(order.column, { ascending: order.ascending });
    }

    const result = await query.range(from, to);

    if (result.error) {
      throw new SupabasePaginationError({
        collection: options.collection,
        from,
        queryError: result.error,
        to,
      });
    }

    const page = result.data ?? [];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}
