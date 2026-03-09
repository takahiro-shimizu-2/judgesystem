from bs4 import BeautifulSoup
import pandas as pd
from urllib.parse import urlparse, urljoin
import os
from datetime import datetime
from pathlib import Path
from pathlib import PurePosixPath
from pypdf import PdfReader
from tqdm import tqdm
import csv
import numpy as np
import argparse

# index == 公告ページを識別する番号。
# index を 100000 倍(10万倍) する。



def append_new_documents_by_group(file1="output/announcements_document_202602162218.txt", file2="output/announcements_document_202603031408.txt", base_digits=5):
    if False:
        base_digits=5
        file1="output/announcements_document_202602162218.txt"
        file2="output/announcements_document_202603031408.txt"

    df1 = pd.read_csv(file1, sep="\t", quoting=csv.QUOTE_NONE)
    df2 = pd.read_csv(file2, sep="\t", quoting=csv.QUOTE_NONE)
    """
    df1 に存在しない document_id を持つ df2 のレコードを追加する。
    announcement_id は group ごとに再採番。
    
    Parameters
    ----------
    df1 : pd.DataFrame
    df2 : pd.DataFrame
    base_digits : int
        announcement_id の group 桁数（例: 6）
    
    Returns
    -------
    pd.DataFrame
    """
    df1 = df1.copy()
    df2 = df2.copy()

    divisor = 10 ** base_digits
    df1["announcement_group"] = df1["announcement_id"] // divisor
    df2["announcement_group"] = df2["announcement_id"] // divisor

    df1["announcement_group"].value_counts()
    df2["announcement_group"].value_counts()

    result_list = []
    group = 1
    df1[df1["announcement_group"]==group]

    for group in df2["announcement_group"].unique():
        df1_g = df1[df1["announcement_group"] == group]
        df2_g = df2[df2["announcement_group"] == group]

        if df2_g.empty:
            continue

        # df1 に存在しない document_id だけ抽出
        existing_docs = set(df1_g["document_id"])
        df2_new = df2_g[~df2_g["document_id"].isin(existing_docs)].copy()

        if df2_new.empty:
            continue

        # group ごとの最大 announcement_id を基準に再採番
        group_max_id = df1_g["announcement_id"].max() if not df1_g.empty else group * divisor
        new_id_counter = group_max_id

        # 元 announcement_id ごとに新IDを割り当て（重複保持）
        unique_old_ids = df2_new["announcement_id"].unique()
        id_map = {}
        for old_id in unique_old_ids:
            new_id_counter += 1
            id_map[old_id] = new_id_counter

        df2_new["announcement_id"] = df2_new["announcement_id"].map(id_map)

        result_list.append(df2_new)

    # 結合
    if result_list:
        df_append = pd.concat(result_list, ignore_index=True)
        final_df = pd.concat([df1, df_append], ignore_index=True)
    else:
        final_df = df1.copy()

    # helper列削除
    final_df = final_df.drop(columns=["announcement_group"])

    # ソート: announcement_id → fileFormat (pdfを先に) → document_id
    # fileFormatのソートキー: pdfなら0、それ以外は1 (pdfが先に来る)
    final_df["_sort_fileformat"] = final_df["fileFormat"].apply(lambda x: 0 if x == "pdf" else 1)
    final_df.sort_values(["announcement_id", "_sort_fileformat", "document_id"], inplace=True)
    final_df = final_df.drop(columns=["_sort_fileformat"])

    return final_df

if False:
    df1_updated = append_new_documents_by_group(file1="output/announcements_document_202602162218.txt", file2="output/announcements_document_202603031408.txt", base_digits=5)
    df1_updated.to_csv(fr"output/announcements_document_202603031408_merged.txt", sep="\t", index=False)


