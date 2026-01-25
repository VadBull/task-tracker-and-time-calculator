import React from "react";
import { Button, Chip, Paper, Typography } from "@mui/material";

export default function PricingCard({ title, price, description, highlighted }) {
  return (
    <Paper
      sx={{
        p: 3,
        bgcolor: "background.paper",
        transform: highlighted ? "translateY(-8px)" : "none",
      }}
    >
      <Typography variant="h3">{title}</Typography>
      <Typography sx={{ fontSize: 24, fontWeight: 800, mt: 1 }}>{price}</Typography>
      <Typography sx={{ color: "text.secondary", mt: 1 }}>{description}</Typography>
      {highlighted ? <Chip label="Популярный" sx={{ mt: 2, bgcolor: "var(--accent-a3)", color: "#121212" }} /> : null}
      <Button variant="contained" sx={{ mt: 2, bgcolor: "var(--accent-a1)" }}>
        Выбрать
      </Button>
    </Paper>
  );
}
