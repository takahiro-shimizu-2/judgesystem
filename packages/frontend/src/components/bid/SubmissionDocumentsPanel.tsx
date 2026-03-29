import { Box, Typography, Chip } from "@mui/material";
import { colors, fontSizes, borderRadius } from "../../constants/styles";
import type { SubmissionDocument } from "../../types";

interface SubmissionDocumentsPanelProps {
  documents?: SubmissionDocument[];
}

const formatSubmissionDate = (doc: SubmissionDocument): { value: string; meaning?: string } => {
  const value = doc.dateValue || doc.dateRaw || "日付情報なし";
  return {
    value,
    meaning: doc.dateMeaning || undefined,
  };
};

export default function SubmissionDocumentsPanel({ documents }: SubmissionDocumentsPanelProps) {
  const hasDocs = Array.isArray(documents) && documents.length > 0;

  return (
    <Box>
      <Typography
        sx={{
          fontSize: fontSizes.xs,
          color: colors.text.muted,
          fontWeight: 600,
          mb: 1.5,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        提出書類
      </Typography>

      {!hasDocs && (
        <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light }}>
          提出書類の情報はありません。
        </Typography>
      )}

      {hasDocs && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {documents!.map((doc, idx) => {
            const { value, meaning } = formatSubmissionDate(doc);
            return (
              <Box
                key={`${doc.documentId || "doc"}-${idx}`}
                sx={{
                  border: `1px solid ${colors.border.light}`,
                  borderRadius: borderRadius.xs,
                  backgroundColor: colors.background.paper,
                  p: 1.5,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                }}
              >
                <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.text.primary }}>
                  {doc.name || "提出書類"}
                </Typography>
                <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary }}>
                  期日: {value}
                </Typography>
                {meaning && (
                  <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
                    {meaning}
                  </Typography>
                )}
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {doc.timepointType && (
                    <Chip
                      size="small"
                      label={doc.timepointType}
                      sx={{ height: 20, fontSize: fontSizes.xs }}
                    />
                  )}
                  {doc.documentId && (
                    <Chip
                      size="small"
                      label={`ID: ${doc.documentId}`}
                      sx={{ height: 20, fontSize: fontSizes.xs, color: colors.text.light }}
                    />
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
