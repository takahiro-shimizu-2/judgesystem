import { useState, useMemo } from 'react';
import { Box, TextField, Chip, Typography, InputAdornment, Button } from '@mui/material';
import { SearchIcon, ClearIcon } from '../../constants/icons';
import { chipSelectAreaStyles, formFieldStyles } from '../../constants/formStyles';
import { colors, fontSizes } from '../../constants/styles';

interface CategoryMultiSelectProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  options: readonly string[];
  label?: string;
  placeholder?: string;
}

export function CategoryMultiSelect({
  selected,
  onChange,
  options,
  label,
  placeholder = '検索...',
}: CategoryMultiSelectProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    return options.filter((option) => option.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [options, searchQuery]);

  const handleToggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const handleSelectAll = () => {
    onChange([...options]);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <Box>
      {label && (
        <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 500, color: colors.text.secondary, mb: 1 }}>
          {label}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        <TextField
          size="small"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ ...formFieldStyles, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: colors.text.light, fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
        <Button
          size="small"
          onClick={handleSelectAll}
          sx={{ textTransform: 'none', fontSize: fontSizes.xs, color: colors.accent.blue }}
        >
          すべて選択
        </Button>
        <Button
          size="small"
          onClick={handleClearAll}
          sx={{ textTransform: 'none', fontSize: fontSizes.xs, color: colors.text.muted }}
        >
          クリア
        </Button>
      </Box>

      {selected.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>
            選択済み ({selected.length}件)
          </Typography>
          <Box sx={chipSelectAreaStyles.chipContainer}>
            {selected.map((item) => (
              <Chip
                key={item}
                label={item}
                size="small"
                onDelete={() => handleToggle(item)}
                deleteIcon={<ClearIcon />}
                sx={chipSelectAreaStyles.selectedChip}
              />
            ))}
          </Box>
        </Box>
      )}

      <Box sx={chipSelectAreaStyles.container}>
        <Box sx={chipSelectAreaStyles.chipContainer}>
          {filteredOptions.map((option) => {
            const isSelected = selected.includes(option);
            if (isSelected) return null;
            return (
              <Chip
                key={option}
                label={option}
                size="small"
                onClick={() => handleToggle(option)}
                sx={chipSelectAreaStyles.optionChip}
              />
            );
          })}
          {filteredOptions.filter((o) => !selected.includes(o)).length === 0 && (
            <Typography sx={{ color: colors.text.light, fontSize: fontSizes.sm }}>
              {searchQuery ? '該当する項目がありません' : 'すべて選択済みです'}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
