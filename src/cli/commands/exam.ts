import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";

export function buildExamCommand(api: NLobbyApi): Command {
  const exam = new Command("exam").description("Exam day utilities");

  exam
    .command("check")
    .description("Check if a date is an exam day (default: today)")
    .argument("[date]", "Date in YYYY-MM-DD format")
    .option("--json", "Output raw JSON")
    .action(async (date: string | undefined, opts: { json?: boolean }) => {
      try {
        const targetDate = date ? new Date(date) : undefined;
        const isExam = await api.isExamDay(targetDate);
        const dateStr = (targetDate ?? new Date()).toISOString().split("T")[0];
        if (opts.json) {
          console.log(
            JSON.stringify({ date: dateStr, isExamDay: isExam }, null, 2),
          );
        } else {
          console.log(
            isExam
              ? `[EXAM] ${dateStr} is an exam day.`
              : `[OK] ${dateStr} is not an exam day.`,
          );
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  exam
    .command("finish")
    .description("Finish exam day mode")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const ok = await api.finishExamDayMode();
        if (opts.json) {
          console.log(JSON.stringify({ success: ok }, null, 2));
        } else {
          console.log(
            ok
              ? "[OK] Exam day mode finished."
              : "[FAIL] Failed to finish exam day mode.",
          );
        }
        if (!ok) process.exit(1);
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  exam
    .command("otp")
    .description("Get one-time password for exam")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const result = await api.getExamOneTimePassword();
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return exam;
}
