/**
 * Ask User Extension - Interactive question tool for Pi
 *
 * Enables the LLM to ask users questions during conversations using
 * multiple interaction patterns: text input, confirmations, selections, and editor.
 *
 * All question types include a "Type your answer..." section at the bottom
 * that's always visible and ready for input.
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import {
	Editor,
	Input,
	type EditorTheme,
	Key,
	matchesKey,
	truncateToWidth,
} from "@mariozechner/pi-tui";
import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Details stored in tool results for session persistence and history
 */
interface QuestionDetails {
	question: string;
	type: "input" | "confirm" | "select" | "editor";
	answer: string | boolean | null;
	cancelled: boolean;
	timedOut?: boolean;
	options?: string[]; // For select type
	selectedIndex?: number; // For select type (0-indexed)
	wasTyped?: boolean; // True if answer came from the text input area
}

/**
 * Tool parameter schema using TypeBox
 */
const AskUserParams = Type.Object({
	question: Type.String({ description: "The question to ask the user" }),
	type: StringEnum(["input", "confirm", "select", "editor"] as const, {
		description: "Type of question interaction",
	}),
	options: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"Options for select type (required when type is 'select')",
		})
	),
	defaultValue: Type.Optional(
		Type.String({
			description: "Default or placeholder text for input/editor types",
		})
	),
	timeout: Type.Optional(
		Type.Number({
			description:
				"Auto-dismiss timeout in milliseconds (must be positive)",
		})
	),
});

type AskUserParamsType = Static<typeof AskUserParams>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create consistent error response with QuestionDetails
 */
function errorResult(
	message: string,
	question: string = "",
	type: "input" | "confirm" | "select" | "editor" = "input"
): { content: { type: "text"; text: string }[]; details: QuestionDetails } {
	return {
		content: [{ type: "text", text: message }],
		details: {
			question,
			type,
			answer: null,
			cancelled: true,
		},
	};
}

/**
 * Validate parameters before execution
 */
function validateParams(params: AskUserParamsType): string | null {
	if (params.type === "select") {
		if (!params.options || !Array.isArray(params.options)) {
			return "Error: 'select' type requires an 'options' array";
		}
		if (params.options.length === 0) {
			return "Error: 'options' array cannot be empty for 'select' type";
		}
	}

	if (params.type !== "select" && params.options && params.options.length > 0) {
		return "Error: 'options' parameter is only valid for 'select' type";
	}

	if (params.type === "confirm" || params.type === "select") {
		if (params.defaultValue !== undefined) {
			return "Error: 'defaultValue' is only valid for 'input' and 'editor' types";
		}
	}

	if (params.timeout !== undefined) {
		if (typeof params.timeout !== "number" || params.timeout <= 0) {
			return "Error: 'timeout' must be a positive number";
		}
	}

	return null;
}

// ============================================================================
// Custom Question Dialog Component
// ============================================================================

interface QuestionDialogResult {
	answer: string | boolean;
	cancelled: boolean;
	timedOut: boolean;
	selectedIndex?: number; // 0-indexed
	wasTyped?: boolean;
}

/**
 * Creates a unified question dialog with an always-visible text input area
 */
