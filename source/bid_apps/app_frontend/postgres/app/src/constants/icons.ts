/**
 * アイコン定義の一元管理
 * アプリケーション全体で統一されたアイコンを使用するための定数ファイル
 *
 * ========================================
 * アイコン使用ルール
 * ========================================
 *
 * 【連絡先】
 * - 電話番号 → PhoneIcon
 * - メールアドレス → EmailIcon
 * - FAX番号 → FaxIcon (Print)
 * - 住所・場所 → LocationIcon
 *
 * 【ファイル・ドキュメント】
 * - 添付ファイル → AttachFileIcon (クリップ)
 * - ドキュメント・書類 → DocumentIcon
 * - アップロード → UploadIcon
 *
 * 【組織・人物】
 * - 企業・会社 → BusinessIcon
 * - 発注機関・官公庁 → OrdererIcon (AccountBalance)
 * - 個人・担当者 → PersonIcon
 * - グループ・チーム → GroupIcon
 * - 協力会社 → HandshakeIcon
 * - 店舗・支店 → StoreIcon
 *
 * 【ワークフロー】
 * - 判定・審査 → JudgmentIcon (Gavel)
 * - 落札・受賞 → TrophyIcon
 * - 送信・提出 → SendIcon
 *
 * 【ステータス】
 * - 完了・チェック済 → CheckCircleIcon (塗りつぶし)
 * - 完了（軽め） → CheckCircleOutlineIcon (線のみ)
 * - 未チェック → UncheckedIcon
 *
 * 【メモ・記録】
 * - 録音・文字起こし → MicIcon
 * - スクリプト・台本 → ScriptIcon (MenuBook)
 * - 確認事項・質問 → QuestionIcon
 * - アイデア・提案 → IdeaIcon
 * - メモ・コメント → MemoIcon (ChatBubbleOutline)
 * - 評価 → EvaluationIcon (StarOutline)
 *
 * 【アクション】
 * - 追加 → AddIcon
 * - 編集 → EditIcon
 * - 削除 → DeleteIcon
 * - 保存 → SaveIcon
 * - 確定 → CheckIcon
 * - 閉じる・キャンセル → CloseIcon
 *
 * 【ナビゲーション】
 * - 次へ → ArrowForwardIcon / ChevronRightIcon
 * - 前へ → ArrowBackIcon / ChevronLeftIcon
 * - 上へ → ArrowUpIcon
 * - 下へ → ArrowDownIcon
 * - 展開 → ExpandMoreIcon
 * - 折りたたみ → ExpandLessIcon
 *
 * 【その他】
 * - ソート → SortIcon
 * - フィルター → FilterIcon
 * - 履歴 → HistoryIcon
 * - 日付・カレンダー → CalendarIcon
 * - 情報 → InfoIcon
 * - 警告 → WarningIcon
 * - エラー → ErrorIcon
 *
 * ========================================
 */
export {
  // 連絡先関連
  Phone as PhoneIcon,
  Email as EmailIcon,
  Print as FaxIcon,  // FAXはプリンターアイコンで統一

  // 組織・人物関連
  Business as BusinessIcon,
  AccountBalance as OrdererIcon,
  Person as PersonIcon,
  Store as StoreIcon,
  Group as GroupIcon,
  Handshake as HandshakeIcon,

  // ドキュメント関連
  Description as DocumentIcon,
  AttachFile as AttachFileIcon,
  Upload as UploadIcon,

  // ワークフロー関連
  Gavel as JudgmentIcon,
  EmojiEvents as TrophyIcon,
  Send as SendIcon,

  // アクション関連
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Check as CheckIcon,
  Close as CloseIcon,

  // ナビゲーション関連
  ArrowForward as ArrowForwardIcon,
  ArrowBack as ArrowBackIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,

  // ステータス関連
  CheckCircle as CheckCircleIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  RadioButtonUnchecked as UncheckedIcon,

  // メモ・記録関連
  Mic as MicIcon,
  MenuBook as ScriptIcon,  // トークスクリプトはMenuBookで統一
  HelpOutline as QuestionIcon,
  LightbulbOutlined as IdeaIcon,
  ChatBubbleOutline as MemoIcon,
  StarOutline as EvaluationIcon,

  // その他
  Sort as SortIcon,
  FilterAlt as FilterIcon,
  History as HistoryIcon,
  CalendarToday as CalendarIcon,
  LocationOn as LocationIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Search as SearchIcon,
  Clear as ClearIcon,

  // フォーム関連
  Category as CategoryIcon,
  Assessment as AssessmentIcon,
  VerifiedUser as VerifiedUserIcon,
  ContactPhone as ContactPhoneIcon,
  AccountTree as AccountTreeIcon,
} from '@mui/icons-material';
