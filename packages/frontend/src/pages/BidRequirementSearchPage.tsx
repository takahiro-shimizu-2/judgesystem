/**
 * 入札要件テキスト全文検索ページ
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { pageStyles, colors, fontSizes } from '../constants/styles';
import { useBidRequirementSearch } from '../hooks/useBidRequirementSearch';

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <Box component="mark" sx={{ bgcolor: '#fff3cd', px: 0.25, borderRadius: '2px' }}>
        {text.slice(idx, idx + query.length)}
      </Box>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function BidRequirementSearchPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const { data, total, page, pageSize, loading, error, query, search } = useBidRequirementSearch();

  const handleSearch = useCallback(() => {
    if (input.trim()) {
      search(input.trim(), 0, pageSize);
    }
  }, [input, pageSize, search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  const handlePageChange = useCallback(
    (_: unknown, newPage: number) => {
      search(query, newPage, pageSize);
    },
    [query, pageSize, search],
  );

  const handleRowsPerPageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      search(query, 0, parseInt(e.target.value, 10));
    },
    [query, search],
  );

  return (
    <Box sx={pageStyles.container}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: colors.primary.main, mb: 0.5 }}>
          入札要件テキスト検索
        </Typography>
        <Typography variant="body2" sx={{ color: colors.text.muted }}>
          全案件の入札要件をキーワードで横断検索します（例: ISO9001、耐震補強）
        </Typography>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="検索キーワードを入力..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={handleSearch} disabled={loading || !input.trim()}>
                    {loading ? <CircularProgress size={20} /> : <SearchIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          size="small"
        />
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: fontSizes.sm, width: 120 }}>
                    案件番号
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: fontSizes.sm, width: 200 }}>
                    案件名
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: fontSizes.sm, width: 100 }}>
                    要件種別
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: fontSizes.sm }}>
                    要件テキスト
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row) => (
                  <TableRow
                    key={`${row.announcementNo}-${row.requirementNo}`}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/announcements/${row.announcementNo}`)}
                  >
                    <TableCell sx={{ fontSize: fontSizes.sm }}>
                      {row.announcementNo}
                    </TableCell>
                    <TableCell sx={{ fontSize: fontSizes.sm, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.announcementTitle}
                    </TableCell>
                    <TableCell>
                      {row.requirementType && (
                        <Chip label={row.requirementType} size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: fontSizes.sm }}>
                      {highlightMatch(row.requirementText || '', query)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={handlePageChange}
            rowsPerPage={pageSize}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={[25, 50, 100]}
            labelRowsPerPage="表示件数:"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} / ${count !== -1 ? count : `${to}件以上`}`
            }
          />
        </Paper>
      )}

      {!loading && query && data.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            「{query}」に一致する入札要件が見つかりませんでした
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
