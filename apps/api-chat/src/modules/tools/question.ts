/**
 * Clarifying-question tool. Durable runs pause on this tool, persist the
 * question, and resume after the user answers.
 */

import type { JsonObject, Tool } from "./types.ts";

export type QuestionOption = {
  label: string;
  description?: string;
};

export type QuestionInput = {
  question: string;
  header?: string;
  options?: QuestionOption[];
  multiple: boolean;
  allowCustom: boolean;
};

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(
  value: unknown,
  field: string,
  max: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (trimmed.length > max) throw new Error(`${field} is too long`);
  return trimmed;
}

/** Validate and normalize the model's question input. */
export function questionFromInput(input: JsonObject): QuestionInput {
  const question = optionalString(input.question, "question", 500);
  if (!question) throw new Error("question is required");

  const header = optionalString(input.header, "header", 80);
  const multiple = input.multiple === true;
  const allowCustom = input.allowCustom !== false;

  let options: QuestionOption[] | undefined;
  if (input.options !== undefined) {
    if (!Array.isArray(input.options)) {
      throw new Error("options must be an array");
    }
    if (input.options.length < 1 || input.options.length > 6) {
      throw new Error("options must contain 1 to 6 entries");
    }
    options = input.options.map((raw, index) => {
      if (!isObject(raw)) {
        throw new Error(`options[${index}] must be an object`);
      }
      const label = optionalString(raw.label, `options[${index}].label`, 100);
      if (!label) throw new Error(`options[${index}].label is required`);
      const description = optionalString(
        raw.description,
        `options[${index}].description`,
        200,
      );
      return { label, ...(description ? { description } : {}) };
    });
  }

  if (!allowCustom && !options) {
    throw new Error("options are required when allowCustom is false");
  }

  return {
    question,
    ...(header ? { header } : {}),
    ...(options ? { options } : {}),
    multiple,
    allowCustom,
  };
}

export const questionTool: Tool = {
  durableOnly: true,
  definition: {
    name: "question",
    description:
      "Ask the user a concise clarifying question when their intent is ambiguous. Use only when the answer materially changes the next action. Do not use for permission or confirmation.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user.",
        },
        header: {
          type: "string",
          description: "Optional short heading.",
        },
        options: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              description: { type: "string" },
            },
            required: ["label"],
            additionalProperties: false,
          },
        },
        multiple: {
          type: "boolean",
          description: "Allow more than one option.",
        },
        allowCustom: {
          type: "boolean",
          description: "Allow a free-text answer. Defaults to true.",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  async execute() {
    throw new Error("question requires durable execution");
  },
};
