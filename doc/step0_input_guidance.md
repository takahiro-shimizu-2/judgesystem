# Step0 Input Guidance

## list_mod_bid*.txt

- `data/urllist/list_mod_bid.txt` enumerates every announcement source page. The `index` column is the stable identifier used across step0 (HTML fetch → link extraction → DB save → PDF naming). Do **not** renumber rows or reuse indices for different pages.
- To run step0 multiple times due to API limits (e.g., Vertex AI), split this file into subsets such as `list_mod_bid_1_2.txt` / `list_mod_bid_2_2.txt` while preserving the original `index` values. Execute step0 twice against the same DB/output root; the results are equivalent to processing the full file once.

## Skipping problematic pages

- Some legacy pages (陸上自衛隊 西部方面隊 indices 51–58) consistently return HTTP 404. Step0 excludes these via the skip index configuration.
- Configuration priority:
  1. Environment variable `STEP0_SKIP_INDICES` (comma/space separated numbers)
  2. `config/step0_skip_indices.json`
  3. Built-in defaults (`51-58`)
- Adjust these values if additional pages need to be skipped. Setting the env var to an empty string disables skipping.

## Re-fetch considerations

- HTML fetching currently runs for all rows; even skipped indices still attempt downloads. If a page is extremely slow or dead, consider adding it to the skip list and/or applying a smaller subset input file to avoid timeouts.
- Downstream outputs (`target_link`, `announcement_id`, `pdf_000xx`) rely on `index`, so keeping the identifier stable ensures re-runs merge cleanly with existing data.
