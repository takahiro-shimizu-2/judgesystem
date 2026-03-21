import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Chip, Typography } from '@mui/material';
import { colors, fontSizes, chipStyles, borderRadius } from '../../../constants/styles';
import { getSimilarCases } from '../../../data';
import type { SimilarCase } from '../../../types';

interface SimilarCasesPanelProps {
  count?: number;
}

const formatAmount = (amount: number): string => {
  if (amount >= 100000000) {
    return `${(amount / 100000000).toFixed(1)}億円`;
  }
  return `${(amount / 10000).toLocaleString()}万円`;
};

export function SimilarCasesPanel({ count = 8 }: SimilarCasesPanelProps) {
  const navigate = useNavigate();

  const similarCases: SimilarCase[] = useMemo(() => getSimilarCases(count), [count]);

  if (similarCases.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light }}>
          類似案件が見つかりませんでした。
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {similarCases.map((similarCase) => (
        <Box
          key={similarCase.id}
          onClick={() => navigate(`/announcements/${similarCase.announcementId}`)}
          sx={{
            p: 2.5,
            borderRadius: borderRadius.xs,
            backgroundColor: colors.text.white,
            border: `1px solid ${colors.border.main}`,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: colors.accent.blue,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
            },
          }}
        >
          <Typography
            sx={{ fontWeight: 600, fontSize: fontSizes.base, color: colors.text.secondary, mb: 1.5 }}
          >
            {similarCase.caseName}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>落札企業:</Typography>
              <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.text.secondary }}>
                {similarCase.winningCompany}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>落札金額:</Typography>
              <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.status.success.main }}>
                {formatAmount(similarCase.winningAmount)}
              </Typography>
            </Box>
          </Box>

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
                    backgroundColor:
                      competitor === similarCase.winningCompany ? '#fef3c7' : colors.background.default,
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
}
