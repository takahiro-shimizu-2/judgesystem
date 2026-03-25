import { Box, Typography, Paper } from '@mui/material';
import { ConfirmSection } from './ConfirmSection';
import { ConfirmField } from './ConfirmField';
import {
  BusinessIcon,
  InfoIcon,
  AssessmentIcon,
  CategoryIcon,
  LocationIcon,
  VerifiedUserIcon,
} from '../../../constants/icons';
import type { PartnerFormData } from '../../../hooks/usePartnerForm';
import { formGridStyles } from '../../../constants/formStyles';
import { colors, fontSizes, borderRadius } from '../../../constants/styles';

interface PartnerConfirmViewProps {
  data: PartnerFormData;
}

const tableStyles = {
  container: {
    border: `1px solid ${colors.border.main}`,
    borderRadius: borderRadius.xs,
    overflow: 'hidden',
  },
  header: {
    display: 'grid',
    backgroundColor: colors.background.default,
    borderBottom: `1px solid ${colors.border.main}`,
    p: 1.5,
  },
  row: {
    display: 'grid',
    p: 1.5,
    '&:not(:last-child)': {
      borderBottom: `1px solid ${colors.border.main}`,
    },
  },
  cell: {
    fontSize: fontSizes.sm,
    color: colors.text.primary,
  },
  headerCell: {
    fontSize: fontSizes.xs,
    fontWeight: 600,
    color: colors.text.muted,
  },
  emptyMessage: {
    p: 3,
    textAlign: 'center',
    color: colors.text.light,
    fontSize: fontSizes.sm,
    fontStyle: 'italic',
  },
} as const;

