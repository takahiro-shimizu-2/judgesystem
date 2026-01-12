from pathlib import Path
import glob
import os
import time
import re
import warnings
warnings.simplefilter(action="ignore", category=FutureWarning)
import argparse

import requests
from bs4 import BeautifulSoup
import pandas as pd
import numpy as np
from ftfy import fix_encoding
from ftfy.badness import badness

if False:
    # want to remove quote...
    df = pd.read_csv("防衛省_陸上自衛隊_80.txt",sep="\t")
    df.to_csv("防衛省_陸上自衛隊_80_2.txt", sep="\t", index=False)

def convert_input_list(input_list="data/リスト_防衛省入札_1.txt", output_list="data/リスト_防衛省入札_2.txt"):
    df = pd.read_csv(input_list,sep="\t")
    df["入札公告（現在募集中）"] = df["入札公告（現在募集中）"].apply(lambda x: f"<a href='{x}'>{x}</a>")
    df.to_csv(output_list, sep="\t", index=False)
    df.to_html(Path(output_list).with_suffix(".html"), escape=False)
    return df


# 防衛省サンプル
def listup_bid_pdf_url(
    output_dir,
    target_url,
    topAgencyName,
    subAgencyName,
    output_file
    ):
    # output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)

    # baseurl = str(Path(target_url).parent) # これだと / が \\ になってしまうのでNG。
    baseurl = os.path.dirname(target_url)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp",
        "Connection": "keep-alive",
    }

    # response = requests.get(url=url)  # 403
    if target_url.startswith("https://tinyurl.com"):
        # ヘッダーを付けるとredirectページから遷移しない。
        # ヘッダーをつけなければ、直接、最終遷移先urlを返す模様。
        response = requests.head(target_url, allow_redirects=True)
        if response.url.startswith("https://tinyurl.com"):
            print("tinyurlのリダイレクトページが引き続きtinyurlでした。処理を終了します")
            return None
        response = requests.get(url=response.url, headers=headers)
        # baseurl 修正。
        baseurl = os.path.dirname(response.url)
    elif target_url.startswith("https"):
        response = requests.get(url=target_url, headers=headers)
    else:
        print("文字列の先頭がhttpsではありません。処理を終了します。")
        return None

    # response.encoding
    response.encoding = "utf-8"
    soup = BeautifulSoup(response.text, "html.parser")

    # 元々は、すべての table 要素を取得しようとしていたが、
    # そもそもtableにまとまっているのかすら不明なのでやめた。
    # tables = soup.find_all("table")
    links = soup.find_all("a")
    href_list = []
    for link in links:
        href = link.get("href")
        if href is not None and href.startswith("https://"):
            href_to_append = href
        else:
            href_to_append = fr'{baseurl}/{href}'

        if href is not None and href.endswith(".pdf"):
            href_list.append([
                link.text, 
                "", 
                topAgencyName,
                subAgencyName,
                "",
                "",
                "",
                "",
                "",
                href_to_append,
                False,
                ""
            ])

    df = pd.DataFrame(href_list, columns=[
        "workName", 
        "userAnnNo",
        "topAgencyName",
        "subAgencyName",
        "publishDate",
        "docDistEnd",
        "submissionEnd",
        "bidEndDate",
        "remarks",
        "pdfUrl",
        "transferFlag",
        "reasonForNG"
    ])
    df.to_csv(fr"{output_dir}/{output_file}", index=False, sep="\t")
    print(fr"Saved {output_dir}/{output_file}.")
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="")
    parser.add_argument("--input_list1", default="data/リスト_防衛省入札_1.txt")
    parser.add_argument("--input_list2", default="data/リスト_防衛省入札_2.txt")
    parser.add_argument("--output_dir_base", default="output")
    parser.add_argument("--topAgencyName", default="防衛省")
    parser.add_argument("--skip_listup", action="store_true")
    parser.add_argument("--skip_url_requests", action="store_true")

    args = parser.parse_args()
    input_list1 = args.input_list1
    input_list2 = args.input_list2
    output_dir_base = args.output_dir_base
    topAgencyName = args.topAgencyName
    skip_listup = args.skip_listup
    skip_url_requests = args.skip_url_requests

    output_dir1 = fr"{output_dir_base}/each_list"
    output_dir_pdf_base = fr"{output_dir_base}/pdf"
    os.makedirs(output_dir1, exist_ok=True)
    output_file_each_list_all = fr"{output_dir_base}/_all.txt"
    output_save_path = fr"{output_dir_base}/save_path.txt"

    pdf_requests_skip_urls = [
        "https://www.mod.go.jp/gsdf/wae/info/",
        "https://www.mod.go.jp/gsdf/nae/fin/nafin",
        "https://www.mod.go.jp/gsdf/neae/koukoku"
    ]


    df = convert_input_list(input_list=input_list1, output_list=input_list2)
    # df = pd.read_csv(input_list2, sep="\t")    

    # exit(1)

    if not skip_listup:
        for target_index in df["index"]:
            if False:
                target_index = 4
                subAgencyName = df["Unnamed: 0"][target_index]
                target_url = BeautifulSoup(df["入札公告（現在募集中）"][target_index], "html.parser").a["href"]
            subAgencyName = df["Unnamed: 0"][target_index]
            target_url = BeautifulSoup(df["入札公告（現在募集中）"][target_index], "html.parser").a["href"]

            output_file = fr"{topAgencyName}_{subAgencyName}_{target_index}.txt"

            #if os.path.exists(fr"{output_dir1}/{output_file}"):
            #    print(fr"Skip: {output_dir1}/{output_file} already exists.")
            #    continue
            if not target_url.startswith("https"):
                print("文字列の先頭がhttpsではありません。処理を終了します。")
                continue

            time.sleep(5)
            listup_bid_pdf_url(
                output_dir=output_dir1,
                target_url=target_url,
                topAgencyName=topAgencyName,
                subAgencyName=subAgencyName,
                output_file=output_file
            )


    fs = glob.glob(fr"{output_dir1}/*.txt")
    fs = [f for f in fs if f.find("_bak.txt") == -1 and Path(f).name != "_all.txt"]
    if False:
        for f in fs:
            re.search(r'(\d+)\.txt$', f).group(1)
    fs = sorted(fs, key=lambda x: int(re.search(r'(\d+)\.txt$', x).group(1)))


    def my_read_csv(file, file_for_blank, input_df):
        d1 = pd.read_csv(file,sep="\t")
        if d1.shape[0] == 0:
            blank_df = pd.read_csv(file_for_blank,sep="\t", nrows=1)
            blank_df.loc[0] = None
            d1 = blank_df
        else:
            score = np.mean([badness(i) for i in d1["workName"] if isinstance(i,str)])
            if score > 1:
                d1["workName"] = "xxxx"

            # 列の文字列から全角スペースを削除
            d1["workName"] = d1["workName"].str.replace("\u3000", "", regex=False)
            # 特殊文字削除
            for cname in ["workName","pdfUrl"]:
                d1[cname] = d1[cname].str.replace("\n", "", regex=False)
                d1[cname] = d1[cname].str.replace("\r", "", regex=False)
                d1[cname] = d1[cname].str.replace("\t", "", regex=False)
                d1[cname] = d1[cname].str.replace('"', "", regex=False)

        target_url = BeautifulSoup(input_df[input_df["index"] == int(Path(file).stem.split("_")[2])]["入札公告（現在募集中）"].iloc[0], "html.parser").a["href"]
        d1.insert(0,"base_url", target_url)
        d1.insert(0,"index", int(Path(file).stem.split("_")[2]))
        return d1
    file_for_blank = fs[0]
    result_df_list = [my_read_csv(file=i,file_for_blank=file_for_blank,input_df=df) for i in fs]

    result_df = pd.concat(result_df_list, ignore_index=True)
    result_df["is_saved"] = None
    result_df.to_csv(output_file_each_list_all, sep="\t", index=False)

    # exit(1)

    save_path_list = []
    for i, row in result_df.iterrows():
        index_value = row["index"]
        pdfurl = row["pdfUrl"]
        if pdfurl is None:
            save_path_list.append(None)
            continue
        # https://www.mod.go.jp/j/budget/chotatsu/naikyoku/koubo/https://warp.da.ndl.go.jp/info:ndljp/pid/11450712/www.mod.go.jp/j/procurement/chotatsu/naikyoku/iken/pdf/20180131.pdf
        # https://www.mod.go.jp/gsdf/wae/info/nyusatu/wa-fin/kou/R6ippan.files/https://www.mod.go.jp/gsdf/wae/info/nyusatu/wa-fin/06/363_oo_0229_009_002.pdf 

        # フォルダ毎にpdfファイルが5000ファイル程度になるように、
        # 別途事前にインデックス数を調整してある。
        if index_value < 15:
            output_dir_pdf = fr"{output_dir_pdf_base}1"
        elif index_value < 19:
            output_dir_pdf = fr"{output_dir_pdf_base}2"
        elif index_value < 45:
            output_dir_pdf = fr"{output_dir_pdf_base}3"
        elif index_value < 50:
            output_dir_pdf = fr"{output_dir_pdf_base}4"
        elif index_value < 51:
            output_dir_pdf = fr"{output_dir_pdf_base}5"
        elif index_value < 53:
            output_dir_pdf = fr"{output_dir_pdf_base}6"
        elif index_value < 58:
            output_dir_pdf = fr"{output_dir_pdf_base}7"
        elif index_value < 99:
            output_dir_pdf = fr"{output_dir_pdf_base}8"
        elif index_value < 373:
            output_dir_pdf = fr"{output_dir_pdf_base}9"
        elif index_value < 437:
            output_dir_pdf = fr"{output_dir_pdf_base}10"
        elif index_value < 451:
            output_dir_pdf = fr"{output_dir_pdf_base}11"
        elif index_value < 495:
            output_dir_pdf = fr"{output_dir_pdf_base}12"
        elif index_value < 1557:
            output_dir_pdf = fr"{output_dir_pdf_base}13"
        else:
            output_dir_pdf = fr"{output_dir_pdf_base}14"

        if not os.path.exists(output_dir_pdf):
            os.makedirs(output_dir_pdf, exist_ok=True)

        output_file_pdf = fr"{output_dir_pdf}/{index_value}_{Path(pdfurl).name}"
        save_path = Path(output_file_pdf)

        save_path_list.append(save_path)
        if skip_url_requests:
            continue

        if os.path.exists(output_file_pdf):
            print(fr"Skip: {output_file_pdf} already exists.")
            continue

        for skipurl in pdf_requests_skip_urls:
            if pdfurl.startswith(skipurl):
                print(fr"Skip url: {skipurl}...")
                continue

        if pdfurl is not None and not pdfurl.startswith("https://tinyurl"):
            print(pdfurl)

            try:
                # PDF をダウンロード
                response = requests.get(pdfurl, headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36",
                    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp",
                    "Connection": "keep-alive",
                })
                response.raise_for_status()  # エラーがあれば例外を出す
            except requests.exceptions.HTTPError as e:
                print(f"HTTP エラー: {pdfurl} -> {e}")
                time.sleep(1)
                continue  # エラーが出ても次の URL に進む
            except requests.exceptions.RequestException as e:
                print(f"通信エラー: {pdfurl} -> {e}")
                time.sleep(1)
                continue
            time.sleep(3)
            save_path.write_bytes(response.content)
            print(fr"Saved {save_path}.")

    is_saved = []
    for p in save_path_list:
        if p is not None and os.path.exists(p):
            is_saved.append(True)
        else:
            is_saved.append(False)
    result_df["is_saved"] = is_saved
    result_df.to_csv(output_file_each_list_all, sep="\t", index=False)

    with open(output_save_path, "w", encoding="utf-8") as f:
        _ = f.write("save_path\n")
        for a in save_path_list:
            a2 = str(a).replace("\\","/")
            _ = f.write(a2 + "\n")
