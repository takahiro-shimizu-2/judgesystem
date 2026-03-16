import { Box, Chip } from '@mui/material';
import { ConfirmSection } from './ConfirmSection';
import { ConfirmField } from './ConfirmField';
import { OrdererIcon, ContactPhoneIcon, AccountTreeIcon } from '../../../constants/icons';
import type { OrdererFormData } from '../../../hooks/useOrdererForm';
import type { OrdererCategory } from '../../../types/orderer';
import { ordererCategoryConfig } from '../../../constants/ordererCategory';
import { formGridStyles } from '../../../constants/formStyles';
import { colors, fontSizes } from '../../../constants/styles';

interface OrdererConfirmViewProps {
  data: OrdererFormData;
}

export function OrdererConfirmView({ data }: OrdererConfirmViewProps) {
  const getCategoryChip = (category: OrdererCategory | '') => {
    if (!category) return null;
    const config = ordererCategoryConfig[category];
    if (!config) return null;
    return (
      <Chip
        label={config.label}
        size="small"
        sx={{
          backgroundColor: config.bgColor,
          color: config.color,
          fontWeight: 500,
          fontSize: fontSizes.xs,
          height: 24,
        }}
      />
    );
  };

  // 空でない部署のみフィルタリング
  const nonEmptyDepartments = data.departments.filter((d) => d.trim() !== '');

  return (
    <Box>
      <ConfirmSection title="基本情報" icon={<OrdererIcon sx={{ fontSize: 18 }} />}>
        <Box sx={formGridStyles.twoColumn}>
          <ConfirmField label="機関名" value={data.name} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ fontSize: fontSizes.xs, color: colors.text.muted, fontWeight: 500 }}>種別</Box>
            {data.category ? getCategoryChip(data.category) : <Box sx={{ color: colors.text.light, fontStyle: 'italic', fontSize: fontSizes.sm }}>-</Box>}
          </Box>
          <ConfirmField label="所在地" value={data.address} fullWidth />
        </Box>
      </ConfirmSection>

      <ConfirmSection title="連絡先" icon={<ContactPhoneIcon sx={{ fontSize: 18 }} />}>
        <Box sx={formGridStyles.twoColumn}>
          <ConfirmField label="電話番号" value={data.phone} />
          <ConfirmField label="FAX" value={data.fax} />
          <ConfirmField label="メールアドレス" value={data.email} />
          <ConfirmField label="ウェブサイト" value={data.website} type="link" />
        </Box>
      </ConfirmSection>

      <ConfirmSection title="組織（部署一覧）" icon={<AccountTreeIcon sx={{ fontSize: 18 }} />}>
        <ConfirmField label="部署" type="chips" chips={nonEmptyDepartments} fullWidth />
      </ConfirmSection>
    </Box>
  );
}
