import React from "react";
import { Chip, Paper, Typography } from "@mui/material";

export default function ShowcaseCard({ tag, title, description }) {
  return (
    <Paper sx={{ p: 3 }}>
      <Chip label={tag} sx={{ bgcolor: "var(--accent-a3)", color: "#121212" }} />
      <Typography variant="h3" sx={{ mt: 2 }}>
        {title}
      </Typography>
      <Typography sx={{ color: "text.secondary", mt: 1 }}>{description}</Typography>
    </Paper>
  );
}