async function showQuestionDialog(
	params: AskUserParamsType,
	ctx: ExtensionContext
): Promise<QuestionDialogResult> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let timedOut = false;

	const result = await ctx.ui.custom<QuestionDialogResult | null>(
		(tui, theme, _kb, done) => {
			// State
			let selectedIndex = 0;
			let cachedLines: string[] | undefined;
			let isInputFocused = true;

			const options =
				params.type === "select" ? (params.options as string[]) : [];
			const totalOptions =
				params.type === "confirm" ? 2 : options.length;

			// Use Input for single-line (input/confirm/select), Editor for multi-line (editor)
			const isMultiLine = params.type === "editor";

			const editorTheme: EditorTheme = {
				borderColor: (s) => theme.fg("accent", s),
				selectList: {
					selectedPrefix: (t) => theme.fg("accent", t),
					selectedText: (t) => theme.fg("accent", t),
					description: (t) => theme.fg("muted", t),
					scrollInfo: (t) => theme.fg("dim", t),
					noMatch: (t) => theme.fg("warning", t),
				},
			};

			// Create the appropriate input component
			const editor = isMultiLine
				? new Editor(tui, editorTheme)
				: null;
			const input = isMultiLine ? null : new Input();

			// Pre-fill with defaultValue if provided
			if (params.defaultValue) {
				if (editor) editor.setText(params.defaultValue);
				if (input) input.setValue(params.defaultValue);
			}

			// Set up submit handlers
			if (editor) {
				editor.onSubmit = (value) => {
					const trimmed = value.trim();
					if (trimmed) {
						done({
							answer: trimmed,
							cancelled: false,
							timedOut: false,
							wasTyped: true,
						});
					}
				};
			}
			if (input) {
				input.onSubmit = (value) => {
					const trimmed = value.trim();
					if (trimmed) {
						done({
							answer: trimmed,
							cancelled: false,
							timedOut: false,
							wasTyped: true,
						});
					}
				};
			}

			// Countdown state
			let remainingMs = params.timeout ?? 0;
			let countdownInterval: ReturnType<typeof setInterval> | undefined;

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			// Set up timeout with countdown
			if (params.timeout && params.timeout > 0) {
				remainingMs = params.timeout;
				timeoutId = setTimeout(() => {
					timedOut = true;
					if (countdownInterval) clearInterval(countdownInterval);
					done({
						answer: false,
						cancelled: true,
						timedOut: true,
					});
				}, params.timeout);

				// Update countdown every second
				countdownInterval = setInterval(() => {
					remainingMs = Math.max(0, remainingMs - 1000);
					refresh();
				}, 1000);
			}

			function clearTimers() {
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = undefined;
				}
				if (countdownInterval) {
					clearInterval(countdownInterval);
					countdownInterval = undefined;
				}
				remainingMs = 0;
			}

			function handleInput(data: string) {
				// Clear timeout on any interaction
				clearTimers();

				// Escape always cancels
				if (matchesKey(data, Key.escape)) {
					done({
						answer: false,
						cancelled: true,
						timedOut: false,
					});
					return;
				}

				if (isInputFocused) {
					// Tab switches to options panel (if confirm/select has options)
					if (
						(params.type === "confirm" ||
							params.type === "select") &&
						matchesKey(data, Key.tab) &&
						totalOptions > 0
					) {
						isInputFocused = false;
						selectedIndex = 0;
						refresh();
						return;
					}

					// Route to the active input component
					if (editor) editor.handleInput(data);
					if (input) input.handleInput(data);
					refresh();
					return;
				}

				// Options/confirm navigation mode
				// Shift+Tab always returns to input
				if (matchesKey(data, Key.shift("tab"))) {
					isInputFocused = true;
					refresh();
					return;
				}

				if (params.type === "confirm") {
					if (
						matchesKey(data, Key.left) ||
						matchesKey(data, Key.right)
					) {
						selectedIndex = selectedIndex === 0 ? 1 : 0;
						refresh();
						return;
					}

					if (matchesKey(data, Key.enter)) {
						done({
							answer: selectedIndex === 0,
							cancelled: false,
							timedOut: false,
							selectedIndex,
							wasTyped: false,
						});
						return;
					}
				} else if (params.type === "select") {
					if (matchesKey(data, Key.up)) {
						selectedIndex = Math.max(0, selectedIndex - 1);
						refresh();
						return;
					}
					if (matchesKey(data, Key.down)) {
						selectedIndex = Math.min(
							totalOptions - 1,
							selectedIndex + 1
						);
						refresh();
						return;
					}

					// Number key shortcuts (1-9)
					const numMatch = data.match(/^[1-9]$/);
					if (numMatch) {
						const idx = parseInt(numMatch[0]!, 10) - 1;
						if (idx < totalOptions) {
							done({
								answer: options[idx]!,
								cancelled: false,
								timedOut: false,
								selectedIndex: idx,
								wasTyped: false,
							});
							return;
						}
					}

					if (matchesKey(data, Key.enter)) {
						done({
							answer: options[selectedIndex]!,
							cancelled: false,
							timedOut: false,
							selectedIndex,
							wasTyped: false,
						});
						return;
					}
				}
			}

			function render(width: number): string[] {
				if (cachedLines) return cachedLines;

				const lines: string[] = [];
				const add = (s: string) =>
					lines.push(truncateToWidth(s, width));

				// Top border
				add(theme.fg("accent", "─".repeat(width)));

				// Question
				add(theme.fg("text", ` ${params.question}`));
				lines.push("");

				// For confirm type: show Yes/No buttons
				if (params.type === "confirm") {
					const yesLabel = " Yes ";
					const noLabel = " No ";
					const selectedYes =
						selectedIndex === 0 && !isInputFocused;
					const selectedNo =
						selectedIndex === 1 && !isInputFocused;

					const yesStyled = selectedYes
						? theme.bg(
								"selectedBg",
								theme.fg("text", theme.bold(yesLabel))
							)
						: theme.fg("muted", yesLabel);
					const noStyled = selectedNo
						? theme.bg(
								"selectedBg",
								theme.fg("text", theme.bold(noLabel))
							)
						: theme.fg("muted", noLabel);

					add(`  ${yesStyled}  ${noStyled}`);
					lines.push("");
				}

				// For select type: show options
				if (params.type === "select" && options.length > 0) {
					for (let i = 0; i < options.length; i++) {
						const selected =
							i === selectedIndex && !isInputFocused;
						const prefix = selected
							? theme.fg("accent", "> ")
							: "  ";
						const color = selected ? "accent" : "text";
						const numHint =
							i < 9
								? theme.fg("dim", `[${i + 1}] `)
								: "    ";
						add(
							prefix + numHint + theme.fg(color, options[i]!)
						);
					}
					lines.push("");
				}

				// Text input area with focus-dependent border color
				const inputBorderColor = isInputFocused
					? theme.fg("accent", "│")
					: theme.fg("dim", "│");

				const inputLabel = isInputFocused
					? theme.fg("accent", isMultiLine ? "✎ Type your answer (multi-line):" : "✎ Type your answer:")
					: theme.fg(
							"muted",
							"Type your answer (Tab to focus):"
						);
				add(inputLabel);

				// Render the input component
				if (editor) {
					const editorLines = editor.render(width - 2);
					for (const line of editorLines) {
						add(`${inputBorderColor} ${line}`);
					}
				} else if (input) {
					const inputLines = input.render(width - 4);
					for (const line of inputLines) {
						add(`${inputBorderColor} ${line}`);
					}
				}

				lines.push("");

				// Help text
				if (params.type === "confirm" || params.type === "select") {
					if (isInputFocused) {
						add(
							theme.fg(
								"dim",
								" Enter to submit • Tab to browse options • Esc to cancel"
							)
						);
					} else {
						const numHint =
							params.type === "select" ? " • 1-9 to pick" : "";
						add(
							theme.fg(
								"dim",
								` Enter to select${numHint} • Shift+Tab to type • Esc to cancel`
							)
						);
					}
				} else if (isMultiLine) {
					add(
						theme.fg(
							"dim",
							" \\+Enter to submit • Esc to cancel"
						)
					);
				} else {
					add(
						theme.fg(
							"dim",
							" Enter to submit • Esc to cancel"
						)
					);
				}

				// Countdown indicator
				if (remainingMs > 0) {
					const seconds = Math.ceil(remainingMs / 1000);
					add(
						theme.fg(
							"dim",
							` Auto-dismiss in ${seconds}s`
						)
					);
				}

				// Bottom border
				add(theme.fg("accent", "─".repeat(width)));

				cachedLines = lines;
				return lines;
			}

			return {
				render,
				invalidate: () => {
					cachedLines = undefined;
					if (editor) editor.invalidate();
					if (input) input.invalidate();
				},
				handleInput,
			};
		}
	);

	// Clean up timers
	if (timeoutId) {
		clearTimeout(timeoutId);
	}

	if (result === null) {
		return {
			answer: false,
			cancelled: true,
			timedOut,
		};
	}

	return result;
}