def compare_result(file1="output/announcements_document_202602162218.txt", file2="output/announcements_document_202603031408.txt"):
    if False:
        file1="output/announcements_document_202602162218.txt"
        file2="output/announcements_document_202603031408.txt"

    df1 = pd.read_csv(file1, sep="\t", quoting=csv.QUOTE_NONE)
    df2 = pd.read_csv(file2, sep="\t", quoting=csv.QUOTE_NONE)

    all_document_ids = pd.concat([df1["document_id"],df2["document_id"]]).unique()
    document_id = all_document_ids[0]
    if False:
        chk = []
        for document_id in tqdm(all_document_ids, total=len(all_document_ids)):
            tmpdf1 = df1[df1["document_id"]==document_id]
            tmpdf2 = df2[df2["document_id"]==document_id]
            # 新しく追加
            if tmpdf1.shape[0] == 0:
                continue
            # 消された
            if tmpdf2.shape[0] == 0:
                continue
            # 同じ
            if tmpdf1.shape[0] == tmpdf2.shape[0]:
                continue
            # => document_idの件数が違ってる。
            # => 異なる公告がまとめられている可能性はある。
            #    df1 で少ないなら、df2で多いということであり、公告が増えた可能性。
            chk.append(document_id)
    else:
        # document_id ごとの件数を集計
        count1 = df1.groupby("document_id").size()
        count2 = df2.groupby("document_id").size()
        # index を揃える
        count1, count2 = count1.align(count2, fill_value=0)
        # document_idの件数が違ってる。
        chk = count1[(count1 != 0) & (count2 != 0) & (count1 != count2)].index.tolist()
        # document_idの件数が違ってる。df1で少ない。
        chk = count1[(count1 != 0) & (count2 != 0) & (count1 < count2)].index.tolist()
        len(chk)
        print(chk)
        document_id = chk[0]
        document_id = chk[1]
        document_id = chk[2]
        document_id = chk[3]
        document_id = chk[4]
        tmpdf1 = df1[df1["document_id"]==document_id]
        tmpdf2 = df2[df2["document_id"]==document_id]
        tmpdf1
        tmpdf2
        tmpdf2["base_link"].values[0]

        tmpdf3 = df1[df1["announcement_id"]==34800002]
        tmpdf4 = df2[df2["announcement_id"]==34800002]
        tmpdf4
    # 新規の document_id という事だけで単純に追加するか。
    # document_id ごとの件数を集計
    count1 = df1.groupby("document_id").size()
    count2 = df2.groupby("document_id").size()
    # index を揃える
    count1, count2 = count1.align(count2, fill_value=0)
    # 新規
    chk = count1[(count1 == 0) & (count2 > 0)].index.tolist()
    df2_new = df2[df2["document_id"].isin(chk)]




if False:
    df1_doc_announcement_count = (
        df1.groupby("document_id")["announcement_id"]
        .nunique()
        .reset_index(name="announcement_count")
    )
    df1_announcement_doc_count = (
        df1.groupby("announcement_id")["document_id"]
        .nunique()
        .reset_index(name="doc_count_in_announcement")
    )
    df1_2 = df1.merge(df1_announcement_doc_count, on="announcement_id", how="left")
    result1 = (
        df1_2.groupby("document_id")
        .agg(
            announcement_count=("announcement_id", "nunique"),
            announcement_doc_counts=("doc_count_in_announcement", list)
        )
        .reset_index()
    )
    result1["announcement_count"].value_counts()




