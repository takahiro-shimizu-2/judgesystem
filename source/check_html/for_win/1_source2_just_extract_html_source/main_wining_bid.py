from pathlib import Path
import glob
import os
import time
import re
import sys
import warnings
warnings.simplefilter(action="ignore", category=FutureWarning)
import argparse

import requests
from bs4 import BeautifulSoup, Comment, Doctype
import pandas as pd
import numpy as np
from ftfy import fix_encoding
from ftfy.badness import badness
import pdfplumber

from google import genai # For OCR
from google.genai.errors import ClientError
from google.genai import types
import json

if False:
    # want to remove quote...
    df = pd.read_csv("防衛省_陸上自衛隊_80.txt",sep="\t")
    df.to_csv("防衛省_陸上自衛隊_80_2.txt", sep="\t", index=False)

def convert_input_list(input_list="data/リスト_防衛省入札_1.txt", output_list="data/リスト_防衛省入札_2.txt", tinyurl_as_is=True):
    df = pd.read_csv(input_list,sep="\t")
    
    # TinyURL を展開する
    def expand_tinyurl(url):
        if isinstance(url, str) and url.startswith("https://tinyurl"):
            time.sleep(1)
            try:
                r = requests.get(url, allow_redirects=True, timeout=5)
                if r.url.startswith("https://tinyurl"):
                    return None
                return r.url
            except Exception:
                return None
        return url
    
    tmp_df = df["入札公告（現在募集中）"]
    df["入札公告（現在募集中）"] = df["入札公告（現在募集中）"].apply(lambda x: f"<a href='{x}'>{x}</a>")
    if not tinyurl_as_is:
        df.insert(df.columns.get_loc('入札公告（現在募集中）')+1, "入札公告（現在募集中）2", tmp_df.apply(expand_tinyurl))

    tmp_df = df["落札情報（過去）"]
    df["落札情報（過去）"] = df["落札情報（過去）"].apply(lambda x: f"<a href='{x}'>{x}</a>")
    if not tinyurl_as_is:
        df.insert(df.columns.get_loc('落札情報（過去）')+1, "落札情報（過去）2", tmp_df.apply(expand_tinyurl))
        
    df.to_csv(output_list, sep="\t", index=False)
    df.to_html(Path(output_list).with_suffix(".html"), escape=False)
    return df

