#!/usr/bin/env python3
"""
Extract announcement links from HTML files and group them by announcement.
"""

import os
import sys
from pathlib import Path
import re


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


def process_html_files(input_dir, output_file):
    """
    Process all HTML files in the input directory and generate output.

    Args:
        input_dir: Directory containing HTML files
        output_file: Output file path
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
        out_f.write("target_link\tannouncement_id\tannouncement_name\tlink_text\tpdf_link\n")

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


def main():
    # Get the script directory
    script_dir = Path(__file__).parent.parent

    # Define paths
    input_dir = script_dir / "source2_just_extract_html_source" / "output_v3" / "each_list"
    output_dir = script_dir / "output_v2_20260205222731"
    output_file = output_dir / "announcements.txt"

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Input directory: {input_dir}")
    print(f"Output file: {output_file}")
    print()

    # Process HTML files
    process_html_files(input_dir, output_file)


if __name__ == "__main__":
    main()