// ============================================================================
// Extension Registration
// ============================================================================

export default function askUser(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description: `Ask the user a question and get their response. Use this when you need:
- Clarification on requirements or preferences
- Confirmation before taking an action
- Selection from multiple options
- Detailed text input for complex information

Question types:
- "input": Single-line text input
- "confirm": Yes/No confirmation dialog
- "select": Choose from predefined options
- "editor": Multi-line text editor for detailed responses

Optional parameters:
- timeout: Auto-dismiss after N milliseconds (e.g., 5000 for 5 seconds)
- defaultValue: Pre-fill text for input/editor types
- options: Required array of choices for select type

Example:
{
  "question": "Which environment to deploy to?",
  "type": "select",
  "options": ["development", "staging", "production"],
  "timeout": 10000
}

Do not use this for simple acknowledgments or when the context already provides the answer.`,
		parameters: AskUserParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const validationError = validateParams(params);
			if (validationError) {
				return errorResult(
					validationError,
					params.question,
					params.type
				);
			}

			if (!ctx.hasUI) {
				return errorResult(
					"Error: UI not available (running in non-interactive mode)",
					params.question,
					params.type
				);
			}

			try {
				const result = await showQuestionDialog(params, ctx);

				if (result.cancelled) {
					return {
						content: [
							{
								type: "text",
								text: result.timedOut
									? "Question timed out"
									: "User cancelled",
							},
						],
						details: {
							question: params.question,
							type: params.type,
							answer: null,
							cancelled: true,
							timedOut: result.timedOut,
							options:
								params.type === "select"
									? params.options
									: undefined,
						},
					};
				}

				// Format the answer for display
				let answerText: string;
				if (params.type === "confirm") {
					answerText = result.answer ? "Yes" : "No";
				} else if (
					params.type === "select" &&
					result.selectedIndex !== undefined
				) {
					answerText = `${result.selectedIndex + 1}. ${result.answer}`;
				} else {
					answerText = String(result.answer);
				}

				const method = result.wasTyped ? "(typed)" : "(selected)";

				return {
					content: [
						{
							type: "text",
							text: `User answered ${method}: ${answerText}`,
						},
					],
					details: {
						question: params.question,
						type: params.type,
						answer: result.answer,
						cancelled: false,
						options:
							params.type === "select"
								? params.options
								: undefined,
						selectedIndex: result.selectedIndex,
						wasTyped: result.wasTyped,
					},
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				return errorResult(
					`Error: ${errorMessage}`,
					params.question,
					params.type
				);
			}
		},

		renderCall(args, theme) {
			const typeIndicator = `[${args.type}]`;
			let text = theme.fg("toolTitle", theme.bold("ask_user "));
			text += theme.fg("accent", typeIndicator) + " ";
			text += theme.fg("muted", args.question);

			if (args.type === "select" && args.options) {
				const preview = args.options.slice(0, 3).join(", ");
				const more =
					args.options.length > 3
						? ` (+${args.options.length - 3} more)`
						: "";
				text += `\n  ${theme.fg("dim", preview + more)}`;
			}

			if (args.timeout) {
				text += ` ${theme.fg("dim", `(${args.timeout / 1000}s timeout)`)}`;
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, options, theme) {
			const details = result.details as QuestionDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(
					text?.type === "text" ? text.text : "",
					0,
					0
				);
			}

			if (details.cancelled) {
				const reason = details.timedOut ? "Timed out" : "Cancelled";
				return new Text(theme.fg("warning", `⚠ ${reason}`), 0, 0);
			}

			let answerText = "";
			if (details.type === "confirm") {
				answerText = details.answer ? "Yes" : "No";
			} else if (
				details.type === "select" &&
				details.selectedIndex !== undefined
			) {
				// Display as 1-indexed for humans
				answerText = `${details.selectedIndex + 1}. ${details.answer}`;
			} else {
				answerText = String(details.answer);
			}

			const method = details.wasTyped ? " ✎" : "";

			let text = theme.fg("success", "✓ ");
			text += theme.fg("accent", answerText) + theme.fg("dim", method);

			if (options.expanded) {
				text += `\n${theme.fg("muted", `Q: ${details.question}`)}`;
				text += `\n${theme.fg("dim", `Type: ${details.type}`)}`;
			}

			return new Text(text, 0, 0);
		},
	});
}
