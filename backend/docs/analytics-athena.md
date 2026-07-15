# Analytics — Athena over the S3 lake (Phase 8)

Ad-hoc SQL for funnel/revenue/financial-reconciliation queries, pay-per-scan, **scales to
zero**. No always-on pipeline: `services/analytics/src/stream.ts` batches DynamoDB Stream
records straight to S3 as NDJSON (Firehose-free), and Athena reads that layout on demand.

## S3 layout

The stream processor writes one object per `(table, day)` batch:

```
s3://sc-<stage>-analytics/<table>/dt=YYYY-MM-DD/<ulid>.jsonl
```

Example:

```
s3://sc-dev-analytics/sc-dev-bookings/dt=2026-07-15/01J....jsonl
s3://sc-dev-analytics/sc-dev-mentors/dt=2026-07-15/01J....jsonl
```

Each line is one stream record (see `AnalyticsLine`):

```json
{"table":"sc-dev-bookings","eventName":"MODIFY","keys":{"PK":"BOOKING#bk_1","SK":"META"},"newImage":{"status":"CONFIRMED","priceINR":1500,"mentorId":"MENTOR#m1","studentId":"stu1"},"ts":"2026-07-15T09:30:00.000Z"}
```

`keys` and `newImage` are nested JSON objects; `newImage` is a **PII-free allow-list** of
analytic fields (status, amounts, ids, timestamps) — emails/OTPs/free-text are dropped at
the source.

## Why partition projection (NOT a Glue crawler)

Partitioning by `dt` keeps every scan tiny (query one day = read one prefix). We declare
the partitions with **partition projection** — Athena computes partition locations from the
`dt` range at query time, so:

- **No Glue crawler** to schedule/run → **no ongoing crawler cost** and nothing to keep in
  sync as new days land.
- **No `MSCK REPAIR TABLE` / `ALTER TABLE ADD PARTITION`** bookkeeping — a new day is
  queryable the moment its first object is written.

## DDL

One external table per source table. `keys`/`newImage` are typed as `string` (raw JSON) and
parsed with Athena's `json_extract_scalar` in queries — robust to the image varying by row.

> Create a database once: `CREATE DATABASE IF NOT EXISTS sc_analytics;`
> Set the Athena workgroup's query-result location to a scratch prefix, e.g.
> `s3://sc-<stage>-analytics/_athena-results/` (owner: confirm per stage).

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS sc_analytics.bookings (
  `table`     string,
  `eventName` string,
  `keys`      string,
  `newImage`  string,
  `ts`        string
)
PARTITIONED BY (`dt` string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://sc-dev-analytics/sc-dev-bookings/'
TBLPROPERTIES (
  'projection.enabled'          = 'true',
  'projection.dt.type'          = 'date',
  'projection.dt.format'        = 'yyyy-MM-dd',
  'projection.dt.range'         = '2026-01-01,NOW',
  'projection.dt.interval'      = '1',
  'projection.dt.interval.unit' = 'DAYS',
  'storage.location.template'   = 's3://sc-dev-analytics/sc-dev-bookings/dt=${dt}/'
);
```

The Mentors table is identical — swap `bookings` → `mentors` and the two `sc-dev-bookings`
paths → `sc-dev-mentors`:

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS sc_analytics.mentors (
  `table`     string,
  `eventName` string,
  `keys`      string,
  `newImage`  string,
  `ts`        string
)
PARTITIONED BY (`dt` string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://sc-dev-mentors-path-goes-here/'
TBLPROPERTIES (
  'projection.enabled'          = 'true',
  'projection.dt.type'          = 'date',
  'projection.dt.format'        = 'yyyy-MM-dd',
  'projection.dt.range'         = '2026-01-01,NOW',
  'projection.dt.interval'      = '1',
  'projection.dt.interval.unit' = 'DAYS',
  'storage.location.template'   = 's3://sc-dev-analytics/sc-dev-mentors/dt=${dt}/'
);
```

> For **prod/staging**, replace `sc-dev-analytics` with `sc-<stage>-analytics` and the
> source-table prefixes with `sc-<stage>-bookings` / `sc-<stage>-mentors`.

## Example queries

Confirmed-booking revenue for one day (scans only that `dt` prefix):

```sql
SELECT
  CAST(json_extract_scalar(newImage, '$.priceINR') AS integer) AS priceINR,
  json_extract_scalar(newImage, '$.mentorId')                  AS mentorId
FROM sc_analytics.bookings
WHERE dt = '2026-07-15'
  AND json_extract_scalar(newImage, '$.status') = 'CONFIRMED';
```

Daily booking funnel by status:

```sql
SELECT dt,
       json_extract_scalar(newImage, '$.status') AS status,
       count(*) AS events
FROM sc_analytics.bookings
WHERE dt BETWEEN '2026-07-01' AND '2026-07-15'
GROUP BY 1, 2
ORDER BY 1, 2;
```

## Cost notes

- **S3**: pennies/GB; objects self-expire at **365 days** (bucket lifecycle rule).
- **Athena**: pay-per-**scan**; `dt` partition + selective columns keep scans tiny.
- **No Glue crawler, no Firehose, no always-on infra.** The stream Lambda and the daily
  reconcile Lambda both scale to zero.
