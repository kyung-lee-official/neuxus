"use client";

import { useState } from "react";
import type { QueryStreamEvent } from "@/chat/lib/api";

type Question = Extract<QueryStreamEvent, { type: "question" }>;

export function QuestionCard({
  question,
  submitting,
  error,
  onSubmit,
}: {
  question: Question;
  submitting: boolean;
  error: string | null;
  onSubmit: (answer: string | string[]) => void;
}) {
  const options = question.options ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");

  function toggle(label: string) {
    if (question.multiple) {
      setSelected((current) =>
        current.includes(label)
          ? current.filter((value) => value !== label)
          : [...current, label],
      );
      return;
    }
    setSelected([label]);
  }

  const customValue = question.allowCustom ? custom.trim() : "";
  const answerValues = question.multiple
    ? [...selected, ...(customValue !== "" ? [customValue] : [])]
    : [customValue !== "" ? customValue : (selected[0] ?? "")].filter(
        (value) => value !== "",
      );
  const canSubmit = answerValues.length > 0 && !submitting;

  return (
    <form
      className="flex flex-col gap-3 rounded border border-accent bg-accent/10 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit(question.multiple ? answerValues : (answerValues[0] ?? ""));
      }}
    >
      <div>
        <p className="m-0 font-mono text-accent text-xs uppercase tracking-wide">
          {question.header ?? "Question"}
        </p>
        <p className="mt-1 mb-0 font-display text-base text-ink">
          {question.question}
        </p>
      </div>

      {options.length > 0 ? (
        <div className="flex flex-col gap-2">
          {options.map((option) => {
            const checked = selected.includes(option.label);
            return (
              <label
                key={option.label}
                className="flex cursor-pointer items-start gap-2 rounded border border-line bg-canvas px-2.5 py-2"
              >
                <input
                  type={question.multiple ? "checkbox" : "radio"}
                  name={`question-${question.questionId}`}
                  checked={checked}
                  disabled={submitting}
                  onChange={() => toggle(option.label)}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-ink text-sm">{option.label}</span>
                  {option.description ? (
                    <span className="text-muted text-xs">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {question.allowCustom ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted text-xs">
            {options.length > 0 ? "Or type an answer" : "Your answer"}
          </span>
          <input
            className="rounded border border-line bg-canvas px-2.5 py-2 text-ink text-sm"
            value={custom}
            disabled={submitting}
            onChange={(event) => setCustom(event.target.value)}
          />
        </label>
      ) : null}

      {error ? <p className="m-0 text-danger text-sm">{error}</p> : null}

      <button
        type="submit"
        className="self-start rounded border border-accent bg-accent px-3.5 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canSubmit}
      >
        {submitting ? "Sending answer…" : "Send answer"}
      </button>
    </form>
  );
}
