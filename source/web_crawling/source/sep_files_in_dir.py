import os
import shutil
from pathlib import Path
import math
import zipfile

def split_by_count(dirname: str, split_count: int, suffix: str = "part"):
    """
    dirname 内のファイルを split_count 分割し、
    dirname と同じ階層に dirname_suffixX フォルダを作成してコピーする。
    """

    src_dir = Path(dirname)
    if not src_dir.is_dir():
        raise NotADirectoryError(f"{dirname} は存在しないフォルダです")

    parent_dir = src_dir.parent

    # フォルダ内のファイル一覧（ファイルのみ）
    files = [f for f in src_dir.iterdir() if f.is_file()]
    files.sort()

    total = len(files)
    if total == 0:
        print("ファイルがありません")
        return

    # 1グループあたりのファイル数
    chunk_size = math.ceil(total / split_count)

    print(f"総ファイル数: {total}, 分割数: {split_count}, 1フォルダあたり: {chunk_size}")

    # 分割処理
    for i in range(split_count):
        start = i * chunk_size
        end = start + chunk_size
        chunk = files[start:end]

        if not chunk:
            break

        out_dir = parent_dir / f"{src_dir.name}_{suffix}{i+1}"
        out_dir.mkdir(exist_ok=True)

        for f in chunk:
            shutil.copy2(f, out_dir / f.name)

        print(f"{out_dir} に {len(chunk)} 個コピーしました")

def zip_folder(folder_path: str, zip_name: str = None):
    """
    指定フォルダを ZIP 圧縮する。
    zip_name を指定しない場合はフォルダ名.zip になる。
    """

    folder = Path(folder_path)
    if not folder.is_dir():
        raise NotADirectoryError(f"{folder_path} はフォルダではありません")

    # ZIP ファイル名（拡張子なし）
    if zip_name is None:
        zip_name = folder.name

    # 出力先（フォルダと同じ階層）
    output_path = folder.parent / zip_name

    # ZIP 作成
    shutil.make_archive(str(output_path), 'zip', root_dir=str(folder))

    print(f"ZIP 作成完了: {output_path}.zip")


def move_files_from_folders(src_dirs, dst_dir):
    """
    src_dirs: 移動元フォルダのリスト（文字列 or Path）
    dst_dir: 移動先フォルダ（文字列 or Path）
    """

    # Path 化
    src_dirs = [Path(d) for d in src_dirs]
    dst_dir = Path(dst_dir)

    # 移動先フォルダがなければ作成
    dst_dir.mkdir(parents=True, exist_ok=True)

    for src in src_dirs:
        if not src.is_dir():
            print(f"スキップ: {src} はフォルダではありません")
            continue

        # フォルダ内のファイルを取得
        for f in src.iterdir():
            if f.is_file():
                target = dst_dir / f.name

                # 同名ファイルがある場合はリネーム
                if target.exists():
                    target = dst_dir / f"{f.stem}_copy{f.suffix}"

                shutil.move(str(f), str(target))
                print(f"{f} → {target} に移動")

    print("移動完了")

def unzip(zip_path: str, extract_to: str = None):
    """
    ZIP ファイルを解凍する関数。
    extract_to を指定しない場合は ZIP と同じ場所に展開する。
    """

    zip_path = Path(zip_path)

    if not zip_path.is_file():
        raise FileNotFoundError(f"{zip_path} は存在しません")

    # 展開先フォルダ
    if extract_to is None:
        extract_to = zip_path.parent / zip_path.stem
    else:
        extract_to = Path(extract_to)

    extract_to.mkdir(parents=True, exist_ok=True)

    # 解凍処理
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(extract_to)

    print(f"解凍完了: {extract_to}")



if __name__ == "__main__":
    if False:
        split_by_count("../output/pdf3", split_count=10, suffix="div")
        split_by_count("../output/pdf4", split_count=10, suffix="div")
        split_by_count("../output/pdf10", split_count=10, suffix="div")

    target_dirs = [fr"../output/pdf3_div{i}" for i in range(1,11)]
    for d in target_dirs:
        zip_folder(d)
    target_dirs = [fr"../output/pdf4_div{i}" for i in range(1,11)]
    for d in target_dirs:
        zip_folder(d)
    target_dirs = [fr"../output/pdf10_div{i}" for i in range(1,11)]
    for d in target_dirs:
        zip_folder(d)

    if False:
        target_dirs = [fr"../output/pdf3_div{i}.zip" for i in range(1,11)]
        for d in target_dirs:
            unzip(d)
        target_dirs = [fr"../output/pdf4_div{i}.zip" for i in range(1,11)]
        for d in target_dirs:
            unzip(d)
        target_dirs = [fr"../output/pdf10_div{i}.zip" for i in range(1,11)]
        for d in target_dirs:
            unzip(d)

    if False:
        move_files_from_folders(
            src_dirs=[fr"../output/pdf3_div{i}.zip" for i in range(1,11)],
            dst_dir="../output/pdf3"
        )

        move_files_from_folders(
            src_dirs=[fr"../output/pdf4_div{i}.zip" for i in range(1,11)],
            dst_dir="../output/pdf4"
        )

        move_files_from_folders(
            src_dirs=[fr"../output/pdf10_div{i}.zip" for i in range(1,11)],
            dst_dir="../output/pdf10"
        )
