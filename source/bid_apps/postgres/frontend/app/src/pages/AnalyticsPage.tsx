import { useState, useEffect, useMemo } from 'react';
import { Box, Paper, Typography, Grid, CircularProgress } from '@mui/material';
import { colors, pageStyles, borderRadius } from '../constants/styles';
import {
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
  AccountBalance as AccountBalanceIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { getApiUrl } from '../config/api';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
  return (
    <Paper sx={{ p: 3, borderRadius: borderRadius.xs, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            {title}
          </Typography>
          <Typography variant="h4" fontWeight={700} sx={{ mt: 1, color }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: borderRadius.xs,
            backgroundColor: `${color}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
          }}
        >
          {icon}
        </Box>
      </Box>
    </Paper>
  );
}

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <Paper sx={{ p: 3, borderRadius: borderRadius.xs, height: '100%' }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

interface BarData {
  label: string;
  value: number;
  color: string;
}

function SimpleBarChart({ data, maxValue }: { data: BarData[]; maxValue: number }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {data.map((item) => (
        <Box key={item.label}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" fontWeight={500}>
              {item.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.value}件
            </Typography>
          </Box>
          <Box sx={{ height: 8, backgroundColor: colors.background.default, borderRadius: 1, overflow: 'hidden' }}>
            <Box
              sx={{
                height: '100%',
                width: `${(item.value / maxValue) * 100}%`,
                backgroundColor: item.color,
                borderRadius: 1,
              }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

interface StatsResponse {
  total: string;
  allMet: string;
  otherUnmet: string;
  unmet: string;
  organizationCount: string;
  topOrganizations: Array<{ organization: string; count: string }> | null;
  topCategories: Array<{ category: string; count: string }> | null;
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawStats, setRawStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await fetch(getApiUrl('/api/evaluations/stats'));
        if (!response.ok) {
          throw new Error(`Failed to fetch stats: ${response.status}`);
        }
        const data = await response.json();
        setRawStats(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const stats = useMemo(() => {
    if (!rawStats) {
      return {
        total: 0,
        allMet: 0,
        otherUnmet: 0,
        unmet: 0,
        participationRate: '0.0',
        organizationCount: 0,
        topOrganizations: [],
        topCategories: [],
      };
    }

    const total = parseInt(rawStats.total);
    const allMet = parseInt(rawStats.allMet);
    const otherUnmet = parseInt(rawStats.otherUnmet);
    const unmet = parseInt(rawStats.unmet);
    const participationRate = total > 0 ? ((allMet / total) * 100).toFixed(1) : '0.0';
    const organizationCount = parseInt(rawStats.organizationCount);

    const topOrganizations = (rawStats.topOrganizations || []).map((item, i) => ({
      label: item.organization,
      value: parseInt(item.count),
      color: [colors.accent.blue, colors.accent.green, colors.accent.orange, colors.accent.red, colors.accent.purple][i],
    }));

    const topCategories = (rawStats.topCategories || []).map((item, i) => ({
      label: item.category,
      value: parseInt(item.count),
      color: [colors.accent.indigo, colors.accent.pink, colors.accent.teal, colors.accent.orangeMedium, colors.text.muted][i],
    }));

    return {
      total,
      allMet,
      otherUnmet,
      unmet,
      participationRate,
      organizationCount,
      topOrganizations,
      topCategories,
    };
  }, [rawStats]);

  const statusData: BarData[] = [
    { label: '参加可能', value: stats.allMet, color: colors.accent.greenSuccess },
    { label: '特殊条件', value: stats.otherUnmet, color: colors.accent.orangeDark },
    { label: '参加不可', value: stats.unmet, color: colors.accent.redDark },
  ];

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: pageStyles.container.bgcolor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: pageStyles.container.bgcolor }}>
        <Box sx={pageStyles.contentArea}>
          <Typography variant="h5" sx={{ ...pageStyles.pageTitle, mb: 3 }}>
            分析ダッシュボード
          </Typography>
          <Typography color="error">エラー: {error}</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageStyles.container.bgcolor }}>
      <Box sx={pageStyles.contentArea}>
        <Typography variant="h5" sx={{ ...pageStyles.pageTitle, mb: 3 }}>
          分析ダッシュボード
        </Typography>
        <Grid container spacing={3}>
          {/* 統計カード */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              title="総判定件数"
              value={stats.total.toLocaleString()}
              subtitle="累計"
              icon={<AssessmentIcon />}
              color={colors.accent.blue}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              title="参加可能件数"
              value={stats.allMet.toLocaleString()}
              subtitle={`全体の${((stats.allMet / stats.total) * 100).toFixed(1)}%`}
              icon={<CheckCircleIcon />}
              color={colors.accent.greenSuccess}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              title="参加可能率"
              value={`${stats.participationRate}%`}
              subtitle="要件充足率"
              icon={<TrendingUpIcon />}
              color={colors.accent.purple}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              title="発注機関数"
              value={stats.organizationCount}
              subtitle="取引先"
              icon={<AccountBalanceIcon />}
              color={colors.accent.orange}
            />
          </Grid>

          {/* チャート */}
          <Grid size={{ xs: 12, md: 4 }}>
            <ChartCard title="判定結果別">
              <SimpleBarChart data={statusData} maxValue={stats.allMet} />
            </ChartCard>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <ChartCard title="発注機関別（上位5）">
              <SimpleBarChart
                data={stats.topOrganizations}
                maxValue={Math.max(...stats.topOrganizations.map((d) => d.value))}
              />
            </ChartCard>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <ChartCard title="カテゴリ別（上位5）">
              <SimpleBarChart
                data={stats.topCategories}
                maxValue={Math.max(...stats.topCategories.map((d) => d.value))}
              />
            </ChartCard>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
