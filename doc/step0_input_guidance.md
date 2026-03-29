# Step0 Input Guidance

## list_mod_bid*.txt

- `data/urllist/list_mod_bid.txt` enumerates every announcement source page. The `index` column is the stable identifier used across step0 (HTML fetch → link extraction → DB save → PDF naming). Do **not** renumber rows or reuse indices for different pages.
- When splitting the list, **balance by PDF link counts**, not by line counts. For example, `list_mod_bid_1_2.txt` contains indices `0-58` (陸自 西部方面隊) and alone produces ~40k PDF links, so the remaining ~3k indices (in `list_mod_bid_2_2.txt`) account for ~31k links. Inspect `output/announcements_links.txt` to measure the distribution.
- Additional splits (e.g., `list_mod_bid_1_5.txt` … `list_mod_bid_5_5.txt`) should be created by aggregating indices until each chunk yields a manageable number of PDF links. Simple equal-line splits cause the first chunk to exceed 60k links while the others stay under 2k.
- Execute each split sequentially against the same DB/output root; this yields the same final dataset as processing the full list once.

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
- Large-scale OCR JSON generation (e.g., 17k documents) is expensive. Limit the scope via split files and/or `--ocr_max_api_calls_per_run` to avoid week-long runs.
