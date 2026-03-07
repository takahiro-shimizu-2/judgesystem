#!/usr/bin/env python3
"""
Extract announcement links from HTML files and group them by announcement.
"""

import argparse
import os
import sys
from pathlib import Path
import re
from datetime import datetime


def extract_links_from_html(html_file_path):
    """
    Extract announcement links from a single HTML file.

    Args:
        html_file_path: Path to the HTML file

    Returns:
        List of announcement groups, where each group is:
        (announcement_id, announcement_name, [(link_text, pdf_link), ...])
    """
    with open(html_file_path, 'r', encoding='utf-8') as f:
        html_content = f.read()

    # Remove newlines within tags to make regex matching easier
    html_content = re.sub(r'<([^>]+)\n', lambda m: '<' + m.group(1).replace('\n', ' '), html_content)

    # Find all table rows
    tr_pattern = r'<tr[^>]*>(.*?)</tr>'
    rows = re.findall(tr_pattern, html_content, re.DOTALL | re.IGNORECASE)

    announcements = []
    announcement_id = 1

    for row_content in rows:
        # Find all <a> tags in this row
        a_pattern = r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>'
        links = re.findall(a_pattern, row_content, re.DOTALL | re.IGNORECASE)

        if not links:
            continue

        # Filter links that point to documents (pdf, xlsx, zip, etc.)
        doc_links = []
        for href, link_text in links:
            # Check if the link points to a document
            if re.search(r'\.(pdf|xlsx?|zip|docx?|txt)$', href, re.IGNORECASE):
                # Clean link text (remove HTML tags and extra whitespace)
                clean_text = re.sub(r'<[^>]+>', '', link_text)
                clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                doc_links.append((href, clean_text))

        if not doc_links:
            continue

        # Use the first link's text as announcement name
        announcement_name = doc_links[0][1]

        # Collect all links in this row
        row_links = []
        for href, link_text in doc_links:
            row_links.append((link_text, href))

        # Add this announcement group
        announcements.append((announcement_id, announcement_name, row_links))
        announcement_id += 1

    return announcements


def process_html_files(input_dir, output_file, id_column_name="pre_announcement_id"):
    """
    Process all HTML files in the input directory and generate output.

    Args:
        input_dir: Directory containing HTML files
        output_file: Output file path
        id_column_name: Name of the ID column in the output (default: "pre_announcement_id")
    """
    input_path = Path(input_dir)
    html_files = sorted(input_path.glob('*.html'))

    if not html_files:
        print(f"No HTML files found in {input_dir}")
        return

    print(f"Found {len(html_files)} HTML files")

    # Open output file
    with open(output_file, 'w', encoding='utf-8') as out_f:
        # Write header
        out_f.write(f"target_link\t{id_column_name}\tannouncement_name\tlink_text\tpdf_link\n")

        # Process each HTML file
        total_files_processed = 0
        total_announcements = 0
        total_links = 0

        for html_file in html_files:
            print(f"Processing {html_file.name}...")

            try:
                announcements = extract_links_from_html(html_file)

                file_links = 0
                for announcement_id, announcement_name, row_links in announcements:
                    for link_text, pdf_link in row_links:
                        out_f.write(f"{html_file.name}\t{announcement_id}\t{announcement_name}\t{link_text}\t{pdf_link}\n")
                        file_links += 1

                print(f"  Extracted {len(announcements)} announcements with {file_links} total links")
                total_files_processed += 1
                total_announcements += len(announcements)
                total_links += file_links

            except Exception as e:
                print(f"  Error processing {html_file.name}: {e}")
                import traceback
                traceback.print_exc()
                continue

    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Total files processed: {total_files_processed}")
    print(f"  Total announcements: {total_announcements}")
    print(f"  Total links: {total_links}")
    print(f"  Output file: {output_file}")
    print(f"{'='*60}")


def find_latest_each_list_dir(base_dir):
    """
    Find the latest each_list_yyyymmdd directory in the base directory.

    Args:
        base_dir: Path to the base directory (e.g., 1_source2_just_extract_html_source/output_v3)

    Returns:
        Path to the latest each_list_yyyymmdd directory, or None if not found
    """
    base_path = Path(base_dir)
    if not base_path.exists():
        return None

    # Find all directories matching each_list_*
    each_list_dirs = sorted(base_path.glob('each_list_*'), reverse=True)

    if not each_list_dirs:
        return None

    # Return the latest one (sorted in reverse order, so first is latest)
    return each_list_dirs[0]


def main():
    parser = argparse.ArgumentParser(
        description='Extract announcement links from HTML files and group them by announcement.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run with default paths (uses latest each_list_yyyymmdd)
  python extract_announcements.py

  # Run with specific input directory
  python extract_announcements.py \\
    --input "1_source2_just_extract_html_source/output_v3/each_list_20260303"

  # Custom input/output
  python extract_announcements.py \\
    --input "/path/to/html/files" \\
    --output "custom_output/announcements.txt" \\
    --id-column "announcement_id"
        """
    )

    parser.add_argument(
        '-i', '--input',
        type=str,
        help='Input directory containing HTML files (default: auto-detect latest each_list_yyyymmdd)',
        default=None
    )

    parser.add_argument(
        '-o', '--output',
        type=str,
        help='Output file path (default: output/announcements_document_yyyymmddhhmmss.txt)',
        default=None
    )

    parser.add_argument(
        '-c', '--id-column',
        type=str,
        help='Name of the ID column in the output (default: pre_announcement_id)',
        default='pre_announcement_id'
    )

    args = parser.parse_args()

    # Get the script directory
    script_dir = Path(__file__).parent

    # Set default paths if not provided
    if args.input is None:
        # Auto-detect latest each_list_yyyymmdd directory
        base_dir = script_dir.parent / "1_source2_just_extract_html_source" / "output_v3"
        input_dir = find_latest_each_list_dir(base_dir)

        if input_dir is None:
            print(f"Error: Could not find any each_list_* directory in {base_dir}")
            sys.exit(1)

        print(f"Auto-detected input directory: {input_dir.name}")
    else:
        input_dir = Path(args.input)
        if not input_dir.is_absolute():
            input_dir = script_dir / input_dir

    if args.output is None:
        # Generate timestamp for output file
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        output_dir = script_dir / "output"
        output_file = output_dir / f"announcements_document_{timestamp}.txt"
    else:
        output_file = Path(args.output)
        if not output_file.is_absolute():
            output_file = script_dir / output_file

    # Ensure output directory exists
    output_file.parent.mkdir(parents=True, exist_ok=True)

    print(f"Input directory: {input_dir}")
    print(f"Output file: {output_file}")
    print(f"ID column name: {args.id_column}")
    print()

    # Process HTML files
    process_html_files(input_dir, output_file, args.id_column)


if __name__ == "__main__":
    main()
