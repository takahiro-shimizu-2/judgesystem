import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, LinearProgress, Chip, Tabs, Tab, useMediaQuery, useTheme } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import type { RequirementResult, EvaluationStatus, SimilarCase } from '../../../types';
import { RequirementCard } from '../../bid';
import { getSimilarCases } from '../../../data';
import { colors, fontSizes, iconStyles, chipStyles, borderRadius } from '../../../constants/styles';

interface JudgmentSectionProps {
  requirements: RequirementResult[];
  status: EvaluationStatus;
}

// 金額フォーマット関数
const formatAmount = (amount: number): string => {
  if (amount >= 100000000) {
    return `${(amount / 100000000).toFixed(1)}億円`;
  }
  return `${(amount / 10000).toLocaleString()}万円`;
};

export function JudgmentSection({ requirements, status }: JudgmentSectionProps) {
  const theme = useTheme();
  const isXlUp = useMediaQuery(theme.breakpoints.up('xl'));
  const [activeTab, setActiveTab] = useState(0);
  const navigate = useNavigate();

  // requirements が undefined の場合のガード
  if (!requirements || !Array.isArray(requirements)) {
    return <Typography>要件データを読み込んでいます...</Typography>;
  }

  const metRequirements = requirements.filter((r) => r.isMet);
  const unmetRequirements = requirements.filter((r) => !r.isMet);
  const totalCount = requirements.length;
  const metCount = metRequirements.length;
  const progressPercent = totalCount > 0 ? (metCount / totalCount) * 100 : 0;

  // 類似案件を5件取得
  const similarCases: SimilarCase[] = getSimilarCases(5);

  const getStatusInfo = () => {
    switch (status) {
      case 'all_met':
        return {
          label: '参加可能',
          color: colors.text.white,
          bgColor: colors.accent.greenSuccess,
          textColor: colors.text.white,
        };
      case 'other_only_unmet':
        return {
          label: '条件付き参加',
          color: colors.text.white,
          bgColor: colors.accent.orangeDark,
          textColor: colors.text.white,
        };
      default:
        return {
          label: '参加不可',
          color: colors.text.white,
          bgColor: colors.status.error.main,
          textColor: colors.text.white,
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 総合判定 (全幅) */}
      <Box
        sx={{
          p: 2.5,
          borderRadius: borderRadius.xs,
          backgroundColor: statusInfo.bgColor,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography sx={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.white }}>
            総合判定
          </Typography>
          <Chip
            label={statusInfo.label}
            size="small"
            sx={{
              ...chipStyles.small,
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: colors.text.white,
            }}
          />
        </Box>
        {/* 進捗バー */}
        <Box sx={{ mb: 1.5 }}>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{
              height: 6,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.3)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                backgroundColor: colors.text.white,
              },
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CheckCircleIcon sx={{ ...iconStyles.small, color: colors.text.white }} />
              <Typography sx={{ fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                OK: {metCount}件
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CancelIcon sx={{ ...iconStyles.small, color: colors.text.white }} />
              <Typography sx={{ fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                NG: {unmetRequirements.length}件
              </Typography>
            </Box>
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: fontSizes.base, color: colors.text.white }}>
            {Math.round(progressPercent)}%
          </Typography>
        </Box>
      </Box>

      {/* 判定結果コンテンツ */}
      {(() => {
        // 判定結果のレンダリング
        const renderJudgmentContent = () => (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* 未達成要件 */}
            {unmetRequirements.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 4,
                      height: 18,
                      borderRadius: 2,
                      backgroundColor: colors.status.error.main,
                    }}
                  />
                  <Typography sx={{ fontWeight: 600, color: colors.text.secondary, fontSize: fontSizes.md }}>
                    未達成要件
                  </Typography>
                  <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                    {unmetRequirements.length}件
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {unmetRequirements.map((req) => (
                    <RequirementCard key={req.id} requirement={req} defaultExpanded={true} />
                  ))}
                </Box>
              </Box>
            )}

            {/* 達成要件 */}
            {metRequirements.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 4,
                      height: 18,
                      borderRadius: 2,
                      backgroundColor: colors.accent.greenSuccess,
                    }}
                  />
                  <Typography sx={{ fontWeight: 600, color: colors.text.secondary, fontSize: fontSizes.md }}>
                    達成要件
                  </Typography>
                  <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                    {metRequirements.length}件
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {metRequirements.map((req) => (
                    <RequirementCard key={req.id} requirement={req} defaultExpanded={false} />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        );

        // 類似案件のレンダリング
        const renderSimilarCases = () => (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {similarCases.map((similarCase) => (
              <Box
                key={similarCase.id}
                onClick={() => navigate(`/announcements/${similarCase.announcementId}`)}
                sx={{
                  p: 2,
                  borderRadius: borderRadius.xs,
                  backgroundColor: colors.text.white,
                  border: `1px solid ${colors.border.main}`,
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: colors.accent.blue,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  },
                }}
              >
                {/* 案件名 */}
                <Typography
                  sx={{
                    fontWeight: 600,
                    fontSize: fontSizes.base,
                    color: colors.text.secondary,
                    mb: 1.5,
                  }}
                >
                  {similarCase.caseName}
                </Typography>

                {/* 落札情報 */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>
                      落札企業:
                    </Typography>
                    <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.text.secondary }}>
                      {similarCase.winningCompany}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>
                      落札金額:
                    </Typography>
                    <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.status.success.main }}>
                      {formatAmount(similarCase.winningAmount)}
                    </Typography>
                  </Box>
                </Box>

                {/* 競争参加企業 */}
                <Box>
                  <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted, mb: 0.75 }}>
                    競争参加企業:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {similarCase.competitors.map((competitor, idx) => (
                      <Chip
                        key={idx}
                        label={competitor}
                        size="small"
                        sx={{
                          ...chipStyles.small,
                          backgroundColor: competitor === similarCase.winningCompany ? '#fef3c7' : colors.background.default,
                          color: competitor === similarCase.winningCompany ? '#92400e' : colors.text.muted,
                          fontWeight: competitor === similarCase.winningCompany ? 600 : 400,
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        );

        // ワイドモニター（xl以上）: 2カラムレイアウト
        if (isXlUp) {
          return (
            <Box sx={{ display: 'flex', gap: 3 }}>
              {/* 左カラム: 判定結果 */}
              <Box
                sx={{
                  flex: 7,
                  pr: 3,
                  borderRight: `1px solid ${colors.border.main}`,
                }}
              >
                {renderJudgmentContent()}
              </Box>

              {/* 右カラム: 類似案件 */}
              <Box sx={{ flex: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 4,
                      height: 18,
                      borderRadius: 2,
                      backgroundColor: colors.accent.blue,
                    }}
                  />
                  <Typography sx={{ fontWeight: 600, color: colors.text.secondary, fontSize: fontSizes.md }}>
                    類似案件
                  </Typography>
                  <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                    {similarCases.length}件
                  </Typography>
                </Box>
                {renderSimilarCases()}
              </Box>
            </Box>
          );
        }

        // 通常のPC幅: タブ切り替え
        return (
          <Box>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              sx={{
                minHeight: 36,
                '& .MuiTab-root': {
                  fontSize: fontSizes.sm,
                  minHeight: 36,
                  py: 0.75,
                  textTransform: 'none',
                  color: colors.text.muted,
                  '&.Mui-selected': {
                    color: colors.accent.blue,
                    fontWeight: 600,
                  },
                },
                '& .MuiTabs-indicator': { backgroundColor: colors.accent.blue },
              }}
            >
              <Tab label="判定根拠" />
              <Tab label={`類似案件 (${similarCases.length})`} />
            </Tabs>
            <Box sx={{ mt: 2 }}>
              {activeTab === 0 && renderJudgmentContent()}
              {activeTab === 1 && renderSimilarCases()}
            </Box>
          </Box>
        );
      })()}
    </Box>
  );
}
