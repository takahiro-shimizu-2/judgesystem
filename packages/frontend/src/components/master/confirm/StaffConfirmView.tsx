import { Box } from '@mui/material';
import { ConfirmSection } from './ConfirmSection';
import { ConfirmField } from './ConfirmField';
import { PersonIcon, ContactPhoneIcon } from '../../../constants/icons';
import type { StaffFormData } from '../../../hooks/useStaffForm';
import { formGridStyles } from '../../../constants/formStyles';

interface StaffConfirmViewProps {
  data: StaffFormData;
}

export function StaffConfirmView({ data }: StaffConfirmViewProps) {
  return (
    <Box>
      <ConfirmSection title="基本情報" icon={<PersonIcon sx={{ fontSize: 18 }} />}>
        <Box sx={formGridStyles.twoColumn}>
          <ConfirmField label="会社名" value={data.companyName} />
          <ConfirmField label="氏名" value={data.name} />
          <ConfirmField label="部署" value={data.department} />
        </Box>
      </ConfirmSection>

      <ConfirmSection title="連絡先" icon={<ContactPhoneIcon sx={{ fontSize: 18 }} />}>
        <Box sx={formGridStyles.twoColumn}>
          <ConfirmField label="メールアドレス" value={data.email} />
          <ConfirmField label="電話番号" value={data.phone} />
        </Box>
      </ConfirmSection>
    </Box>
  );
}
