import { Box, IconButton, Button, Typography } from '@mui/material';
import { DeleteIcon, AddIcon } from '../../constants/icons';
import { dynamicArrayItemStyles, addButtonStyles } from '../../constants/formStyles';
import { colors } from '../../constants/styles';

interface DynamicArrayInputProps<T> {
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  addLabel?: string;
  emptyMessage?: string;
  maxItems?: number;
}

export function DynamicArrayInput<T>({
  items,
  onAdd,
  onRemove,
  renderItem,
  addLabel = '追加',
  emptyMessage = '項目がありません',
  maxItems,
}: DynamicArrayInputProps<T>) {
  const canAdd = maxItems === undefined || items.length < maxItems;

  return (
    <Box>
      {items.length === 0 ? (
        <Typography
          sx={{
            color: colors.text.light,
            fontSize: '0.875rem',
            textAlign: 'center',
            py: 3,
          }}
        >
          {emptyMessage}
        </Typography>
      ) : (
        items.map((item, index) => (
          <Box key={index} sx={dynamicArrayItemStyles.container}>
            <Box sx={dynamicArrayItemStyles.fieldsContainer}>{renderItem(item, index)}</Box>
            <IconButton onClick={() => onRemove(index)} sx={dynamicArrayItemStyles.deleteButton} size="small">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))
      )}
      {canAdd && (
        <Button fullWidth startIcon={<AddIcon />} onClick={onAdd} sx={addButtonStyles}>
          {addLabel}
        </Button>
      )}
    </Box>
  );
}
