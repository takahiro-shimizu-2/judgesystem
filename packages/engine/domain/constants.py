#coding: utf-8
"""
定数定義モジュール。

和暦 (Japanese era) から西暦への変換オフセットなど、
複数モジュールで共有されるマジックナンバーを集約する。
"""

# 和暦の年を西暦に変換するためのオフセット辞書。
# 使い方: western_year = era_year + ERA_OFFSETS["reiwa"]
ERA_OFFSETS: dict[str, int] = {
    "reiwa": 2018,    # 令和: 令和1年 = 2019年 → 1 + 2018
    "heisei": 1988,   # 平成: 平成1年 = 1989年 → 1 + 1988
    "showa": 1925,    # 昭和: 昭和1年 = 1926年 → 1 + 1925
}
