import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, TextField, CircularProgress, Box, Typography } from '@mui/material';
import { colors, fontSizes } from '../../constants/styles';
import { getApiUrl } from '../../config/api';
import type { CompanyBranchOption } from '../../types';

export interface CompanyBranchSelectProps {
  value: string | null;
  valueLabel?: string | null;
  onChange: (officeId: string | null, label?: string) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
}

const getOptionLabel = (option: CompanyBranchOption | null) => {
  if (!option) return '';
  if (option.branchName && option.branchName.trim().length > 0) {
    return `${option.companyName}／${option.branchName}`;
  }
  return option.companyName;
};

export function CompanyBranchSelect({
  value,
  valueLabel,
  onChange,
  label = '企業・拠点で絞り込み',
  placeholder = '企業・拠点を検索',
  helperText,
  disabled,
}: CompanyBranchSelectProps) {
  const [options, setOptions] = useState<CompanyBranchOption[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [debouncedInput, setDebouncedInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedInput(inputValue);
    }, 300);
    return () => clearTimeout(handle);
  }, [inputValue]);

  useEffect(() => {
    if (!value) {
      setInputValue('');
      return;
    }

    if (valueLabel) {
      setInputValue(valueLabel);
      return;
    }

    const match = options.find((option) => option.officeId === value);
    if (match) {
      setInputValue(getOptionLabel(match));
    }
  }, [value, valueLabel, options]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const fetchOptions = async () => {
      try {
        setLoading(true);
        const query = debouncedInput.trim()
          ? `?search=${encodeURIComponent(debouncedInput.trim())}`
          : '';
        const response = await fetch(getApiUrl(`/api/evaluations/company-options${query}`), {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch company options: ${response.status}`);
        }
        const data = await response.json();
        if (!active) {
          return;
        }
        if (Array.isArray(data)) {
          const normalized = data
            .map((item: any) => ({
              officeId: item.officeNo ? String(item.officeNo) : null,
              companyId: String(item.companyNo ?? ''),
              companyName: String(item.companyName ?? ''),
              branchName: String(item.branchName ?? ''),
            }))
            .filter((option) => option.officeId);
          setOptions(normalized as CompanyBranchOption[]);
        } else {
          setOptions([]);
        }
      } catch (error) {
        if (active) {
          console.error('Failed to fetch company options:', error);
          setOptions([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchOptions();

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedInput]);

  const selectedOption = useMemo(() => {
    if (!value) return undefined;
    const match = options.find((option) => option.officeId === value);
    if (match) return match;
    return {
      officeId: value,
      companyId: '',
      companyName: valueLabel || `拠点: ${value}`,
      branchName: '',
    };
  }, [value, valueLabel, options]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Autocomplete<CompanyBranchOption, false, true, false>
        disablePortal
        options={options}
        loading={loading}
        value={selectedOption}
        disabled={disabled}
        inputValue={inputValue}
        onInputChange={(_, newInput) => setInputValue(newInput)}
        onChange={(_, newValue) => {
          if (!newValue) {
            onChange(null);
          } else {
            onChange(newValue.officeId, getOptionLabel(newValue));
          }
        }}
        isOptionEqualToValue={(option, val) => option.officeId === val.officeId}
        getOptionLabel={(option) => getOptionLabel(option)}
        noOptionsText={debouncedInput ? '該当する企業・拠点がありません' : '候補がありません'}
        renderOption={(props, option) => (
          <Box component="li" {...props} key={`${option.companyId}-${option.officeId ?? 'company'}`}>
            <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.primary }}>
              {option.companyName}
            </Typography>
            {option.branchName && (
              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
                {option.branchName}
              </Typography>
            )}
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={placeholder}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={16} sx={{ mr: 1 }} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />
      {helperText && (
        <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}
