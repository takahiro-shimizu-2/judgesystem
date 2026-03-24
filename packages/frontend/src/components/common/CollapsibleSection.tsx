import { useState } from 'react';
import { Box, Typography, Collapse, IconButton } from '@mui/material';
import { colors, fontSizes, iconStyles } from '../../constants/styles';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';

export interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

/**
 * 開閉可能なセクションコンポーネント
 * サイドバー内のサブセクション（資料リンク、概要情報など）で使用
 */
export function CollapsibleSection({
  title,
  defaultExpanded = true,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box sx={{ borderBottom: `1px solid ${colors.border.main}` }}>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          py: 1.5,
          cursor: 'pointer',
          '&:hover': { backgroundColor: 'rgba(0,0,0,0.02)' },
        }}
      >
        <Typography
          component="div"
          sx={{
            fontSize: fontSizes.xs,
            fontWeight: 600,
            color: colors.text.muted,
            letterSpacing: '0.03em',
          }}
        >
          {title}
        </Typography>
        <IconButton
          size="small"
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            p: 0.5,
          }}
        >
          <ExpandMoreIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ pb: 2, pt: 0.5 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}
