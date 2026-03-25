import { Box, Typography, Link } from '@mui/material';
import { colors, fontSizes, iconStyles } from '../../../constants/styles';
import {
  Phone as PhoneIcon,
  Email as EmailIcon,
  Print as FaxIcon,
  Person as PersonIcon,
  LocationOn as LocationIcon,
} from '@mui/icons-material';
import { InfoRow } from '../../common';
import type { Announcement } from '../../../types';

interface OrdererInfoSectionProps {
  announcement: Announcement;
}

/**
 * 発注者情報セクションコンポーネント
 */
export function OrdererInfoSection({ announcement }: OrdererInfoSectionProps) {
  const { organization, department } = announcement;
  const iconStyle = { ...iconStyles.small, color: colors.text.light };

  return (
    <Box>
      {/* 組織名 */}
      <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.text.secondary, mb: 1.5 }}>
        {organization}
      </Typography>

      {/* 詳細情報 */}
      <Box>
        <InfoRow label="担当者" value={department.contactPerson} icon={<PersonIcon sx={iconStyle} />} variant="list" />
        <InfoRow label="電話" value={department.phone} icon={<PhoneIcon sx={iconStyle} />} variant="list" />
        <InfoRow
          label="メール"
          value={<Link href={`mailto:${department.email}`} sx={{ color: colors.accent.blue, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>{department.email}</Link>}
          icon={<EmailIcon sx={iconStyle} />}
          variant="list"
        />
        <InfoRow label="FAX" value={department.fax} icon={<FaxIcon sx={iconStyle} />} variant="list" />
        <InfoRow
          label="住所"
          value={<>〒{department.postalCode}<br />{department.address}</>}
          icon={<LocationIcon sx={iconStyle} />}
          variant="list"
        />
      </Box>
    </Box>
  );
}
