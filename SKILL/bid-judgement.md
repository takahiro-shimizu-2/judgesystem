# bid-judgement

- category: domain
- description: 入札公告PDFを解析し、企業の参加資格を判定する
- keywords: bid, judgement, eligibility, requirements, experience, technician, location, grade

## Usage
Python CLIから実行。`packages/engine/main.py` がエントリポイント。
各要件（経験、技術者、所在地、等級）を個別に判定し結果をDBに保存。
