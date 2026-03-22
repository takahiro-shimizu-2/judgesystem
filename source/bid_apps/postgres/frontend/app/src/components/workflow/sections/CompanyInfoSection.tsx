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
import { findCompanyById } from '../../../data/companies';

interface CompanyInfoSectionProps {
  company: Company;
  branch: Branch;
}

const formatAddress = (postalCode: string | undefined, address: string | undefined) => {
  if (!address) {
    return '住所情報なし';
  }
  if (!postalCode) {
    return address;
  }
  return (
    <>
      〒{postalCode}
      <br />
      {address}
    </>
  );
};

const renderEmailValue = (email?: string | null) => {
  if (!email) {
    return '未登録';
  }
  return (
    <Link
      href={`mailto:${email}`}
      sx={{
        color: colors.accent.blue,
        textDecoration: 'none',
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      {email}
    </Link>
  );
};

/**
 * 企業情報セクションコンポーネント
 */
export function CompanyInfoSection({ company, branch }: CompanyInfoSectionProps) {
  const companyDetails = findCompanyById(company.id);
  const phone = companyDetails?.phone?.trim() || '未登録';
  const email = companyDetails?.email?.trim() || null;
  const fax = companyDetails?.fax?.trim() || '未登録';
  const postalCode = companyDetails?.postalCode?.trim();
  const fallbackAddress = companyDetails?.address?.trim() || company.address?.trim();
  const branchAddress = branch?.address?.trim() || fallbackAddress;
  const iconStyle = { ...iconStyles.small, color: colors.text.light };

  return (
    <Box>
      {/* 企業名 */}
      <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.text.secondary, mb: 1.5 }}>
        {company.name}
      </Typography>

      {/* 詳細情報 */}
      <Box>
        <InfoRow label="支店" value={branch.name || '未登録'} icon={<BusinessIcon sx={iconStyle} />} variant="list" />
        <InfoRow label="電話" value={phone} icon={<PhoneIcon sx={iconStyle} />} variant="list" />
        <InfoRow
          label="メール"
          value={renderEmailValue(email)}
          icon={<EmailIcon sx={iconStyle} />}
          variant="list"
        />
        <InfoRow label="FAX" value={fax} icon={<FaxIcon sx={iconStyle} />} variant="list" />
        <InfoRow
          label="住所"
          value={formatAddress(postalCode || undefined, branchAddress)}
          icon={<LocationIcon sx={iconStyle} />}
          variant="list"
        />
      </Box>
    </Box>
  );
}
