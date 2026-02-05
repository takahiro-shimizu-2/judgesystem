from pathlib import Path
import glob
import os
import time
import re
import warnings
warnings.simplefilter(action="ignore", category=FutureWarning)
import argparse

import requests
from bs4 import BeautifulSoup, Comment, Doctype
import pandas as pd
import numpy as np
from ftfy import fix_encoding
from ftfy.badness import badness
from PyPDF2 import PdfReader
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
    tmp_df = df["入札公告（現在募集中）"]
    df["入札公告（現在募集中）"] = df["入札公告（現在募集中）"].apply(lambda x: f"<a href='{x}'>{x}</a>")
    df.to_csv(output_list, sep="\t", index=False)

    # TinyURL を展開する関数
    def expand_tinyurl(url):
        if isinstance(url, str) and url.startswith("https://tinyurl"):
            time.sleep(1)
            try:
                r = requests.get(url, allow_redirects=True, timeout=5)
                return r.url   # 最終的な遷移先 URL
            except Exception:
                return None
        return url
    
    if not tinyurl_as_is:
        # 新しい列として追加
        df.insert(6, "入札公告（現在募集中）2", tmp_df.apply(expand_tinyurl))

    df.to_html(Path(output_list).with_suffix(".html"), escape=False)
    return df


# 防衛省サンプル
def listup_bid_pdf_url(
    output_dir,
    target_url,
    topAgencyName,
    subAgencyName,
    output_file,
    google_ai_studio_api_key_filepath,
    let_gemini_handle_url=[],
    return_encode_info=False
    ):
    # output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)

    # pdf リンクを絶対パスにするため target_url の dirname を baseurl とする。
    # baseurl = str(Path(target_url).parent) で処理しようとしていたが、これだと / が \\ になってしまうのでNG。
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
        # baseurl 修正。
        baseurl = os.path.dirname(response.url)
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
    if return_encode_info:
        return encode_info
    
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


    if target_url in let_gemini_handle_url:
        print(fr"listup_bid_pdf_url : Let gemini handle the url {target_url}")

        with open(google_ai_studio_api_key_filepath,"r") as f:
            key = f.read()

        client = genai.Client(api_key=key)
        prompt = """
        Goal: Extract announcement pdf links.

        Steps:
        Please extract the PDF links from the <a> tags and summarize them in JSON format.

        Notes:
        If the following condition is met, please group one or more PDFs into a list for each key. 
        Condition 1: The <tr> tag in the table contains multiple PDFs.

        Output Structure:
        Please output the JSON with numbered entries. Use the text of the <a> tag as the key. If multiple PDFs are associated, use the texts of the <a> tags concatenated with '/' as the key.

        ```json
        {
            "the_text_of_the_a_tag_1": [
                "pdf link1"
            ],
            "the_text_of_the_a_tag_2": [
                "pdf link1",
                "pdf link2",
                ...
            ]
            ...
        }
        ```
        """

        prompt = """
        Goal:
        Extract announcement PDF links grouped by each announcement (業務).

        Rules:
        - Do NOT group by <tr> or by date.
        - Each announcement is identified by the text of its <a> tag (業務名).
        - If a single announcement has multiple PDFs, group them into one list.

        Steps:
        1. For each <a> tag whose href ends with ".pdf":
        - Use the text content of the <a> tag as the key.
        - Extract the PDF link.
        2. If multiple <a> tags belong to the same announcement, group their PDF links into one list.
        3. If multiple <a> tags appear in the same <tr> but have different texts, treat them as separate announcements.

        Output Format:
        Output JSON where:
        - Key = text of the <a> tag (業務名)
        - Value = list of PDF URLs

        Example:
        {
        "業務名A": ["2020/0925a.pdf"],
        "業務名B": ["2020/1126a.pdf", "2020/1126b.pdf"]
        }
        """

        # script と style を削除
        for tag in soup(["script", "style"]): 
            tag.decompose() 

        for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
            comment.extract()

        for item in soup.contents: 
            if isinstance(item, Doctype): 
                item.extract()

        # 3. head を削除（公告抽出には不要） 
        if soup.head: 
            soup.head.decompose()

        for tag in soup(["head", "header", "footer", "nav"]): 
            tag.decompose()

        html = str(soup)
        # 改行と余計な空白を削除 
        html = re.sub(r"\s+", " ", html)
        # 連続空白を1つに
        html = html.strip()

        gemini_response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                html,
                prompt
            ]
        )
        # print(response.text)
        text=gemini_response.text
        text2 = text.replace('\n', '').replace('```json', '').replace("```","")
        json_data = json.loads(text2)

        df = pd.DataFrame(
            [(
                target_url,
                idx,
                k, 
                "", 
                topAgencyName,
                subAgencyName,
                "",
                "",
                "",
                "",
                "",
                v if v is not None and v.startswith("https://") else f"{baseurl}/{v}",
                False,
                ""
         ) for idx, (k, values) in enumerate(json_data.items()) for v in values],
            columns=[
                "target_url",
                "idx",
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
            ]
        )
    else:
        print(fr"listup_bid_pdf_url : Don't let gemini handle the url {target_url}")
        # tables = soup.find_all("table")
        # ↑元々は、すべての table 要素を取得しようとしていたが、
        # そもそもtableにまとまっているのかすら不明なのでやめた。

        links = soup.find_all("a")
        href_list = []
        for idx, link in enumerate(links):
            href = link.get("href")
            if href is not None and href.startswith("https://"):
                href_to_append = href
            else:
                href_to_append = fr'{baseurl}/{href}'

            if href is not None and href.endswith(".pdf"):
                href_list.append([
                    target_url,
                    idx,
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
            "target_url",
            "idx",
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
    parser.add_argument("--output_dir_base", default="output_v3")
    parser.add_argument("--topAgencyName", default="防衛省")
    parser.add_argument("--google_ai_studio_api_key_filepath", default="data/sec/google_ai_studio_api_key_mizu.txt")
    parser.add_argument("--do_listup", action="store_true")
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

    do_listup = args.do_listup
    do_url_requests = args.do_url_requests
    stop_processing = args.stop_processing
    return_encode_info = args.return_encode_info

    output_dir1 = fr"{output_dir_base}/each_list"
    output_dir_pdf_base = fr"{output_dir_base}/pdf"
    os.makedirs(output_dir1, exist_ok=True)
    output_file_each_list_all_v1 = fr"{output_dir_base}/_all_v1.txt"
    output_file_each_list_all_v2 = fr"{output_dir_base}/_all_v2.txt"
    output_file_each_list_all_v3 = fr"{output_dir_base}/_all_v3.txt"
    output_save_path = fr"{output_dir_base}/save_path.txt"

    pdf_requests_skip_urls = [
        "https://www.mod.go.jp/gsdf/wae/info/",
        "https://www.mod.go.jp/gsdf/nae/fin/nafin",
        "https://www.mod.go.jp/gsdf/neae/koukoku"
    ]
    pdf_requests_skip_urls = ["dummy"]

    if stop_processing:
        exit(1)

    df = convert_input_list(input_list=input_list1, output_list=input_list2, tinyurl_as_is=True)
    # df = pd.read_csv(input_list2, sep="\t")

    # exit(1)
    encode_info_list = []

    if False:
        fs_v2 = glob.glob("output_v2/each_list/*.txt")
        fs_v3 = glob.glob("output_v3/each_list/*.txt")

        fs_v2 = [Path(f.replace("\\","/")).name for f in fs_v2]
        fs_v3 = [Path(f.replace("\\","/")).name for f in fs_v3]
        result = [x for x in fs_v2 if x not in fs_v3]
        fs_v2_2 = [fr"output_v2/each_list/{f}" for f in result]
        a = [os.path.getsize(f) for f in fs_v2_2]




    if do_listup:
        if False:
            i = 1
            ds = []
            for i, target_index in enumerate(df["index"]):
                if i <= 2352:
                    continue
                if i % 10 == 0:
                    print(fr"{i} / {df.shape[0]}")
                subAgencyName = df["Unnamed: 0"][target_index]
                target_url = BeautifulSoup(df["入札公告（現在募集中）"][target_index], "html.parser").a["href"]

                output_file = fr"{target_index:05d}_{topAgencyName}_{subAgencyName}.txt"
                output_dir = output_dir1
                if os.path.exists(Path(output_dir) / output_file):
                    continue
                    
                if not target_url.startswith("https"):
                    continue

                if target_url.endswith(".pdf"):
                    continue

                try:
                    if target_url.startswith("https://tinyurl.com"):
                        time.sleep(0.3)
                        response = requests.head(target_url, allow_redirects=True)
                        if response.url.startswith("https://tinyurl.com"):
                            #print("tinyurlのリダイレクトページが引き続きtinyurlでした。処理を終了します")
                            continue
                        elif response.url.endswith(".pdf"):
                            #print("tinyurlのリダイレクトページのurl文字列の末尾が.pdfで終わっています。処理を終了します。")
                            continue
                    ds.append(target_index)
                except Exception as e:
                    print(e)

            target_index = ds[0]
            for i, target_index in enumerate(ds):
                subAgencyName = df["Unnamed: 0"][target_index]
                target_url = BeautifulSoup(df["入札公告（現在募集中）"][target_index], "html.parser").a["href"]

                output_file = fr"{target_index:05d}_{topAgencyName}_{subAgencyName}.txt"
                output_dir = output_dir1

                dummy = listup_bid_pdf_url(
                    output_dir=output_dir,
                    target_url=target_url,
                    topAgencyName=topAgencyName,
                    subAgencyName=subAgencyName,
                    output_file=output_file, 
                    google_ai_studio_api_key_filepath=    google_ai_studio_api_key_filepath,
                    let_gemini_handle_url=["https://www.mod.go.jp/j/budget/chotatsu/naikyoku/consul/gyomu.html"],
                    return_encode_info = return_encode_info
                )



        for i, target_index in enumerate(df["index"]):
            if False:
                target_index = 4
                subAgencyName = df["Unnamed: 0"][target_index]
                target_url = BeautifulSoup(df["入札公告（現在募集中）"][target_index], "html.parser").a["href"]

            subAgencyName = df["Unnamed: 0"][target_index]
            target_url = BeautifulSoup(df["入札公告（現在募集中）"][target_index], "html.parser").a["href"]

            output_file = fr"{target_index:05d}_{topAgencyName}_{subAgencyName}.txt"
            if False:
                fs = glob.glob("output_v2/each_list/*.txt")
                for i,f in enumerate(fs):

                    old_name = f
                    basefile = Path(old_name).name
                    dfile = Path(old_name).parent

                    # 拡張子と本体を分離
                    name, ext = basefile.rsplit(".", 1)
                    # アンダースコアで分割
                    parts = name.split("_")  # ['a', 'b', 'c']
                    num = parts[2].zfill(5)
                    # 並べ替え（例: c, a, b）
                    new_name = f"{num}_{parts[0]}_{parts[1]}.{ext}"

                    new_file = dfile / new_name
                    new_file = str(new_file)
                    os.rename(old_name, new_file)

            output_dir = output_dir1
            #if i not in [372, 374, 373, 356, 401, 400, 358, 409, 410, 398, 397]:
            #    continue

            #if os.path.exists(fr"{output_dir1}/{output_file}"):
            #    print(fr"Skip: {output_dir1}/{output_file} already exists.")
            #    continue
            if not target_url.startswith("https"):
                print("文字列の先頭がhttpsではありません。処理を終了します。")
                continue

            if target_url.endswith(".pdf"):
                print("文字列の末尾が.pdfで終わっています。処理を終了します。")
                continue

            time.sleep(1)
            try:
                dummy = listup_bid_pdf_url(
                    output_dir=output_dir,
                    target_url=target_url,
                    topAgencyName=topAgencyName,
                    subAgencyName=subAgencyName,
                    output_file=output_file, 
                    google_ai_studio_api_key_filepath=    google_ai_studio_api_key_filepath,
                    let_gemini_handle_url=["https://www.mod.go.jp/j/budget/chotatsu/naikyoku/consul/gyomu.html"],
                    return_encode_info = return_encode_info
                )
                encode_info_list.append(dummy)
            except Exception as e:
                print(e)

    if return_encode_info:
        encode_info_df = pd.DataFrame(encode_info_list)
        encode_info_df[encode_info_df["charset_guess"].isna()]
        encode_info_df[["charset", "charset_guess"]].apply(pd.value_counts)

    fs = glob.glob(fr"{output_dir1}/*.txt")
    fs = [f for f in fs if f.find("_bak.txt") == -1 and Path(f).name != "_all.txt"]
    if False:
        for f in fs:
            re.search(r'(\d+)\.txt$', f).group(1)
    fs.sort()


    def my_read_csv(file, file_for_blank, input_df, index_value):
        d1 = pd.read_csv(file,sep="\t")
        if d1.shape[0] == 0:
            blank_df = pd.read_csv(file_for_blank,sep="\t", nrows=1)
            blank_df.loc[0] = None
            d1 = blank_df
        else:
            # 型を調整
            d1["workName"] = d1["workName"].astype(str)
            d1["idx"] = d1["idx"].astype("Int64")


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

        d1.insert(0,"index", index_value)
        return d1
    
    file_for_blank = fs[0]
    result_df_list = [my_read_csv(file=i,file_for_blank=file_for_blank,input_df=df, index_value=int(Path(i).stem.split("_")[0])) for i in fs]
    if False:
        for i in fs:
            file=i
            input_df=df
            tmpres = my_read_csv(file=file,file_for_blank=file_for_blank,input_df=df)

    result_df = pd.concat(result_df_list, ignore_index=True)
    result_df["is_saved"] = None
    result_df.to_csv(output_file_each_list_all_v1, sep="\t", index=False)
    if False:
        result_df = pd.read_csv(output_file_each_list_all_v1, sep="\t")
        result_df[result_df["workName"]=="xxxx"]["index"].value_counts()

    # exit(1)

    # pdf 保存処理
    save_path_list = [None] * len(result_df)
    for i, row in result_df.iterrows():
        index_value = row["index"]

        if False:
            if index_value > 1:
                break

        pdfurl = row["pdfUrl"]
        target_url = row["target_url"]
        if pdfurl is None:
            continue
        # https://www.mod.go.jp/j/budget/chotatsu/naikyoku/koubo/https://warp.da.ndl.go.jp/info:ndljp/pid/11450712/www.mod.go.jp/j/procurement/chotatsu/naikyoku/iken/pdf/20180131.pdf
        # https://www.mod.go.jp/gsdf/wae/info/nyusatu/wa-fin/kou/R6ippan.files/https://www.mod.go.jp/gsdf/wae/info/nyusatu/wa-fin/06/363_oo_0229_009_002.pdf 

        output_dir_pdf = fr"{output_dir_pdf_base}_{index_value:05d}"
        if False:
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

        #pdfurl
        #target_url
        common = os.path.commonprefix([pdfurl, target_url])
        pname = pdfurl[len(common):]

        #print(pname)
        p = Path(pname)
        no_ext = str(p.with_suffix(""))
        no_ext = no_ext.replace(".","_").replace("\\","_").replace("/","_")
        pname2 = no_ext + p.suffix
        #print(pname2)

        output_file_pdf = fr"{output_dir_pdf}/{index_value:05d}_{pname2}"
        save_path = Path(output_file_pdf)

        save_path_list[i] = save_path

        if not do_url_requests:
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
                    time.sleep(0.7)
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
                try:
                    save_path.write_bytes(response.content)
                    print(fr"Saved {save_path}.")
                except Exception as e:
                    print(e)


    exit(1)

    is_saved = []
    for p in save_path_list:
        if p is not None and os.path.exists(p):
            is_saved.append(True)
        else:
            is_saved.append(False)
    result_df["is_saved"] = is_saved
    result_df.to_csv(output_file_each_list_all_v2, sep="\t", index=False)

    result_df["save_path"] = [str(p) for p in save_path_list]

    if False:
        pdf_types = ["N_A" for i in range(result_df.shape[0])]
        for i, path in enumerate(result_df["save_path"]):
            if False:
                i = 10560
                i = 10561
                path = result_df["save_path"].iloc[i]

            # print(fr"{i}/{result_df.shape[0]}")
            if i % 100 == 0:
                print(fr"{i}/{result_df.shape[0]}")
                # aaa=0
            if not os.path.exists(path):
                pdf_types[i] = "ファイル無し"
                continue

            with pdfplumber.open(path) as pdf:
                for page in pdf.pages:
                    tmptext = page.extract_text()
                    tmptext = re.sub(r"\s+", "", tmptext)
                    if tmptext.find("入札公告") >= 0:
                        pdf_types[i] = "入札公告"
                    elif tmptext.find("入札結果") >= 0:
                        pdf_types[i] = "入札結果"
                    else:
                        pdf_types[i] = "その他"
                    break

        result_df["pdf_types"] = pdf_types
        result_df.to_csv(output_file_each_list_all_v3, sep="\t", index=False)

