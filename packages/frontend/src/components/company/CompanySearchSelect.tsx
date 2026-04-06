import { Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { fontSizes, colors } from '../../constants/styles';
import { fetchCompanyMasterList } from '../../data/companies-master';
import type { CompanyListRow } from '../../data/companies-master';

export interface CompanySearchOption {
  id: string;
  name: string;
  address?: string;
  phone?: string;
}

interface CompanySearchSelectProps {
  value: CompanySearchOption | null;
  onChange: (option: CompanySearchOption | null) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
}

export function CompanySearchSelect({
  value,
  onChange,
  label = '協力会社',
  placeholder = '会社名で検索',
  helperText,
  disabled = false,
}: CompanySearchSelectProps) {
  const [inputValue, setInputValue] = useState(value?.name ?? '');
  const [options, setOptions] = useState<CompanySearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [debouncedInput, setDebouncedInput] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedInput(inputValue.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [inputValue]);

  useEffect(() => {
    setInputValue(value?.name ?? '');
  }, [value?.id]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const loadOptions = async () => {
      setLoading(true);
      try {
        const { data } = await fetchCompanyMasterList(
          {
            q: debouncedInput || undefined,
            page: 0,
            pageSize: 10,
          },
          controller.signal
        );
        if (!active) {
          return;
        }
        const mapped = (data || []).map((item: CompanyListRow): CompanySearchOption => ({
          id: item.id,
          name: item.name,
          address: item.address,
          phone: item.phone,
        }));
        setOptions(mapped);
      } catch (error) {
        if (active) {
          console.error('Failed to search companies:', error);
          setOptions([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadOptions();

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedInput]);

  const selectedOption = useMemo(() => value || undefined, [value]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Autocomplete<CompanySearchOption, false, true, false>
        disablePortal
        options={options}
        loading={loading}
        value={selectedOption}
        disabled={disabled}
        inputValue={inputValue}
        onInputChange={(_, newValue) => setInputValue(newValue)}
        onChange={(_, newValue) => onChange(newValue)}
        getOptionLabel={(option) => option?.name ?? ''}
        isOptionEqualToValue={(option, val) => option.id === val.id}
        noOptionsText={debouncedInput ? '該当する協力会社がありません' : '候補がありません'}
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.id}>
            <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.primary, fontWeight: 500 }}>
              {option.name}
            </Typography>
            {option.address && (
              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
                {option.address}
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