# 防衛省サンプル
def listup_bid_pdf_url(
    output_dir,
    target_url,
    output_file,
    return_encode_info=False
    ):
    # output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)

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
            if return_encode_info:
                encode_info = {
                    "target_url": target_url,
                    "charset":None,
                    "charset_guess":None,
                    "is_page_exists":False
                }
                return encode_info
            return None
        elif response.url.endswith(".pdf"):
            print("tinyurlのリダイレクトページのurl文字列の末尾が.pdfで終わっています。処理を終了します。")
            if return_encode_info:
                encode_info = {
                    "target_url": target_url,
                    "charset":None,
                    "charset_guess":None,
                    "is_page_exists":False
                }
                return encode_info
            return None
        
        response = requests.get(url=response.url, headers=headers)
    elif target_url.startswith("https"):
        response = requests.get(url=target_url, headers=headers)
    else:
        print("文字列の先頭がhttpsではありません。処理を終了します。")
        if return_encode_info:
            encode_info = {
                "target_url": target_url,
                "charset":None,
                "charset_guess":None,
                "is_page_exists":False
            }
            return encode_info
        return None

    # response.encoding
    # response.encoding = "utf-8"
    # response.encoding = "shift_jis" # または "cp932"
    # response.encoding = response.apparent_encoding
    soup = BeautifulSoup(response.text, "html.parser")

    # encoding 判定
    # <meta> タグを探す
    charset = None
    meta = soup.find("meta", attrs={"charset": True})
    if meta:
        charset = meta["charset"]
    else:
        meta = soup.find("meta", attrs={"http-equiv": "Content-Type"})
        if meta and "charset=" in meta.get("content", ""):
            charset = meta["content"]
        else:
            print("HTML 内に charset 情報が見つからない")
    
    charset_dict = {
        "shift_jis":["cp932","shift-jis","shift_jis"],
        "utf-8":["utf-8"]
    }
    charset_guess = None
    if charset is not None:
        for key, value in charset_dict.items():
            for v in value:
                if re.search(v, charset, flags=re.IGNORECASE):
                    charset_guess = key
                    break

    encode_info = {
        "target_url": target_url,
        "charset":charset,
        "charset_guess":charset_guess,
        "is_page_exists":True
    }
    
    if charset_guess is not None:
        response.encoding = charset_guess
    else:
        # htmlソースから判定できなかったなら、ありそうなenc_listの中から文字化け具合のscoreを見て小さいものを設定。
        enc_list = list(set([i.lower() for i in [response.encoding, response.apparent_encoding, "shift_jis","utf-8"]]))
        score_list = []
        for i, enc in enumerate(enc_list):
            response.encoding = enc
            soup = BeautifulSoup(response.text, "html.parser")
            score = badness(response.text)
            score_list.append(score)
        charset_guess = enc_list[score_list.index(min(score_list))]
        response.encoding = charset_guess

    # encoding を設定して再度 Beautifulsoup を実行。
    soup = BeautifulSoup(response.text, "html.parser")

    # script と style を削除
    for tag in soup(["script", "style"]): 
        tag.decompose() 

    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        comment.extract()

    #for item in soup.contents: 
    #    if isinstance(item, Doctype): 
    #        item.extract()

    # 3. head を削除（公告抽出には不要） 
    #if soup.head: 
    #    soup.head.decompose()

    #for tag in soup(["header", "footer", "nav"]): 
    #    # tag.decompose()
    #    tag.unwrap()

    html = str(soup)
    # 改行と余計な空白を削除 
    html = re.sub(r"\s+", " ", html)
    # 連続空白を1つに
    html = html.strip()

    output_path_tmp = fr"{output_dir}/{output_file}"
    with open(output_path_tmp, "w", encoding="utf-8") as f:
        f.write(html)

    print(fr"Saved {output_path_tmp}.")
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="")
    parser.add_argument("--input_list1", default="data/リスト_防衛省入札_1.txt")
    parser.add_argument("--input_list2", default="data/リスト_防衛省入札_2.txt")
    parser.add_argument("--output_dir_base", default="output_v3_wining_bid")
    parser.add_argument("--topAgencyName", default="防衛省")
    parser.add_argument("--google_ai_studio_api_key_filepath", default="data/sec/google_ai_studio_api_key_mizu.txt")
    parser.add_argument("--do_url_requests", action="store_true")
    parser.add_argument("--return_encode_info", action="store_true")
    parser.add_argument("--stop_processing", action="store_true")

    args = parser.parse_args()
    input_list1 = args.input_list1
    input_list2 = args.input_list2
    output_dir_base = args.output_dir_base
    topAgencyName = args.topAgencyName
    google_ai_studio_api_key_filepath = "data/sec/google_ai_studio_api_key.txt"
    google_ai_studio_api_key_filepath = args.google_ai_studio_api_key_filepath

    do_url_requests = args.do_url_requests
    stop_processing = args.stop_processing
    return_encode_info = args.return_encode_info

    output_dir1 = fr"{output_dir_base}/each_list_2"
    # output_dir_pdf_base = fr"{output_dir_base}/pdf"
    os.makedirs(output_dir1, exist_ok=True)
    #output_file_each_list_all_v1 = fr"{output_dir_base}/_all_v1.txt"
    #output_file_each_list_all_v2 = fr"{output_dir_base}/_all_v2.txt"
    #output_file_each_list_all_v3 = fr"{output_dir_base}/_all_v3.txt"
    # output_save_path = fr"{output_dir_base}/save_path.txt"

    pdf_requests_skip_urls = [
        "https://www.mod.go.jp/gsdf/wae/info/",
        "https://www.mod.go.jp/gsdf/nae/fin/nafin",
        "https://www.mod.go.jp/gsdf/neae/koukoku"
    ]
    pdf_requests_skip_urls = ["dummy"]

    if stop_processing:
        exit(1)

    if not os.path.exists(input_list2):
        print("Converting the input file. This may take some time.")

        for i in range(10, 0, -1):
            print(f"\rexe in {i} seconds...", end="")
            sys.stdout.flush()
            time.sleep(1)

        print("\nExecuting!")
        time.sleep(1)
        df = convert_input_list(input_list=input_list1, output_list=input_list2, tinyurl_as_is=False)
    else:
        print(fr"File {input_list2} already exists.")
        time.sleep(1)
        df = pd.read_csv(input_list2,sep="\t")

    # df = pd.read_csv(input_list2, sep="\t")

    # 実行の前に、関数に与えるパラメータの一部を取得
    param_dict_list = []
    for i, row in df.iterrows():
        target_index = row["index"]
        subAgencyName = row["Unnamed: 0"]
        target_url = row["落札情報（過去）2"]
        output_file = fr"{target_index:05d}_{topAgencyName}_{subAgencyName}.html"
        output_dir = output_dir1

        param_dict_list.append(
            {
                "index":target_index,
                "subAgencyName":subAgencyName,
                "target_url":target_url,
                "output_dir":output_dir,
                "output_file":output_file
            }
        )
    param_df = pd.DataFrame(param_dict_list)

    cond1 = param_df["target_url"].str.startswith("https")
    cond2 = param_df["target_url"].str.startswith("https://tinyurl")
    cond3 = (
        param_df["target_url"].str.endswith(".pdf", na=False)
        & param_df["target_url"].str.startswith("https", na=False)
    )
    result = pd.DataFrame([
        {"項目": "全体", "件数": param_df.shape[0]},
        {"項目": "https で始まる", "件数": cond1.sum()},
        {"項目": "https://tinyurl で始まる", "件数": cond2.sum()},
        {"項目": "その他", "件数": (~(cond1 | cond2)).sum()},
        {"項目": "httpsで始まり、.pdfで終わる", "件数": cond3.sum()}
    ])
    print(result)

    is_ex1 = []
    for i, row in df.iterrows():
        target_index = row["index"]
        subAgencyName = row["Unnamed: 0"]
        target_url = row["落札情報（過去）2"]
        output_file = fr"{target_index:05d}_{topAgencyName}_{subAgencyName}.html"
        output_dir = output_dir1

        is_ex1.append(os.path.exists(fr"{output_dir_base}/each_list/{output_file}"))

    df["is_ex1"] = is_ex1
    df["is_ex1"].value_counts()

    # exit(1)
    encode_info_list = []

    for i, target_index in enumerate(df["index"]):
        # target_url = df["target_url"][i]
        target_url = df["落札情報（過去）2"][i]
        if isinstance(target_url, float):
            target_url = str(target_url)
        subAgencyName = df["Unnamed: 0"][i]
        output_dir = output_dir1
        output_file = fr"{target_index:05d}_{topAgencyName}_{subAgencyName}.html"

        if not isinstance(target_url, str) or not target_url.startswith("https"):
            print(f"処理スキップ: index={target_index}, 文字列の先頭がhttpsではありません。")
            continue

        if target_url.endswith(".pdf"):
            print(f"処理スキップ: index={target_index}, 文字列の末尾が.pdfで終わっています。")
            continue

        time.sleep(0.3)
        try:
            dummy = listup_bid_pdf_url(
                output_dir=output_dir,
                target_url=target_url,
                #topAgencyName=topAgencyName,
                #subAgencyName=subAgencyName,
                output_file=output_file,
                #google_ai_studio_api_key_filepath=google_ai_studio_api_key_filepath,
                #let_gemini_handle_url=[],
                return_encode_info = return_encode_info
            )
            encode_info_list.append(dummy)
        except Exception as e:
            print(f"エラー: index={target_index}, {e}")


    # exit(1)

    # pdf 保存処理は無し。
