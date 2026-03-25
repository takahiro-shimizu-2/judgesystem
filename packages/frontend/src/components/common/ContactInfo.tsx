/**
 * 連絡先情報表示コンポーネント
 * 電話・メール・FAX・住所などの連絡先情報を統一されたスタイルで表示
 */
import { Box, Typography, Button } from '@mui/material';
import {
  PhoneIcon,
  EmailIcon,
  FaxIcon,
  LocationIcon,
} from '../../constants/icons';
import { colors, fontSizes } from '../../constants/styles';

// ============================================================================
// IconText - アイコン付きテキスト（汎用）
// ============================================================================

export interface IconTextProps {
  icon: React.ReactNode;
  text: string;
  color?: string;
  fontSize?: string;
  iconSize?: number;
  onClick?: () => void;
}

export function IconText({
  icon,
  text,
  color = colors.text.muted,
  fontSize = fontSizes.sm,
  iconSize = 16,
  onClick,
}: IconTextProps) {
  const content = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        color,
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { opacity: 0.8 } : {},
      }}
      onClick={onClick}
    >
      <Box sx={{ display: 'flex', '& svg': { fontSize: iconSize } }}>{icon}</Box>
      <Typography sx={{ fontSize, color }}>{text}</Typography>
    </Box>
  );

  return content;
}

// ============================================================================
// ContactInfo - 連絡先情報セット
// ============================================================================

export interface ContactInfoProps {
  phone?: string;
  email?: string;
  fax?: string;
  address?: string;
  contactPerson?: string;
  layout?: 'row' | 'column';
  fontSize?: string;
  iconSize?: number;
  showLabels?: boolean;
  gap?: number;
}

export function ContactInfo({
  phone,
  email,
  fax,
  address,
  contactPerson,
  layout = 'row',
  fontSize = fontSizes.sm,
  iconSize = 16,
  showLabels = false,
  gap = 2,
}: ContactInfoProps) {
  const containerSx =
    layout === 'row'
      ? { display: 'flex', gap, flexWrap: 'wrap' as const, alignItems: 'center' }
      : { display: 'flex', flexDirection: 'column' as const, gap: 0.5 };

  const items = [
    contactPerson && {
      key: 'person',
      content: (
        <Typography sx={{ fontSize, color: colors.text.secondary, fontWeight: 500 }}>
          {contactPerson}
        </Typography>
      ),
    },
    phone && {
      key: 'phone',
      content: (
        <IconText
          icon={<PhoneIcon />}
          text={showLabels ? `TEL: ${phone}` : phone}
          fontSize={fontSize}
          iconSize={iconSize}
        />
      ),
    },
    email && {
      key: 'email',
      content: (
        <IconText
          icon={<EmailIcon />}
          text={showLabels ? `Email: ${email}` : email}
          fontSize={fontSize}
          iconSize={iconSize}
        />
      ),
    },
    fax && {
      key: 'fax',
      content: (
        <IconText
          icon={<FaxIcon />}
          text={showLabels ? `FAX: ${fax}` : fax}
          fontSize={fontSize}
          iconSize={iconSize}
        />
      ),
    },
    address && {
      key: 'address',
      content: (
        <IconText
          icon={<LocationIcon />}
          text={address}
          fontSize={fontSize}
          iconSize={iconSize}
        />
      ),
    },
  ].filter(Boolean) as Array<{ key: string; content: React.ReactNode }>;

  return (
    <Box sx={containerSx}>
      {items.map((item) => (
        <Box key={item.key}>{item.content}</Box>
      ))}
    </Box>
  );
}

// ============================================================================
// ContactActions - 連絡先アクションボタン
// ============================================================================

export interface ContactActionsProps {
  phone?: string;
  email?: string;
  onPhoneClick?: () => void;
  onEmailClick?: () => void;
  layout?: 'row' | 'stacked';
  size?: 'small' | 'medium';
}

export function ContactActions({
  phone,
  email,
  onPhoneClick,
  onEmailClick,
  layout = 'row',
  size = 'medium',
}: ContactActionsProps) {
  const handlePhone = onPhoneClick || (() => {
    if (phone) window.location.href = `tel:${phone}`;
  });

  const handleEmail = onEmailClick || (() => {
    if (email) window.location.href = `mailto:${email}`;
  });

  const buttonSx = {
    flex: layout === 'row' ? 1 : undefined,
    py: size === 'small' ? 0.5 : 0.75,
    fontWeight: 600,
    fontSize: size === 'small' ? fontSizes.xs : fontSizes.sm,
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, flexDirection: layout === 'stacked' ? 'column' : 'row' }}>
      {phone && (
        <Button
          variant="contained"
          startIcon={<PhoneIcon />}
          onClick={(e) => {
            e.stopPropagation();
            handlePhone();
          }}
          sx={{
            ...buttonSx,
            backgroundColor: colors.status.success.main,
            '&:hover': { backgroundColor: colors.accent.greenHover },
          }}
        >
          電話
        </Button>
      )}
      {email && (
        <Button
          variant="contained"
          startIcon={<EmailIcon />}
          onClick={(e) => {
            e.stopPropagation();
            handleEmail();
          }}
          sx={{
            ...buttonSx,
            backgroundColor: colors.accent.blue,
            '&:hover': { backgroundColor: colors.accent.blueHover },
          }}
        >
          メール
        </Button>
      )}
    </Box>
  );
}
