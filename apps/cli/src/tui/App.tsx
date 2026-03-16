import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";

interface Props {
  session: { userId: string; token: string };
}

export default function App({ session }: Props) {
  const [view, setView] = useState<"projects" | "secrets">("projects");
  const { exit } = useApp();

  useInput((input) => {
    if (input === "q") exit();
    if (input === "p") setView("projects");
    if (input === "s") setView("secrets");
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="green" paddingX={1}>
        <Text bold color="green">Open Secret</Text>
        <Text> — </Text>
        <Text dimColor>User: {session.userId.slice(0, 8)}...</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[p] Projects  [s] Secrets  [q] Quit</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {view === "projects" && (
          <Box flexDirection="column">
            <Text bold>Projects</Text>
            <Text dimColor>Loading... (connect to Convex for live data)</Text>
          </Box>
        )}
        {view === "secrets" && (
          <Box flexDirection="column">
            <Text bold>Secrets</Text>
            <Text dimColor>Select a project first.</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