export function PartnerConfirmView({ data }: PartnerConfirmViewProps) {
  // 金額フォーマット
  const formatCurrency = (value: string) => {
    if (!value) return '';
    const num = parseInt(value, 10);
    if (isNaN(num)) return value;
    return num.toLocaleString();
  };

  // 空でない拠点のみフィルタリング
  const validBranches = data.branches.filter((b) => b.name || b.address);

  // 空でない資格のみフィルタリング
  const validUnifiedQualifications = data.unifiedQualifications.filter(
    (q) => q.mainCategory || q.category || q.region
  );

  const validOrdererQualifications = data.ordererQualifications.filter(
    (q) => q.ordererName || q.items.some((item) => item.category || item.region)
  );

  return (
    <Box>
      {/* 基本情報 */}
      <ConfirmSection title="基本情報" icon={<BusinessIcon sx={{ fontSize: 18 }} />}>
        <Box sx={formGridStyles.twoColumn}>
          <ConfirmField label="会社名" value={data.name} />
          <ConfirmField label="郵便番号" value={data.postalCode} />
          <ConfirmField label="住所" value={data.address} fullWidth />
          <ConfirmField label="電話番号" value={data.phone} />
          <ConfirmField label="メールアドレス" value={data.email} />
          <ConfirmField label="FAX" value={data.fax} />
          <ConfirmField label="ホームページURL" value={data.url} type="link" />
        </Box>
      </ConfirmSection>

      {/* 会社概要 */}
      <ConfirmSection title="会社概要" icon={<InfoIcon sx={{ fontSize: 18 }} />}>
        <Box sx={formGridStyles.twoColumn}>
          <ConfirmField label="代表者" value={data.representative} />
          <ConfirmField label="設立年" value={data.established} suffix="年" />
          <ConfirmField label="資本金" value={formatCurrency(data.capital)} suffix="円" />
          <ConfirmField label="従業員数" value={data.employeeCount} suffix="名" />
        </Box>
      </ConfirmSection>

      {/* 業種 */}
      <ConfirmSection title="業種" icon={<CategoryIcon sx={{ fontSize: 18 }} />}>
        <ConfirmField label="業種" type="chips" chips={data.categories} fullWidth />
      </ConfirmSection>

      {/* 実績・評価 */}
      <ConfirmSection title="実績・評価" icon={<AssessmentIcon sx={{ fontSize: 18 }} />}>
        <Box sx={formGridStyles.threeColumn}>
          <ConfirmField label="現地調査回数" value={data.surveyCount} suffix="回" />
          <ConfirmField label="実績数" value={data.resultCount} suffix="件" />
          <ConfirmField label="評価" value={data.rating} type="rating" ratingMax={3} />
        </Box>
      </ConfirmSection>

      {/* 拠点一覧 */}
      <ConfirmSection title="拠点一覧" icon={<LocationIcon sx={{ fontSize: 18 }} />}>
        {validBranches.length === 0 ? (
          <Typography sx={tableStyles.emptyMessage}>登録なし</Typography>
        ) : (
          <Box sx={tableStyles.container}>
            <Box sx={{ ...tableStyles.header, gridTemplateColumns: '1fr 2fr' }}>
              <Typography sx={tableStyles.headerCell}>拠点名</Typography>
              <Typography sx={tableStyles.headerCell}>住所</Typography>
            </Box>
            {validBranches.map((branch, index) => (
              <Box key={index} sx={{ ...tableStyles.row, gridTemplateColumns: '1fr 2fr' }}>
                <Typography sx={tableStyles.cell}>{branch.name || '-'}</Typography>
                <Typography sx={tableStyles.cell}>{branch.address || '-'}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </ConfirmSection>

      {/* 競争参加資格 */}
      <ConfirmSection title="競争参加資格" icon={<VerifiedUserIcon sx={{ fontSize: 18 }} />}>
        {/* 全省庁統一資格 */}
        <Typography
          sx={{
            fontSize: fontSizes.sm,
            fontWeight: 600,
            color: colors.text.secondary,
            mb: 1.5,
          }}
        >
          全省庁統一資格
        </Typography>
        {validUnifiedQualifications.length === 0 ? (
          <Typography sx={{ ...tableStyles.emptyMessage, mb: 3 }}>登録なし</Typography>
        ) : (
          <Box sx={{ ...tableStyles.container, mb: 3 }}>
            <Box
              sx={{
                ...tableStyles.header,
                gridTemplateColumns: '1fr 1fr 1fr 0.7fr 0.5fr',
              }}
            >
              <Typography sx={tableStyles.headerCell}>大カテゴリー</Typography>
              <Typography sx={tableStyles.headerCell}>種別</Typography>
              <Typography sx={tableStyles.headerCell}>競争参加地域</Typography>
              <Typography sx={tableStyles.headerCell}>数値</Typography>
              <Typography sx={tableStyles.headerCell}>等級</Typography>
            </Box>
            {validUnifiedQualifications.map((qual, index) => (
              <Box
                key={index}
                sx={{
                  ...tableStyles.row,
                  gridTemplateColumns: '1fr 1fr 1fr 0.7fr 0.5fr',
                }}
              >
                <Typography sx={tableStyles.cell}>{qual.mainCategory || '-'}</Typography>
                <Typography sx={tableStyles.cell}>{qual.category || '-'}</Typography>
                <Typography sx={tableStyles.cell}>{qual.region || '-'}</Typography>
                <Typography sx={tableStyles.cell}>{qual.value || '-'}</Typography>
                <Typography sx={tableStyles.cell}>{qual.grade || '-'}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* 発注者別資格 */}
        <Typography
          sx={{
            fontSize: fontSizes.sm,
            fontWeight: 600,
            color: colors.text.secondary,
            mb: 1.5,
          }}
        >
          発注者別資格
        </Typography>
        {validOrdererQualifications.length === 0 ? (
          <Typography sx={tableStyles.emptyMessage}>登録なし</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {validOrdererQualifications.map((ordererQual, ordererIndex) => (
              <Paper
                key={ordererIndex}
                elevation={0}
                sx={{
                  border: `1px solid ${colors.border.main}`,
                  borderRadius: borderRadius.xs,
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    backgroundColor: colors.background.default,
                    px: 2,
                    py: 1,
                    borderBottom: `1px solid ${colors.border.main}`,
                  }}
                >
                  <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.text.secondary }}>
                    {ordererQual.ordererName || '（発注者名未設定）'}
                  </Typography>
                </Box>
                {ordererQual.items.filter((item) => item.category || item.region).length === 0 ? (
                  <Typography sx={tableStyles.emptyMessage}>資格項目なし</Typography>
                ) : (
                  <Box>
                    <Box
                      sx={{
                        ...tableStyles.header,
                        gridTemplateColumns: '1fr 1fr 0.7fr 0.5fr',
                      }}
                    >
                      <Typography sx={tableStyles.headerCell}>種別</Typography>
                      <Typography sx={tableStyles.headerCell}>競争参加地域</Typography>
                      <Typography sx={tableStyles.headerCell}>数値</Typography>
                      <Typography sx={tableStyles.headerCell}>等級</Typography>
                    </Box>
                    {ordererQual.items
                      .filter((item) => item.category || item.region)
                      .map((item, itemIndex) => (
                        <Box
                          key={itemIndex}
                          sx={{
                            ...tableStyles.row,
                            gridTemplateColumns: '1fr 1fr 0.7fr 0.5fr',
                          }}
                        >
                          <Typography sx={tableStyles.cell}>{item.category || '-'}</Typography>
                          <Typography sx={tableStyles.cell}>{item.region || '-'}</Typography>
                          <Typography sx={tableStyles.cell}>{item.value || '-'}</Typography>
                          <Typography sx={tableStyles.cell}>{item.grade || '-'}</Typography>
                        </Box>
                      ))}
                  </Box>
                )}
              </Paper>
            ))}
          </Box>
        )}
      </ConfirmSection>
    </Box>
  );
}
