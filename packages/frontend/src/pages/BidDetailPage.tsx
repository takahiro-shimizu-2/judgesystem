import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Box, Button, Alert, Typography, Paper, Tabs, Tab } from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Gavel as GavelIcon,
  Handshake as HandshakeIcon,
  EmojiEvents as TrophyIcon,
  Phone as PhoneIcon,
  Send as SendIcon,
  ArrowForward as ArrowForwardIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";
import { useState, useCallback, useEffect } from "react";
import { getApiUrl } from "../config/api";

import { bidTypeConfig, updateWorkStatus, updateEvaluationAssignee } from "../data";
import type { BidEvaluation, Partner, SimilarCase, StepAssignee, WorkStatus } from "../types";
import { priorityLabels, priorityColors } from "../constants/priority";
import { WORKFLOW_STEP_CONFIG, WORKFLOW_STEP_IDS } from "../constants/workflow";
import { pageStyles, colors, fontSizes, iconStyles, borderRadius } from "../constants/styles";
import {
  FloatingBackButton,
  ScrollToTopButton,
} from "../components/common";
import { formatAmountInManYen } from "../utils";
import {
  BidInfoSection,
  BidDocumentsSection,
  CompanyInfoSection,
  OrdererInfoSection,
  JudgmentSection,
  OrdererWorkflowSection,
  PartnerSection,
  RequestSection,
  AwardSection,
  StaffAssignmentPanel,
  SimilarCasesPanel,
} from "../components/workflow";

// ============================================================================
// 定数
// ============================================================================

const STEP_ICONS: Record<string, React.ReactNode> = {
  [WORKFLOW_STEP_IDS.JUDGMENT]: <GavelIcon sx={iconStyles.medium} />,
  [WORKFLOW_STEP_IDS.ORDERER]: <PhoneIcon sx={iconStyles.medium} />,
  [WORKFLOW_STEP_IDS.PARTNER]: <HandshakeIcon sx={iconStyles.medium} />,
  [WORKFLOW_STEP_IDS.REQUEST]: <SendIcon sx={iconStyles.medium} />,
  [WORKFLOW_STEP_IDS.AWARD]: <TrophyIcon sx={iconStyles.medium} />,
};

const TAB_LABELS: Record<string, string> = {
  [WORKFLOW_STEP_IDS.JUDGMENT]: "判定",
  [WORKFLOW_STEP_IDS.ORDERER]: "発注者",
  [WORKFLOW_STEP_IDS.PARTNER]: "協力会社",
  [WORKFLOW_STEP_IDS.REQUEST]: "確認依頼",
  [WORKFLOW_STEP_IDS.AWARD]: "落札",
};

type MainViewTab = "workflow" | "similar" | "documents";

const MAIN_VIEW_TABS: { id: MainViewTab; label: string }[] = [
  { id: "workflow", label: "ワークフロー" },
  { id: "similar", label: "類似案件" },
  { id: "documents", label: "資料" },
];

// ============================================================================
// サブコンポーネント
// ============================================================================

type TabStatus = "completed" | "current" | "pending";

interface WorkflowTabProps {
  label: string;
  icon: React.ReactNode;
  status: TabStatus;
  isActive: boolean;
  onClick: () => void;
}