if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Format bid announcement documents")

    # 入力ファイル
    parser.add_argument("--input1",
                       default="../1_source2_just_extract_html_source/data/リスト_防衛省入札_2.txt",
                       help="Input file 1: リスト_防衛省入札")
    parser.add_argument("--input2",
                       default=None,
                       help="Input file 2: announcements_document_*.txt (If not specified, uses latest file in ../2_gen_by_claude/output/)")
    parser.add_argument("--input2_dir",
                       default="../2_gen_by_claude/output",
                       help="Directory to search for latest announcements_document file when --input2 is not specified")

    # 出力設定
    parser.add_argument("--output_base",
                       default="output",
                       help="Base output directory")
    parser.add_argument("--timestamp",
                       default=None,
                       help="Timestamp for output directory (format: YYYYMMDDHHMM). If not specified, current time will be used")
    parser.add_argument("--output_dir_for_get_documents",
                       default="output_v3",
                       help="Output directory for get_documents")

    # その他のパラメータ
    parser.add_argument("--extracted_at",
                       default=datetime.now().strftime("%Y-%m-%d"),
                       help="Extraction date (format: YYYY-MM-DD)")
    parser.add_argument("--no_merge",
                       action="store_true",
                       help="Do not merge with previous result (default: merge is enabled)")
    parser.add_argument("--base_digits",
                       type=int,
                       default=5,
                       help="Base digits for announcement_id grouping (default: 5)")
    parser.add_argument("--stop_processing",
                       action="store_true",
                       help="Stop processing before main logic")

    args = parser.parse_args()

    # スクリプトのディレクトリを取得（相対パスを解決するため）
    script_dir = Path(__file__).parent

    # タイムスタンプの設定
    if args.timestamp is None:
        timestamp = datetime.now().strftime("%Y%m%d%H%M")
    else:
        timestamp = args.timestamp

    # 入力ファイル1の読み込み（相対パスの場合はスクリプトディレクトリ基準で解決）
    path1 = args.input1
    if not Path(path1).is_absolute():
        path1 = script_dir / path1

    if not path1.exists():
        raise FileNotFoundError(f"Input file 1 not found: {path1}")

    df1 = pd.read_csv(path1, sep="\t")

    # 入力ファイル2の決定（指定がない場合は最新ファイルを自動選択）
    if args.input2 is None:
        input2_dir = Path(args.input2_dir)
        if not input2_dir.is_absolute():
            input2_dir = script_dir / input2_dir

        if not input2_dir.exists():
            raise FileNotFoundError(f"Input2 directory not found: {input2_dir}")

        # announcements_document_*.txt の最新ファイルを検索
        pattern = "announcements_document_*.txt"
        matching_files = sorted(input2_dir.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)

        if not matching_files:
            raise FileNotFoundError(f"No {pattern} files found in {input2_dir}")

        path2 = str(matching_files[0])
        print(f"Using latest input2 file: {path2}")
    else:
        path2 = args.input2

    df2 = pd.read_csv(path2, sep="\t", quoting=csv.QUOTE_NONE)

    df2["announcement_name"] = (df2["announcement_name"].str.replace('"', '', regex=False))
    df2["link_text"] = (df2["link_text"].str.replace('"', '', regex=False))

    # =======================================================================
    # 出力設定
    output_base = Path(args.output_base)
    if not output_base.is_absolute():
        output_base = script_dir / output_base

    output_dir = output_base / timestamp
    os.makedirs(output_dir, exist_ok=True)
    output_path1 = output_dir / f"announcements_document_{timestamp}.txt"
    output_dir_for_get_documents = args.output_dir_for_get_documents
    # =======================================================================
    if args.stop_processing:
        exit(1)

    # target_link から index 取得。
    # ex. 00001_防衛省_内部部局.html  => 1
    df2.insert(0, "index", df2["target_link"].str.split("_").str[0].astype(int))
    df2["adhoc_index"] = df2["target_link"].apply(lambda x: f"{int(x.split('_')[0]):05d}")

    df1_sub = df1[["index","落札情報（過去）2"]].copy()

    def parent_url(url):
        # NaN や None を弾く
        if not isinstance(url, str) or not url.startswith("https://"):
            return None
        parsed = urlparse(url)
        # パス部分の最後の要素を削除
        parent_path = os.path.dirname(parsed.path)
        # URL を再構築
        return f"{parsed.scheme}://{parsed.netloc}{parent_path}"

    df1_sub["base_link_parent"] = df1_sub["落札情報（過去）2"].apply(parent_url)

    df1_sub = df1_sub.rename(columns={"落札情報（過去）2": "base_link"})

    # df2 に、df1_sub をマージする。キーは、df2 は idx 列。df1 は、index 列。
    df_merged = df2.merge(
        df1_sub,
        on="index",
        how="left"
    )
    df_merged.shape[0] == df2.shape[0]

    df_merged["pdf_full_url"] = df_merged.apply(
        lambda row: urljoin(row["base_link_parent"] + "/", row["pdf_link"]) if row["base_link_parent"] is not None else row["pdf_link"],
        axis=1
    )
    if False:
        1
        tmpval = []
        for i,row in df_merged.iterrows():
            v = urljoin(row["base_link_parent"] + "/", row["pdf_link"])
            tmpval.append(v)


    df_merged.head(3)

    df_merged["index"] = df_merged["index"] * 100000
    df_merged["announcement_id"] = df_merged["pre_announcement_id"] + df_merged["index"]

    # df_merged["document_id"] = df_merged.groupby(["announcement_id"]).cumcount() + 1
    # document_id 設定。
    # 以前のsave_path
    # ファイルと1対1の対応がつけばよい。(<= 保存先のため)
    save_path_list = [None] * len(df_merged)
    for i,row in df_merged.iterrows():
        index = row["adhoc_index"]
        pdfurl = row["pdf_full_url"]
        target_url = row["base_link_parent"]

        # pdfurl または target_url が None の場合はスキップ
        if pdfurl is None or pd.isna(pdfurl) or target_url is None or pd.isna(target_url):
            # フォールバック: pdfurl が有効な場合はそれを使用
            if pdfurl is not None and not pd.isna(pdfurl):
                pname = pdfurl
            else:
                # 両方 None の場合はデフォルト名を使用
                pname = f"unknown_{i}"
        else:
            # pdfがある url と、公告一覧の url から共通部分を除去し、pdfの保存先として使う。
            # 問題点として、たとえば以下を共通とみなして除去される点がある。
            # 'https://www.mod.go.jp/j/budget/chotatsu/naikyoku/koubo'
            # 'https://warp.da.ndl.go.jp/info:ndljp/pid/11450712/www.mod.go.jp/j/procurement/chotatsu/naikyoku/iken/pdf/20161021.pdf'
            # common == 'https://w'
            common = os.path.commonprefix([pdfurl, target_url])
            pname = pdfurl[len(common):]

        #print(pname)
        #p = Path(pname)
        pname = pname[1:] if pname.startswith('/') else pname
        p = PurePosixPath(pname)
        no_ext = str(p.with_suffix(""))
        no_ext = no_ext.replace(".","_").replace("\\","_").replace("/","_").replace(":","_")
        pname2 = no_ext + p.suffix
        #print(pname2)

        output_file_pdf = fr"{output_dir_for_get_documents}/pdf/pdf_{index}/{index}_{pname2}"
        save_path = Path(output_file_pdf)
        save_path_list[i] = save_path
    df_merged["save_path"] = [p.as_posix() for p in save_path_list]
    df_merged["document_id"] = df_merged["save_path"].apply(lambda p: Path(p).stem)

    # pdf_full_url が https: で始まらないレコードを除外
    before_filter_count = len(df_merged)
    df_merged = df_merged[df_merged["pdf_full_url"].str.startswith("https:", na=False)].copy()
    after_filter_count = len(df_merged)
    excluded_count = before_filter_count - after_filter_count
    print(f"Excluded {excluded_count} records where pdf_full_url does not start with 'https:' (before: {before_filter_count}, after: {after_filter_count})")

    df_merged[df_merged["announcement_id"]==100002]
    df_merged[df_merged["announcement_id"]==182200001]

    # ~~(announcement_id,document_id) の組で、重複は無し。~~ ある。
    tmpdf1 = df_merged.duplicated(subset=["announcement_id", "document_id"])
    tmpdf2 = df_merged.duplicated(subset=["link_text","announcement_id", "document_id"])

    # assert tmpdf2.any() == False

    df_merged["dup"] = tmpdf2
    df_merged["dup"].value_counts()

    # announcements_document 用に整形。
    ext = df_merged["pdf_full_url"].str.extract(r'\.([^.]+)$')[0].str.lower()
    df_new = pd.DataFrame({
        "announcement_id": df_merged["announcement_id"],
        "document_id":     df_merged["document_id"],
        "type":            [None]*df_merged.shape[0],
        "title":           df_merged["link_text"],
        "fileFormat":      ext.fillna(""),
        "pageCount":       np.where(ext == "pdf", -1, -2),
        "extractedAt":     [args.extracted_at]*df_merged.shape[0],
        "url":             df_merged["pdf_full_url"],
        "content":         ["dummy"]*df_merged.shape[0],
        "adhoc_index":     df_merged["adhoc_index"],
        "base_link_parent":df_merged["base_link_parent"],
        "base_link":df_merged["base_link"],
        "dup":df_merged["dup"],
        "save_path":df_merged["save_path"],
        "pdf_is_saved":[None]*df_merged.shape[0],
        "pdf_is_saved_date":[None]*df_merged.shape[0],
        "orderer_id":[None]*df_merged.shape[0],
        "topAgencyName":[None]*df_merged.shape[0],
        "category":[None]*df_merged.shape[0],
        "bidType":[None]*df_merged.shape[0]
    })

    #df_new.shape
    #df_new["fileFormat"].value_counts().reset_index(name="count")
    #df_new["fileFormat"].value_counts().reset_index(name="count").sum()
    #df_new.iloc[0:6,]

    # (?)
    # この時点で、過去バージョンの annoucnement_document があるなら、
    # それを参照しつつ、新しい行を追加する。
    # その後で、保存先を設定。
    # ということをしたい.

    # exit(1)

    # ソート: announcement_id → fileFormat (pdfを先に) → document_id
    df_new["_sort_fileformat"] = df_new["fileFormat"].apply(lambda x: 0 if x == "pdf" else 1)
    df_new.sort_values(["announcement_id", "_sort_fileformat", "document_id"], inplace=True)
    df_new = df_new.drop(columns=["_sort_fileformat"])

    df_new.to_csv(output_path1, sep="\t", index=False)
    print(f"Output saved to: {output_path1}")

    # 過去の結果とマージ
    merged_output_path = output_dir / f"announcements_document_{timestamp}_merged.txt"

    if not args.no_merge:
        # output_base配下のディレクトリを取得（今回のディレクトリを除く）
        if output_base.exists():
            # yyyymmddhhmm 形式のディレクトリを探す
            all_dirs = [d for d in output_base.iterdir() if d.is_dir() and d.name.isdigit()]
            # 今回のディレクトリを除外
            all_dirs = [d for d in all_dirs if d.name != timestamp]

            if all_dirs:
                # 最新のディレクトリを取得（ディレクトリ名でソート）
                latest_dir = sorted(all_dirs, reverse=True)[0]

                # 優先順位で過去ファイルを選択
                # 1. _merged_updated.txt
                # 2. _merged.txt
                # 3. announcements_document_*.txt (上記以外)

                previous_file = None

                # 優先順位1: _merged_updated.txt を探す
                merged_updated_files = list(latest_dir.glob("announcements_document_*_merged_updated.txt"))
                if merged_updated_files:
                    previous_file = str(sorted(merged_updated_files, key=lambda p: p.stat().st_mtime, reverse=True)[0])

                # 優先順位2: _merged.txt を探す
                if not previous_file:
                    merged_files = list(latest_dir.glob("announcements_document_*_merged.txt"))
                    if merged_files:
                        previous_file = str(sorted(merged_files, key=lambda p: p.stat().st_mtime, reverse=True)[0])

                # 優先順位3: その他のannouncements_document_*.txt
                if not previous_file:
                    pattern = "announcements_document_*.txt"
                    matching_files = sorted(latest_dir.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
                    # _merged.txt と _merged_updated.txt を除外
                    matching_files = [f for f in matching_files if not (f.name.endswith("_merged.txt") or f.name.endswith("_merged_updated.txt"))]
                    if matching_files:
                        previous_file = str(matching_files[0])

                if previous_file:
                    current_file = str(output_path1)

                    print(f"Merging with previous result: {previous_file}")

                    # マージ実行
                    df_merged_result = append_new_documents_by_group(
                        file1=previous_file,
                        file2=current_file,
                        base_digits=args.base_digits
                    )

                    # マージ結果を保存
                    df_merged_result.to_csv(merged_output_path, sep="\t", index=False)
                    print(f"Merged output saved to: {merged_output_path}")
                else:
                    print(f"No previous announcements_document file found in {latest_dir}")
                    print(f"Creating _merged.txt as copy of current output (first run)")
                    df_new.to_csv(merged_output_path, sep="\t", index=False)
            else:
                print(f"No previous output directories found in {output_base}")
                print(f"Creating _merged.txt as copy of current output (first run)")
                df_new.to_csv(merged_output_path, sep="\t", index=False)
        else:
            print(f"Output base directory does not exist: {output_base}")
            print(f"Creating _merged.txt as copy of current output (first run)")
            df_new.to_csv(merged_output_path, sep="\t", index=False)
    else:
        print("Skipping merge with previous result (--no_merge specified)")
        print(f"Creating _merged.txt as copy of current output (--no_merge mode)")
        df_new.to_csv(merged_output_path, sep="\t", index=False)

    if False:
        1

