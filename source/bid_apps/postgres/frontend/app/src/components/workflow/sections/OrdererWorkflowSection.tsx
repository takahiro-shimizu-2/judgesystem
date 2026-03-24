/**
 * 発注者ワークフローセクション（コンテナ）
 * 架電記録、提出書類、評価、文字起こしのサブコンポーネントを統合
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  Phone as PhoneIcon,
  AttachFile as AttachFileIcon,
  Mic as MicIcon,
  StarOutline as EvaluationIcon,
} from '@mui/icons-material';
import {
  colors,
  fontSizes,
  iconStyles,
  staffSelectStyles,
} from '../../../constants/styles';
import {
  createEmptyOrdererWorkflowState,
  fetchOrdererWorkflowState,
  updateOrdererWorkflowState,
} from '../../../data/evaluations';
import type {
  BidEvaluation,
  OrdererWorkflowState,
} from '../../../types';
import { useStaffDirectory } from '../../../contexts/StaffContext';
import { PersonIcon } from '../../../constants/icons';
import { SCRIPT_TEMPLATE_IDS, EMAIL_TEMPLATE_IDS } from './ordererWorkflowUtils';
import { CallLogSection } from './CallLogSection';
import { DocumentsSection } from './DocumentsSection';
import { EvaluationScoreSection } from './EvaluationScoreSection';
import { TranscriptionSection } from './TranscriptionSection';

interface OrdererWorkflowSectionProps {
  evaluation?: BidEvaluation;
  workflowAssigneeId?: string;
}

export function OrdererWorkflowSection({ evaluation, workflowAssigneeId }: OrdererWorkflowSectionProps) {
  const { staff, findById } = useStaffDirectory();
  const evaluationNo = evaluation?.evaluationNo ?? '';
  const projectName = evaluation?.announcement?.title || '（案件名）';
  const ordererOrg = evaluation?.announcement?.organization || '（発注機関）';
  const ordererContact = evaluation?.announcement?.department?.contactPerson || '担当者';
  const companyName = evaluation?.company?.name || '（自社名）';
  const myName = '営業担当';

  const [workflowState, setWorkflowState] = useState<OrdererWorkflowState>(createEmptyOrdererWorkflowState);
  const workflowStateRef = useRef<OrdererWorkflowState>(createEmptyOrdererWorkflowState());
  const saveRequestIdRef = useRef(0);

  const [isWorkflowLoading, setIsWorkflowLoading] = useState(false);
  const [isWorkflowSaving, setIsWorkflowSaving] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState(0);

  const [tabAssignees, setTabAssignees] = useState<string[]>(['', '', '', '']);
  const [scriptAssignees, setScriptAssignees] = useState<Record<string, string>>({});
  const [emailAssignees, setEmailAssignees] = useState<Record<string, string>>({});
  const [docsAssignee, setDocsAssignee] = useState('');

  // -- Talk script templates --
  const talkScriptTemplates = [
    {
      id: 'intro',
      label: '初回架電',
      content: `【挨拶】
お世話になっております。${companyName}の${myName}と申します。

【用件】
本日は「${projectName}」の件でご連絡しました。
入札参加を検討しており、確認させていただきたい点がございます。

【確認事項】
・現場説明会の日程
・入札参加資格
・質問書の提出期限

【クロージング】
ご確認ありがとうございます。よろしくお願いいたします。`,
    },
    {
      id: 'followup',
      label: 'フォローアップ',
      content: `【挨拶】
お世話になっております。${companyName}の${myName}です。

【用件】
先日ご相談した「${projectName}」について追加で確認のためお電話しました。

【確認事項】
・前回質問への回答状況
・追加で必要な情報

【クロージング】
お忙しいところ恐れ入りますが、よろしくお願いいたします。`,
    },
  ];

  // -- Email templates --
  const emailTemplates = [
    {
      id: '1',
      label: '資料請求',
      subject: `【資料請求】${projectName}に関する資料のご送付のお願い`,
      body: `${ordererOrg}
${ordererContact}様

お世話になっております。
${companyName}の${myName}でございます。

「${projectName}」について入札参加を検討しております。
関連資料のご送付をお願いできますと幸いです。

よろしくお願いいたします。`,
    },
    {
      id: '2',
      label: '質問送付',
      subject: `【質問】${projectName}について`,
      body: `${ordererOrg}
${ordererContact}様

お世話になっております。
${companyName}の${myName}でございます。

「${projectName}」について確認事項がございます。

1.

ご回答いただけますと幸いです。`,
    },
    {
      id: '3',
      label: '書類提出',
      subject: `【書類提出】${projectName}`,
      body: `${ordererOrg}
${ordererContact}様

お世話になっております。
${companyName}の${myName}でございます。

「${projectName}」の提出書類をお送りいたします。
ご査収のほどよろしくお願いいたします。`,
    },
  ];

  // -- Effects --

  useEffect(() => {
    workflowStateRef.current = workflowState;
  }, [workflowState]);

  useEffect(() => {
    let isCancelled = false;

    const loadWorkflow = async () => {
      if (!evaluationNo) {
        const emptyState = createEmptyOrdererWorkflowState();
        workflowStateRef.current = emptyState;
        setWorkflowState(emptyState);
        setIsWorkflowLoading(false);
        return;
      }

      setIsWorkflowLoading(true);
      setWorkflowError(null);

      const state = await fetchOrdererWorkflowState(evaluationNo);
      if (!isCancelled) {
        workflowStateRef.current = state;
        setWorkflowState(state);
        setIsWorkflowLoading(false);
      }
    };

    loadWorkflow();

    return () => {
      isCancelled = true;
    };
  }, [evaluationNo]);

  useEffect(() => {
    if (!workflowAssigneeId) {
      return;
    }

    setTabAssignees((prev) => prev.map((value) => (value === '' ? workflowAssigneeId : value)));

    setScriptAssignees((prev) => {
      const next = { ...prev };
      SCRIPT_TEMPLATE_IDS.forEach((templateId) => {
        if (!next[templateId]) {
          next[templateId] = workflowAssigneeId;
        }
      });
      return next;
    });

    setEmailAssignees((prev) => {
      const next = { ...prev };
      EMAIL_TEMPLATE_IDS.forEach((templateId) => {
        if (!next[templateId]) {
          next[templateId] = workflowAssigneeId;
        }
      });
      return next;
    });

    setDocsAssignee((prev) => (prev === '' ? workflowAssigneeId : prev));
  }, [workflowAssigneeId]);

  // -- Persist helper --

  const persistWorkflowState = useCallback(async (
    updater: (prev: OrdererWorkflowState) => OrdererWorkflowState
  ): Promise<boolean> => {
    const previousState = workflowStateRef.current;
    const nextState = updater(previousState);
    workflowStateRef.current = nextState;
    setWorkflowState(nextState);
    setWorkflowError(null);

    if (!evaluationNo) {
      return true;
    }

    const requestId = ++saveRequestIdRef.current;
    setIsWorkflowSaving(true);
    const savedState = await updateOrdererWorkflowState(evaluationNo, nextState);

    if (requestId !== saveRequestIdRef.current) {
      return savedState !== null;
    }

    setIsWorkflowSaving(false);

    if (!savedState) {
      workflowStateRef.current = previousState;
      setWorkflowState(previousState);
      setWorkflowError('DB 保存に失敗しました。時間をおいて再度お試しください。');
      return false;
    }

    workflowStateRef.current = savedState;
    setWorkflowState(savedState);
    return true;
  }, [evaluationNo]);

  // -- Assignee handlers --

  const handleTabAssigneeChange = (tabIndex: number, staffId: string) => {
    setTabAssignees((prev) => {
      const next = [...prev];
      next[tabIndex] = staffId;
      return next;
    });
  };

  const handleScriptAssigneeChange = (scriptId: string, staffId: string) => {
    setScriptAssignees((prev) => ({ ...prev, [scriptId]: staffId }));
  };

  const handleEmailAssigneeChange = (templateId: string, staffId: string) => {
    setEmailAssignees((prev) => ({ ...prev, [templateId]: staffId }));
  };

  // -- Status line --

  const renderStatusLine = () => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, minHeight: 20 }}>
      {isWorkflowLoading && (
        <>
          <CircularProgress size={14} />
          <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
            DB から読み込み中...
          </Typography>
        </>
      )}
      {!isWorkflowLoading && isWorkflowSaving && (
        <Typography sx={{ fontSize: fontSizes.xs, color: colors.accent.blue }}>
          保存中...
        </Typography>
      )}
      {workflowError && (
        <Typography sx={{ fontSize: fontSizes.xs, color: colors.status.error.main }}>
          {workflowError}
        </Typography>
      )}
    </Box>
  );

  // -- Render --

  return (
    <Box>
      {renderStatusLine()}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 32,
            flex: 1,
            '& .MuiTab-root': { fontSize: fontSizes.sm, minHeight: 32, py: 0.5, textTransform: 'none' },
            '& .MuiTabs-indicator': { backgroundColor: colors.accent.blue },
            '& .Mui-selected': { color: colors.accent.blue },
          }}
        >
          <Tab icon={<PhoneIcon sx={iconStyles.small} />} iconPosition="start" label="記録" />
          <Tab icon={<AttachFileIcon sx={iconStyles.small} />} iconPosition="start" label="提出書類" />
          <Tab icon={<EvaluationIcon sx={iconStyles.small} />} iconPosition="start" label="評価" />
          <Tab icon={<MicIcon sx={iconStyles.small} />} iconPosition="start" label="文字起こし" />
        </Tabs>
        {activeTab === 2 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PersonIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
            <FormControl size="small">
              <Select
                value={tabAssignees[activeTab] || ''}
                onChange={(event) => handleTabAssigneeChange(activeTab, event.target.value)}
                displayEmpty
                sx={staffSelectStyles}
                renderValue={(value) => {
                  if (!value) {
                    return <span style={{ color: colors.text.light, fontSize: fontSizes.xs }}>担当者</span>;
                  }
                  const staffMember = findById(value);
                  return <span style={{ fontSize: fontSizes.xs }}>{staffMember?.name || '担当者'}</span>;
                }}
              >
                <MenuItem value="">
                  <em style={{ color: colors.text.light, fontSize: fontSizes.xs }}>未割当</em>
                </MenuItem>
                {staff.map((member) => (
                  <MenuItem key={member.id} value={member.id} sx={{ fontSize: fontSizes.xs }}>
                    {member.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}
      </Box>

      <Box>
        {activeTab === 0 && (
          <CallLogSection
            workflowState={workflowState}
            isWorkflowLoading={isWorkflowLoading}
            persistWorkflowState={persistWorkflowState}
            talkScriptTemplates={talkScriptTemplates}
            staff={staff}
            findById={findById}
            scriptAssignees={scriptAssignees}
            onScriptAssigneeChange={handleScriptAssigneeChange}
          />
        )}
        {activeTab === 1 && (
          <DocumentsSection
            workflowState={workflowState}
            persistWorkflowState={persistWorkflowState}
            setWorkflowError={setWorkflowError}
            emailTemplates={emailTemplates}
            staff={staff}
            findById={findById}
            emailAssignees={emailAssignees}
            onEmailAssigneeChange={handleEmailAssigneeChange}
            docsAssignee={docsAssignee}
            onDocsAssigneeChange={setDocsAssignee}
          />
        )}
        {activeTab === 2 && (
          <EvaluationScoreSection
            workflowState={workflowState}
            persistWorkflowState={persistWorkflowState}
          />
        )}
        {activeTab === 3 && (
          <TranscriptionSection
            workflowState={workflowState}
            persistWorkflowState={persistWorkflowState}
          />
        )}
      </Box>
    </Box>
  );
}