function WorkflowTab({
  label,
  icon,
  status,
  isActive,
  onClick,
}: WorkflowTabProps) {
  const isClickable = status !== "pending";
  const isCompleted = status === "completed";

  return (
    <Box
      onClick={isClickable ? onClick : undefined}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 2,
        py: 1.25,
        cursor: isClickable ? "pointer" : "default",
        position: "relative",
        transition: "all 0.15s ease",
        backgroundColor: isActive ? "rgba(59, 130, 246, 0.04)" : "transparent",
        color:
          status === "pending" ? colors.border.dark : isActive ? colors.accent.blue : colors.text.muted,
        borderBottom: isActive ? `2px solid ${colors.accent.blue}` : "2px solid transparent",
        marginBottom: "-1px",
        "&:hover": isClickable
          ? {
              backgroundColor: "rgba(59, 130, 246, 0.04)",
              color: isActive ? colors.accent.blue : colors.text.secondary,
            }
          : {},
      }}
    >
      {isCompleted ? (
        <CheckCircleIcon sx={{ ...iconStyles.small, color: colors.status.success.main }} />
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", color: "inherit" }}>
          {icon}
        </Box>
      )}
      <Typography
        sx={{
          fontSize: fontSizes.sm,
          fontWeight: isActive ? 600 : 500,
          color: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function NotFoundView({ onBack }: { onBack: () => void }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 4,
      }}
    >
      <Alert severity="error" sx={{ mb: 3, borderRadius: borderRadius.xs }}>
        指定された判定結果が見つかりません。
      </Alert>
      <Button startIcon={<ArrowBackIcon />} onClick={onBack}>
        一覧に戻る
      </Button>
    </Box>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

// ナビゲーション追跡用
const NAV_TRACKING_KEY = 'lastVisitedPath';

export default function BidDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // 詳細ページのパスを保存（一覧に戻った時のページ復元用）
  useEffect(() => {
    try {
      sessionStorage.setItem(NAV_TRACKING_KEY, location.pathname);
    } catch { /* ignore */ }
  }, [location.pathname]);

  // API状態管理
  const [evaluation, setEvaluation] = useState<BidEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
  const [isSimilarCasesLoading, setIsSimilarCasesLoading] = useState(false);
  const [similarCasesError, setSimilarCasesError] = useState<string | null>(null);
  const [targetAnnouncementNo, setTargetAnnouncementNo] = useState<string | null>(null);

  // 評価データ取得
  useEffect(() => {
    if (!id) {
      setIsLoading(false);
      return;
    }

    const fetchEvaluation = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(getApiUrl(`/api/evaluations/${id}`));
        if (!response.ok) {
          throw new Error(`Failed to fetch evaluation: ${response.status}`);
        }
        const data = await response.json();
        setEvaluation(data);
      } catch (err) {
        console.error('Failed to fetch evaluation:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvaluation();
  }, [id]);

  const [currentStep, setCurrentStep] = useState<string>(WORKFLOW_STEP_IDS.JUDGMENT);
  const [activeTab, setActiveTab] = useState<string>(WORKFLOW_STEP_IDS.JUDGMENT);
  const [currentWorkStatus, setCurrentWorkStatus] = useState<WorkStatus>(
    (evaluation?.workStatus as WorkStatus) || "not_started"
  );

  // 各ステップの担当者
  const [stepAssignees, setStepAssignees] = useState<StepAssignee[]>(
    evaluation?.stepAssignees || []
  );

  // evaluationが読み込まれたら状態を初期化
  useEffect(() => {
    if (evaluation) {
      setCurrentStep(evaluation.currentStep || WORKFLOW_STEP_IDS.JUDGMENT);
      setActiveTab(evaluation.currentStep || WORKFLOW_STEP_IDS.JUDGMENT);
      setCurrentWorkStatus(
        (evaluation.workStatus as WorkStatus) || "not_started"
      );
      setStepAssignees(evaluation.stepAssignees || []);
    }
  }, [evaluation]);

  const fetchSimilarCases = useCallback(async (announcementNo: string) => {
    if (!announcementNo) return;
    setIsSimilarCasesLoading(true);
    setSimilarCasesError(null);
    try {
      const response = await fetch(getApiUrl(`/api/announcements/${announcementNo}/similar-cases`));
      if (!response.ok) {
        throw new Error(`Failed to fetch similar cases: ${response.status}`);
      }
      const data = await response.json();
      setSimilarCases(data);
    } catch (err) {
      console.error("Failed to fetch similar cases:", err);
      setSimilarCases([]);
      setSimilarCasesError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSimilarCasesLoading(false);
    }
  }, []);

  useEffect(() => {
    const announcementId = evaluation?.announcement?.id;
    if (!announcementId) {
      setSimilarCases([]);
      setTargetAnnouncementNo(null);
      return;
    }
    const match = announcementId.match(/^ann-(\d+)$/);
    const announcementNo = match ? match[1] : announcementId;
    setTargetAnnouncementNo(announcementNo);
    fetchSimilarCases(announcementNo);
  }, [evaluation?.announcement?.id, fetchSimilarCases]);

  const handleRetrySimilarCases = useCallback(() => {
    if (targetAnnouncementNo) {
      fetchSimilarCases(targetAnnouncementNo);
    }
  }, [targetAnnouncementNo, fetchSimilarCases]);

  // 担当者変更ハンドラ
  const handleAssigneeChange = useCallback(async (stepId: string, staffId: string) => {
    if (!evaluation) return;
    const success = await updateEvaluationAssignee(evaluation.evaluationNo, stepId, staffId);
    if (!success) {
      alert('担当者の更新に失敗しました。時間をおいて再度お試しください。');
      return;
    }
    setStepAssignees((prev) => {
      const existing = prev.find((a) => a.stepId === stepId);
      if (staffId === '') {
        return prev.filter((a) => a.stepId !== stepId);
      }
      if (existing) {
        return prev.map((a) =>
          a.stepId === stepId
            ? { ...a, staffId, assignedAt: new Date().toISOString() }
            : a
        );
      }
      return [
        ...prev,
        { stepId, staffId, assignedAt: new Date().toISOString() },
      ];
    });
  }, [evaluation]);

  // 協力会社データ（全タブで共有）
  const [partners, setPartners] = useState<Partner[]>([
    {
      id: '1',
      name: '山田建設株式会社',
      contactPerson: '山田太郎',
      phone: '03-1234-5678',
      email: 'yamada@yamada-kensetsu.co.jp',
      fax: '03-1234-5679',
      status: 'estimate_adopted',
      memos: [{ id: 'memo-1', content: '見積依頼中。来週回答予定。', createdAt: '2024/01/15 10:00' }],
      transcriptions: [{ id: 'trans-1', content: '「来週中にはお見積りをお送りできると思います」', date: '2024/01/15 10:30' }],
      talkScript: '',
      surveyApproved: true,
      receivedDocuments: [
        { id: 'rd-1', name: '見積書_山田建設.pdf', date: '2024/01/18' },
      ],
    },
    {
      id: '2',
      name: '佐藤土木株式会社',
      contactPerson: '佐藤花子',
      phone: '03-5555-1234',
      email: 'sato@sato-doboku.co.jp',
      fax: '03-5555-1235',
      status: 'estimate_completed',
      memos: [{ id: 'memo-2', content: '見積書受領済み。金額確認中。', createdAt: '2024/01/18 14:00' }],
      transcriptions: [],
      talkScript: '',
      surveyApproved: true,
      receivedDocuments: [
        { id: 'rd-2', name: '見積書_佐藤土木.pdf', date: '2024/01/17' },
        { id: 'rd-3', name: '技術者名簿', date: '2024/01/18' },
      ],
    },
    {
      id: '3',
      name: '鈴木工業株式会社',
      contactPerson: '鈴木一郎',
      phone: '03-9876-5432',
      email: 'suzuki@suzuki-kogyo.co.jp',
      fax: '03-9876-5433',
      status: 'waiting_response',
      memos: [],
      transcriptions: [],
      talkScript: '',
      surveyApproved: false,
      receivedDocuments: [],
    },
    {
      id: '4',
      name: '田中組',
      contactPerson: '田中次郎',
      phone: '03-7777-8888',
      email: 'tanaka@tanaka-gumi.co.jp',
      fax: '03-7777-8889',
      status: 'unavailable',
      memos: [{ id: 'memo-3', content: '工期が合わず対応不可', createdAt: '2024/01/16 11:00' }],
      transcriptions: [],
      talkScript: '',
      surveyApproved: false,
      receivedDocuments: [],
    },
  ]);
  const [mainViewTab, setMainViewTab] = useState<MainViewTab>("workflow");

  const handleBack = useCallback(() => navigate("/"), [navigate]);

  const goToNextStep = useCallback(async () => {
    const currentIndex = WORKFLOW_STEP_CONFIG.findIndex(
      (s) => s.id === currentStep
    );
    const nextStep = WORKFLOW_STEP_CONFIG[currentIndex + 1];
    if (nextStep && evaluation) {
      const nextStatus: WorkStatus =
        currentWorkStatus === "not_started" ? "in_progress" : currentWorkStatus;
      const success = await updateWorkStatus(
        evaluation.evaluationNo,
        nextStatus,
        nextStep.id
      );
      if (success) {
        setCurrentStep(nextStep.id);
        setActiveTab(nextStep.id);
        setCurrentWorkStatus(nextStatus);
      }
    }
  }, [currentStep, currentWorkStatus, evaluation]);

  const handleComplete = useCallback(async () => {
    if (evaluation) {
      const success = await updateWorkStatus(
        evaluation.evaluationNo,
        "completed",
        currentStep
      );
      if (success) {
        setCurrentWorkStatus("completed");
      }
    }
  }, [evaluation, currentStep]);

  const getTabStatus = useCallback(
    (stepId: string): TabStatus => {
      const stepIndex = WORKFLOW_STEP_CONFIG.findIndex((s) => s.id === stepId);
      const currentIndex = WORKFLOW_STEP_CONFIG.findIndex(
        (s) => s.id === currentStep
      );
      if (stepIndex < currentIndex) return "completed";
      if (stepIndex === currentIndex) return "current";
      return "pending";
    },
    [currentStep]
  );

  const handleTabClick = useCallback(
    (stepId: string) => {
      const status = getTabStatus(stepId);
      if (status !== "pending") {
        setActiveTab(stepId);
      }
    },
    [getTabStatus]
  );

  const handleMainViewChange = useCallback((_: unknown, value: MainViewTab) => {
    setMainViewTab(value);
  }, []);

  // ローディング中
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ color: colors.text.muted, mb: 2 }}>読み込み中...</Typography>
        </Box>
      </Box>
    );
  }

  // エラー時
  if (error) {
    return (
      <Box sx={{ ...pageStyles.contentArea, maxWidth: "900px", py: 3 }}>
        <Alert severity="error" sx={{ mb: 3, borderRadius: borderRadius.xs }}>
          データの取得に失敗しました: {error}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack}>
          一覧に戻る
        </Button>
      </Box>
    );
  }

  // データが見つからない時
  if (!evaluation) {
    return <NotFoundView onBack={handleBack} />;
  }

  const { announcement, company, branch, requirements, status } = evaluation;
  const isCurrentTab = getTabStatus(activeTab) === "current";
  const isLastStep = currentStep === WORKFLOW_STEP_IDS.AWARD;
  const isOnLastTab = activeTab === WORKFLOW_STEP_IDS.AWARD;

  const renderTabContent = () => {
    switch (activeTab) {
      case WORKFLOW_STEP_IDS.JUDGMENT:
        return <JudgmentSection requirements={requirements || []} status={status} />;
      case WORKFLOW_STEP_IDS.ORDERER: {
        const ordererAssignee = stepAssignees.find((a) => a.stepId === WORKFLOW_STEP_IDS.ORDERER);
        return <OrdererWorkflowSection evaluation={evaluation} workflowAssigneeId={ordererAssignee?.staffId} />;
      }
      case WORKFLOW_STEP_IDS.PARTNER: {
        const partnerAssignee = stepAssignees.find((a) => a.stepId === WORKFLOW_STEP_IDS.PARTNER);
        return <PartnerSection evaluation={evaluation} partners={partners} onPartnersChange={setPartners} workflowAssigneeId={partnerAssignee?.staffId} />;
      }
      case WORKFLOW_STEP_IDS.REQUEST: {
        const requestAssignee = stepAssignees.find((a) => a.stepId === WORKFLOW_STEP_IDS.REQUEST);
        return <RequestSection evaluation={evaluation} partners={partners} workflowAssigneeId={requestAssignee?.staffId} />;
      }
      case WORKFLOW_STEP_IDS.AWARD: {
        const awardAssignee = stepAssignees.find((a) => a.stepId === WORKFLOW_STEP_IDS.AWARD);
        return <AwardSection evaluation={evaluation} partners={partners} workflowAssigneeId={awardAssignee?.staffId} />;
      }
      default:
        return null;
    }
  };

  const renderMainViewContent = () => {
    if (mainViewTab === "workflow") {
      return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: `1px solid ${colors.border.main}`,
              backgroundColor: colors.text.white,
            }}
          >
            <Box sx={{ display: "flex" }}>
              {WORKFLOW_STEP_CONFIG.map((step) => (
                <WorkflowTab
                  key={step.id}
                  label={TAB_LABELS[step.id]}
                  icon={STEP_ICONS[step.id]}
                  status={getTabStatus(step.id)}
                  isActive={activeTab === step.id}
                  onClick={() => handleTabClick(step.id)}
                />
              ))}
            </Box>
            {isCurrentTab && !isLastStep && (
              <Box sx={{ pr: 2 }}>
                <Button
                  variant="contained"
                  size="small"
                  endIcon={<ArrowForwardIcon sx={iconStyles.small} />}
                  onClick={goToNextStep}
                  sx={{
                    backgroundColor: colors.accent.blue,
                    fontWeight: 600,
                    px: 1.5,
                    py: 0.5,
                    fontSize: fontSizes.xs,
                    borderRadius: borderRadius.xs,
                    textTransform: "none",
                    boxShadow: "none",
                    "&:hover": {
                      backgroundColor: "#2563eb",
                      boxShadow: "none",
                    },
                  }}
                >
                  {activeTab === WORKFLOW_STEP_IDS.JUDGMENT ? "着手" : "次へ"}
                </Button>
              </Box>
            )}
            {isOnLastTab && currentWorkStatus !== "completed" && (
              <Box sx={{ pr: 2 }}>
                <Button
                  variant="contained"
                  size="small"
                  endIcon={<CheckCircleIcon sx={iconStyles.small} />}
                  onClick={handleComplete}
                  sx={{
                    backgroundColor: colors.accent.blue,
                    fontWeight: 600,
                    px: 1.5,
                    py: 0.5,
                    fontSize: fontSizes.xs,
                    borderRadius: borderRadius.xs,
                    textTransform: "none",
                    boxShadow: "none",
                    "&:hover": {
                      backgroundColor: "#2563eb",
                      boxShadow: "none",
                    },
                  }}
                >
                  完了
                </Button>
              </Box>
            )}
          </Box>

          <Box sx={{ px: 3, pt: 1.5, pb: 3, backgroundColor: colors.background.hover, flex: 1 }}>
            {renderTabContent()}
          </Box>
        </Box>
      );
    }

    if (mainViewTab === "similar") {
      return (
        <Box sx={{ flex: 1, overflow: "auto", backgroundColor: colors.background.hover }}>
          <Box sx={{ p: 3 }}>
            <SimilarCasesPanel
              cases={similarCases}
              isLoading={isSimilarCasesLoading}
              error={similarCasesError}
              onRetry={handleRetrySimilarCases}
            />
          </Box>
        </Box>
      );
    }

    return (
      <Box sx={{ flex: 1, overflow: "auto", backgroundColor: colors.background.hover }}>
        <Box sx={{ p: 3 }}>
          <BidDocumentsSection announcement={announcement} />
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: colors.page.background, display: "flex", flexDirection: "column" }}>
      <Box sx={{ ...pageStyles.contentArea, maxWidth: "100%", py: 3, display: "flex", flexDirection: "column", flex: 1 }}>
        {/* ヘッダー */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", mb: 2 }}>
          {/* 左側: ステータス + タイトル */}
          <Box
            sx={{
              pl: 2,
              borderLeft: "4px solid",
              borderColor:
                status === "all_met" ? colors.status.success.main :
                status === "other_only_unmet" ? colors.status.warning.main : colors.status.error.main,
            }}
          >
            {/* ステータス類 */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2.5, mb: 0.5, flexWrap: "wrap" }}>
              {/* 一覧に戻る */}
              <Button
                size="small"
                startIcon={<ArrowBackIcon sx={iconStyles.small} />}
                onClick={handleBack}
                sx={{
                  color: colors.text.muted,
                  fontWeight: 500,
                  fontSize: fontSizes.sm,
                  textTransform: "none",
                  px: 1,
                  py: 0.25,
                  minWidth: "auto",
                  "&:hover": { backgroundColor: colors.border.light },
                }}
              >
                一覧に戻る
              </Button>

              {/* 進捗 */}
              <Typography
                sx={{
                  fontSize: fontSizes.base,
                  fontWeight: 700,
                  color:
                    currentWorkStatus === "completed" ? colors.status.success.main :
                    currentWorkStatus === "in_progress" ? colors.accent.blue : colors.text.muted,
                }}
              >
                {currentWorkStatus === "not_started" ? "未着手" :
                 currentWorkStatus === "in_progress" ? "着手中" : "完了"}
              </Typography>

              <Typography sx={{ color: colors.border.dark }}>|</Typography>

              {/* 判定結果 */}
              <Typography
                sx={{
                  fontSize: fontSizes.base,
                  fontWeight: 700,
                  color:
                    status === "all_met" ? colors.status.success.main :
                    status === "other_only_unmet" ? colors.status.warning.main : colors.status.error.main,
                }}
              >
                {status === "all_met" ? "参加可能" :
                 status === "other_only_unmet" ? "条件付き" : "参加不可"}
              </Typography>

              <Typography sx={{ color: colors.border.dark }}>|</Typography>

              {/* 優先度 */}
              <Typography sx={{ fontSize: fontSizes.base, fontWeight: 700, color: priorityColors[company.priority].color }}>
                <Typography component="span" sx={{ fontSize: fontSizes.xs, fontWeight: 500, color: colors.text.muted }}>
                  優先度{" "}
                </Typography>
                {priorityLabels[company.priority].replace("優先度:", "")}
              </Typography>

              <Typography sx={{ color: colors.border.dark }}>|</Typography>

              {/* 入札形式 */}
              <Typography sx={{ fontSize: fontSizes.base, fontWeight: 700, color: colors.primary.dark }}>
                {announcement.bidType ? bidTypeConfig[announcement.bidType].label : "-"}
              </Typography>
            </Box>

            {/* タイトル */}
            <Typography sx={pageStyles.detailPageTitle}>
              {announcement.title}
            </Typography>
          </Box>

          {/* 右側: No + 見積予想金額 */}
          <Box sx={{ textAlign: "right", flexShrink: 0, ml: 3, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light }}>
              No. {evaluation.evaluationNo}
            </Typography>
            <Typography sx={{ fontSize: fontSizes.xl, fontWeight: 700, color: colors.primary.main }}>
              <Typography component="span" sx={{ fontSize: fontSizes.sm, fontWeight: 500, color: colors.text.muted }}>
                見積予想金額{" "}
              </Typography>
              {formatAmountInManYen(announcement.estimatedAmountMin, announcement.estimatedAmountMax)}
            </Typography>
          </Box>
        </Box>

        {/* メインカード */}
      <Paper
        sx={{
          borderRadius: borderRadius.xs,
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
          <Box sx={{ display: "flex", flex: 1 }}>
            {/* 左: 発注者・企業 */}
            <Box
              sx={{
                width: { xs: "100%", md: 240, lg: 280, xl: 320 },
                flexShrink: 0,
                backgroundColor: colors.text.white,
                borderRight: `1px solid ${colors.border.main}`,
                display: { xs: "none", md: "block" },
              }}
            >
              {/* 発注者 */}
              <Box sx={{ p: 2.5, borderBottom: `1px solid ${colors.border.light}` }}>
                <Typography
                  sx={{
                    fontSize: fontSizes.xs,
                    color: colors.text.muted,
                    fontWeight: 600,
                    mb: 1.5,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  発注者
                </Typography>
                <OrdererInfoSection announcement={announcement} />
              </Box>

              {/* 企業 */}
              <Box sx={{ p: 2.5 }}>
                <Typography
                  sx={{
                    fontSize: fontSizes.xs,
                    color: colors.text.muted,
                    fontWeight: 600,
                    mb: 1.5,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  企業
                </Typography>
                <CompanyInfoSection company={company} branch={branch} />
              </Box>
            </Box>

            {/* 中央: メインエリア */}
            <Box sx={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
              <Tabs
                value={mainViewTab}
                onChange={handleMainViewChange}
                sx={{
                  minHeight: 44,
                  borderBottom: `1px solid ${colors.border.main}`,
                  backgroundColor: colors.text.white,
                  '& .MuiTab-root': {
                    fontSize: fontSizes.sm,
                    textTransform: 'none',
                    fontWeight: 600,
                    color: colors.text.muted,
                    minHeight: 44,
                    '&.Mui-selected': {
                      color: colors.accent.blue,
                    },
                  },
                  '& .MuiTabs-indicator': {
                    backgroundColor: colors.accent.blue,
                  },
                }}
              >
                {MAIN_VIEW_TABS.map((tab) => (
                  <Tab key={tab.id} label={tab.label} value={tab.id} />
                ))}
              </Tabs>
              {renderMainViewContent()}
            </Box>

            {/* 右: 担当者・入札情報 */}
            <Box
              sx={{
                width: { xs: "100%", md: 280, lg: 320, xl: 360 },
                flexShrink: 0,
                backgroundColor: colors.text.white,
                borderLeft: `1px solid ${colors.border.main}`,
                display: { xs: "none", md: "block" },
              }}
            >
              <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
                {/* 担当者セクション */}
                <StaffAssignmentPanel
                  stepAssignees={stepAssignees}
                  currentStep={activeTab}
                  onAssigneeChange={handleAssigneeChange}
                />

                {/* 入札情報セクション */}
                <Box>
                  <Typography
                    sx={{
                      fontSize: fontSizes.xs,
                      color: colors.text.muted,
                      fontWeight: 600,
                      mb: 1.5,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    入札情報
                  </Typography>
                  <BidInfoSection announcement={announcement} />
                </Box>
              </Box>
            </Box>
          </Box>
        </Paper>
      </Box>

      <FloatingBackButton onClick={handleBack} />
      <ScrollToTopButton />
    </Box>
  );
}
