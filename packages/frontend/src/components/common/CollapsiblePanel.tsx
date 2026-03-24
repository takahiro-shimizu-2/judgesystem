import { Box, Typography, Collapse, IconButton } from '@mui/material';
import { colors, fontSizes, iconStyles } from '../../constants/styles';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';

export interface CollapsiblePanelProps {
  title: string;
  icon: React.ReactNode;
  iconGradient: string;
  backgroundColor: string;
  hoverColor: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * 開閉可能なパネルコンポーネント
 * サイドバーの主要セクション（入札情報、発注者情報、企業情報）で使用
 */
export function CollapsiblePanel({
  title,
  icon,
  iconGradient,
  backgroundColor,
  hoverColor,
  expanded,
  onToggle,
  children,
}: CollapsiblePanelProps) {
  return (
    <>
      <Box
        onClick={onToggle}
        sx={{
          p: 2.5,
          borderBottom: `1px solid ${colors.border.main}`,
          backgroundColor,
          cursor: 'pointer',
          '&:hover': { backgroundColor: hoverColor },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: iconGradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {icon}
            </Box>
            <Typography sx={{ fontSize: fontSizes.base, fontWeight: 700, color: colors.text.secondary }}>
              {title}
            </Typography>
          </Box>
          <IconButton size="small">
            <ExpandMoreIcon
              sx={{
                ...iconStyles.large,
                color: colors.text.muted,
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
          </IconButton>
        </Box>
      </Box>
      <Collapse in={expanded}>{children}</Collapse>
    </>
  );
}
