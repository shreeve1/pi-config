/**
 * Claude Code Compatibility Layer for Pi
 * 
 * Provides compatibility shims for tools that exist in Claude Code but not in Pi.
 * Primarily translates AskUserQuestion calls to the ask_user extension.
 * 
 * This allows skills written for Claude Code (like /interview) to work in Pi
 * without modification.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Claude Code AskUserQuestion parameters
 */
const AskUserQuestionParams = Type.Object({
	question: Type.String({
		description: "The question to ask the user"
	}),
	options: Type.Optional(
		Type.Array(Type.String(), {
			description: "Multiple choice options (if provided, shows selection dialog)"
		})
	),
});

// ============================================================================
// Extension Registration
// ============================================================================

export default function claudeCodeCompat(pi: ExtensionAPI) {
	/**
	 * AskUserQuestion compatibility shim
	 * 
	 * Translates Claude Code's AskUserQuestion to Pi's ask_user tool.
	 * 
	 * Behavior:
	 * - If options provided: Maps to ask_user type "select"
	 * - If no options: Maps to ask_user type "input"
	 * 
	 * This allows skills to use AskUserQuestion syntax and it "just works".
	 */
	pi.registerTool({
		name: "AskUserQuestion",
		label: "Ask User Question (Compat)",
		description: `[Claude Code Compatibility] Ask the user a question.

If options are provided, user will select from the list.
If no options, user will type a text response.

Note: This is a compatibility shim. For new code, use the 'ask_user' tool directly for more control.`,
		parameters: AskUserQuestionParams,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			// Check for UI availability (inherit from ask_user behavior)
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Error: UI not available (running in non-interactive mode)" }],
					details: {
						question: params.question,
						answer: null,
						cancelled: true,
					},
				};
			}

			try {
				// Determine question type based on whether options are provided
				const hasOptions = params.options && params.options.length > 0;

				if (hasOptions) {
					// Map to select type
					const selected = await ctx.ui.select(
						params.question,
						params.options
					);

					// User cancelled
					if (selected === undefined) {
						return {
							content: [{ type: "text", text: "User cancelled" }],
							details: {
								question: params.question,
								options: params.options,
								answer: null,
								cancelled: true,
							},
						};
					}

					// Success - return in Claude Code format
					return {
						content: [{ type: "text", text: `User selected: ${selected}` }],
						details: {
							question: params.question,
							options: params.options,
							answer: selected,
							cancelled: false,
						},
					};
				} else {
					// Map to input type
					const answer = await ctx.ui.input(
						params.question,
						"Type your answer..."
					);

					// User cancelled
					if (answer === undefined) {
						return {
							content: [{ type: "text", text: "User cancelled" }],
							details: {
								question: params.question,
								answer: null,
								cancelled: true,
							},
						};
					}

					// Success - return in Claude Code format
					return {
						content: [{ type: "text", text: `User answered: ${answer}` }],
						details: {
							question: params.question,
							answer,
							cancelled: false,
						},
					};
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: ${errorMessage}` }],
					details: {
						question: params.question,
						answer: null,
						cancelled: true,
					},
				};
			}
		},

		// Custom rendering to match Pi conventions
		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("AskUserQuestion "));
			text += theme.fg("muted", args.question);

			// Show options preview if provided
			if (args.options && args.options.length > 0) {
				const preview = args.options.slice(0, 3).join(", ");
				const more = args.options.length > 3 ? ` (+${args.options.length - 3} more)` : "";
				text += `\n  ${theme.fg("dim", preview + more)}`;
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			// Handle cancelled
			if (details.cancelled) {
				return new Text(theme.fg("warning", "⚠ Cancelled"), 0, 0);
			}

			// Show answer
			let text = theme.fg("success", "✓ ");
			text += theme.fg("accent", String(details.answer));

			// Expanded view shows question
			if (options.expanded) {
				text += `\n${theme.fg("muted", `Q: ${details.question}`)}`;
			}

			return new Text(text, 0, 0);
		},
	});

	// Log that compatibility layer is loaded
	pi.on("session_start", (_event, ctx) => {
		// Only log in interactive mode
		if (ctx.hasUI) {
			// Notify silently that compat layer is active
			// (comment out if too noisy)
			// ctx.ui.notify("Claude Code compatibility layer loaded", "info");
		}
	});
}
