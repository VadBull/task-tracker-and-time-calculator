import React from "react";
import { Chip, Paper, Typography } from "@mui/material";

export default function FeatureCard({ badge, title, body, color }) {
  return (
    <Paper sx={{ p: 3, bgcolor: "background.paper" }}>
      <Chip label={badge} sx={{ bgcolor: color, color: "#121212" }} />
      <Typography variant="h3" sx={{ mt: 2 }}>
        {title}
      </Typography>
      <Typography sx={{ mt: 1, color: "text.secondary" }}>{body}</Typography>
    </Paper>
  );
}
