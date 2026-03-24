import { Accordion, AccordionSummary, AccordionDetails, Typography, Box } from '@mui/material';
import { ExpandMoreIcon } from '../../constants/icons';
import {
  formAccordionStyles,
  formAccordionSummaryStyles,
  formAccordionDetailsStyles,
  formSectionTitleStyles,
} from '../../constants/formStyles';

interface FormSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function FormSection({ title, icon, defaultExpanded = true, children }: FormSectionProps) {
  return (
    <Accordion defaultExpanded={defaultExpanded} sx={formAccordionStyles}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={formAccordionSummaryStyles}>
        <Box sx={formSectionTitleStyles}>
          {icon}
          <Typography component="span" sx={{ fontSize: 'inherit', fontWeight: 'inherit' }}>
            {title}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={formAccordionDetailsStyles}>{children}</AccordionDetails>
    </Accordion>
  );
}
