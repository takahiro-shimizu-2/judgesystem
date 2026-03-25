import { Paper, Typography, Box } from '@mui/material';
import { colors, fontSizes, borderRadius } from '../../../constants/styles';

interface ConfirmSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const sectionStyles = {
  container: {
    border: `1px solid ${colors.border.main}`,
    borderRadius: borderRadius.xs,
    overflow: 'hidden',
    mb: 2,
  },
  header: {
    backgroundColor: colors.background.default,
    px: 2.5,
    py: 1.5,
    borderBottom: `1px solid ${colors.border.main}`,
  },
  title: {
    fontSize: fontSizes.sm,
    fontWeight: 600,
    color: colors.text.secondary,
    display: 'flex',
    alignItems: 'center',
    gap: 1,
  },
  content: {
    p: 2.5,
    backgroundColor: colors.background.white,
  },
} as const;

export function ConfirmSection({ title, icon, children }: ConfirmSectionProps) {
  return (
    <Paper elevation={0} sx={sectionStyles.container}>
      <Box sx={sectionStyles.header}>
        <Box sx={sectionStyles.title}>
          {icon}
          <Typography component="span" sx={{ fontSize: 'inherit', fontWeight: 'inherit' }}>
            {title}
          </Typography>
        </Box>
      </Box>
      <Box sx={sectionStyles.content}>{children}</Box>
    </Paper>
  );
}
