import { Box, Typography, Link } from '@mui/material';
import { colors, fontSizes, iconStyles } from '../../../constants/styles';
import {
  Phone as PhoneIcon,
  Email as EmailIcon,
  Print as FaxIcon,
  Business as BusinessIcon,
  LocationOn as LocationIcon,
} from '@mui/icons-material';
import { InfoRow } from '../../common';
import type { Company, Branch } from '../../../types';

interface CompanyInfoSectionProps {
  company: Company;
  branch: Branch;
}

/**
 * 企業情報セクションコンポーネント
 */
export function CompanyInfoSection({ company, branch }: CompanyInfoSectionProps) {
  // TODO: 実際のデータに置き換え
  const phone = '03-1234-5678';
  const email = 'info@example.co.jp';
  const fax = '03-1234-5679';
  const postalCode = '100-0001';

  const iconStyle = { ...iconStyles.small, color: colors.text.light };

  return (
    <Box>
      {/* 企業名 */}
      <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.text.secondary, mb: 1.5 }}>
        {company.name}
      </Typography>

      {/* 詳細情報 */}
      <Box>
        <InfoRow label="支店" value={branch.name} icon={<BusinessIcon sx={iconStyle} />} variant="list" />
        <InfoRow label="電話" value={phone} icon={<PhoneIcon sx={iconStyle} />} variant="list" />
        <InfoRow
          label="メール"
          value={<Link href={`mailto:${email}`} sx={{ color: colors.accent.blue, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>{email}</Link>}
          icon={<EmailIcon sx={iconStyle} />}
          variant="list"
        />
        <InfoRow label="FAX" value={fax} icon={<FaxIcon sx={iconStyle} />} variant="list" />
        <InfoRow
          label="住所"
          value={<>〒{postalCode}<br />{company.address}</>}
          icon={<LocationIcon sx={iconStyle} />}
          variant="list"
        />
      </Box>
    </Box>
  );
}
